import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import { JwtAuthGuard, PermissionsGuard, TenantGuard } from './common/auth/guards';
import { AppThrottlerGuard } from './common/auth/throttler.guard';
import { CommonModule } from './common/common.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { env } from './config/env';
import { AnalyticsModule } from './modules/analytics/analytics.controller';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessModule } from './modules/business/business.controller';
import { CategoriesModule } from './modules/categories/categories.module';
import { HealthModule } from './modules/health/health.controller';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProductsModule } from './modules/products/products.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { WarehousesModule } from './modules/warehouses/warehouses.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: Request) => {
          const header = req.headers['x-request-id'];
          return typeof header === 'string' && /^[\w-]{8,64}$/.test(header) ? header : randomUUID();
        },
        setup: (cls, req: Request) => {
          cls.set('requestId', cls.getId());
          cls.set('ip', req.ip);
          cls.set('userAgent', req.headers['user-agent']);
        },
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      skipIf: () => !env().THROTTLE_ENABLED,
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuditModule,
    HealthModule,
    AuthModule,
    BusinessModule,
    WarehousesModule,
    CategoriesModule,
    SuppliersModule,
    InventoryModule,
    ProductsModule,
    AnalyticsModule,
  ],
  providers: [
    // Order matters: rate limit → authenticate → load tenant → check permissions (docs/01 §6).
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
