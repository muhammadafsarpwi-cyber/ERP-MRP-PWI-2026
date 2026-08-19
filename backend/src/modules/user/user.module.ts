import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErpUser, UserRole, UserOrganizationScope } from './entities';
import { ErpUserService } from './services/erp-user.service';
import { UserController } from './controllers/user.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ErpUser, UserRole, UserOrganizationScope]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
  ],
  controllers: [UserController],
  providers: [ErpUserService],
  exports: [ErpUserService],
})
export class UserModule {}
