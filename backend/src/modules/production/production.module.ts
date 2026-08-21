import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionOrder, ProductionOrderOperation, ProductionOrderOperationLog } from './entities';
import { ProductionRouting, RoutingOperation } from '../production-routing/entities';
import { BillOfMaterials, BomLine } from '../bom/entities';
import { Item, UomConversion } from '../item/entities';
import { Division, Section, Department, DepartmentDivisionScope, Warehouse } from '../organization/entities';
import { SalesOrderItem } from '../sales/entities';
import { ProductionOrderService, ProductionPlanningService } from './services';
import { ProductionOrderController } from './controllers/production-order.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionOrder,
      ProductionOrderOperation,
      ProductionOrderOperationLog,
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
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [ProductionOrderController],
  providers: [ProductionOrderService, ProductionPlanningService],
  exports: [ProductionOrderService, ProductionPlanningService],
})
export class ProductionModule {}
