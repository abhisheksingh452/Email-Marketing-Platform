import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequirePermissions } from '../../common/decorators';
import { AuthedRequest, Principal, getRequestMeta } from '../../common/types/request';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  list(@CurrentPrincipal() principal: Principal, @Query() query: ListUsersQuery) {
    return this.users.list(principal, query);
  }

  @Post()
  @RequirePermissions('users.manage')
  create(@CurrentPrincipal() principal: Principal, @Body() dto: CreateUserDto, @Req() req: AuthedRequest) {
    return this.users.create(principal, dto, getRequestMeta(req));
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthedRequest,
  ) {
    return this.users.update(principal, id, dto, getRequestMeta(req));
  }
}
