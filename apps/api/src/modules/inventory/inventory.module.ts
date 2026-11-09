import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockQueryService } from './stock-query.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, StockQueryService],
  exports: [InventoryService, StockQueryService],
})
export class InventoryModule {}
