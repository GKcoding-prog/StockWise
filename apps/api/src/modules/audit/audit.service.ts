import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context';
import { Prisma } from '../../generated/prisma/client';
import type { Tx } from '../../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  /** Defaults to the request's tenant / user. */
  businessId?: string | null;
  userId?: string | null;
}

/** Converts Decimals, Dates and BigInts to plain JSON for the audit columns. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

/** Append-only activity log. Call inside the same transaction as the write it records. */
@Injectable()
export class AuditService {
  constructor(private readonly ctx: RequestContext) {}

  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    let businessId = entry.businessId;
    let userId = entry.userId;
    if (businessId === undefined || userId === undefined) {
      try {
        const tenant = this.ctx.tenant;
        businessId ??= tenant.businessId;
        userId ??= tenant.userId;
      } catch {
        // Public routes (login, register) pass ids explicitly.
      }
    }
    const meta = this.ctx.meta;
    await tx.auditLog.create({
      data: {
        businessId: businessId ?? null,
        userId: userId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: meta.ip?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        requestId: meta.requestId ?? null,
      },
    });
  }
}
