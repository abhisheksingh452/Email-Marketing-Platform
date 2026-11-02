import type { NextFunction, Response } from 'express';
import { ErrorCode } from '../errors/error-codes';
import type { AuthedRequest } from '../types/request';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence-in-depth for cookie auth (on top of SameSite=Lax): browsers always send
 * Origin on cross-origin unsafe requests, so a foreign Origin is rejected. Requests with
 * no Origin (curl, server-to-server) pass through.
 */
export function originCheckMiddleware(allowedOrigin: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (!SAFE_METHODS.has(req.method) && origin && origin !== allowedOrigin) {
      return res.status(403).json({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Cross-origin request rejected',
          details: null,
          requestId: req.id,
        },
      });
    }
    next();
  };
}
