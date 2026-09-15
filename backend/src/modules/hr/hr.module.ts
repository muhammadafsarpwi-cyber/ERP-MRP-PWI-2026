import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  HrDesignation, HrEmployee, HrEmployeeDocument, HrEmployeeSkill, HrEmployeeTraining,
  HrEmployeeHistory, HrAttendance, HrLeaveRequest, HrLeaveType, HrShift, HrHoliday,
  HrShiftRoster, HrRegularization, HrAttendanceHistory, HrOvertime, HrOvertimeHistory,
  HrAdvance, HrAdvanceHistory,
} from './entities';
import { HrService } from './services/hr.service';
import { HrRegularizationsService } from './services/hr-regularizations.service';
import { HrOvertimeService } from './services/hr-overtime.service';
import { HrAdvancesService } from './services/hr-advances.service';
import { HrDashboardService } from './services/hr-dashboard.service';
import { HrController } from './controllers/hr.controller';
import { HrDashboardController } from './controllers/hr-dashboard.controller';
import { Department } from '../organization/entities/department.entity';
import { Division } from '../organization/entities/division.entity';
import { Section } from '../organization/entities/section.entity';
import { ErpUser } from '../user/entities/erp-user.entity';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { BarcodeModule } from '../barcode/barcode.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HrDesignation, HrEmployee, HrEmployeeDocument, HrEmployeeSkill, HrEmployeeTraining,
      HrEmployeeHistory, HrAttendance, HrLeaveRequest, HrLeaveType, HrShift, HrHoliday,
      HrShiftRoster, Department, Division, Section, ErpUser,
      HrRegularization, HrAttendanceHistory, HrOvertime, HrOvertimeHistory,
      HrAdvance, HrAdvanceHistory,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => BarcodeModule),
    FinanceModule,
  ],
  controllers: [HrController, HrDashboardController],
  providers: [HrService, HrDashboardService, HrRegularizationsService, HrOvertimeService, HrAdvancesService],
  exports: [HrService],
})
export class HrModule {}