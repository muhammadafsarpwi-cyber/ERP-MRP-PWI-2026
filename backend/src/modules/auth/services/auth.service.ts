import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseAuthService } from './supabase-auth.service';
import { ErpUserService } from '../../user/services/erp-user.service';
import { LoginDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from '../dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseAuthService: SupabaseAuthService,
    private readonly userService: ErpUserService,
  ) {}

  async login(loginDto: LoginDto): Promise<{ token: string; refreshToken: string; user: any }> {
    const result = await this.supabaseAuthService.signInWithPassword(
      loginDto.email,
      loginDto.password,
    );

    let erpUser = await this.userService.findByAuthUserId(result.user.id);

    if (!erpUser) {
      erpUser = await this.userService.createFromAuthUser({
        id: result.user.id,
        email: result.user.email,
      });
    }

    if (erpUser.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive');
    }

    await this.userService.updateLastLogin(erpUser.id);

    return {
      token: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: erpUser.id,
        email: erpUser.email,
        displayName: erpUser.displayName,
        firstName: erpUser.firstName,
        lastName: erpUser.lastName,
        defaultCompanyId: erpUser.defaultCompanyId,
        status: erpUser.status,
      },
    };
  }

  async validateToken(token: string): Promise<any> {
    const supabaseUser = await this.supabaseAuthService.getUserFromToken(token);
    if (!supabaseUser || !supabaseUser.id) {
      throw new UnauthorizedException('Invalid token');
    }

    let erpUser = await this.userService.findByAuthUserId(supabaseUser.id);

    if (!erpUser) {
      erpUser = await this.userService.createFromAuthUser(supabaseUser);
    }

    if (erpUser.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive');
    }

    await this.userService.updateLastLogin(erpUser.id);

    return erpUser;
  }

  async inviteUser(email: string, metadata?: Record<string, any>): Promise<any> {
    return this.supabaseAuthService.inviteUser(email, metadata);
  }

  async getProfile(authUserId: string): Promise<any> {
    const user = await this.userService.findByAuthUserId(authUserId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.supabaseAuthService.sendPasswordResetEmail(dto.email);
    return {
      message: 'If an account exists with this email, a password reset link has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    await this.supabaseAuthService.resetPassword(dto.token, dto.password);
    return { message: 'Password has been reset successfully. You can now log in with your new password.' };
  }

  async changePassword(
    authUserId: string,
    dto: ChangePasswordDto,
    accessToken: string,
  ): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    await this.supabaseAuthService.changePassword(accessToken, dto.currentPassword, dto.newPassword);
    return { message: 'Password changed successfully.' };
  }

  async adminResetPassword(userId: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userService.findOne(userId);
    if (!user.authUserId) {
      throw new BadRequestException('User has no linked auth account');
    }

    await this.supabaseAuthService.adminResetUserPassword(user.authUserId, newPassword);
    return { message: `Password has been reset for ${user.email}. The user should check their email for a reset link.` };
  }
}
