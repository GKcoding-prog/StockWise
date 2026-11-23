import { Controller, Get, Module, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/auth/decorators';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Readiness: pings the database. Don't point an uptime monitor here (it keeps Neon awake). */
  @Public()
  @SkipThrottle()
  @Get()
  async health() {
    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return { status: db === 'up' ? 'ok' : 'degraded', db };
  }

  /**
   * Liveness: answers without touching the database. Safe for a keep-awake ping every few
   * minutes, because a sleeping database stays asleep (Neon free tier, docs/08).
   */
  @Public()
  @SkipThrottle()
  @Get('live')
  live(@Req() req: Request) {
    return env().SHOW_CLIENT_IP ? { status: 'ok', ip: req.ip, ips: req.ips } : { status: 'ok' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
