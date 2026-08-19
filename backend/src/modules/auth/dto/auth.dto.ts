import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';
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
