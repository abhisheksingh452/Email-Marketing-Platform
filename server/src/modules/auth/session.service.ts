import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { randomToken, sha256Hex } from '../../common/security/crypto.util';
import type { Principal, RequestMeta } from '../../common/types/request';
import type { Env } from '../../config/env';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface CreatedSession {
  token: string; // raw value for the cookie; only its hash is stored
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get ttlMs() {
    return this.config.get('SESSION_TTL_HOURS', { infer: true }) * 60 * 60 * 1000;
  }

  async create(userId: string, workspaceId: string, meta: RequestMeta): Promise<CreatedSession> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.prisma.session.create({
      data: {
        userId,
        workspaceId,
        tokenHash: sha256Hex(token),
        ipHash: this.audit.hashIp(meta.ip),
        userAgent: meta.userAgent?.slice(0, 512),
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  /** Cookie token -> Principal, or null when missing/expired/revoked/user disabled. */
  async resolve(token: string): Promise<Principal | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: { include: { workspace: { select: { status: true } } } } },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    if (session.user.status !== 'ACTIVE' || session.user.workspace.status !== 'ACTIVE') return null;

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      void this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => undefined);
    }

    const access = await this.rbac.getAccess(session.userId);
    return {
      userId: session.userId,
      workspaceId: session.workspaceId,
      sessionId: session.id,
      email: session.user.email,
      name: session.user.name,
      mfaEnabled: session.user.mfaEnabled,
      ...access,
    };
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Rotation: the old token dies, a fresh one (with a fresh expiry) is issued. */
  async rotate(principal: Principal, meta: RequestMeta): Promise<CreatedSession> {
    await this.revoke(principal.sessionId);
    return this.create(principal.userId, principal.workspaceId, meta);
  }
}
