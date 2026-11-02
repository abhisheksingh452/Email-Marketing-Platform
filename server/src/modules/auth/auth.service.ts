import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { normalizeEmail, randomToken, sha256Hex } from '../../common/security/crypto.util';
import type { Principal, RequestMeta } from '../../common/types/request';
import type { Env } from '../../config/env';
import { MailerService } from '../../infra/mailer/mailer.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import type { ForgotPasswordDto, LoginDto, ResetPasswordDto } from './dto/auth.dto';
import { CreatedSession, SessionService } from './session.service';

export interface AuthUserView {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
  mfaEnabled: boolean;
  roles: string[];
  permissions: string[];
}

export const principalToView = (p: Principal): AuthUserView => ({
  id: p.userId,
  email: p.email,
  name: p.name,
  workspaceId: p.workspaceId,
  mfaEnabled: p.mfaEnabled,
  roles: p.roles,
  permissions: p.permissions,
});

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = argon2.hash('timing-equalizer-not-a-real-password');

const RESET_TTL_MS = 30 * 60 * 1000;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta): Promise<{ session: CreatedSession; user: AuthUserView }> {
    const email = normalizeEmail(dto.email);
    // NOTE: the schema allows the same email in different workspaces (unique on workspace+email).
    // While a deployment has one workspace this is unambiguous; add a workspace selector before multi-tenant signup.
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { workspace: { select: { status: true } } },
    });

    let valid = false;
    try {
      valid = await argon2.verify(user?.passwordHash ?? (await DUMMY_HASH), dto.password);
    } catch {
      valid = false;
    }

    const reason = !user ? 'unknown_user' : !user.passwordHash || !valid ? 'bad_password'
      : user.status !== UserStatus.ACTIVE || user.workspace.status !== 'ACTIVE' ? 'inactive' : null;

    if (!user || reason) {
      await this.audit.log({
        action: AuditAction.AUTH_LOGIN_FAILED,
        result: 'FAILURE',
        workspaceId: user?.workspaceId,
        actorUserId: user?.id,
        metadata: { reason },
        ...meta,
      });
      // Same error for every failure: never reveal which part was wrong.
      throw new AppException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
    }

    if (user.passwordHash && argon2.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(dto.password) } });
    }

    const session = await this.sessions.create(user.id, user.workspaceId, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const access = await this.rbac.getAccess(user.id);

    await this.audit.log({
      action: AuditAction.AUTH_LOGIN_SUCCEEDED,
      result: 'SUCCESS',
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      ...meta,
    });

    return {
      session,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        workspaceId: user.workspaceId,
        mfaEnabled: user.mfaEnabled,
        ...access,
      },
    };
  }

  async logout(principal: Principal, meta: RequestMeta) {
    await this.sessions.revoke(principal.sessionId);
    await this.audit.log({
      action: AuditAction.AUTH_LOGOUT,
      result: 'SUCCESS',
      workspaceId: principal.workspaceId,
      actorUserId: principal.userId,
      ...meta,
    });
  }

  refresh(principal: Principal, meta: RequestMeta) {
    return this.sessions.rotate(principal, meta);
  }

  /** Always answers the same way, whether or not the email exists. */
  async forgotPassword(dto: ForgotPasswordDto, meta: RequestMeta) {
    const user = await this.prisma.user.findFirst({
      where: { email: normalizeEmail(dto.email), status: UserStatus.ACTIVE },
    });
    if (user) {
      await this.issuePasswordToken(user, 'reset');
      await this.audit.log({
        action: AuditAction.AUTH_PASSWORD_RESET_REQUESTED,
        result: 'SUCCESS',
        workspaceId: user.workspaceId,
        actorUserId: user.id,
        ...meta,
      });
    }
    return { accepted: true };
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta) {
    const invalid = () => AppException.validation('Reset token is invalid or expired');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(dto.token) },
      include: { user: true },
    });
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt <= now || record.user.status === UserStatus.DISABLED) {
      throw invalid();
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      // Claim the token atomically so two concurrent requests can't both use it.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw invalid();
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          ...(record.user.status === UserStatus.INVITED ? { status: UserStatus.ACTIVE } : {}),
        },
      });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } });
    });

    await this.audit.log({
      action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
      result: 'SUCCESS',
      workspaceId: record.user.workspaceId,
      actorUserId: record.userId,
      ...meta,
    });
    return { success: true };
  }

  /** Used for password resets and for user invites (an invite is a long-lived "set your password" link). */
  async issuePasswordToken(user: { id: string; email: string; name: string }, purpose: 'reset' | 'invite') {
    const token = randomToken();
    const ttl = purpose === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS;
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + ttl) },
      }),
    ]);
    const url = `${this.config.get('WEB_BASE_URL', { infer: true })}/reset-password?token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: purpose === 'invite' ? 'You have been invited' : 'Reset your password',
      text:
        purpose === 'invite'
          ? `Hi ${user.name},\n\nSet your password to activate your account (link valid 72 hours):\n${url}\n`
          : `Hi ${user.name},\n\nReset your password (link valid 30 minutes):\n${url}\n\nIgnore this email if you didn't request it.\n`,
    });
  }
}
