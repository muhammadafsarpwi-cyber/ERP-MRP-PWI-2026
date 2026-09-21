import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { SupabaseUser, SupabaseJwtPayload } from '../interfaces/supabase-user.interface';

@Injectable()
export class SupabaseAuthService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseAuthService.name);
  private jwtSecretValidated = false;
  private jwtSecretValid = false;
  private readonly localJwtSecret: string;
  private readonly localJwtExpiration: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      this.logger.warn('Supabase credentials not configured. Auth will not work.');
    }

    this.supabase = createClient(
      supabaseUrl || 'http://localhost:54321',
      supabaseServiceKey || 'dummy-key',
    );

    this.localJwtSecret = this.configService.get<string>('JWT_SECRET', 'dev-jwt-secret-not-for-production');
    this.localJwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '1h');
  }

  async verifyToken(token: string): Promise<SupabaseJwtPayload> {
    // First, try to verify as a locally-issued JWT (fallback tokens)
    try {
      const payload = jwt.verify(token, this.localJwtSecret) as any;
      if (payload.sub && payload.iss === 'pwi-local-auth') {
        return { sub: payload.sub, email: payload.email, role: payload.role };
      }
    } catch {
      // Not a local token — continue to Supabase verification
    }

    if (!this.jwtSecretValidated) {
      this.validateJwtSecret();
    }

    if (this.jwtSecretValid) {
      return this.verifyTokenLocally(token);
    }

    // Try Supabase API, fall back to local if quota exhausted
    try {
      return await this.verifyTokenViaSupabase(token);
    } catch (error) {
      // If Supabase is down/quota exhausted, try decoding locally with JWT_SECRET
      try {
        const payload = jwt.verify(token, this.localJwtSecret) as any;
        if (payload.sub) {
          return { sub: payload.sub, email: payload.email, role: payload.role };
        }
      } catch {}
      throw error;
    }
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
      // No Supabase config — go straight to local fallback
      return this.signInLocalFallback(email, password);
    }

    try {
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

      // 402 = quota exceeded, 500/503 = service down — use local fallback
      if (response.status === 402 || response.status === 500 || response.status === 503) {
        this.logger.warn(
          `Supabase Auth API returned ${response.status} for ${email} — ` +
          `falling back to local DB authentication. ` +
          `Reason: ${data.message || data.error_description || data.msg || 'Service unavailable'}`,
        );
        return this.signInLocalFallback(email, password);
      }

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
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // Network error, DNS failure, timeout — try local fallback
      this.logger.warn(
        `Supabase Auth API unreachable for ${email}: ${error.message} — falling back to local DB authentication`,
      );
      return this.signInLocalFallback(email, password);
    }
  }

  /**
   * Local fallback authentication: queries auth.users directly and verifies
   * the bcrypt password hash. Issues a locally-signed JWT when Supabase Auth
   * API is unavailable (quota exceeded, outage, etc.).
   */
  private async signInLocalFallback(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    this.logger.log(`Attempting local DB authentication for ${email}`);

    // Query auth.users for the encrypted password and user metadata
    const rows = await this.dataSource.query(
      `SELECT id, email, encrypted_password, email_confirmed_at, banned_until,
              raw_user_meta_data, role
       FROM auth.users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email],
    );

    if (!rows || rows.length === 0) {
      this.logger.warn(`Local auth: no user found for ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const authUser = rows[0];

    // Check if email is confirmed
    if (!authUser.email_confirmed_at) {
      this.logger.warn(`Local auth: email not confirmed for ${email}`);
      throw new UnauthorizedException('Email not confirmed');
    }

    // Check if user is banned
    if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) {
      this.logger.warn(`Local auth: user banned until ${authUser.banned_until} for ${email}`);
      throw new UnauthorizedException('Account is banned');
    }

    // Verify password via bcrypt
    const passwordValid = await bcrypt.compare(password, authUser.encrypted_password);
    if (!passwordValid) {
      this.logger.warn(`Local auth: invalid password for ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last_sign_in_at in auth.users
    await this.dataSource.query(
      `UPDATE auth.users SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [authUser.id],
    ).catch((err) => this.logger.warn(`Failed to update last_sign_in_at: ${err.message}`));

    // Generate local JWT tokens
    const now = Math.floor(Date.now() / 1000);
    const accessPayload = {
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role || 'authenticated',
      iss: 'pwi-local-auth',
      iat: now,
    };

    const accessToken = jwt.sign(accessPayload, this.localJwtSecret, {
      expiresIn: this.localJwtExpiration,
    });

    const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d');
    const refreshToken = jwt.sign(
      { sub: authUser.id, type: 'refresh', iss: 'pwi-local-auth', iat: now },
      this.localJwtSecret,
      { expiresIn: refreshExpiration },
    );

    this.logger.log(`Local auth: login successful for ${email} (user ${authUser.id})`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: authUser.id,
        email: authUser.email,
        role: authUser.role || 'authenticated',
        user_metadata: authUser.raw_user_meta_data || {},
      },
    };
  }

  async refreshSession(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    // First, check if this is a locally-issued refresh token
    try {
      const payload = jwt.verify(refreshToken, this.localJwtSecret) as any;
      if (payload.iss === 'pwi-local-auth' && payload.type === 'refresh' && payload.sub) {
        return this.refreshLocalSession(payload.sub);
      }
    } catch {
      // Not a local token — try Supabase
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException('Supabase not configured');
    }

    try {
      const response = await fetch(
        `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
        {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
      );

      const data = await response.json();

      // Quota/service issues — try to decode the original refresh token for a local refresh
      if (response.status === 402 || response.status === 500 || response.status === 503) {
        this.logger.warn(`Supabase refresh API returned ${response.status} — attempting local fallback`);
        // Try to extract sub from the expired/original Supabase refresh token
        try {
          const decoded = jwt.decode(refreshToken) as any;
          if (decoded?.sub) {
            return this.refreshLocalSession(decoded.sub);
          }
        } catch {}
        throw new UnauthorizedException('Unable to refresh session — Supabase service unavailable');
      }

      if (!response.ok || data.error) {
        const msg = data.error_description || data.msg || 'Invalid refresh token';
        this.logger.warn(`Token refresh failed: ${msg}`);
        throw new UnauthorizedException(msg);
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.warn(`Supabase refresh API unreachable: ${error.message}`);
      // Try local fallback with decoded token
      try {
        const decoded = jwt.decode(refreshToken) as any;
        if (decoded?.sub) {
          return this.refreshLocalSession(decoded.sub);
        }
      } catch {}
      throw new UnauthorizedException('Unable to refresh session');
    }
  }

  /**
   * Issue a new local access+refresh token pair for a known auth user ID.
   */
  private async refreshLocalSession(
    authUserId: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const rows = await this.dataSource.query(
      `SELECT id, email, role, raw_user_meta_data FROM auth.users WHERE id = $1 LIMIT 1`,
      [authUserId],
    );

    if (!rows || rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const authUser = rows[0];
    const now = Math.floor(Date.now() / 1000);

    const accessToken = jwt.sign(
      { sub: authUser.id, email: authUser.email, role: authUser.role || 'authenticated', iss: 'pwi-local-auth', iat: now },
      this.localJwtSecret,
      { expiresIn: this.localJwtExpiration },
    );

    const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d');
    const newRefreshToken = jwt.sign(
      { sub: authUser.id, type: 'refresh', iss: 'pwi-local-auth', iat: now },
      this.localJwtSecret,
      { expiresIn: refreshExpiration },
    );

    this.logger.log(`Local session refresh succeeded for user ${authUserId}`);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: authUser.id,
        email: authUser.email,
        role: authUser.role || 'authenticated',
        user_metadata: authUser.raw_user_meta_data || {},
      },
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

  async signUpWithPassword(
    email: string,
    password: string,
    metadata?: Record<string, any>,
  ): Promise<{ user: { id: string; email: string } }> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase not configured');
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        data: metadata || {},
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const msg = data.error_description || data.msg || data.error?.message || 'Failed to create user';
      this.logger.error(`Signup failed for ${email}: ${msg}`);
      throw new Error(msg);
    }

    return { user: { id: data.user.id, email: data.user.email } };
  }

  async adminResetUserPassword(authUserId: string, newPassword: string): Promise<void> {
    // Primary strategy: update the bcrypt-hashed password directly in auth.users
    // This is the same approach used for user creation and works reliably even
    // when the Supabase Admin REST API is unavailable or misconfigured.
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const now = new Date().toISOString();
      const result = await this.dataSource.query(
        `UPDATE auth.users
         SET encrypted_password = $1,
             updated_at = $2,
             recovery_token = '',
             recovery_sent_at = NULL,
             email_change_token_new = '',
             email_change_token_current = '',
             email_change_confirm_status = 0
         WHERE id = $3`,
        [hashedPassword, now, authUserId],
      );
      const rowsAffected = Array.isArray(result) ? result[1] : (result?.rowCount ?? 0);
      if (!rowsAffected || rowsAffected === 0) {
        throw new Error(`No auth user found with id ${authUserId}`);
      }
      this.logger.log(`Password reset (direct DB) succeeded for auth user ${authUserId}`);
      return;
    } catch (dbError) {
      this.logger.warn(
        `Direct DB password reset failed for ${authUserId}: ${dbError.message}. Falling back to Supabase Admin API.`,
      );
    }

    // Fallback: Supabase Admin API
    const { error } = await this.supabase.auth.admin.updateUserById(authUserId, {
      password: newPassword,
    });

    if (error) {
      this.logger.error(`Admin password reset (API fallback) failed for ${authUserId}: ${error.message}`);
      throw new Error(`Failed to reset user password: ${error.message}`);
    }
    this.logger.log(`Password reset (Supabase API fallback) succeeded for auth user ${authUserId}`);
  }
}
