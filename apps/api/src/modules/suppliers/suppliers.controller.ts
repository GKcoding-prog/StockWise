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
  CreateSupplierSchema,
  SupplierListQuerySchema,
  UpdateSupplierSchema,
} from '@stockwise/shared';
import { RequirePermissions } from '../../common/auth/decorators';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions('suppliers.view')
  list(@Query(new ZodPipe(SupplierListQuerySchema)) q: Out<typeof SupplierListQuerySchema>) {
    return this.suppliers.list(q);
  }

  @Get(':id')
  @RequirePermissions('suppliers.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  @RequirePermissions('suppliers.manage')
  create(@Body(new ZodPipe(CreateSupplierSchema)) body: Out<typeof CreateSupplierSchema>) {
    return this.suppliers.create(body);
  }

  @Patch(':id')
  @RequirePermissions('suppliers.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateSupplierSchema)) body: Out<typeof UpdateSupplierSchema>,
  ) {
    return this.suppliers.update(id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('suppliers.manage')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.setArchived(id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermissions('suppliers.manage')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.setArchived(id, false);
  }

  @Get(':id/products')
  @RequirePermissions('suppliers.view')
  products(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.products(id);
  }

  @Get(':id/purchases')
  @RequirePermissions('purchases.view')
  purchases(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.purchases(id);
  }
}
