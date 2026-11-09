import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { env } from './config/env';
import { setupApp } from './setup-app';

async function bootstrap() {
  const config = env(); // fail fast on bad configuration
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  setupApp(app);
  await app.listen(config.PORT);
  Logger.log(`StockWise API listening on http://localhost:${config.PORT}/api/v1`, 'Bootstrap');
}

void bootstrap();
