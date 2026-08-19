import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { SupabaseAuthService } from './supabase-auth.service';
import { ErpUserService } from '../../user/services/erp-user.service';
import { LoginDto } from '../dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseAuthService: SupabaseAuthService,
    private readonly userService: ErpUserService,
  ) {}

  async login(loginDto: LoginDto): Promise<{ user: any; token: string }> {
    this.logger.warn('Login via direct password is not implemented. Use Supabase Auth client login.');
    throw new UnauthorizedException('Use Supabase Auth client for login');
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
}
