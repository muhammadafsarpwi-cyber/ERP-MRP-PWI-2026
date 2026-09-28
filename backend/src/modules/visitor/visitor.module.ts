import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { AuditModule } from '../audit/audit.module';
import { Location, VisitorEntry } from './entities';
import { ErpUser } from '../user/entities/erp-user.entity';
import { Company } from '../organization/entities/company.entity';
import { Division } from '../organization/entities/division.entity';
import { HrEmployee } from '../hr/entities/hr-employee.entity';
import { LocationService, VisitorEntryService } from './services';
import { LocationController, VisitorEntryController } from './controllers';

/**
 * Visitor Management foundation (Prompt #17) + exit (Prompt #18) + slip/host
 * confirmation (Prompt #19).
 *
 * Reuses the existing authorization stack — the controllers are wrapped in
 * SupabaseJwtGuard → PermissionGuard → OrgScopeGuard → DivisionScopeGuard —
 * and the existing employee master (`hr_employees`) for host selection, so no
 * parallel authentication/authorization system is introduced. `Company` is
 * registered only so the slip can print the real legal name from the database
 * instead of a hard-coded one (§3/§4). `ErpUser` is registered for the same
 * narrow reason (#19A §2): the slip resolves `created_by` / `host_confirmed_by`
 * to a person's `display_name` so a UUID never reaches the printed page.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    AuditModule,
    TypeOrmModule.forFeature([Location, VisitorEntry, Division, HrEmployee, Company, ErpUser]),
  ],
  controllers: [LocationController, VisitorEntryController],
  providers: [LocationService, VisitorEntryService],
  exports: [LocationService, VisitorEntryService],
})
export class VisitorModule {}
