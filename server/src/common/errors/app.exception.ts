import { HttpException } from '@nestjs/common';
import { ERROR_STATUS, ErrorCode } from './error-codes';

/** Throw this from services; the global filter turns it into the standard error envelope. */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, ERROR_STATUS[code]);
  }

  static unauthenticated() {
    return new AppException(ErrorCode.UNAUTHENTICATED, 'Authentication required');
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppException(ErrorCode.FORBIDDEN, message);
  }
  static notFound(what = 'Resource') {
    return new AppException(ErrorCode.RESOURCE_NOT_FOUND, `${what} not found`);
  }
  static conflict(message: string, details?: unknown) {
    return new AppException(ErrorCode.CONFLICT, message, details);
  }
  static validation(message: string, details?: unknown) {
    return new AppException(ErrorCode.VALIDATION_ERROR, message, details);
  }
}
