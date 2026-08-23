import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ProductionOrder,
  ProductionOrderOperation,
  ProductionOrderOperationLog,
  ProductionEntry,
  Machine,
  Shift,
  DowntimeReason,
} from './entities';
import { ProductionRouting, RoutingOperation } from '../production-routing/entities';
import { BillOfMaterials, BomLine } from '../bom/entities';
import { Item, UomConversion } from '../item/entities';
import { Division, Section, Department, DepartmentDivisionScope, Warehouse } from '../organization/entities';
import { SalesOrderItem } from '../sales/entities';
import {
  ProductionOrderService,
  ProductionPlanningService,
  ProductionEntryService,
} from './services';
import { ProductionOrderController, ProductionEntryController } from './controllers';
import { InventoryModule } from '../inventory/inventory.module';
import { MachineTargetModule } from '../machine-target/machine-target.module';
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
      Machine,
      Shift,
      DowntimeReason,
      ProductionRouting,
      RoutingOperation,
      BillOfMaterials,
      BomLine,
      Item,
      UomConversion,
      Division,
      Section,
      Department,
      DepartmentDivisionScope,
      Warehouse,
      SalesOrderItem,
    ]),
    InventoryModule,
    MachineTargetModule,
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [ProductionOrderController, ProductionEntryController],
  providers: [ProductionOrderService, ProductionPlanningService, ProductionEntryService],
  exports: [ProductionOrderService, ProductionPlanningService, ProductionEntryService],
})
export class ProductionModule {}
