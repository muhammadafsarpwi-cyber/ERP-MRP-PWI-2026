import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthService } from './supabase-auth.service';
import { ErpUserService } from '../../user/services/erp-user.service';
import { PermissionMatrixService } from '../../permission/services/permission-matrix.service';
import { LoginDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, UpdateOwnProfileDto, AvatarUploadDto } from '../dto/auth.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly storagePath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAuthService: SupabaseAuthService,
    private readonly userService: ErpUserService,
    private readonly permissionMatrixService: PermissionMatrixService,
  ) {
    const configured = this.configService.get<string>('STORAGE_PATH', './storage');
    this.storagePath = path.resolve(configured);
  }

  async login(loginDto: LoginDto): Promise<{ token: string; refreshToken: string; user: any }> {
    const result = await this.supabaseAuthService.signInWithPassword(
      loginDto.email,
      loginDto.password,
    );

    const erpUser = await this.userService.findByAuthUserId(result.user.id);

    if (!erpUser) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }

    if (erpUser.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive');
    }

    await this.userService.updateLastLogin(erpUser.id);

    const permissions = await this.permissionMatrixService.getUserPermissions(erpUser.id);

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
        permissions,
      },
    };
  }

  async validateToken(token: string): Promise<any> {
    const supabaseUser = await this.supabaseAuthService.getUserFromToken(token);
    if (!supabaseUser || !supabaseUser.id) {
      throw new UnauthorizedException('Invalid token');
    }

    const erpUser = await this.userService.findByAuthUserId(supabaseUser.id);

    if (!erpUser) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
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

    const permissions = await this.permissionMatrixService.getUserPermissions(user.id);

    return {
      ...user,
      permissions,
    };
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

  async updateOwnProfile(authUserId: string, dto: UpdateOwnProfileDto): Promise<any> {
    const updates: Partial<Pick<any, 'displayName' | 'firstName' | 'lastName' | 'phone' | 'username'>> = {};
    const allowedFields: (keyof UpdateOwnProfileDto)[] = ['displayName', 'firstName', 'lastName', 'phone', 'username'];
    for (const field of allowedFields) {
      if (dto[field] !== undefined) {
        (updates as any)[field] = dto[field];
      }
    }
    const saved = await this.userService.updateOwnProfile(authUserId, updates);
    const permissions = await this.permissionMatrixService.getUserPermissions(saved.id);
    return { ...saved, permissions };
  }

  async uploadAvatar(authUserId: string, dto: AvatarUploadDto): Promise<any> {
    const user = await this.userService.findByAuthUserId(authUserId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedMimes.has(dto.mime)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
    }

    const maxSize = 5 * 1024 * 1024;
    const buffer = Buffer.from(dto.data, 'base64');
    if (buffer.length > maxSize) {
      throw new BadRequestException('File size exceeds the 5 MB limit.');
    }

    const magicBytes: Record<string, (buf: Buffer) => boolean> = {
      'image/jpeg': (buf) => buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
      'image/png': (buf) => buf.length > 8 && buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG',
      'image/webp': (buf) =>
        buf.length > 12 &&
        buf.slice(0, 4).toString() === 'RIFF' &&
        buf.slice(8, 12).toString() === 'WEBP',
    };
    const validator = magicBytes[dto.mime];
    if (!validator || !validator(buffer)) {
      throw new BadRequestException('File content does not match the declared MIME type.');
    }

    const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = extMap[dto.mime] || 'jpg';

    const avatarDir = path.join(this.storagePath, 'avatars', authUserId);
    if (!fs.existsSync(avatarDir)) {
      fs.mkdirSync(avatarDir, { recursive: true });
    }

    if (user.avatarUrl) {
      this.deleteAvatarFile(user.avatarUrl);
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(avatarDir, filename);
    fs.writeFileSync(filePath, buffer);

    const avatarUrl = `/uploads/avatars/${authUserId}/${filename}`;
    const saved = await this.userService.setAvatarUrl(authUserId, avatarUrl);
    const permissions = await this.permissionMatrixService.getUserPermissions(saved.id);

    return {
      ...saved,
      permissions,
    };
  }

  async removeAvatar(authUserId: string): Promise<any> {
    const user = await this.userService.findByAuthUserId(authUserId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.avatarUrl) {
      this.deleteAvatarFile(user.avatarUrl);
    }

    const saved = await this.userService.setAvatarUrl(authUserId, null);
    const permissions = await this.permissionMatrixService.getUserPermissions(saved.id);

    return {
      ...saved,
      permissions,
    };
  }

  private deleteAvatarFile(avatarUrl: string): void {
    if (!avatarUrl.startsWith('/uploads/avatars/')) return;
    const relativePath = avatarUrl.replace('/uploads/', '');
    const filePath = path.join(this.storagePath, relativePath);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // non-fatal: file may have been deleted already
    }
  }
}
