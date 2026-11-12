import { Injectable } from '@nestjs/common';
import type {
  CancelPurchaseSchema,
  CreatePurchaseSchema,
  PurchaseListQuerySchema,
  PurchaseStatus,
  ReceivePurchaseSchema,
  SupplierReturnSchema,
  UpdatePurchaseSchema,
} from '@stockwise/shared';
import type { z } from 'zod';
import { RequestContext } from '../../common/context/request-context';
import { D, qtyString, roundCost, roundMoney, sum } from '../../common/decimal';
import { AppError } from '../../common/errors/app-error';
import { addDays, localDateOf, localDateRange, startOfLocalDay } from '../../common/time';
import type { Prisma, StockMovement } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { nextReference } from '../inventory/document-sequence';
import { InventoryService } from '../inventory/inventory.service';
import { movementInclude } from '../inventory/movement.mapper';
import {
  purchaseDetailInclude,
  purchaseSummaryInclude,
  remainingOf,
  toPurchaseDetailDto,
  toPurchaseSummaryDto,
} from './purchase.mapper';

type ItemInput = z.output<typeof CreatePurchaseSchema>['items'][number];

/** Allowed status transitions (docs/05 §4.10). Anything else → INVALID_STATE_TRANSITION. */
const EDITABLE: readonly PurchaseStatus[] = ['DRAFT', 'ORDERED'];
const RECEIVABLE: readonly PurchaseStatus[] = ['ORDERED', 'PARTIALLY_RECEIVED'];
const CANCELLABLE: readonly PurchaseStatus[] = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'];

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,80}$/;

/**
 * Purchase lifecycle (UC-20 … UC-24): DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED,
 * with CANCELLED from any open state. Stock only changes when goods are received or returned,
 * and always through the stock engine (invariant I6).
 */
