import { Injectable } from '@nestjs/common';
import type { StockStatus } from '@stockwise/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProductStockFilter {
  businessId: string;
  warehouseId: string;
  q?: string;
  categoryId?: string;
  supplierId?: string;
  stockStatus?: StockStatus;
  archived?: boolean;
  sort?: string;
  page: number;
  pageSize: number;
}

/** Whitelisted sort keys → SQL. A leading "-" sorts descending. */
const SORTS: Record<string, Prisma.Sql> = {
  name: Prisma.sql`p."name"`,
  sku: Prisma.sql`p."sku"`,
  createdAt: Prisma.sql`p."createdAt"`,
  sellingPrice: Prisma.sql`p."sellingPrice"`,
  quantityOnHand: Prisma.sql`COALESCE(sl."quantityOnHand", 0)`,
};

const QTY = Prisma.sql`COALESCE(sl."quantityOnHand", 0)`;

/**
 * Products joined with their balance in one warehouse, filterable by computed stock status
 * (docs/04 §1). Prisma's query builder can't compare columns across tables, so the id page is
 * selected in SQL and the rows are then loaded with Prisma.
 */
@Injectable()
export class StockQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async pageOfProductIds(f: ProductStockFilter): Promise<{ ids: string[]; total: number }> {
    const where: Prisma.Sql[] = [Prisma.sql`p."businessId" = ${f.businessId}::uuid`];
    where.push(
      f.archived ? Prisma.sql`p."archivedAt" IS NOT NULL` : Prisma.sql`p."archivedAt" IS NULL`,
    );
    if (f.q) {
      const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(
        Prisma.sql`(p."name" ILIKE ${like} OR p."sku" ILIKE ${like} OR p."barcode" = ${f.q})`,
      );
    }
    if (f.categoryId) where.push(Prisma.sql`p."categoryId" = ${f.categoryId}::uuid`);
    if (f.supplierId) where.push(Prisma.sql`p."defaultSupplierId" = ${f.supplierId}::uuid`);
    if (f.stockStatus === 'OUT') where.push(Prisma.sql`${QTY} <= 0`);
    if (f.stockStatus === 'LOW') {
      where.push(Prisma.sql`${QTY} > 0 AND ${QTY} <= p."minStockLevel"`);
    }
    if (f.stockStatus === 'OK') where.push(Prisma.sql`${QTY} > 0 AND ${QTY} > p."minStockLevel"`);

    const sortKey = f.sort?.replace(/^-/, '') ?? 'name';
    const sortSql = SORTS[sortKey] ?? SORTS.name;
    const direction = f.sort?.startsWith('-') ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const rows = await this.prisma.$queryRaw<{ id: string; total: bigint }[]>`
      SELECT p."id", COUNT(*) OVER() AS total
      FROM "products" p
      LEFT JOIN "stock_levels" sl
        ON sl."productId" = p."id" AND sl."warehouseId" = ${f.warehouseId}::uuid
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${sortSql} ${direction}, p."id"
      LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`;

    let total = rows.length ? Number(rows[0].total) : 0;
    if (!rows.length && f.page > 1) {
      // Past the last page: still report the real total.
      const count = await this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM "products" p
        LEFT JOIN "stock_levels" sl
          ON sl."productId" = p."id" AND sl."warehouseId" = ${f.warehouseId}::uuid
        WHERE ${Prisma.join(where, ' AND ')}`;
      total = Number(count[0].total);
    }
    return { ids: rows.map((r) => r.id), total };
  }

  /** Counts by status for the summary chips (Out: 4 · Low: 12). Non-archived products only. */
  async statusCounts(
    businessId: string,
    warehouseId: string,
  ): Promise<Record<StockStatus, number>> {
    const rows = await this.prisma.$queryRaw<{ status: StockStatus; count: bigint }[]>`
      SELECT CASE
               WHEN ${QTY} <= 0 THEN 'OUT'
               WHEN ${QTY} <= p."minStockLevel" THEN 'LOW'
               ELSE 'OK'
             END AS status,
             COUNT(*) AS count
      FROM "products" p
      LEFT JOIN "stock_levels" sl
        ON sl."productId" = p."id" AND sl."warehouseId" = ${warehouseId}::uuid
      WHERE p."businessId" = ${businessId}::uuid AND p."archivedAt" IS NULL
      GROUP BY 1`;
    const counts: Record<StockStatus, number> = { OK: 0, LOW: 0, OUT: 0 };
    for (const r of rows) counts[r.status] = Number(r.count);
    return counts;
  }
}
