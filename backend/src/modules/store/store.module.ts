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
import { Department } from '../organization/entities/department.entity';
import { StoreService } from './services/store.service';
import { ReplenishmentService } from './services/replenishment.service';
import { ReplenishmentProcessorService } from './services/replenishment-processor.service';
import { StoreDashboardService } from './services/store-dashboard.service';
import { StoreMaterialTraceService } from './services/store-material-trace.service';
import { StoreController } from './controllers/store.controller';
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
      Department,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => InventoryModule),
    forwardRef(() => ProcurementModule),
  ],
  controllers: [StoreController, ReplenishmentController, StoreReceiptController],
  providers: [StoreService, ReplenishmentService, ReplenishmentProcessorService, StoreDashboardService, StoreMaterialTraceService],
  exports: [StoreService],
})
export class StoreModule {}