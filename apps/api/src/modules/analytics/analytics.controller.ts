import { Controller, Get, Module, Query } from '@nestjs/common';
import { localDate } from '@stockwise/shared';
import { z } from 'zod';
import { RequirePermissions } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { D, moneyString, qtyString, roundMoney } from '../../common/decimal';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { addDays, startOfLocalDay } from '../../common/time';
import { PrismaService } from '../../prisma/prisma.service';

const ValuationQuerySchema = z.object({ asOf: localDate.optional() });

interface ValuationRow {
  categoryId: string | null;
  categoryName: string | null;
  quantity: string;
  value: string;
  productCount: bigint;
}

/**
 * Inventory valuation at weighted average cost (docs/04 §9).
 * Now: Σ OH × averageCost. At a past date D: for each product × warehouse, the last movement
 * on or before the end of D gives quantityAfter × averageCostAfter.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  @Get('valuation')
  @RequirePermissions('products.view_cost')
  async valuation(@Query(new ZodPipe(ValuationQuerySchema)) q: Out<typeof ValuationQuerySchema>) {
    const { businessId, timezone } = this.ctx.tenant;
    const rows = q.asOf
      ? await this.prisma.$queryRaw<ValuationRow[]>`
          WITH last AS (
            SELECT DISTINCT ON (m."productId", m."warehouseId")
                   m."productId", m."quantityAfter", m."averageCostAfter"
            FROM "stock_movements" m
            WHERE m."businessId" = ${businessId}::uuid
              AND m."occurredAt" < ${startOfLocalDay(addDays(q.asOf, 1), timezone)}
            ORDER BY m."productId", m."warehouseId", m."seq" DESC
          )
          SELECT c."id" AS "categoryId", c."name" AS "categoryName",
                 SUM(last."quantityAfter")::text AS quantity,
                 SUM(last."quantityAfter" * last."averageCostAfter")::text AS value,
                 COUNT(DISTINCT p."id") AS "productCount"
          FROM last
          JOIN "products" p ON p."id" = last."productId"
          LEFT JOIN "categories" c ON c."id" = p."categoryId"
          GROUP BY c."id", c."name"`
      : await this.prisma.$queryRaw<ValuationRow[]>`
          SELECT c."id" AS "categoryId", c."name" AS "categoryName",
                 SUM(sl."quantityOnHand")::text AS quantity,
                 SUM(sl."quantityOnHand" * sl."averageCost")::text AS value,
                 COUNT(DISTINCT p."id") AS "productCount"
          FROM "stock_levels" sl
          JOIN "products" p ON p."id" = sl."productId"
          LEFT JOIN "categories" c ON c."id" = p."categoryId"
          WHERE sl."businessId" = ${businessId}::uuid
          GROUP BY c."id", c."name"`;

    const byCategory = rows
      .map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        productCount: Number(r.productCount),
        quantity: qtyString(D(r.quantity)),
        value: moneyString(roundMoney(D(r.value))),
      }))
      .sort((a, b) => D(b.value).comparedTo(D(a.value)));
    const total = rows.reduce((acc, r) => acc.plus(D(r.value)), D(0));
    return {
      asOf: q.asOf ?? null,
      method: 'WEIGHTED_AVERAGE_COST',
      totalValue: moneyString(roundMoney(total)),
      byCategory,
    };
  }
}

@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}
