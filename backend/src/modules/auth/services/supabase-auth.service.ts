import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { SupabaseUser, SupabaseJwtPayload } from '../interfaces/supabase-user.interface';

@Injectable()
export class SupabaseAuthService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseAuthService.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseJwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET');

    if (!supabaseUrl || !supabaseServiceKey) {
      this.logger.warn('Supabase credentials not configured. Auth will not work.');
    }

    this.supabase = createClient(
      supabaseUrl || 'http://localhost:54321',
      supabaseServiceKey || 'dummy-key',
    );
  }

  async verifyToken(token: string): Promise<SupabaseJwtPayload> {
    try {
      const supabaseJwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET');
      if (!supabaseJwtSecret) {
        throw new UnauthorizedException('JWT secret not configured');
      }

      const payload = jwt.verify(token, supabaseJwtSecret) as SupabaseJwtPayload;
      return payload;
    } catch (error) {
      this.logger.warn(`Token verification failed: ${error.message}`);
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
}
