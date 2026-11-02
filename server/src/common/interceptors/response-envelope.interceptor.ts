import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { RAW_RESPONSE } from '../decorators';
import { PageResult } from '../pagination/pagination';
import type { AuthedRequest } from '../types/request';

/** Wraps every successful response as { data, meta: { requestId } }. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [ctx.getHandler(), ctx.getClass()]);
    if (raw) return next.handle();

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return next.handle().pipe(
      map((body) =>
        body instanceof PageResult
          ? { data: body.items, meta: { requestId: req.id, nextCursor: body.nextCursor } }
          : { data: body ?? null, meta: { requestId: req.id } },
      ),
    );
  }
}
