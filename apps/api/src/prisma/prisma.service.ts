import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { env, tenantGuardRailEnabled } from '../config/env';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { tenantGuardRail } from './tenant-guard-rail';

export function createPrismaAdapter(connectionString = env().DATABASE_URL): PrismaPg {
  return new PrismaPg({ connectionString, max: 20 });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: createPrismaAdapter() });
    // Query-only extensions keep the client's type surface, so the extended client can stand in
    // for `this`. Its proxy forwards unknown members (onModuleDestroy) to the base client.
    if (tenantGuardRailEnabled()) {
      return this.$extends(tenantGuardRail) as unknown as PrismaService;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Transaction client passed to services that must run inside a caller's transaction. */
export type Tx = Prisma.TransactionClient;

/** Interactive transaction options used for writes that touch stock. */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;
