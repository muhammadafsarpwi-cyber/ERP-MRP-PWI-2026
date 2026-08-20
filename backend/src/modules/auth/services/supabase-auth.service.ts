import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { SupabaseUser, SupabaseJwtPayload } from '../interfaces/supabase-user.interface';

@Injectable()
export class SupabaseAuthService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseAuthService.name);
  private jwtSecretValidated = false;
  private jwtSecretValid = false;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      this.logger.warn('Supabase credentials not configured. Auth will not work.');
    }

    this.supabase = createClient(
      supabaseUrl || 'http://localhost:54321',
      supabaseServiceKey || 'dummy-key',
    );
  }

  async verifyToken(token: string): Promise<SupabaseJwtPayload> {
    if (!this.jwtSecretValidated) {
      this.validateJwtSecret();
    }

    if (this.jwtSecretValid) {
      return this.verifyTokenLocally(token);
    }

    return this.verifyTokenViaSupabase(token);
  }

  private validateJwtSecret(): void {
    this.jwtSecretValidated = true;
    const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');
    if (!secret) {
      this.logger.warn('SUPABASE_JWT_SECRET not set — using Supabase API fallback for token verification (slower)');
      this.jwtSecretValid = false;
      return;
    }
    if (secret.startsWith('eyJ')) {
      this.logger.error(
        'SUPABASE_JWT_SECRET appears to be a JWT token (anon key), not the HS256 signing secret. ' +
        'Set it to the JWT Secret from Supabase Dashboard > Settings > API > JWT Secret. ' +
        'Falling back to Supabase API for token verification.',
      );
      this.jwtSecretValid = false;
      return;
    }
    this.jwtSecretValid = true;
    this.logger.log('SUPABASE_JWT_SECRET validated — using local JWT verification');
  }

  private verifyTokenLocally(token: string): SupabaseJwtPayload {
    try {
      const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');
      if (!secret) {
        throw new UnauthorizedException('JWT secret not configured');
      }
      return jwt.verify(token, secret) as SupabaseJwtPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.warn(`Local JWT verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async verifyTokenViaSupabase(token: string): Promise<SupabaseJwtPayload> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException('Supabase not configured');
    }

    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      const user = await response.json();
      return {
        sub: user.id,
        email: user.email,
        role: user.role,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.warn(`Supabase token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async getUserFromToken(token: string): Promise<SupabaseUser> {
    const payload = await this.verifyToken(token);
    return { id: payload.sub, email: payload.email };
  }

  async inviteUser(email: string, metadata?: Record<string, any>): Promise<any> {
    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(email, {
      data: metadata || {},
      redirectTo: this.configService.get<string>('SUPABASE_REDIRECT_URL', 'http://localhost:3000/login'),
    });

    if (error) {
      this.logger.error(`Failed to invite user: ${error.message}`);
      throw new Error(`Failed to invite user: ${error.message}`);
    }

    return data;
  }

  async getUser(authUserId: string): Promise<any> {
    const { data, error } = await this.supabase.auth.admin.getUserById(authUserId);
    if (error) {
      return null;
    }
    return data.user;
  }

  async deleteUser(authUserId: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.deleteUser(authUserId);
    if (error) {
      this.logger.error(`Failed to delete auth user: ${error.message}`);
    }
  }

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException('Supabase not configured');
    }

    const response = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      },
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      const msg = data.error_description || data.msg || 'Invalid credentials';
      this.logger.warn(`Login failed for ${email}: ${msg}`);
      throw new UnauthorizedException(msg);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
    };
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    const redirectUrl = this.configService.get<string>('SUPABASE_REDIRECT_URL', 'http://localhost:3000/login');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException('Supabase not configured');
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, redirect_to: redirectUrl }),
    });

    const data = await response.json();

    if (!response.ok && data.error) {
      this.logger.warn(`Password reset failed for ${email}: ${data.error_description || data.msg}`);
    }

    this.logger.log(`Password reset email sent to ${email}`);
  }

  async resetPassword(accessToken: string, newPassword: string): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException('Supabase not configured');
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const msg = data.error_description || data.msg || 'Failed to reset password';
      this.logger.warn(`Password reset failed: ${msg}`);
      throw new UnauthorizedException(msg);
    }
  }

  async changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException('Supabase not configured');
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const msg = data.error_description || data.msg || 'Failed to change password';
      this.logger.warn(`Password change failed: ${msg}`);
      throw new UnauthorizedException(msg);
    }
  }

  async adminResetUserPassword(authUserId: string, newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.updateUserById(authUserId, {
      password: newPassword,
    });

    if (error) {
      this.logger.error(`Admin password reset failed for ${authUserId}: ${error.message}`);
      throw new Error(`Failed to reset user password: ${error.message}`);
    }
  }
}
