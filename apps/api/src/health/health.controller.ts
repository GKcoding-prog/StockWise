import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  time: string;
}

@ApiTags('system')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ description: 'API and database are reachable' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const dbUp = await this.prisma.ping();
    if (!dbUp) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      time: new Date().toISOString(),
    };
  }
}
