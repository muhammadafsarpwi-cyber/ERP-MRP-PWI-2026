import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { AuditModule } from '../audit/audit.module';
import { Location, VisitorEntry } from './entities';
import { Division } from '../organization/entities/division.entity';
import { HrEmployee } from '../hr/entities/hr-employee.entity';
import { LocationService, VisitorEntryService } from './services';
import { LocationController, VisitorEntryController } from './controllers';

/**
 * Visitor Management foundation (Prompt #17).
 *
 * Reuses the existing authorization stack — the controllers are wrapped in
 * SupabaseJwtGuard → PermissionGuard → OrgScopeGuard → DivisionScopeGuard —
 * and the existing employee master (`hr_employees`) for host selection, so no
 * parallel authentication/authorization system is introduced.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    AuditModule,
    TypeOrmModule.forFeature([Location, VisitorEntry, Division, HrEmployee]),
  ],
  controllers: [LocationController, VisitorEntryController],
  providers: [LocationService, VisitorEntryService],
  exports: [LocationService, VisitorEntryService],
})
export class VisitorModule {}
