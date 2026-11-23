import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CancelPurchaseSchema,
  CreatePurchaseSchema,
  PurchaseListQuerySchema,
  ReceivePurchaseSchema,
  SupplierReturnSchema,
  UpdatePurchaseSchema,
} from '@stockwise/shared';
import { RequirePermissions } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { toMovementDto } from '../inventory/movement.mapper';
import { PurchasesService } from './purchases.service';

/** docs/05 §4.10 */
@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly ctx: RequestContext,
  ) {}

  @Get()
  @RequirePermissions('purchases.view')
  list(
    @Query(new ZodPipe(PurchaseListQuerySchema))
    q: Out<typeof PurchaseListQuerySchema>,
  ) {
    return this.purchases.list(q);
  }

  @Get(':id')
  @RequirePermissions('purchases.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.get(id);
  }

  @Get(':id/movements')
  @RequirePermissions('inventory.view_movements')
  async movements(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.purchases.movements(id);
    const canSeeCost = this.ctx.can('products.view_cost');
    return { data: rows.map((m) => toMovementDto(m, canSeeCost)) };
  }

  @Post()
  @RequirePermissions('purchases.manage')
  create(
    @Body(new ZodPipe(CreatePurchaseSchema))
    body: Out<typeof CreatePurchaseSchema>,
  ) {
    return this.purchases.create(body);
  }

  @Patch(':id')
  @RequirePermissions('purchases.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdatePurchaseSchema))
    body: Out<typeof UpdatePurchaseSchema>,
  ) {
    return this.purchases.update(id, body);
  }

  @Post(':id/order')
  @HttpCode(200)
  @RequirePermissions('purchases.manage')
  order(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.order(id);
  }

  @Post(':id/receive')
  @HttpCode(200)
  @RequirePermissions('purchases.receive')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ReceivePurchaseSchema))
    body: Out<typeof ReceivePurchaseSchema>,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.purchases.receive(id, body, idempotencyKey);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('purchases.manage')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CancelPurchaseSchema))
    body: Out<typeof CancelPurchaseSchema>,
  ) {
    return this.purchases.cancel(id, body);
  }

  @Post(':id/supplier-returns')
  @HttpCode(200)
  @RequirePermissions('purchases.return')
  supplierReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SupplierReturnSchema))
    body: Out<typeof SupplierReturnSchema>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.purchases.supplierReturn(id, body, idempotencyKey);
  }
}
