import {
  Controller, Get, Post, Patch, Body, UseGuards, Req, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { NotificationPreference } from './entities/notification-preference.entity';

// User notification preferences — each user controls which channels they
// receive for each module. Scoped to the authenticated user only.

@ApiTags('notifications/preferences')
@Controller('notifications/preferences')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class NotificationPreferenceController {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly prefRepo: Repository<NotificationPreference>,
  ) {}

  private erpUserId(req: any): string {
    // req.user.id is the auth user id; notification_preferences stores erp user id
    return req.user?.id;
  }

  @Get()
  @ApiOperation({ summary: 'List my notification preferences' })
  async list(@Req() req: any) {
    const userId = this.erpUserId(req);
    const data = await this.prefRepo.find({ where: { userId }, order: { module: 'ASC' } });
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Upsert my notification preference for a module' })
  async upsert(@Req() req: any, @Body() dto: { module: string; inApp?: boolean; email?: boolean; whatsapp?: boolean }) {
    const userId = this.erpUserId(req);
    if (!dto.module) throw new BadRequestException('module is required');
    const existing = await this.prefRepo.findOne({ where: { userId, module: dto.module } });
    if (existing) {
      Object.assign(existing, {
        inApp: dto.inApp ?? existing.inApp,
        email: dto.email ?? existing.email,
        whatsapp: dto.whatsapp ?? existing.whatsapp,
      });
      const saved = await this.prefRepo.save(existing);
      return { success: true, data: saved };
    }
    const created = await this.prefRepo.save(this.prefRepo.create({
      userId,
      module: dto.module,
      inApp: dto.inApp ?? true,
      email: dto.email ?? true,
      whatsapp: dto.whatsapp ?? false,
    }));
    return { success: true, data: created };
  }

  @Patch()
  @ApiOperation({ summary: 'Update my preference for a module' })
  async update(@Req() req: any, @Body() dto: { module: string; inApp?: boolean; email?: boolean; whatsapp?: boolean }) {
    return this.upsert(req, dto);
  }
}