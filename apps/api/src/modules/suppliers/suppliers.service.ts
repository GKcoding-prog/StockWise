import { Injectable } from '@nestjs/common';
import type {
  CreateSupplierSchema,
  SupplierListQuerySchema,
  UpdateSupplierSchema,
} from '@stockwise/shared';
import type { z } from 'zod';
import { RequestContext } from '../../common/context/request-context';
import { moneyString, sum } from '../../common/decimal';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import type { Prisma, Supplier } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const OPEN_PURCHASE_STATUSES = ['ORDERED', 'PARTIALLY_RECEIVED'] as const;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
  ) {}

  async list(q: z.output<typeof SupplierListQuerySchema>) {
    const { businessId } = this.ctx.tenant;
    const where: Prisma.SupplierWhereInput = {
      businessId,
      archivedAt: q.archived ? { not: null } : null,
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { contactName: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { products: { where: { archivedAt: null } } } } },
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return {
      data: rows.map(({ _count, ...s }) => ({ ...s, productCount: _count.products })),
      meta: { page: q.page, pageSize: q.pageSize, total },
    };
  }

  /** Details + open purchases count/value (docs/05 §4.7). */
  async get(id: string) {
    const supplier = await this.find(id);
    const open = await this.prisma.purchase.findMany({
      where: {
        businessId: supplier.businessId,
        supplierId: id,
        status: { in: [...OPEN_PURCHASE_STATUSES] },
      },
      select: { total: true },
    });
    const canSeeCost = this.ctx.can('products.view_cost');
    return {
      ...supplier,
      openPurchases: {
        count: open.length,
        ...(canSeeCost ? { value: moneyString(sum(open.map((p) => p.total))) } : {}),
      },
    };
  }

  async create(input: z.output<typeof CreateSupplierSchema>) {
    const { businessId } = this.ctx.tenant;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({ data: { businessId, ...input } });
        await this.audit.record(tx, {
          action: 'supplier.create',
          entityType: 'Supplier',
          entityId: supplier.id,
          after: supplier,
        });
        return supplier;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('NAME_TAKEN', 'Supplier name already in use');
      throw err;
    }
  }

  async update(id: string, input: z.output<typeof UpdateSupplierSchema>) {
    const existing = await this.find(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.update({
          where: { id, businessId: existing.businessId },
          data: input,
        });
        await this.audit.record(tx, {
          action: 'supplier.update',
          entityType: 'Supplier',
          entityId: id,
          before: existing,
          after: supplier,
        });
        return supplier;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('NAME_TAKEN', 'Supplier name already in use');
      throw err;
    }
  }

  async setArchived(id: string, archived: boolean) {
    const existing = await this.find(id);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.update({
        where: { id, businessId: existing.businessId },
        data: { archivedAt: archived ? new Date() : null },
      });
      await this.audit.record(tx, {
        action: archived ? 'supplier.archive' : 'supplier.restore',
        entityType: 'Supplier',
        entityId: id,
      });
      return supplier;
    });
  }

  async products(id: string) {
    const supplier = await this.find(id);
    const rows = await this.prisma.product.findMany({
      where: { businessId: supplier.businessId, defaultSupplierId: id, archivedAt: null },
      select: { id: true, name: true, sku: true, unit: true },
      orderBy: { name: 'asc' },
    });
    return { data: rows };
  }

  async purchases(id: string) {
    const supplier = await this.find(id);
    const canSeeCost = this.ctx.can('products.view_cost');
    const rows = await this.prisma.purchase.findMany({
      where: { businessId: supplier.businessId, supplierId: id },
      select: {
        id: true,
        reference: true,
        status: true,
        orderedAt: true,
        expectedAt: true,
        receivedAt: true,
        createdAt: true,
        total: canSeeCost,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { data: rows };
  }

  private async find(id: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, businessId: this.ctx.tenant.businessId },
    });
    if (!supplier) throw AppError.notFound('Supplier');
    return supplier;
  }
}
