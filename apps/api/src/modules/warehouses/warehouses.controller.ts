import { Controller, Get, Module } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context';
import { PrismaService } from '../../prisma/prisma.service';

/** MVP: one default warehouse per business; multi-location is a later (Pro) feature. */
@Controller('warehouses')
export class WarehousesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  @Get()
  async list() {
    const data = await this.prisma.warehouse.findMany({
      where: { businessId: this.ctx.tenant.businessId, archivedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return { data };
  }
}

@Module({ controllers: [WarehousesController] })
export class WarehousesModule {}
