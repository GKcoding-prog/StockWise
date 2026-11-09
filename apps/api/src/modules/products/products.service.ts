import { Injectable } from '@nestjs/common';
import type { CreateProductSchema, ProductListQuery, UpdateProductSchema } from '@stockwise/shared';
import type { z } from 'zod';
import { RequestContext } from '../../common/context/request-context';
import { D, ZERO, qtyString } from '../../common/decimal';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { StockQueryService } from '../inventory/stock-query.service';
import { productInclude, toProductDto } from './product.mapper';

type CreateInput = z.output<typeof CreateProductSchema>;
type UpdateInput = z.output<typeof UpdateProductSchema>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly inventory: InventoryService,
    private readonly stockQuery: StockQueryService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ProductListQuery) {
    const { businessId } = this.ctx.tenant;
    const warehouseId = await this.inventory.defaultWarehouseId();
    const { ids, total } = await this.stockQuery.pageOfProductIds({
      businessId,
      warehouseId,
      q: q.q,
      categoryId: q.categoryId,
      supplierId: q.supplierId,
      stockStatus: q.stockStatus,
      archived: q.archived,
      sort: q.sort,
      page: q.page,
      pageSize: q.pageSize,
    });
    const rows = await this.prisma.product.findMany({
      where: { businessId, id: { in: ids } },
      include: productInclude(warehouseId),
    });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const canSeeCost = this.ctx.can('products.view_cost');
    return {
      data: ids.map((id) => toProductDto(byId.get(id)!, canSeeCost)),
      meta: { page: q.page, pageSize: q.pageSize, total },
    };
  }

  /** Exact SKU or barcode match, for the scanner on the sale screen. */
  async lookup(code: string) {
    const { businessId } = this.ctx.tenant;
    const warehouseId = await this.inventory.defaultWarehouseId();
    const product = await this.prisma.product.findFirst({
      where: {
        businessId,
        archivedAt: null,
        OR: [{ barcode: code }, { sku: { equals: code, mode: 'insensitive' } }],
      },
      include: productInclude(warehouseId),
    });
    if (!product) throw AppError.notFound('Product');
    return toProductDto(product, this.ctx.can('products.view_cost'));
  }

  async get(id: string) {
    const { businessId } = this.ctx.tenant;
    const warehouseId = await this.inventory.defaultWarehouseId();
    const product = await this.prisma.product.findFirst({
      where: { id, businessId },
      include: {
        ...productInclude(warehouseId),
        stockLevels: {
          select: {
            warehouseId: true,
            quantityOnHand: true,
            averageCost: true,
            lastMovementAt: true,
            warehouse: { select: { name: true, code: true } },
          },
        },
      },
    });
    if (!product) throw AppError.notFound('Product');
    const canSeeCost = this.ctx.can('products.view_cost');
    const defaultLevel = product.stockLevels.filter((l) => l.warehouseId === warehouseId);
    return {
      ...toProductDto({ ...product, stockLevels: defaultLevel }, canSeeCost),
      stockByWarehouse: product.stockLevels.map((l) => ({
        warehouseId: l.warehouseId,
        warehouseName: l.warehouse.name,
        quantityOnHand: qtyString(l.quantityOnHand),
        ...(canSeeCost ? { averageCost: l.averageCost.toFixed(4) } : {}),
      })),
      velocity: await this.velocity(businessId, id),
    };
  }

  async create(input: CreateInput) {
    const { businessId } = this.ctx.tenant;
    await this.assertReferences(input.categoryId, input.defaultSupplierId);
    try {
      const productId = await this.inventory.transaction(async (tx) => {
        const sku = input.sku ?? (await this.suggestSku(tx, input.name));
        const product = await tx.product.create({
          data: {
            businessId,
            name: input.name,
            sku,
            barcode: input.barcode,
            description: input.description,
            categoryId: input.categoryId,
            defaultSupplierId: input.defaultSupplierId,
            unit: input.unit,
            allowFractional: input.allowFractional,
            sellingPrice: D(input.sellingPrice),
            costPrice: input.costPrice
              ? D(input.costPrice)
              : input.openingUnitCost
                ? D(input.openingUnitCost)
                : null,
            minStockLevel: D(input.minStockLevel),
            targetStockLevel: input.targetStockLevel ? D(input.targetStockLevel) : null,
            reorderMultiple: input.reorderMultiple ? D(input.reorderMultiple) : null,
            leadTimeDaysOverride: input.leadTimeDaysOverride ?? null,
          },
        });
        const opening = input.openingQuantity ? D(input.openingQuantity) : ZERO;
        if (opening.gt(0)) {
          await this.inventory.applyMovements(tx, [
            {
              productId: product.id,
              warehouseId: await this.inventory.defaultWarehouseId(tx),
              type: 'OPENING_BALANCE',
              quantityChange: opening,
              unitCost: D(input.openingUnitCost!),
            },
          ]);
        }
        await this.audit.record(tx, {
          action: 'product.create',
          entityType: 'Product',
          entityId: product.id,
          after: { ...product, openingQuantity: input.openingQuantity ?? null },
        });
        return product.id;
      });
      return this.get(productId);
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(id: string, input: UpdateInput) {
    const { businessId } = this.ctx.tenant;
    const existing = await this.prisma.product.findFirst({ where: { id, businessId } });
    if (!existing) throw AppError.notFound('Product');
    await this.assertReferences(input.categoryId, input.defaultSupplierId);

    const data: Prisma.ProductUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.barcode !== undefined) data.barcode = input.barcode;
    if (input.description !== undefined) data.description = input.description;
    if (input.categoryId !== undefined) {
      data.category = input.categoryId
        ? { connect: { id: input.categoryId } }
        : { disconnect: true };
    }
    if (input.defaultSupplierId !== undefined) {
      data.defaultSupplier = input.defaultSupplierId
        ? { connect: { id: input.defaultSupplierId } }
        : { disconnect: true };
    }
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.allowFractional !== undefined) data.allowFractional = input.allowFractional;
    if (input.sellingPrice !== undefined) data.sellingPrice = D(input.sellingPrice);
    if (input.costPrice !== undefined) data.costPrice = input.costPrice ? D(input.costPrice) : null;
    if (input.minStockLevel !== undefined) data.minStockLevel = D(input.minStockLevel);
    if (input.targetStockLevel !== undefined) {
      data.targetStockLevel = input.targetStockLevel ? D(input.targetStockLevel) : null;
    }
    if (input.reorderMultiple !== undefined) {
      data.reorderMultiple = input.reorderMultiple ? D(input.reorderMultiple) : null;
    }
    if (input.leadTimeDaysOverride !== undefined) {
      data.leadTimeDaysOverride = input.leadTimeDaysOverride ?? null;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({ where: { id, businessId }, data });
        await this.audit.record(tx, {
          action: 'product.update',
          entityType: 'Product',
          entityId: id,
          before: existing,
          after: updated,
        });
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
    return this.get(id);
  }

  async setArchived(id: string, archived: boolean) {
    const { businessId } = this.ctx.tenant;
    const existing = await this.prisma.product.findFirst({ where: { id, businessId } });
    if (!existing) throw AppError.notFound('Product');
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id, businessId },
        data: { archivedAt: archived ? new Date() : null },
      });
      await this.audit.record(tx, {
        action: archived ? 'product.archive' : 'product.restore',
        entityType: 'Product',
        entityId: id,
      });
    });
    return this.get(id);
  }

  /** Net units sold over 7/30/90 days and average daily sales (docs/04 §2). */
  private async velocity(businessId: string, productId: string) {
    const rows = await this.prisma.$queryRaw<
      { d7: string; d30: string; d90: string; firstMovementAt: Date | null }[]
    >`
      SELECT
        COALESCE(-SUM("quantityChange") FILTER (
          WHERE "type" IN ('SALE','SALE_VOID','CUSTOMER_RETURN') AND "occurredAt" >= now() - interval '7 days'), 0)::text AS d7,
        COALESCE(-SUM("quantityChange") FILTER (
          WHERE "type" IN ('SALE','SALE_VOID','CUSTOMER_RETURN') AND "occurredAt" >= now() - interval '30 days'), 0)::text AS d30,
        COALESCE(-SUM("quantityChange") FILTER (
          WHERE "type" IN ('SALE','SALE_VOID','CUSTOMER_RETURN') AND "occurredAt" >= now() - interval '90 days'), 0)::text AS d90,
        MIN("occurredAt") AS "firstMovementAt"
      FROM "stock_movements"
      WHERE "businessId" = ${businessId}::uuid AND "productId" = ${productId}::uuid`;
    const r = rows[0];
    const daysOfHistory = r.firstMovementAt
      ? Math.max(1, Math.ceil((Date.now() - r.firstMovementAt.getTime()) / 86_400_000))
      : 0;
    const window = (days: number, netSold: string) => {
      const effectiveDays = Math.min(days, daysOfHistory);
      return {
        days,
        netSold: qtyString(D(netSold)),
        averageDailySales:
          effectiveDays > 0 ? D(netSold).dividedBy(effectiveDays).toFixed(3) : '0.000',
      };
    };
    return {
      daysOfHistory,
      windows: [window(7, r.d7), window(30, r.d30), window(90, r.d90)],
    };
  }

  /** Referenced category and supplier must belong to the caller's business. */
  private async assertReferences(categoryId?: string | null, supplierId?: string | null) {
    const { businessId } = this.ctx.tenant;
    if (categoryId) {
      const found = await this.prisma.category.count({ where: { id: categoryId, businessId } });
      if (!found) throw AppError.notFound('Category');
    }
    if (supplierId) {
      const found = await this.prisma.supplier.count({ where: { id: supplierId, businessId } });
      if (!found) throw AppError.notFound('Supplier');
    }
  }

  /** e.g. "Sucre 1 kg" → SUC-0007 (next free number for that prefix). */
  private async suggestSku(tx: Tx, name: string): Promise<string> {
    const { businessId } = this.ctx.tenant;
    const letters = name
      .normalize('NFD')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase();
    const prefix = (letters.slice(0, 3) || 'PRD').padEnd(3, 'X');
    const existing = await tx.product.findMany({
      where: { businessId, sku: { startsWith: `${prefix}-` } },
      select: { sku: true },
    });
    const max = existing.reduce((m, { sku }) => {
      const n = Number(sku.slice(prefix.length + 1));
      return Number.isInteger(n) && n > m ? n : m;
    }, 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  private mapUniqueError(err: unknown): unknown {
    if (isUniqueViolation(err, 'sku')) return new AppError('SKU_TAKEN', 'SKU already in use');
    if (isUniqueViolation(err, 'barcode'))
      return new AppError('BARCODE_TAKEN', 'Barcode already in use');
    return err;
  }
}
