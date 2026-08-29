import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import {
  MaintenanceJobCard,
  MaintenanceJobCardTechnician,
  MaintenanceJobCardPart,
  MaintenanceJobCardAttachment,
  MaintenanceJobCardStatusHistory,
  MaintenanceJobCardWorkLog,
  MaintenanceTeam,
  MaintenanceTeamMember,
  MaintenanceComplaintCategory,
  MaintenanceRootCauseCategory,
  MaintenanceFailureCategory,
  MaintenancePmPlan,
  MaintenancePmSchedule,
  MaintenanceTechnician,
} from './entities';
import { Machine } from '../production/entities/machine.entity';
import { Department } from '../organization/entities/department.entity';
import { Division } from '../organization/entities/division.entity';
import { Section } from '../organization/entities/section.entity';
import { ErpUser } from '../user/entities/erp-user.entity';
import { MaintenanceJobCardService } from './services/maintenance-job-card.service';
import { MaintenanceTeamService } from './services/maintenance-team.service';
import { MaintenanceCategoryService } from './services/maintenance-category.service';
import { MaintenancePmService } from './services/maintenance-pm.service';
import { MaintenanceTechnicianService } from './services/maintenance-technician.service';
import { MaintenanceUserResolverService } from './services/maintenance-user-resolver.service';
import { MaintenanceJobCardController } from './controllers/job-card.controller';
import { MaintenanceTeamController } from './controllers/team.controller';
import { MaintenanceCategoryController } from './controllers/category.controller';
import { MaintenancePmController } from './controllers/pm.controller';
import { MaintenanceTechnicianController } from './controllers/technician.controller';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => AuditModule),
    forwardRef(() => InventoryModule),
    TypeOrmModule.forFeature([
      MaintenanceJobCard,
      MaintenanceJobCardTechnician,
      MaintenanceJobCardPart,
      MaintenanceJobCardAttachment,
      MaintenanceJobCardStatusHistory,
      MaintenanceJobCardWorkLog,
      MaintenanceTeam,
      MaintenanceTeamMember,
      MaintenanceComplaintCategory,
      MaintenanceRootCauseCategory,
      MaintenanceFailureCategory,
      MaintenancePmPlan,
      MaintenancePmSchedule,
      Machine,
      Department,
      Division,
      Section,
      ErpUser,
      MaintenanceTechnician,
    ]),
  ],
  controllers: [
    MaintenanceJobCardController,
    MaintenanceTeamController,
    MaintenanceCategoryController,
    MaintenancePmController,
    MaintenanceTechnicianController,
  ],
  providers: [
    MaintenanceJobCardService,
    MaintenanceTeamService,
    MaintenanceCategoryService,
    MaintenancePmService,
    MaintenanceUserResolverService,
    MaintenanceTechnicianService,
  ],
  exports: [
    MaintenanceJobCardService,
    MaintenanceTeamService,
    MaintenanceCategoryService,
    MaintenancePmService,
    MaintenanceUserResolverService,
    MaintenanceTechnicianService,
  ],
})
export class MaintenanceModule {}
