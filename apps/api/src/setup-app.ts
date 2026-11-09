import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env';

/** HTTP hardening and conventions shared by main.ts and the e2e tests. */
export function setupApp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1); // behind Nginx in production
  express.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env().WEB_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  });
  app.enableShutdownHooks();
}
