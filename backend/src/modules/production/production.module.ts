import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ProductionOrder,
  ProductionOrderOperation,
  ProductionOrderOperationLog,
  ProductionEntry,
  ProductionEntryItem,
  ProductionEntryDowntime,
  Machine,
  Shift,
  DowntimeReason,
} from './entities';
import { ProductionRouting, RoutingOperation } from '../production-routing/entities';
import { BillOfMaterials, BomLine } from '../bom/entities';
import { Item, Uom, UomConversion } from '../item/entities';
import { Division, Section, Department, DepartmentDivisionScope, Warehouse, Company } from '../organization/entities';
import { SalesOrderItem } from '../sales/entities';
import { StockLedger, InventoryBalance } from '../inventory/entities';
import {
  ProductionOrderService,
  ProductionPlanningService,
  ProductionEntryService,
  ProductionInventoryReportService,
} from './services';
import { ProductionOrderController, ProductionEntryController, ProductionInventoryReportController } from './controllers';
import { InventoryModule } from '../inventory/inventory.module';
import { MachineTargetModule } from '../machine-target/machine-target.module';
import { ProductionRoutingModule } from '../production-routing/production-routing.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionOrder,
      ProductionOrderOperation,
      ProductionOrderOperationLog,
      ProductionEntry,
      ProductionEntryItem,
      ProductionEntryDowntime,
      Machine,
      Shift,
      DowntimeReason,
      ProductionRouting,
      RoutingOperation,
      BillOfMaterials,
      BomLine,
      Item,
      Uom,
      UomConversion,
      Division,
      Section,
      Department,
      DepartmentDivisionScope,
      Warehouse,
      Company,
      SalesOrderItem,
      StockLedger,
      InventoryBalance,
    ]),
    InventoryModule,
    MachineTargetModule,
    ProductionRoutingModule,
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [ProductionOrderController, ProductionEntryController, ProductionInventoryReportController],
  providers: [ProductionOrderService, ProductionPlanningService, ProductionEntryService, ProductionInventoryReportService],
  exports: [ProductionOrderService, ProductionPlanningService, ProductionEntryService],
})
export class ProductionModule {}
