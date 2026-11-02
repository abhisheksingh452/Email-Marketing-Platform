import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { PermissionCode } from '../../modules/rbac/permissions';
import type { AuthedRequest, Principal } from '../types/request';

export const IS_PUBLIC = 'isPublic';
/** Skips the session guard (login, health, webhooks...). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const RAW_RESPONSE = 'rawResponse';
/** Skips the { data, meta } envelope (health probes, file downloads). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/** Caller must hold ALL listed permissions. */
export const RequirePermissions = (...codes: PermissionCode[]) => SetMetadata(PERMISSIONS_KEY, codes);

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().principal as Principal;
});
