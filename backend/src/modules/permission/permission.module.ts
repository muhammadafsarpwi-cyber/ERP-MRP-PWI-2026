import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities';
import { Role } from '../role/entities/role.entity';
import { RolePermission } from '../role/entities/role-permission.entity';
import { RolePermissionDivisionScope } from '../role/entities/role-permission-division-scope.entity';
import { UserOrganizationScope } from '../user/entities/user-organization-scope.entity';
import { Division } from '../organization/entities/division.entity';
import { PermissionService } from './services/permission.service';
import { PermissionMatrixService } from './services/permission-matrix.service';
import { DivisionAccessService } from './services/division-access.service';
import { PermissionController } from './controllers/permission.controller';
import { PermissionMatrixController } from './controllers/permission-matrix.controller';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Permission,
      Role,
      RolePermission,
      RolePermissionDivisionScope,
      UserOrganizationScope,
      Division,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => AuditModule),
  ],
  controllers: [PermissionController, PermissionMatrixController],
  providers: [PermissionService, PermissionMatrixService, DivisionAccessService],
  exports: [PermissionService, PermissionMatrixService, DivisionAccessService],
})
export class PermissionModule {}
