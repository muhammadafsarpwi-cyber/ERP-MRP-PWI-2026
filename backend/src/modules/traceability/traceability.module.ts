import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedger, InventoryBalance } from '../inventory/entities';
import { ProductionEntry, ProductionOrder, ProductionOrderOperation } from '../production/entities';
import { ProductionRouting, RoutingOperation } from '../production-routing/entities';
import { BillOfMaterials, BomLine } from '../bom/entities';
import { Item, Uom } from '../item/entities';
import { Division, Section, Department, Warehouse, WarehouseLocation } from '../organization/entities';
import { TraceabilityController } from './controllers/traceability.controller';
import { TraceabilityService } from './services/traceability.service';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockLedger,
      InventoryBalance,
      ProductionEntry,
      ProductionOrder,
      ProductionOrderOperation,
      ProductionRouting,
      RoutingOperation,
      BillOfMaterials,
      BomLine,
      Item,
      Uom,
      Division,
      Section,
      Department,
      Warehouse,
      WarehouseLocation,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [TraceabilityController],
  providers: [TraceabilityService],
  exports: [TraceabilityService],
})
export class TraceabilityModule {}