import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { Principal, RequestMeta } from '../../common/types/request';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { UpdateWorkspaceDto } from './dto/update-workspace.dto';

const select = { id: true, name: true, legalName: true, timezone: true, locale: true, status: true, createdAt: true } as const;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCurrent(principal: Principal) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: principal.workspaceId }, select });
    if (!ws) throw AppException.notFound('Workspace');
    return ws;
  }

  async updateCurrent(principal: Principal, dto: UpdateWorkspaceDto, meta: RequestMeta) {
    const ws = await this.prisma.workspace.update({
      where: { id: principal.workspaceId }, // from the session, never from the request
      data: dto,
      select,
    });
    await this.audit.log({
      action: AuditAction.WORKSPACE_UPDATED,
      result: 'SUCCESS',
      workspaceId: principal.workspaceId,
      actorUserId: principal.userId,
      objectType: 'workspace',
      objectId: principal.workspaceId,
      metadata: { fields: Object.keys(dto) },
      ...meta,
    });
    return ws;
  }
}
