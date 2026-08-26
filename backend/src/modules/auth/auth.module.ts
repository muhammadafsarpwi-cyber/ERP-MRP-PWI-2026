import { Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthService } from './services/supabase-auth.service';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { SupabaseJwtGuard } from './guards/supabase-jwt.guard';
import { PermissionGuard } from './guards/permission.guard';
import { OrgScopeGuard } from './guards/org-scope.guard';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
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
    {
      provide: APP_GUARD,
      useClass: SupabaseJwtGuard,
    },
    SupabaseJwtGuard,
    PermissionGuard,
    OrgScopeGuard,
    AuthRateLimitGuard,
  ],
  exports: [
    SupabaseAuthService,
    AuthService,
    SupabaseJwtGuard,
    PermissionGuard,
    OrgScopeGuard,
    AuthRateLimitGuard,
  ],
})
export class AuthModule {}