@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────────────────

  async list(q: z.output<typeof PurchaseListQuerySchema>) {
    const { businessId, timezone } = this.ctx.tenant;
    const where: Prisma.PurchaseWhereInput = {
      businessId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      ...(q.from || q.to ? { createdAt: localDateRange(q.from, q.to, timezone) } : {}),
      ...(q.q
        ? {
            OR: [
              { reference: { contains: q.q, mode: 'insensitive' } },
              { supplier: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        include: purchaseSummaryInclude,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    const canSeeCost = this.ctx.can('products.view_cost');
    return {
      data: rows.map((p) => toPurchaseSummaryDto(p, canSeeCost)),
      meta: { page: q.page, pageSize: q.pageSize, total },
    };
  }

  async get(id: string, db: Tx | PrismaService = this.prisma) {
    const purchase = await db.purchase.findFirst({
      where: { id, businessId: this.ctx.tenant.businessId },
      include: purchaseDetailInclude,
    });
    if (!purchase) throw AppError.notFound('Purchase');
    return toPurchaseDetailDto(purchase, this.ctx.can('products.view_cost'));
  }

  // ── Create / edit / order ────────────────────────────────────────────────────────────

  async create(input: z.output<typeof CreatePurchaseSchema>) {
    const tenant = this.ctx.tenant;
    return this.prisma.$transaction(async (tx) => {
      const supplier = await this.activeSupplier(tx, input.supplierId);
      await this.checkProducts(tx, input.items);
      const warehouseId = await this.inventory.defaultWarehouseId(tx);
      const reference = await nextReference(tx, tenant.businessId, 'PURCHASE', tenant.timezone);
      const lines = this.priceLines(input.items);

      const now = new Date();
      const purchase = await tx.purchase.create({
        data: {
          businessId: tenant.businessId,
          reference,
          supplierId: supplier.id,
          warehouseId,
          notes: input.notes,
          total: sum(lines.map((l) => l.lineTotal)),
          createdById: tenant.userId,
          ...(input.markOrdered
            ? {
                status: 'ORDERED',
                orderedAt: now,
                expectedAt: this.expectedDate(input.expectedAt, supplier.leadTimeDays, now),
              }
            : {
                status: 'DRAFT',
                expectedAt: input.expectedAt
                  ? startOfLocalDay(input.expectedAt, tenant.timezone)
                  : null,
              }),
        },
      });
      await tx.purchaseItem.createMany({
        data: lines.map((l) => ({
          businessId: tenant.businessId,
          purchaseId: purchase.id,
          ...l,
        })),
      });
      await this.audit.record(tx, {
        action: 'purchase.create',
        entityType: 'Purchase',
        entityId: purchase.id,
        after: { reference, status: purchase.status, items: input.items },
      });
      return this.get(purchase.id, tx);
    });
  }

  async update(id: string, input: z.output<typeof UpdatePurchaseSchema>) {
    const tenant = this.ctx.tenant;
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockPurchase(tx, id);
      this.assertStatus(existing.status, EDITABLE, 'edit');
      const anyReceived = await tx.purchaseItem.count({
        where: {
          businessId: tenant.businessId,
          purchaseId: id,
          quantityReceived: { gt: 0 },
        },
      });
      if (anyReceived > 0) {
        throw new AppError('INVALID_STATE_TRANSITION', 'Goods were already received', {
          from: existing.status,
          action: 'edit',
        });
      }

      const data: Prisma.PurchaseUncheckedUpdateInput = {};
      if (input.supplierId && input.supplierId !== existing.supplierId) {
        data.supplierId = (await this.activeSupplier(tx, input.supplierId)).id;
      }
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.expectedAt !== undefined) {
        data.expectedAt = input.expectedAt
          ? startOfLocalDay(input.expectedAt, tenant.timezone)
          : null;
      }
      if (input.items) {
        await this.checkProducts(tx, input.items);
        const lines = this.priceLines(input.items);
        await tx.purchaseItem.deleteMany({
          where: { businessId: tenant.businessId, purchaseId: id },
        });
        await tx.purchaseItem.createMany({
          data: lines.map((l) => ({
            businessId: tenant.businessId,
            purchaseId: id,
            ...l,
          })),
        });
        data.total = sum(lines.map((l) => l.lineTotal));
      }
      await tx.purchase.update({
        where: { id, businessId: tenant.businessId },
        data,
      });
      await this.audit.record(tx, {
        action: 'purchase.update',
        entityType: 'Purchase',
        entityId: id,
        before: { supplierId: existing.supplierId, status: existing.status },
        after: input,
      });
      return this.get(id, tx);
    });
  }

  /** DRAFT → ORDERED. Expected date defaults to today + the supplier's lead time. */
  async order(id: string) {
    const tenant = this.ctx.tenant;
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockPurchase(tx, id);
      this.assertStatus(existing.status, ['DRAFT'], 'order');
      const supplier = await tx.supplier.findFirstOrThrow({
        where: { id: existing.supplierId, businessId: tenant.businessId },
        select: { leadTimeDays: true },
      });
      const now = new Date();
      await tx.purchase.update({
        where: { id, businessId: tenant.businessId },
        data: {
          status: 'ORDERED',
          orderedAt: now,
          expectedAt: existing.expectedAt ?? this.expectedDate(null, supplier.leadTimeDays, now),
        },
      });
      await this.audit.record(tx, {
        action: 'purchase.order',
        entityType: 'Purchase',
        entityId: id,
        before: { status: existing.status },
        after: { status: 'ORDERED' },
      });
      return this.get(id, tx);
    });
  }

  /** UC-23. For a partially received purchase this closes the remainder; received stock stays. */
  async cancel(id: string, input: z.output<typeof CancelPurchaseSchema>) {
    const tenant = this.ctx.tenant;
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockPurchase(tx, id);
      this.assertStatus(existing.status, CANCELLABLE, 'cancel');
      await tx.purchase.update({
        where: { id, businessId: tenant.businessId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: input.reason,
        },
      });
      await this.audit.record(tx, {
        action: 'purchase.cancel',
        entityType: 'Purchase',
        entityId: id,
        before: { status: existing.status },
        after: { status: 'CANCELLED', reason: input.reason },
      });
      return this.get(id, tx);
    });
  }

  // ── Receiving and returns (stock changes) ────────────────────────────────────────────

  /**
   * UC-22: records goods received. Idempotent: a retry with the same Idempotency-Key returns
   * the purchase without receiving twice (the purchase row lock serialises concurrent retries).
   */
  async receive(id: string, input: z.output<typeof ReceivePurchaseSchema>, idempotencyKey: string) {
    this.assertIdempotencyKey(idempotencyKey);
    const tenant = this.ctx.tenant;
    const requested = input.lines.filter((l) => !D(l.quantity).isZero());

    return this.inventory.transaction(async (tx) => {
      const purchase = await this.lockPurchase(tx, id);
      if (await this.replayed(tx, idempotencyKey, id, 'PURCHASE_RECEIPT', requested)) {
        return this.get(id, tx);
      }
      this.assertStatus(purchase.status, RECEIVABLE, 'receive');

      const items = await tx.purchaseItem.findMany({
        where: { businessId: tenant.businessId, purchaseId: id },
      });
      const byId = new Map(items.map((i) => [i.id, i]));

      const overReceipt: object[] = [];
      for (const line of requested) {
        const item = byId.get(line.purchaseItemId);
        if (!item) throw AppError.notFound('Purchase line');
        const remaining = remainingOf(item, purchase.status);
        if (D(line.quantity).gt(remaining)) {
          overReceipt.push({
            purchaseItemId: item.id,
            productId: item.productId,
            remaining: qtyString(remaining),
            requested: qtyString(D(line.quantity)),
          });
        }
        if (line.unitCost !== undefined && !D(line.unitCost).eq(item.unitCost)) {
          if (!this.ctx.can('purchases.manage')) {
            throw AppError.forbidden('Changing the unit cost requires purchases.manage');
          }
        }
      }
      if (overReceipt.length) {
        throw new AppError('OVER_RECEIPT', 'Receiving more than was ordered', overReceipt);
      }

      const movements = await this.inventory.applyMovements(
        tx,
        requested.map((line) => {
          const item = byId.get(line.purchaseItemId)!;
          return {
            productId: item.productId,
            warehouseId: purchase.warehouseId,
            type: 'PURCHASE_RECEIPT' as const,
            quantityChange: D(line.quantity),
            unitCost: line.unitCost !== undefined ? D(line.unitCost) : item.unitCost,
            note: input.note ?? undefined,
            documentRef: purchase.reference,
            idempotencyKey,
            refs: { purchaseId: id, purchaseItemId: item.id },
          };
        }),
      );

      // Update received quantities and, when the invoice cost differs, the line cost.
      for (const line of requested) {
        const item = byId.get(line.purchaseItemId)!;
        const newCost = line.unitCost !== undefined ? roundCost(D(line.unitCost)) : item.unitCost;
        const received = item.quantityReceived.plus(D(line.quantity));
        await tx.purchaseItem.update({
          where: { id: item.id, businessId: tenant.businessId },
          data: {
            quantityReceived: received,
            unitCost: newCost,
            lineTotal: roundMoney(item.quantityOrdered.times(newCost)),
          },
        });
        byId.set(item.id, {
          ...item,
          quantityReceived: received,
          unitCost: newCost,
        });
        // Last purchase cost becomes the product's reference cost (pre-fills the next order).
        await tx.product.update({
          where: { id: item.productId, businessId: tenant.businessId },
          data: { costPrice: newCost },
        });
      }

      const all = [...byId.values()];
      const complete = all.every((i) => i.quantityReceived.gte(i.quantityOrdered));
      const status: PurchaseStatus = complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      await tx.purchase.update({
        where: { id, businessId: tenant.businessId },
        data: {
          status,
          receivedAt: complete ? new Date() : null,
          total: sum(all.map((i) => roundMoney(i.quantityOrdered.times(i.unitCost)))),
        },
      });
      await this.audit.record(tx, {
        action: 'purchase.receive',
        entityType: 'Purchase',
        entityId: id,
        before: { status: purchase.status },
        after: { status, movementIds: movements.map((m) => m.id) },
      });
      return this.get(id, tx);
    });
  }

  /** UC-24: sends received goods back. Stock leaves at the current average cost. */
  async supplierReturn(
    id: string,
    input: z.output<typeof SupplierReturnSchema>,
    idempotencyKey: string | undefined,
  ) {
    if (idempotencyKey !== undefined) this.assertIdempotencyKey(idempotencyKey);
    const tenant = this.ctx.tenant;

    return this.inventory.transaction(async (tx) => {
      const purchase = await this.lockPurchase(tx, id);
      if (
        idempotencyKey &&
        (await this.replayed(tx, idempotencyKey, id, 'SUPPLIER_RETURN', input.lines))
      ) {
        return this.get(id, tx);
      }
      const items = await tx.purchaseItem.findMany({
        where: { businessId: tenant.businessId, purchaseId: id },
      });
      const byId = new Map(items.map((i) => [i.id, i]));

      const overReturn: object[] = [];
      for (const line of input.lines) {
        const item = byId.get(line.purchaseItemId);
        if (!item) throw AppError.notFound('Purchase line');
        const returnable = item.quantityReceived.minus(item.quantityReturned);
        if (D(line.quantity).gt(returnable)) {
          overReturn.push({
            purchaseItemId: item.id,
            productId: item.productId,
            returnable: qtyString(returnable),
            requested: qtyString(D(line.quantity)),
          });
        }
      }
      if (overReturn.length) {
        throw new AppError('OVER_RETURN', 'Returning more than was received', overReturn);
      }

      const documentRef = await nextReference(
        tx,
        tenant.businessId,
        'SUPPLIER_RETURN',
        tenant.timezone,
      );
      const movements = await this.inventory.applyMovements(
        tx,
        input.lines.map((line) => {
          const item = byId.get(line.purchaseItemId)!;
          return {
            productId: item.productId,
            warehouseId: purchase.warehouseId,
            type: 'SUPPLIER_RETURN' as const,
            quantityChange: D(line.quantity).negated(),
            reason: input.reason,
            note: input.note ?? undefined,
            documentRef,
            idempotencyKey,
            refs: { purchaseId: id, purchaseItemId: item.id },
          };
        }),
      );
      for (const line of input.lines) {
        await tx.purchaseItem.update({
          where: { id: line.purchaseItemId, businessId: tenant.businessId },
          data: { quantityReturned: { increment: D(line.quantity) } },
        });
      }
      await this.audit.record(tx, {
        action: 'purchase.supplier_return',
        entityType: 'Purchase',
        entityId: id,
        after: {
          documentRef,
          reason: input.reason,
          movementIds: movements.map((m) => m.id),
        },
      });
      return this.get(id, tx);
    });
  }

  /** Ledger rows created by this purchase (receipts and returns), newest first. */
  async movements(id: string) {
    const { businessId } = this.ctx.tenant;
    await this.find(id);
    return this.prisma.stockMovement.findMany({
      where: { businessId, purchaseId: id },
      include: movementInclude,
      orderBy: { seq: 'desc' },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────────────

  private async find(id: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, businessId: this.ctx.tenant.businessId },
      select: { id: true },
    });
    if (!purchase) throw AppError.notFound('Purchase');
    return purchase;
  }

  /** Locks the purchase row for the rest of the transaction (serialises receive/cancel/edit). */
  private async lockPurchase(tx: Tx, id: string) {
    const { businessId } = this.ctx.tenant;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "purchases"
      WHERE "id" = ${id}::uuid AND "businessId" = ${businessId}::uuid
      FOR UPDATE`;
    if (rows.length === 0) throw AppError.notFound('Purchase');
    return tx.purchase.findFirstOrThrow({ where: { id, businessId } });
  }

  private assertStatus(
    current: PurchaseStatus,
    allowed: readonly PurchaseStatus[],
    action: string,
  ) {
    if (!allowed.includes(current)) {
      throw new AppError('INVALID_STATE_TRANSITION', `Cannot ${action} a ${current} purchase`, {
        from: current,
        action,
      });
    }
  }

  private assertIdempotencyKey(key: string | undefined): asserts key is string {
    if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    if (!IDEMPOTENCY_KEY.test(key)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid Idempotency-Key', [
        {
          path: 'Idempotency-Key',
          code: 'invalid_format',
          message: 'sw.idempotencyKey',
        },
      ]);
    }
  }

  /**
   * True if movements with this key already exist (a retry). The same key reused for another
   * purchase, another operation or different quantities is a client bug → IDEMPOTENCY_CONFLICT.
   */
  private async replayed(
    tx: Tx,
    key: string,
    purchaseId: string,
    type: 'PURCHASE_RECEIPT' | 'SUPPLIER_RETURN',
    lines: { purchaseItemId: string; quantity: string }[],
  ): Promise<boolean> {
    const previous: StockMovement[] = await tx.stockMovement.findMany({
      where: { businessId: this.ctx.tenant.businessId, idempotencyKey: key },
    });
    if (previous.length === 0) return false;

    const sameRequest =
      previous.every((m) => m.purchaseId === purchaseId && m.type === type) &&
      previous.length === lines.length &&
      lines.every((l) => {
        const m = previous.find((p) => p.purchaseItemId === l.purchaseItemId);
        return m !== undefined && m.quantityChange.abs().eq(D(l.quantity));
      });
    if (!sameRequest) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was already used for another request',
      );
    }
    return true;
  }

  private async activeSupplier(tx: Tx, supplierId: string) {
    const supplier = await tx.supplier.findFirst({
      where: {
        id: supplierId,
        businessId: this.ctx.tenant.businessId,
        archivedAt: null,
      },
      select: { id: true, leadTimeDays: true },
    });
    if (!supplier) throw AppError.notFound('Supplier');
    return supplier;
  }

  /** Products must belong to the business, be active, and respect the fractional rule. */
  private async checkProducts(tx: Tx, items: ItemInput[]) {
    const ids = items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: {
        businessId: this.ctx.tenant.businessId,
        id: { in: ids },
        archivedAt: null,
      },
      select: { id: true, allowFractional: true },
    });
    if (products.length !== new Set(ids).size) throw AppError.notFound('Product');
    const fractional = new Map(products.map((p) => [p.id, p.allowFractional]));
    const offending = items.filter(
      (i) => !fractional.get(i.productId) && !D(i.quantityOrdered).isInteger(),
    );
    if (offending.length) {
      throw new AppError(
        'FRACTIONAL_QUANTITY_NOT_ALLOWED',
        'Whole numbers only for these products',
        offending.map((i) => ({ productId: i.productId })),
      );
    }
  }

  private priceLines(items: ItemInput[]) {
    return items.map((i) => {
      const quantityOrdered = D(i.quantityOrdered);
      const unitCost = roundCost(D(i.unitCost));
      return {
        productId: i.productId,
        quantityOrdered,
        unitCost,
        lineTotal: roundMoney(quantityOrdered.times(unitCost)),
      };
    });
  }

  /** Expected delivery: the given business-local date, else today + lead time. */
  private expectedDate(localDate: string | null | undefined, leadTimeDays: number, now: Date) {
    const tz = this.ctx.tenant.timezone;
    return startOfLocalDay(localDate ?? addDays(localDateOf(now, tz), leadTimeDays), tz);
  }
}
