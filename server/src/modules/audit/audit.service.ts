import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditResult, Prisma } from '@prisma/client';
import { PageQueryDto, paginate } from '../../common/pagination/pagination';
import { hmacHex } from '../../common/security/crypto.util';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuditAction } from './audit-actions';
import type { ListAuditQuery } from './dto/list-audit.query';

export interface AuditEntry {
  action: AuditAction;
  result: 'SUCCESS' | 'FAILURE';
  workspaceId?: string | null;
  actorUserId?: string | null;
  objectType?: string;
  objectId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** HMAC so raw IPs are never stored but the same IP still correlates across rows. */
  hashIp(ip?: string): string | undefined {
    return ip ? hmacHex(this.config.get('SESSION_SECRET', { infer: true }), ip) : undefined;
  }

  /**
   * Best-effort in Phase 0: an audit-write failure is logged loudly but does not fail the request.
   * (Revisit for Phase 2: write inside the same transaction as the change for critical actions.)
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          result: entry.result as AuditResult,
          workspaceId: entry.workspaceId ?? null,
          actorUserId: entry.actorUserId ?? null,
          objectType: entry.objectType,
          objectId: entry.objectId,
          ipHash: this.hashIp(entry.ip),
          userAgent: entry.userAgent?.slice(0, 512),
          metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log ${entry.action}`, err instanceof Error ? err.stack : String(err));
    }
  }

  list(workspaceId: string, query: ListAuditQuery & PageQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      workspaceId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    };
    return paginate(query, ({ take, cursor }) =>
      this.prisma.auditLog.findMany({
        where,
        take,
        cursor,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          action: true,
          result: true,
          objectType: true,
          objectId: true,
          actorUserId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    );
  }
}
