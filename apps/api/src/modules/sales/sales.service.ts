import { Injectable } from '@nestjs/common';
import type {
  CreateSaleSchema,
  CustomerReturnSchema,
  SaleListQuerySchema,
  VoidSaleSchema,
} from '@stockwise/shared';
import type { z } from 'zod';
import { RequestContext } from '../../common/context/request-context';
import { sha256 } from '../../common/crypto';
import { D, Decimal, ZERO, moneyString, qtyString, roundMoney, sum } from '../../common/decimal';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import { localDateRange } from '../../common/time';
import type { Prisma, StockMovement } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { nextReference } from '../inventory/document-sequence';
import { InventoryService } from '../inventory/inventory.service';
import { movementInclude } from '../inventory/movement.mapper';
import { stockStatus } from '../inventory/stock-math';
import { discountPercent, refundShare } from './sale-math';
import {
  saleDetailInclude,
  saleSummaryInclude,
  toSaleDetailDto,
  toSaleSummaryDto,
} from './sale.mapper';

type CreateInput = z.output<typeof CreateSaleSchema>;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,80}$/;

/** Movement reason stored on SALE_VOID rows; the free-text void reason goes in the note. */
const VOID_MOVEMENT_REASON = 'VOIDED';

interface PricedLine {
  productId: string;
  productName: string;
  quantity: Decimal;
  /** The product's selling price, the reference for the discount limit. */
  listPrice: Decimal;
  unitPrice: Decimal;
  discountAmount: Decimal;
  gross: Decimal;
  lineTotal: Decimal;
}

