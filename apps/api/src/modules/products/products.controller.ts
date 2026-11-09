import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateProductSchema,
  MovementListQuerySchema,
  NON_EDITABLE_PRODUCT_FIELDS,
  ProductListQuerySchema,
  ProductLookupQuerySchema,
  UpdateProductSchema,
} from '@stockwise/shared';
import { RequirePermissions } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { AppError } from '../../common/errors/app-error';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { localDateRange } from '../../common/time';
import { PrismaService } from '../../prisma/prisma.service';
import { movementInclude, toMovementDto } from '../inventory/movement.mapper';
import { ProductsService } from './products.service';

const updatePipe = new ZodPipe(UpdateProductSchema);

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  @Get()
  @RequirePermissions('products.view')
  list(@Query(new ZodPipe(ProductListQuerySchema)) q: Out<typeof ProductListQuerySchema>) {
    return this.products.list(q);
  }

  @Get('lookup')
  @RequirePermissions('products.view')
  lookup(@Query(new ZodPipe(ProductLookupQuerySchema)) q: Out<typeof ProductLookupQuerySchema>) {
    return this.products.lookup(q.code);
  }

  @Get(':id')
  @RequirePermissions('products.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post()
  @RequirePermissions('products.manage')
  create(@Body(new ZodPipe(CreateProductSchema)) body: Out<typeof CreateProductSchema>) {
    return this.products.create(body);
  }

  /** Quantity is never editable here: stock changes only through movements (UC-10). */
  @Patch(':id')
  @RequirePermissions('products.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() raw: Record<string, unknown>) {
    const forbidden = NON_EDITABLE_PRODUCT_FIELDS.filter((f) => raw && f in raw);
    if (forbidden.length) {
      throw new AppError(
        'QUANTITY_NOT_EDITABLE',
        'Stock quantity cannot be edited; record an adjustment instead',
        { fields: forbidden },
      );
    }
    return this.products.update(id, updatePipe.transform(raw));
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('products.manage')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.setArchived(id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermissions('products.manage')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.setArchived(id, false);
  }

  @Get(':id/movements')
  @RequirePermissions('inventory.view_movements')
  async movements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(MovementListQuerySchema)) q: Out<typeof MovementListQuerySchema>,
  ) {
    const { businessId, timezone } = this.ctx.tenant;
    const exists = await this.prisma.product.count({ where: { id, businessId } });
    if (!exists) throw AppError.notFound('Product');
    const where = {
      businessId,
      productId: id,
      ...(q.type ? { type: q.type } : {}),
      ...(q.from || q.to ? { occurredAt: localDateRange(q.from, q.to, timezone) } : {}),
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
}
