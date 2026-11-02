import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from '../types/request';

const logger = new Logger('HTTP');
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Accept X-Request-ID (if sane), else generate one; echo it back; log one line per request. */
export function requestIdMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : `req_${randomUUID()}`;
  res.setHeader('X-Request-ID', req.id);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const path = req.originalUrl.split('?')[0]; // never log query strings
    logger.log(`${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms ${req.id}`);
  });
  next();
}
