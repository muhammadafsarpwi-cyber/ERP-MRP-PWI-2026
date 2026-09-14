import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  HrDesignation, HrEmployee, HrEmployeeDocument, HrEmployeeSkill, HrEmployeeTraining,
  HrEmployeeHistory, HrAttendance, HrLeaveRequest, HrLeaveType, HrShift, HrHoliday,
  HrShiftRoster, HrRegularization, HrAttendanceHistory,
} from './entities';
import { HrService } from './services/hr.service';
import { HrRegularizationsService } from './services/hr-regularizations.service';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HrDesignation, HrEmployee, HrEmployeeDocument, HrEmployeeSkill, HrEmployeeTraining,
      HrEmployeeHistory, HrAttendance, HrLeaveRequest, HrLeaveType, HrShift, HrHoliday,
      HrShiftRoster, Department, Division, Section, ErpUser,
      HrRegularization, HrAttendanceHistory,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => BarcodeModule),
  ],
  controllers: [HrController, HrDashboardController],
  providers: [HrService, HrDashboardService, HrRegularizationsService],
  exports: [HrService],
})
export class HrModule {}