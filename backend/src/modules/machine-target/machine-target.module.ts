import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MachineTarget } from './entities/machine-target.entity';
import { Machine } from '../production/entities/machine.entity';
import { Shift } from '../production/entities/shift.entity';
import { Uom } from '../item/entities/uom.entity';
import { MachineTargetService } from './services';
import { MachineTargetController } from './controllers';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MachineTarget, Machine, Shift, Uom]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [MachineTargetController],
  providers: [MachineTargetService],
  exports: [MachineTargetService],
})
export class MachineTargetModule {}
