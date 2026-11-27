import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateSaleSchema,
  CustomerReturnSchema,
  SaleListQuerySchema,
  VoidSaleSchema,
} from '@stockwise/shared';
import { RequirePermissions } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { toMovementDto } from '../inventory/movement.mapper';
import { SalesService } from './sales.service';

/** docs/05 §4.11. Without sales.view_all, every route only sees the caller's own sales. */
@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly ctx: RequestContext,
  ) {}

  @Get()
  @RequirePermissions('sales.create')
  list(@Query(new ZodPipe(SaleListQuerySchema)) q: Out<typeof SaleListQuerySchema>) {
    return this.sales.list(q);
  }

  @Get(':id')
  @RequirePermissions('sales.create')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.get(id);
  }

  @Get(':id/movements')
  @RequirePermissions('sales.create', 'inventory.view_movements')
  async movements(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.sales.movements(id);
    const canSeeCost = this.ctx.can('products.view_cost');
    return { data: rows.map((m) => toMovementDto(m, canSeeCost)) };
  }

  /** Idempotency-Key required; a retry returns the original sale (201 both times). */
  @Post()
  @RequirePermissions('sales.create')
  create(
    @Body(new ZodPipe(CreateSaleSchema)) body: Out<typeof CreateSaleSchema>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.sales.create(body, idempotencyKey);
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermissions('sales.void')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(VoidSaleSchema)) body: Out<typeof VoidSaleSchema>,
  ) {
    return this.sales.void(id, body);
  }

  @Post(':id/returns')
  @HttpCode(200)
  @RequirePermissions('sales.return')
  customerReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CustomerReturnSchema)) body: Out<typeof CustomerReturnSchema>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.sales.customerReturn(id, body, idempotencyKey);
  }
}
