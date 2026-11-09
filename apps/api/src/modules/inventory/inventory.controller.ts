import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CreateAdjustmentSchema,
  CreateWriteOffSchema,
  MovementListQuerySchema,
  StockCountSchema,
  StockListQuerySchema,
  type Paginated,
} from '@stockwise/shared';
import { RequirePermissions } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { qtyString } from '../../common/decimal';
import { AppError } from '../../common/errors/app-error';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { localDateRange } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { productInclude, toProductDto, type ProductDto } from '../products/product.mapper';
import { InventoryService } from './inventory.service';
import { movementInclude, toMovementDto } from './movement.mapper';
import { StockQueryService } from './stock-query.service';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly stockQuery: StockQueryService,
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  @Get('stock')
  @RequirePermissions('products.view')
  async stock(@Query(new ZodPipe(StockListQuerySchema)) q: Out<typeof StockListQuerySchema>) {
    const { businessId } = this.ctx.tenant;
    const warehouseId = q.warehouseId ?? (await this.inventory.defaultWarehouseId());
    const [{ ids, total }, counts] = await Promise.all([
      this.stockQuery.pageOfProductIds({
        businessId,
        warehouseId,
        q: q.q,
        categoryId: q.categoryId,
        stockStatus: q.status,
        sort: q.sort,
        page: q.page,
        pageSize: q.pageSize,
      }),
      this.stockQuery.statusCounts(businessId, warehouseId),
    ]);
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: ids } },
      include: productInclude(warehouseId),
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const canSeeCost = this.ctx.can('products.view_cost');
    const result: Paginated<ProductDto> & { summary: typeof counts } = {
      data: ids.map((id) => toProductDto(byId.get(id)!, canSeeCost)),
      meta: { page: q.page, pageSize: q.pageSize, total },
      summary: counts,
    };
    return result;
  }

  @Get('movements')
  @RequirePermissions('inventory.view_movements')
  async movements(
    @Query(new ZodPipe(MovementListQuerySchema)) q: Out<typeof MovementListQuerySchema>,
  ) {
    const { businessId, timezone } = this.ctx.tenant;
    const where: Prisma.StockMovementWhereInput = {
      businessId,
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.flagged !== undefined ? { isFlagged: q.flagged } : {}),
      ...(q.from || q.to ? { occurredAt: localDateRange(q.from, q.to, timezone) } : {}),
      ...(q.q ? { documentRef: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: { seq: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    const canSeeCost = this.ctx.can('products.view_cost');
    return {
      data: rows.map((m) => toMovementDto(m, canSeeCost)),
      meta: { page: q.page, pageSize: q.pageSize, total },
    };
  }

  @Get('movements/:id')
  @RequirePermissions('inventory.view_movements')
  async movement(@Param('id', ParseUUIDPipe) id: string) {
    const m = await this.prisma.stockMovement.findFirst({
      where: { id, businessId: this.ctx.tenant.businessId },
      include: { ...movementInclude, reversedBy: { select: { id: true } } },
    });
    if (!m) throw AppError.notFound('Movement');
    return {
      ...toMovementDto(m, this.ctx.can('products.view_cost')),
      reversedById: m.reversedBy?.id ?? null,
    };
  }

  @Post('adjustments')
  @RequirePermissions('inventory.adjust')
  async adjust(
    @Body(new ZodPipe(CreateAdjustmentSchema)) body: Out<typeof CreateAdjustmentSchema>,
  ) {
    const { documentRef, movements } = await this.inventory.adjust(body);
    const canSeeCost = this.ctx.can('products.view_cost');
    return { documentRef, movements: movements.map((m) => toMovementDto(m, canSeeCost)) };
  }

  @Post('write-offs')
  @RequirePermissions('inventory.write_off')
  async writeOff(@Body(new ZodPipe(CreateWriteOffSchema)) body: Out<typeof CreateWriteOffSchema>) {
    const { documentRef, movements } = await this.inventory.writeOff(body);
    const canSeeCost = this.ctx.can('products.view_cost');
    return { documentRef, movements: movements.map((m) => toMovementDto(m, canSeeCost)) };
  }

  @Post('counts/preview')
  @HttpCode(200)
  @RequirePermissions('inventory.adjust')
  async previewCount(@Body(new ZodPipe(StockCountSchema)) body: Out<typeof StockCountSchema>) {
    const preview = await this.inventory.previewCount(body);
    return {
      ...preview,
      lines: preview.lines.map((l) => ({
        ...l,
        systemQuantity: qtyString(l.systemQuantity),
        countedQuantity: qtyString(l.countedQuantity),
        difference: qtyString(l.difference),
      })),
    };
  }

  @Post('counts/commit')
  @RequirePermissions('inventory.adjust')
  async commitCount(@Body(new ZodPipe(StockCountSchema)) body: Out<typeof StockCountSchema>) {
    const { documentRef, movements } = await this.inventory.commitCount(body);
    const canSeeCost = this.ctx.can('products.view_cost');
    return { documentRef, movements: movements.map((m) => toMovementDto(m, canSeeCost)) };
  }

  @Get('reconcile')
  @RequirePermissions('audit.view')
  reconcile() {
    return this.inventory.reconcile();
  }
}
