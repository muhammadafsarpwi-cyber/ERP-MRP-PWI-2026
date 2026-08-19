import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryPolicy, Batch, InventoryBalance, StockLedger, StockAdjustment, StockAdjustmentLine, StockTransfer, StockTransferLine, InventoryReservation } from './entities';
import { InventoryPolicyService } from './services/inventory-policy.service';
import { BatchService } from './services/batch.service';
import { InventoryBalanceService } from './services/inventory-balance.service';
import { StockLedgerService } from './services/stock-ledger.service';
import { StockAdjustmentService } from './services/stock-adjustment.service';
import { StockTransferService } from './services/stock-transfer.service';
import { InventoryReservationService } from './services/inventory-reservation.service';
import { InventoryPolicyController } from './controllers/inventory-policy.controller';
import { BatchController } from './controllers/batch.controller';
import { InventoryBalanceController } from './controllers/inventory-balance.controller';
import { StockAdjustmentController } from './controllers/stock-adjustment.controller';
import { StockTransferController } from './controllers/stock-transfer.controller';
import { InventoryReservationController } from './controllers/inventory-reservation.controller';
import { StockReportController } from './controllers/stock-report.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryPolicy, Batch, InventoryBalance, StockLedger,
      StockAdjustment, StockAdjustmentLine, StockTransfer, StockTransferLine, InventoryReservation,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [
    InventoryPolicyController, BatchController, InventoryBalanceController,
    StockAdjustmentController, StockTransferController, InventoryReservationController,
    StockReportController,
  ],
  providers: [
    InventoryPolicyService, BatchService, InventoryBalanceService, StockLedgerService,
    StockAdjustmentService, StockTransferService, InventoryReservationService,
  ],
  exports: [InventoryBalanceService, StockLedgerService, InventoryPolicyService, BatchService],
})
export class InventoryModule {}
