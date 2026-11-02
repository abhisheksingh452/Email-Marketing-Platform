import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators';
import { AppException } from '../../../common/errors/app.exception';
import type { AuthedRequest } from '../../../common/types/request';
import type { PermissionCode } from '../../rbac/permissions';

/** Global guard: enforces @RequirePermissions(...) after the session guard has set the principal. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[] | undefined>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const principal = ctx.switchToHttp().getRequest<AuthedRequest>().principal;
    if (!principal) throw AppException.unauthenticated();
    if (!required.every((code) => principal.permissions.includes(code))) throw AppException.forbidden();
    return true;
  }
}
