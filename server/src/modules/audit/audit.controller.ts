import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequirePermissions } from '../../common/decorators';
import type { Principal } from '../../common/types/request';
import { AuditService } from './audit.service';
import { ListAuditQuery } from './dto/list-audit.query';

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(@CurrentPrincipal() principal: Principal, @Query() query: ListAuditQuery) {
    return this.audit.list(principal.workspaceId, query);
  }
}
