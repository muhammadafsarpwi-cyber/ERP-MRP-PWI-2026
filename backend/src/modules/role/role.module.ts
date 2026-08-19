import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role, RolePermission } from './entities';
import { RoleService } from './services/role.service';
import { RoleController } from './controllers/role.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, RolePermission]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
