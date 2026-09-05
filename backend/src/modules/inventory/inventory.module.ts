import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryPolicy, Batch, InventoryBalance, StockLedger, StockAdjustment, StockAdjustmentLine, StockTransfer, StockTransferLine, InventoryReservation, SerialNumber, RawMaterialReceipt, RawMaterialReceiptLine, RawMaterialReturn, RawMaterialReturnLine } from './entities';
import { Division, Section, Department } from '../organization/entities';
import { Warehouse } from '../organization/entities/warehouse.entity';
import { Item } from '../item/entities/item.entity';
import { Uom } from '../item/entities/uom.entity';
import { InventoryPolicyService } from './services/inventory-policy.service';
import { BatchService } from './services/batch.service';
import { InventoryBalanceService } from './services/inventory-balance.service';
import { StockLedgerService } from './services/stock-ledger.service';
import { StockAdjustmentService } from './services/stock-adjustment.service';
import { StockTransferService } from './services/stock-transfer.service';
import { InventoryReservationService } from './services/inventory-reservation.service';
import { OpeningStockService } from './services/opening-stock.service';
import { SerialNumberService } from './services/serial-number.service';
import { RawMaterialReceivingService } from './services/raw-material-receiving.service';
import { InventoryPolicyController } from './controllers/inventory-policy.controller';
import { BatchController } from './controllers/batch.controller';
import { InventoryBalanceController } from './controllers/inventory-balance.controller';
import { StockAdjustmentController } from './controllers/stock-adjustment.controller';
import { StockTransferController } from './controllers/stock-transfer.controller';
import { InventoryReservationController } from './controllers/inventory-reservation.controller';
import { StockReportController } from './controllers/stock-report.controller';
import { OpeningStockController } from './controllers/opening-stock.controller';
import { SerialNumberController } from './controllers/serial-number.controller';
import { InventoryReceiptController } from './controllers/inventory-receipt.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryPolicy, Batch, InventoryBalance, StockLedger,
      StockAdjustment, StockAdjustmentLine, StockTransfer, StockTransferLine,
      InventoryReservation, SerialNumber,
      RawMaterialReceipt, RawMaterialReceiptLine, RawMaterialReturn, RawMaterialReturnLine,
      Division, Section, Department, Warehouse, Item, Uom,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [
    InventoryPolicyController, BatchController, InventoryBalanceController,
    StockAdjustmentController, StockTransferController, InventoryReservationController,
    StockReportController, OpeningStockController, SerialNumberController,
    InventoryReceiptController,
  ],
  providers: [
    InventoryPolicyService, BatchService, InventoryBalanceService, StockLedgerService,
    StockAdjustmentService, StockTransferService, InventoryReservationService,
    OpeningStockService, SerialNumberService, RawMaterialReceivingService,
  ],
  exports: [InventoryBalanceService, StockLedgerService, InventoryPolicyService, BatchService],
})
export class InventoryModule {}
