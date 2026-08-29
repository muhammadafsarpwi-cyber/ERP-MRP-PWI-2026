import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  HrDesignation, HrEmployee, HrEmployeeDocument, HrEmployeeSkill, HrEmployeeTraining,
  HrEmployeeHistory, HrAttendance, HrLeaveRequest, HrLeaveType, HrShift, HrHoliday,
} from './entities';
import { HrService } from './services/hr.service';
import { HrController } from './controllers/hr.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HrDesignation, HrEmployee, HrEmployeeDocument, HrEmployeeSkill, HrEmployeeTraining,
      HrEmployeeHistory, HrAttendance, HrLeaveRequest, HrLeaveType, HrShift, HrHoliday,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}