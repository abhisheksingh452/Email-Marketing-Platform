import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PageResult, paginate } from '../../common/pagination/pagination';
import { normalizeEmail } from '../../common/security/crypto.util';
import type { Principal, RequestMeta } from '../../common/types/request';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { SUPER_ADMIN_ROLE } from '../rbac/default-roles';
import type { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/users.dto';

const userInclude = { userRoles: { select: { role: { select: { id: true, name: true } } } } } satisfies Prisma.UserInclude;
type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

const toUserView = (u: UserWithRoles) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  status: u.status,
  mfaEnabled: u.mfaEnabled,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
  roles: u.userRoles.map((ur) => ur.role),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  async list(principal: Principal, query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {
      workspaceId: principal.workspaceId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const page = await paginate(query, ({ take, cursor }) =>
      this.prisma.user.findMany({
        where,
        take,
        cursor,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: userInclude,
      }),
    );
    return new PageResult(page.items.map(toUserView), page.nextCursor);
  }

  async create(principal: Principal, dto: CreateUserDto, meta: RequestMeta) {
    const email = normalizeEmail(dto.email);
    const roles = await this.loadRoles(principal.workspaceId, dto.roleIds);
    this.assertCanAssign(principal, roles.map((r) => r.name));

    const existing = await this.prisma.user.findUnique({
      where: { workspaceId_email: { workspaceId: principal.workspaceId, email } },
      select: { id: true },
    });
    if (existing) throw AppException.conflict('A user with this email already exists');

    const user = await this.prisma.user.create({
      data: {
        workspaceId: principal.workspaceId,
        email,
        name: dto.name,
        status: UserStatus.INVITED, // becomes ACTIVE when they set their password via the invite link
        userRoles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      include: userInclude,
    });
    await this.auth.issuePasswordToken(user, 'invite');

    await this.audit.log({
      action: AuditAction.USER_CREATED,
      result: 'SUCCESS',
      workspaceId: principal.workspaceId,
      actorUserId: principal.userId,
      objectType: 'user',
      objectId: user.id,
      metadata: { roles: roles.map((r) => r.name) },
      ...meta,
    });
    return toUserView(user);
  }

  async update(principal: Principal, id: string, dto: UpdateUserDto, meta: RequestMeta) {
    const target = await this.prisma.user.findFirst({
      where: { id, workspaceId: principal.workspaceId }, // object-level authorization: same workspace only
      include: userInclude,
    });
    if (!target) throw AppException.notFound('User');

    const before = target.userRoles.map((ur) => ur.role.name);
    if (id === principal.userId && (dto.status !== undefined || dto.roleIds !== undefined)) {
      throw AppException.forbidden('You cannot change your own status or roles');
    }
    if (before.includes(SUPER_ADMIN_ROLE) && !principal.roles.includes(SUPER_ADMIN_ROLE)) {
      throw AppException.forbidden('Only a Super Admin can modify a Super Admin');
    }
    if (dto.status === 'ACTIVE' && target.status === UserStatus.INVITED) {
      throw AppException.validation('Invited users become active when they set their password');
    }

    let newRoles: { id: string; name: string }[] | undefined;
    if (dto.roleIds) {
      newRoles = await this.loadRoles(principal.workspaceId, dto.roleIds);
      this.assertCanAssign(principal, newRoles.map((r) => r.name));
    }

    await this.prisma.$transaction(async (tx) => {
      if (newRoles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: newRoles.map((r) => ({ userId: id, roleId: r.id })) });
      }
      await tx.user.update({
        where: { id },
        data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.status ? { status: dto.status } : {}) },
      });
      if (dto.status === 'DISABLED') {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    });

    const base = {
      result: 'SUCCESS' as const,
      workspaceId: principal.workspaceId,
      actorUserId: principal.userId,
      objectType: 'user',
      objectId: id,
      ...meta,
    };
    if (newRoles) {
      await this.audit.log({
        ...base,
        action: AuditAction.USER_ROLE_CHANGED,
        metadata: { before, after: newRoles.map((r) => r.name) },
      });
    }
    if (dto.status === 'DISABLED') {
      await this.audit.log({ ...base, action: AuditAction.USER_DISABLED });
    } else if (dto.name !== undefined || dto.status) {
      await this.audit.log({ ...base, action: AuditAction.USER_UPDATED, metadata: { name: dto.name, status: dto.status } });
    }

    const fresh = await this.prisma.user.findFirstOrThrow({ where: { id }, include: userInclude });
    return toUserView(fresh);
  }

  /** Every roleId must belong to the caller's workspace. */
  private async loadRoles(workspaceId: string, roleIds: string[]) {
    const unique = [...new Set(roleIds)];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: unique }, workspaceId },
      select: { id: true, name: true },
    });
    if (roles.length !== unique.length) throw AppException.validation('One or more roleIds are invalid');
    return roles;
  }

  /** Only a Super Admin may hand out the Super Admin role (prevents privilege escalation). */
  private assertCanAssign(principal: Principal, roleNames: string[]) {
    if (roleNames.includes(SUPER_ADMIN_ROLE) && !principal.roles.includes(SUPER_ADMIN_ROLE)) {
      throw AppException.forbidden('Only a Super Admin can assign the Super Admin role');
    }
  }
}
