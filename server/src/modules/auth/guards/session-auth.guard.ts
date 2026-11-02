import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../../../common/decorators';
import { AppException } from '../../../common/errors/app.exception';
import type { AuthedRequest } from '../../../common/types/request';
import { SESSION_COOKIE } from '../auth.constants';
import { SessionService } from '../session.service';

/** Global guard: every route needs a valid session unless marked @Public(). */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw AppException.unauthenticated();

    const principal = await this.sessions.resolve(token);
    if (!principal) throw AppException.unauthenticated();

    req.principal = principal;
    return true;
  }
}
