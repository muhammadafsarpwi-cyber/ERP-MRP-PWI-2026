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
  ProductionUnit,
  ProductionUnitPrintLog,
  BatchProductionCostingLedger,
  MonthlyUtilityCostSheet,
  MonthlyUtilityItemAllocation,
  ProductionReworkReturn,
} from './entities';
import { ProductionRouting, RoutingOperation } from '../production-routing/entities';
import { BillOfMaterials, BomLine } from '../bom/entities';
import { Item, Uom, UomConversion } from '../item/entities';
import { Division, Section, Department, DepartmentDivisionScope, Warehouse, Company } from '../organization/entities';
import { SalesOrder, SalesOrderItem, SalesInvoice } from '../sales/entities';
import { PurchaseOrderLine } from '../procurement/entities/purchase-order-line.entity';
import { StockLedger, InventoryBalance } from '../inventory/entities';
import {
  ProductionOrderService,
  ProductionPlanningService,
  ProductionEntryService,
  ProductionInventoryReportService,
  ProductionUnitService,
  ProductionOpenStockService,
  ShopfloorTouchscreenService,
  BatchCostingService,
  ProductionReworkReturnService,
} from './services';
import {
  ProductionOrderController,
  ProductionEntryController,
  ProductionInventoryReportController,
  ProductionUnitController,
  ProductionOpenStockController,
  ShopfloorTouchscreenController,
  BatchCostingController,
  ProductionReworkReturnController,
} from './controllers';
import { InventoryModule } from '../inventory/inventory.module';
import { MachineTargetModule } from '../machine-target/machine-target.module';
import { ProductionRoutingModule } from '../production-routing/production-routing.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { BarcodeModule } from '../barcode/barcode.module';

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
      SalesOrder,
      SalesOrderItem,
      SalesInvoice,
      PurchaseOrderLine,
      StockLedger,
      InventoryBalance,
      ProductionUnit,
      ProductionUnitPrintLog,
      BatchProductionCostingLedger,
      MonthlyUtilityCostSheet,
      MonthlyUtilityItemAllocation,
      ProductionReworkReturn,
    ]),
    InventoryModule,
    MachineTargetModule,
    ProductionRoutingModule,
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => BarcodeModule),
  ],
  controllers: [
    ProductionOrderController,
    ProductionEntryController,
    ProductionInventoryReportController,
    ProductionUnitController,
    ProductionOpenStockController,
    ShopfloorTouchscreenController,
    BatchCostingController,
    ProductionReworkReturnController,
  ],
  providers: [
    ProductionOrderService,
    ProductionPlanningService,
    ProductionEntryService,
    ProductionInventoryReportService,
    ProductionUnitService,
    ProductionOpenStockService,
    ShopfloorTouchscreenService,
    BatchCostingService,
    ProductionReworkReturnService,
  ],
  exports: [
    ProductionOrderService,
    ProductionPlanningService,
    ProductionEntryService,
    ProductionUnitService,
    ProductionOpenStockService,
    ShopfloorTouchscreenService,
    BatchCostingService,
    ProductionReworkReturnService,
  ],
})
export class ProductionModule {}

