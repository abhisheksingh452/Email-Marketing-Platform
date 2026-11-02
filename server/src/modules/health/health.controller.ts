import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public, RawResponse } from '../../common/decorators';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

@ApiTags('ops')
@Controller()
@Public()
@RawResponse()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: the process is up. */
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable. 503 when not. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks = { database: false, redis: false };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      /* reported below */
    }
    try {
      checks.redis = (await this.redis.ping()) === 'PONG';
    } catch {
      /* reported below */
    }
    const ok = checks.database && checks.redis;
    if (!ok) res.status(503);
    return { status: ok ? 'ready' : 'unavailable', checks };
  }
}
