import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  CreateAdjustmentSchema,
  CreateWriteOffSchema,
  StockCountSchema,
} from '@stockwise/shared';
import type { z } from 'zod';
import { RequestContext } from '../../common/context/request-context';
import { D, ZERO, roundMoney } from '../../common/decimal';
import { AppError } from '../../common/errors/app-error';
import type { StockMovement } from '../../generated/prisma/client';
import { PrismaService, TX_OPTIONS, type Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { nextReference } from './document-sequence';
import { applyMovements, type MovementInput } from './stock-engine';

export const STOCK_CHANGED = 'stock.changed';
export const STOCK_ADJUSTED = 'stock.adjusted';

export interface StockChangedEvent {
  businessId: string;
  productIds: string[];
}
export interface StockAdjustedEvent {
  businessId: string;
  movementIds: string[];
}

interface PendingEvents {
  businessId?: string;
  productIds: Set<string>;
  adjustedMovementIds: string[];
}

/**
 * The stock engine's front door. Other modules (purchases, sales, products) call
 * `transaction()` and, inside it, `applyMovements()`. Events go out only after commit
 * (docs/01 §7.2); if the process dies in between, the nightly job catches up.
 */
@Injectable()
export class InventoryService {
  private readonly pending = new WeakMap<object, PendingEvents>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const events: PendingEvents = { productIds: new Set(), adjustedMovementIds: [] };
    const result = await this.prisma.$transaction(async (tx) => {
      this.pending.set(tx, events);
      return fn(tx);
    }, TX_OPTIONS);
    this.flush(events);
    return result;
  }

  async applyMovements(tx: Tx, lines: MovementInput[]): Promise<StockMovement[]> {
    const events = this.pending.get(tx);
    if (!events) throw new Error('applyMovements must run inside InventoryService.transaction()');
    const tenant = this.ctx.tenant;
    const movements = await applyMovements(
      tx,
      {
        businessId: tenant.businessId,
        userId: tenant.userId,
        allowNegativeStock: tenant.settings.allowNegativeStock,
      },
      lines,
    );
    events.businessId = tenant.businessId;
    for (const m of movements) {
      events.productIds.add(m.productId);
      if (m.type === 'ADJUSTMENT' || m.type === 'WRITE_OFF') events.adjustedMovementIds.push(m.id);
    }
    return movements;
  }

  async defaultWarehouseId(tx: Tx | PrismaService = this.prisma): Promise<string> {
    const warehouse = await tx.warehouse.findFirst({
      where: { businessId: this.ctx.tenant.businessId, isDefault: true },
      select: { id: true },
    });
    if (!warehouse) throw AppError.notFound('Default warehouse');
    return warehouse.id;
  }

  // ── Adjustments, write-offs and stock counts (UC-41, UC-42, UC-43) ────────────────────────

  async adjust(input: z.output<typeof CreateAdjustmentSchema>) {
    return this.transaction(async (tx) => {
      const tenant = this.ctx.tenant;
      const warehouseId = await this.defaultWarehouseId(tx);
      const documentRef = await nextReference(tx, tenant.businessId, 'ADJUSTMENT', tenant.timezone);
      const movements = await this.applyMovements(
        tx,
        input.lines.map((l) => ({
          productId: l.productId,
          warehouseId,
          type: 'ADJUSTMENT',
          ...(l.newQuantity !== undefined
            ? { targetQuantity: D(l.newQuantity) }
            : { quantityChange: D(l.quantityChange!) }),
          reason: input.reason,
          note: input.note ?? undefined,
          documentRef,
        })),
      );
      await this.audit.record(tx, {
        action: 'inventory.adjust',
        entityType: 'StockMovement',
        after: { documentRef, reason: input.reason, movementIds: movements.map((m) => m.id) },
      });
      return { documentRef, movements };
    });
  }

  async writeOff(input: z.output<typeof CreateWriteOffSchema>) {
    return this.transaction(async (tx) => {
      const tenant = this.ctx.tenant;
      const warehouseId = await this.defaultWarehouseId(tx);
      const documentRef = await nextReference(tx, tenant.businessId, 'WRITE_OFF', tenant.timezone);
      const movements = await this.applyMovements(
        tx,
        input.lines.map((l) => ({
          productId: l.productId,
          warehouseId,
          type: 'WRITE_OFF',
          quantityChange: D(l.quantity).negated(),
          reason: input.reason,
          note: input.note,
          documentRef,
        })),
      );
      await this.audit.record(tx, {
        action: 'inventory.write_off',
        entityType: 'StockMovement',
        after: { documentRef, reason: input.reason, movementIds: movements.map((m) => m.id) },
      });
      return { documentRef, movements };
    });
  }

  /** Differences between counted and system quantities, with value impact. Writes nothing. */
  async previewCount(input: z.output<typeof StockCountSchema>) {
    const tenant = this.ctx.tenant;
    const warehouseId = await this.defaultWarehouseId();
    const productIds = input.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({
      where: { businessId: tenant.businessId, id: { in: productIds } },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        stockLevels: {
          where: { warehouseId },
          select: { quantityOnHand: true, averageCost: true },
        },
      },
    });
    if (products.length !== new Set(productIds).size) throw AppError.notFound('Product');
    const byId = new Map(products.map((p) => [p.id, p]));
    const canSeeCost = this.ctx.can('products.view_cost');

    let totalValueImpact = ZERO;
    const lines = input.lines.map((l) => {
      const p = byId.get(l.productId)!;
      const level = p.stockLevels[0];
      const systemQuantity = level?.quantityOnHand ?? ZERO;
      const difference = D(l.countedQuantity).minus(systemQuantity);
      const valueImpact = roundMoney(difference.times(level?.averageCost ?? ZERO));
      totalValueImpact = totalValueImpact.plus(valueImpact);
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        systemQuantity,
        countedQuantity: D(l.countedQuantity),
        difference,
        ...(canSeeCost ? { valueImpact } : {}),
      };
    });
    return {
      lines,
      differingLines: lines.filter((l) => !l.difference.isZero()).length,
      ...(canSeeCost ? { totalValueImpact } : {}),
    };
  }

  async commitCount(input: z.output<typeof StockCountSchema>) {
    return this.transaction(async (tx) => {
      const tenant = this.ctx.tenant;
      const warehouseId = await this.defaultWarehouseId(tx);
      const documentRef = await nextReference(
        tx,
        tenant.businessId,
        'STOCK_COUNT',
        tenant.timezone,
      );
      const movements = await this.applyMovements(
        tx,
        input.lines.map((l) => ({
          productId: l.productId,
          warehouseId,
          type: 'ADJUSTMENT',
          targetQuantity: D(l.countedQuantity),
          reason: 'COUNT_CORRECTION',
          note: input.note ?? undefined,
          documentRef,
        })),
      );
      await this.audit.record(tx, {
        action: 'inventory.count',
        entityType: 'StockMovement',
        after: {
          documentRef,
          countedLines: input.lines.length,
          movementIds: movements.map((m) => m.id),
        },
      });
      return { documentRef, movements };
    });
  }

  /** Invariant I1: every balance equals the sum of its ledger. Should always be empty. */
  async reconcile(businessId = this.ctx.tenant.businessId) {
    const rows = await this.prisma.$queryRaw<
      { productId: string; warehouseId: string; quantityOnHand: string; ledgerSum: string }[]
    >`
      SELECT sl."productId", sl."warehouseId",
             sl."quantityOnHand"::text AS "quantityOnHand",
             COALESCE(SUM(m."quantityChange"), 0)::text AS "ledgerSum"
      FROM "stock_levels" sl
      LEFT JOIN "stock_movements" m
        ON m."productId" = sl."productId" AND m."warehouseId" = sl."warehouseId"
      WHERE sl."businessId" = ${businessId}::uuid
      GROUP BY sl."id"
      HAVING sl."quantityOnHand" <> COALESCE(SUM(m."quantityChange"), 0)`;
    return { checkedAt: new Date(), mismatches: rows };
  }

  private flush(events: PendingEvents): void {
    if (!events.businessId) return;
    if (events.productIds.size) {
      this.events.emit(STOCK_CHANGED, {
        businessId: events.businessId,
        productIds: [...events.productIds],
      } satisfies StockChangedEvent);
    }
    if (events.adjustedMovementIds.length) {
      this.events.emit(STOCK_ADJUSTED, {
        businessId: events.businessId,
        movementIds: events.adjustedMovementIds,
      } satisfies StockAdjustedEvent);
    }
  }
}
