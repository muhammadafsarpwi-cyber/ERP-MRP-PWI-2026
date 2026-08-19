import { Module, forwardRef } from '@nestjs/common';
import { SupabaseAuthService } from './services/supabase-auth.service';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { SupabaseJwtGuard } from './guards/supabase-jwt.guard';
import { PermissionGuard } from './guards/permission.guard';
import { OrgScopeGuard } from './guards/org-scope.guard';
import { UserModule } from '../user/user.module';
import { PermissionModule } from '../permission/permission.module';

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => PermissionModule),
  ],
  controllers: [AuthController],
  providers: [
    SupabaseAuthService,
    AuthService,
    SupabaseJwtGuard,
    PermissionGuard,
    OrgScopeGuard,
  ],
  exports: [
    SupabaseAuthService,
    AuthService,
    SupabaseJwtGuard,
    PermissionGuard,
    OrgScopeGuard,
  ],
})
export class AuthModule {}
