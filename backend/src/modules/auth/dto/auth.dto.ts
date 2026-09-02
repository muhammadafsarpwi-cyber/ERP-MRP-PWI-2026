import { IsEmail, IsNotEmpty, IsString, IsOptional, MinLength, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InviteUserDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsString()
  @IsOptional()
  lastName?: string;
}

export class LoginDto {
  @ApiProperty({ description: 'Email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email address to send password reset link' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token from email link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'New password (min 8 chars, must include uppercase, lowercase, number)' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({ description: 'Confirm new password' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: 'New password (min 8 chars, must include uppercase, lowercase, number)' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  newPassword: string;

  @ApiProperty({ description: 'Confirm new password' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}

export class AdminResetPasswordDto {
  @ApiProperty({ description: 'New password to set for the user' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  newPassword: string;
}

export class UpdateOwnProfileDto {
  @ApiPropertyOptional({ description: 'Display name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Username' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  username?: string;
}

export class AvatarUploadDto {
  @ApiProperty({ description: 'Base64-encoded image data (without data URI prefix)' })
  @IsString()
  @IsNotEmpty()
  data: string;

  @ApiProperty({ description: 'MIME type of the image', example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  mime: string;
}