/**
 * Sales (UC-30 … UC-33). A sale is created COMPLETED in one transaction with its SALE
 * movements; it can then be VOIDED (all stock back) or returned line by line
 * (PARTIALLY_RETURNED → RETURNED). Stock only changes through the stock engine (I6).
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────────────────

  async list(q: z.output<typeof SaleListQuerySchema>) {
    const { businessId, timezone } = this.ctx.tenant;
    const where: Prisma.SaleWhereInput = {
      businessId,
      ...this.visibility(q.userId),
      ...(q.status ? { status: q.status } : {}),
      ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
      ...(q.productId ? { items: { some: { productId: q.productId } } } : {}),
      ...(q.from || q.to ? { soldAt: localDateRange(q.from, q.to, timezone) } : {}),
      ...(q.q
        ? {
            OR: [
              { reference: { contains: q.q, mode: 'insensitive' } },
              { customerName: { contains: q.q, mode: 'insensitive' } },
              { customerPhone: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: saleSummaryInclude,
        orderBy: { soldAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return {
      data: rows.map(toSaleSummaryDto),
      meta: { page: q.page, pageSize: q.pageSize, total },
    };
  }

  async get(id: string, db: Tx | PrismaService = this.prisma) {
    const sale = await db.sale.findFirst({
      where: { id, businessId: this.ctx.tenant.businessId, ...this.visibility() },
      include: saleDetailInclude,
    });
    if (!sale) throw AppError.notFound('Sale');
    return toSaleDetailDto(sale, this.ctx.can('products.view_cost'));
  }

  /** Ledger rows created by this sale (the sale itself, a void, returns), newest first. */
  async movements(id: string) {
    const { businessId } = this.ctx.tenant;
    await this.get(id); // visibility rule
    return this.prisma.stockMovement.findMany({
      where: { businessId, saleId: id },
      include: movementInclude,
      orderBy: { seq: 'desc' },
    });
  }

  // ── Record a sale (UC-30) ────────────────────────────────────────────────────────────

  /**
   * Idempotent (I9): a retry with the same Idempotency-Key and body returns the original sale;
   * the same key with another body is IDEMPOTENCY_CONFLICT. Two concurrent retries race on the
   * unique (businessId, idempotencyKey) index, and the loser returns the winner's sale.
   */
  async create(input: CreateInput, idempotencyKey: string | undefined) {
    this.assertIdempotencyKey(idempotencyKey);
    const requestHash = sha256(JSON.stringify(input));
    const previous = await this.replay(idempotencyKey, requestHash);
    if (previous) return previous;
    try {
      return await this.inventory.transaction((tx) =>
        this.createInTx(tx, input, idempotencyKey, requestHash),
      );
    } catch (err) {
      if (isUniqueViolation(err, 'idempotencyKey')) {
        const winner = await this.replay(idempotencyKey, requestHash);
        if (winner) return winner;
      }
      throw err;
    }
  }

  private async createInTx(tx: Tx, input: CreateInput, idempotencyKey: string, hash: string) {
    const tenant = this.ctx.tenant;
    const warehouseId = await this.inventory.defaultWarehouseId(tx);
    const lines = await this.priceLines(tx, input.items);
    this.checkDiscounts(lines);

    const subtotal = sum(lines.map((l) => l.gross));
    const discountTotal = sum(lines.map((l) => l.discountAmount));
    const total = subtotal.minus(discountTotal);

    // Change is only meaningful for cash; other methods ignore the tendered amount.
    let amountTendered: Decimal | null = null;
    let changeDue: Decimal | null = null;
    if (input.paymentMethod === 'CASH' && input.amountTendered !== null) {
      amountTendered = D(input.amountTendered);
      if (amountTendered.lt(total)) {
        throw new AppError('VALIDATION_ERROR', 'Amount tendered is less than the total', [
          { path: 'amountTendered', code: 'too_small', message: 'sw.tenderedTooLow' },
        ]);
      }
      changeDue = amountTendered.minus(total);
    }

    const reference = await nextReference(tx, tenant.businessId, 'SALE', tenant.timezone);
    const sale = await tx.sale.create({
      data: {
        businessId: tenant.businessId,
        reference,
        warehouseId,
        soldById: tenant.userId,
        paymentMethod: input.paymentMethod,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        notes: input.notes,
        subtotal,
        discountTotal,
        total,
        amountTendered,
        changeDue,
        idempotencyKey,
        requestHash: hash,
      },
    });
    const items = await tx.saleItem.createManyAndReturn({
      data: lines.map((l) => ({
        businessId: tenant.businessId,
        saleId: sale.id,
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        lineTotal: l.lineTotal,
        unitCost: ZERO, // set from the movement's average cost below
      })),
    });

    // Checks stock (INSUFFICIENT_STOCK rolls everything back) and the fractional rule.
    const movements = await this.inventory.applyMovements(
      tx,
      items.map((si) => ({
        productId: si.productId,
        warehouseId,
        type: 'SALE' as const,
        quantityChange: si.quantity.negated(),
        documentRef: reference,
        refs: { saleId: sale.id, saleItemId: si.id },
      })),
    );
    // Cost snapshot for margin reports (docs/02 §1.4).
    for (const m of movements) {
      await tx.saleItem.update({
        where: { id: m.saleItemId!, businessId: tenant.businessId },
        data: { unitCost: m.unitCost },
      });
    }

    await this.audit.record(tx, {
      action: 'sale.create',
      entityType: 'Sale',
      entityId: sale.id,
      after: {
        reference,
        total: moneyString(total),
        paymentMethod: input.paymentMethod,
        movementIds: movements.map((m) => m.id),
      },
    });
    return this.withStockAfter(sale.id, tx);
  }

  // ── Void (UC-32) ─────────────────────────────────────────────────────────────────────

  /** Puts every unit back at its original cost. Only for a sale with no returns. */
  async void(id: string, input: z.output<typeof VoidSaleSchema>) {
    const tenant = this.ctx.tenant;
    return this.inventory.transaction(async (tx) => {
      const sale = await this.lockSale(tx, id);
      if (sale.status === 'VOIDED') {
        throw new AppError('ALREADY_VOIDED', 'This sale is already voided');
      }
      if (sale.status !== 'COMPLETED' || sale.returnedTotal.gt(0)) {
        throw new AppError('HAS_RETURNS', 'A sale with returns cannot be voided');
      }

      const sold: StockMovement[] = await tx.stockMovement.findMany({
        where: { businessId: tenant.businessId, saleId: id, type: 'SALE' },
        orderBy: { seq: 'asc' },
      });
      const movements = await this.inventory.applyMovements(
        tx,
        sold.map((m) => ({
          productId: m.productId,
          warehouseId: m.warehouseId,
          type: 'SALE_VOID' as const,
          quantityChange: m.quantityChange.negated(),
          unitCost: m.unitCost,
          reason: VOID_MOVEMENT_REASON,
          note: input.reason,
          documentRef: sale.reference,
          refs: { saleId: id, saleItemId: m.saleItemId ?? undefined, reversalOfId: m.id },
        })),
      );
      await tx.sale.update({
        where: { id, businessId: tenant.businessId },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: tenant.userId,
          voidReason: input.reason,
        },
      });
      await this.audit.record(tx, {
        action: 'sale.void',
        entityType: 'Sale',
        entityId: id,
        before: { status: sale.status },
        after: {
          status: 'VOIDED',
          reason: input.reason,
          movementIds: movements.map((m) => m.id),
        },
      });
      return this.get(id, tx);
    });
  }

  // ── Customer return (UC-33) ──────────────────────────────────────────────────────────

  /**
   * Returned units go back into stock at the cost they left with. The refund is the line's
   * paid amount pro rata, computed so that a fully returned line refunds exactly its total.
   */
  async customerReturn(
    id: string,
    input: z.output<typeof CustomerReturnSchema>,
    idempotencyKey: string | undefined,
  ) {
    if (idempotencyKey !== undefined) this.assertIdempotencyKey(idempotencyKey);
    const tenant = this.ctx.tenant;

    return this.inventory.transaction(async (tx) => {
      const sale = await this.lockSale(tx, id);
      if (idempotencyKey && (await this.returnReplayed(tx, idempotencyKey, id, input.lines))) {
        return this.get(id, tx);
      }
      if (sale.status === 'VOIDED') {
        throw new AppError('INVALID_STATE_TRANSITION', 'Cannot return items of a voided sale', {
          from: sale.status,
          action: 'return',
        });
      }

      const items = await tx.saleItem.findMany({
        where: { businessId: tenant.businessId, saleId: id },
      });
      const byId = new Map(items.map((i) => [i.id, i]));
      const overReturn: object[] = [];
      for (const line of input.lines) {
        const item = byId.get(line.saleItemId);
        if (!item) throw AppError.notFound('Sale line');
        const returnable = item.quantity.minus(item.quantityReturned);
        if (D(line.quantity).gt(returnable)) {
          overReturn.push({
            saleItemId: item.id,
            productId: item.productId,
            returnable: qtyString(returnable),
            requested: qtyString(D(line.quantity)),
          });
        }
      }
      if (overReturn.length) {
        throw new AppError('OVER_RETURN', 'Returning more than was sold', overReturn);
      }

      const documentRef = await nextReference(
        tx,
        tenant.businessId,
        'CUSTOMER_RETURN',
        tenant.timezone,
      );
      const movements = await this.inventory.applyMovements(
        tx,
        input.lines.map((line) => {
          const item = byId.get(line.saleItemId)!;
          return {
            productId: item.productId,
            warehouseId: sale.warehouseId,
            type: 'CUSTOMER_RETURN' as const,
            quantityChange: D(line.quantity),
            unitCost: item.unitCost,
            reason: input.reason,
            note: input.note ?? undefined,
            documentRef,
            idempotencyKey,
            refs: { saleId: id, saleItemId: item.id },
          };
        }),
      );

      let refund = ZERO;
      for (const line of input.lines) {
        const item = byId.get(line.saleItemId)!;
        const after = item.quantityReturned.plus(D(line.quantity));
        refund = refund.plus(
          refundShare(item, after).minus(refundShare(item, item.quantityReturned)),
        );
        await tx.saleItem.update({
          where: { id: item.id, businessId: tenant.businessId },
          data: { quantityReturned: after },
        });
        byId.set(item.id, { ...item, quantityReturned: after });
      }
      const allReturned = [...byId.values()].every((i) => i.quantityReturned.gte(i.quantity));
      await tx.sale.update({
        where: { id, businessId: tenant.businessId },
        data: {
          status: allReturned ? 'RETURNED' : 'PARTIALLY_RETURNED',
          returnedTotal: sale.returnedTotal.plus(refund),
        },
      });
      await this.audit.record(tx, {
        action: 'sale.return',
        entityType: 'Sale',
        entityId: id,
        before: { status: sale.status },
        after: {
          documentRef,
          reason: input.reason,
          refund: moneyString(refund),
          movementIds: movements.map((m) => m.id),
        },
      });
      return this.get(id, tx);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────────────

  /** Employees (no sales.view_all) only see their own sales (docs/03 §2). */
  private visibility(userId?: string): Prisma.SaleWhereInput {
    if (!this.ctx.can('sales.view_all')) return { soldById: this.ctx.tenant.userId };
    return userId ? { soldById: userId } : {};
  }

  /** The created sale plus the resulting stock of each product, for low-stock warnings. */
  private async withStockAfter(id: string, db: Tx | PrismaService) {
    const sale = await this.get(id, db);
    const movements = await db.stockMovement.findMany({
      where: { businessId: this.ctx.tenant.businessId, saleId: id, type: 'SALE' },
      select: {
        productId: true,
        quantityAfter: true,
        product: { select: { minStockLevel: true } },
      },
    });
    return {
      ...sale,
      stockAfter: movements.map((m) => ({
        productId: m.productId,
        quantityOnHand: qtyString(m.quantityAfter),
        stockStatus: stockStatus(m.quantityAfter, m.product.minStockLevel),
      })),
    };
  }

  /** The sale this key already created, if any. Different body or seller → conflict. */
  private async replay(idempotencyKey: string, requestHash: string) {
    const { businessId, userId } = this.ctx.tenant;
    const existing = await this.prisma.sale.findFirst({
      where: { businessId, idempotencyKey },
      select: { id: true, requestHash: true, soldById: true },
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash || existing.soldById !== userId) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was already used for another request',
      );
    }
    return this.withStockAfter(existing.id, this.prisma);
  }

  /** Same idea as purchases: movements carrying this key mean the return already happened. */
  private async returnReplayed(
    tx: Tx,
    key: string,
    saleId: string,
    lines: { saleItemId: string; quantity: string }[],
  ): Promise<boolean> {
    const previous: StockMovement[] = await tx.stockMovement.findMany({
      where: { businessId: this.ctx.tenant.businessId, idempotencyKey: key },
    });
    if (previous.length === 0) return false;
    const sameRequest =
      previous.every((m) => m.saleId === saleId && m.type === 'CUSTOMER_RETURN') &&
      previous.length === lines.length &&
      lines.every((l) => {
        const m = previous.find((p) => p.saleItemId === l.saleItemId);
        return m !== undefined && m.quantityChange.eq(D(l.quantity));
      });
    if (!sameRequest) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was already used for another request',
      );
    }
    return true;
  }

  /** Locks the sale row for the rest of the transaction (serialises void and returns). */
  private async lockSale(tx: Tx, id: string) {
    const { businessId } = this.ctx.tenant;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "sales"
      WHERE "id" = ${id}::uuid AND "businessId" = ${businessId}::uuid
      FOR UPDATE`;
    if (rows.length === 0) throw AppError.notFound('Sale');
    const sale = await tx.sale.findFirst({ where: { id, businessId, ...this.visibility() } });
    if (!sale) throw AppError.notFound('Sale');
    return sale;
  }

  /**
   * Server-side pricing: products must be active and belong to the business; the price
   * defaults to the selling price; a discount can't exceed the line amount.
   */
  private async priceLines(tx: Tx, items: CreateInput['items']): Promise<PricedLine[]> {
    const ids = items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { businessId: this.ctx.tenant.businessId, id: { in: ids }, archivedAt: null },
      select: { id: true, name: true, sellingPrice: true },
    });
    if (products.length !== new Set(ids).size) throw AppError.notFound('Product');
    const byId = new Map(products.map((p) => [p.id, p]));

    const tooBig: object[] = [];
    const lines = items.map((item, index) => {
      const product = byId.get(item.productId)!;
      const quantity = D(item.quantity);
      const unitPrice = item.unitPrice !== undefined ? D(item.unitPrice) : product.sellingPrice;
      const gross = roundMoney(quantity.times(unitPrice));
      const discountAmount = D(item.discountAmount);
      if (discountAmount.gt(gross)) {
        tooBig.push({
          path: `items.${index}.discountAmount`,
          code: 'too_big',
          message: 'sw.discountAboveLine',
        });
      }
      return {
        productId: product.id,
        productName: product.name,
        quantity,
        listPrice: product.sellingPrice,
        unitPrice,
        discountAmount,
        gross,
        lineTotal: gross.minus(discountAmount),
      };
    });
    if (tooBig.length) {
      throw new AppError('VALIDATION_ERROR', 'Discount is larger than the line amount', tooBig);
    }
    return lines;
  }

  /**
   * Employee discount limit (docs/03 §3): per line, the price cut plus the line discount,
   * as a share of the line at the selling price, must not exceed employeeMaxDiscountPercent.
   */
  private checkDiscounts(lines: PricedLine[]) {
    if (this.ctx.can('sales.discount_unlimited')) return;
    const max = D(this.ctx.tenant.settings.employeeMaxDiscountPercent);
    const over = lines.flatMap((l) => {
      const percent = discountPercent(l);
      return percent.gt(max)
        ? [
            {
              productId: l.productId,
              maxPercent: max.toString(),
              requestedPercent: percent.toDecimalPlaces(2).toString(),
            },
          ]
        : [];
    });
    if (over.length) {
      throw new AppError('DISCOUNT_NOT_ALLOWED', 'Discount above your limit', over);
    }
  }

  private assertIdempotencyKey(key: string | undefined): asserts key is string {
    if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    if (!IDEMPOTENCY_KEY.test(key)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid Idempotency-Key', [
        { path: 'Idempotency-Key', code: 'invalid_format', message: 'sw.idempotencyKey' },
      ]);
    }
  }
}
