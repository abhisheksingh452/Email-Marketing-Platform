import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { AuthedRequest } from '../types/request';

interface Normalized {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.RESOURCE_NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

/** Every error leaves the API as { error: { code, message, details, requestId } }. No stack traces. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AuthedRequest>();
    const res = ctx.getResponse<Response>();
    const { status, code, message, details } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(
        `[${req.id}] ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    res.status(status).json({ error: { code, message, details: details ?? null, requestId: req.id } });
  }

  private normalize(e: unknown): Normalized {
    if (e instanceof AppException) {
      return { status: e.getStatus(), code: e.code, message: e.message, details: e.details };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        return { status: 409, code: ErrorCode.CONFLICT, message: 'Resource already exists' };
      }
      if (e.code === 'P2025') {
        return { status: 404, code: ErrorCode.RESOURCE_NOT_FOUND, message: 'Resource not found' };
      }
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const fallback = status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_ERROR;
      return { status, code: STATUS_TO_CODE[status] ?? fallback, message: e.message };
    }
    // http-errors thrown by body-parser (malformed JSON, payload too large, ...)
    const status = (e as { status?: number } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return {
        status,
        code: STATUS_TO_CODE[status] ?? ErrorCode.VALIDATION_ERROR,
        message: status === 413 ? 'Payload too large' : 'Malformed request',
      };
    }
    return { status: 500, code: ErrorCode.INTERNAL_ERROR, message: 'Unexpected server error' };
  }
}
