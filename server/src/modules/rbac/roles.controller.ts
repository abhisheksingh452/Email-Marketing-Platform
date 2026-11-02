import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequirePermissions } from '../../common/decorators';
import type { Principal } from '../../common/types/request';
import { RbacService } from './rbac.service';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rbac: RbacService) {}

  @Get()
  @RequirePermissions('users.read')
  list(@CurrentPrincipal() principal: Principal) {
    return this.rbac.listRoles(principal.workspaceId);
  }
}
