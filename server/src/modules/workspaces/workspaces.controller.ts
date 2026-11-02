import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequirePermissions } from '../../common/decorators';
import { AuthedRequest, Principal, getRequestMeta } from '../../common/types/request';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@Controller('workspaces/current')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  get(@CurrentPrincipal() principal: Principal) {
    return this.workspaces.getCurrent(principal);
  }

  @Patch()
  @RequirePermissions('settings.manage')
  update(@CurrentPrincipal() principal: Principal, @Body() dto: UpdateWorkspaceDto, @Req() req: AuthedRequest) {
    return this.workspaces.updateCurrent(principal, dto, getRequestMeta(req));
  }
}
