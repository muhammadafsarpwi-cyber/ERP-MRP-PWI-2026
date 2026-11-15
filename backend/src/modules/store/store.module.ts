import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { StoreItem } from './entities/store-item.entity';
import { MaterialRequest } from './entities/material-request.entity';
import { MaterialIssue } from './entities/material-issue.entity';
import { MaterialReturn } from './entities/material-return.entity';
import { MaterialRequestLine } from './entities/material-request-line.entity';
import { MaterialIssueLine } from './entities/material-issue-line.entity';
import { MaterialReturnLine } from './entities/material-return-line.entity';
import { StoreReplenishment } from './entities/store-replenishment.entity';
import { ScrapDisposal } from './entities/scrap-disposal.entity';
import { StoreGatePass } from './entities/store-gate-pass.entity';
import { StoreGatePassLine } from './entities/store-gate-pass-line.entity';
import { StoreTransferNote } from './entities/store-transfer-note.entity';
import { StoreTransferNoteLine } from './entities/store-transfer-note-line.entity';
import { Department } from '../organization/entities/department.entity';
import { StoreService } from './services/store.service';
import { StoreLogisticsService } from './services/store-logistics.service';
import { ReplenishmentService } from './services/replenishment.service';
import { ReplenishmentProcessorService } from './services/replenishment-processor.service';
import { StoreDashboardService } from './services/store-dashboard.service';
import { StoreMaterialTraceService } from './services/store-material-trace.service';
import { StoreController } from './controllers/store.controller';
import { StoreLogisticsController } from './controllers/store-logistics.controller';
import { ReplenishmentController } from './controllers/replenishment.controller';
import { StoreReceiptController } from './controllers/store-receipt.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProcurementModule } from '../procurement/procurement.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Store,
      StoreItem,
      MaterialRequest,
      MaterialIssue,
      MaterialReturn,
      MaterialRequestLine,
      MaterialIssueLine,
      MaterialReturnLine,
      StoreReplenishment,
      ScrapDisposal,
      StoreGatePass,
      StoreGatePassLine,
      StoreTransferNote,
      StoreTransferNoteLine,
      Department,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => InventoryModule),
    forwardRef(() => ProcurementModule),
  ],
  controllers: [StoreController, StoreLogisticsController, ReplenishmentController, StoreReceiptController],
  providers: [StoreService, StoreLogisticsService, ReplenishmentService, ReplenishmentProcessorService, StoreDashboardService, StoreMaterialTraceService],
  exports: [StoreService, StoreLogisticsService],
})
export class StoreModule {}