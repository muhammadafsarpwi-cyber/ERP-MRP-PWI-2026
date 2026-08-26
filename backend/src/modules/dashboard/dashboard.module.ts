import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionEntry, Machine, Shift } from '../production/entities';
import { MachineTarget } from '../machine-target/entities';
import { Item, ItemBarcode, UomConversion } from '../item/entities';
import { StockLedger, InventoryBalance } from '../inventory/entities';
import { PurchaseOrder, PurchaseOrderLine } from '../procurement/entities';
import { SalesOrder } from '../sales/entities';
import { ActivityLog } from '../audit/entities/activity-log.entity';
import { Division, Section, Department, Warehouse } from '../organization/entities';
import { BomLine } from '../bom/entities';
import { ProductionRouting, RoutingOperation } from '../production-routing/entities';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionEntry,
      Machine,
      Shift,
      MachineTarget,
      Item,
      ItemBarcode,
      UomConversion,
      StockLedger,
      InventoryBalance,
      PurchaseOrder,
      PurchaseOrderLine,
      SalesOrder,
      ActivityLog,
      Division,
      Section,
      Department,
      Warehouse,
      BomLine,
      ProductionRouting,
      RoutingOperation,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
