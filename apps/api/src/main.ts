import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { API_PREFIX, setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  setupApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API ready on http://localhost:${port}/${API_PREFIX}`);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    logger.log(`Swagger docs on http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
