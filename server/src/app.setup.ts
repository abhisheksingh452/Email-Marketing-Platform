import { INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppException } from './common/errors/app.exception';
import { originCheckMiddleware } from './common/middleware/origin-check.middleware';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import type { Env } from './config/env';

function flatten(errors: ValidationError[], parent = ''): { field: string; messages: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, messages: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const webOrigin = new URL(config.get('WEB_BASE_URL', { infer: true })).origin;

  if (config.get('NODE_ENV', { infer: true }) === 'production') {
    (app as NestExpressApplication).set('trust proxy', 1); // correct client IPs behind a load balancer
  }

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.use(originCheckMiddleware(webOrigin));
  app.enableCors({ origin: webOrigin, credentials: true, exposedHeaders: ['X-Request-ID'] });

  app.setGlobalPrefix('v1', { exclude: ['health', 'ready'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // ...and reject them (also blocks arbitrary filter params)
      transform: true,
      exceptionFactory: (errors) => AppException.validation('Input failed validation', flatten(errors)),
    }),
  );
}
