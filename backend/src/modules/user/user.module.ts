import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErpUser, UserRole, UserOrganizationScope } from './entities';
import { Company } from '../organization/entities/company.entity';
import { ErpUserService } from './services/erp-user.service';
import { UserController } from './controllers/user.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { NotificationsModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ErpUser, UserRole, UserOrganizationScope, Company]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [UserController],
  providers: [ErpUserService],
  exports: [ErpUserService],
})
export class UserModule {}
