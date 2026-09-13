import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MachineComponent } from './entities/machine-component.entity';
import { ComponentChange } from './entities/component-change.entity';
import { MachineComponentItem } from './entities/machine-component-item.entity';
import { Machine } from '../production/entities/machine.entity';
import { Item } from '../item/entities/item.entity';
import { Uom } from '../item/entities/uom.entity';
import { MaintenanceJobCard } from '../maintenance/entities/maintenance-job-card.entity';
import { ErpUser } from '../user/entities/erp-user.entity';
import { MaterialIssue } from '../store/entities/material-issue.entity';
import { MachineComponentService } from './services/machine-component.service';
import { ComponentChangeService } from './services/component-change.service';
import { ToolLifecycleService } from './services/tool-lifecycle.service';
import { MachineComponentController } from './controllers/machine-component.controller';
import { ComponentChangeController } from './controllers/component-change.controller';
import { ToolLifecycleController } from './controllers/tool-lifecycle.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MachineComponent,
      ComponentChange,
      MachineComponentItem,
      Machine,
      Item,
      Uom,
      MaintenanceJobCard,
      ErpUser,
      MaterialIssue,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [MachineComponentController, ComponentChangeController, ToolLifecycleController],
  providers: [MachineComponentService, ComponentChangeService, ToolLifecycleService],
  exports: [MachineComponentService, ComponentChangeService, ToolLifecycleService],
})
export class MachineToolingModule {}