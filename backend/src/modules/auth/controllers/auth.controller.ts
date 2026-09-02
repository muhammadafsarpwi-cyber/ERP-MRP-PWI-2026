import { Controller, Get, Post, Patch, Delete, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { SupabaseJwtGuard } from '../guards/supabase-jwt.guard';
import { Public } from '../decorators/public.decorator';
import { AuthRateLimitGuard } from '../guards/auth-rate-limit.guard';
import { LoginDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, UpdateOwnProfileDto, AvatarUploadDto } from '../dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful, returns JWT token and user' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.login(loginDto);
    return result;
  }

  @Get('me')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req: any) {
    const user = await this.authService.getProfile(req.user.id);
    return { success: true, data: user };
  }

  @Patch('me')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'User profile updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(@Request() req: any, @Body() dto: UpdateOwnProfileDto) {
    const user = await this.authService.updateOwnProfile(req.user.id, dto);
    return { success: true, data: user, message: 'Profile updated successfully' };
  }

  @Post('me/avatar')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload current user avatar image' })
  @ApiResponse({ status: 200, description: 'Avatar uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadAvatar(@Request() req: any, @Body() dto: AvatarUploadDto) {
    const user = await this.authService.uploadAvatar(req.user.id, dto);
    return { success: true, data: user, message: 'Avatar updated successfully' };
  }

  @Delete('me/avatar')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove current user avatar' })
  @ApiResponse({ status: 200, description: 'Avatar removed successfully' })
  async removeAvatar(@Request() req: any) {
    const user = await this.authService.removeAvatar(req.user.id);
    return { success: true, data: user, message: 'Avatar removed successfully' };
  }

  @Post('forgot-password')
  @Public()
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent (or email not found — same response for security)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token or password mismatch' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @UseGuards(SupabaseJwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized or incorrect current password' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace('Bearer ', '');
    return this.authService.changePassword(req.user.id, dto, accessToken);
  }
}
