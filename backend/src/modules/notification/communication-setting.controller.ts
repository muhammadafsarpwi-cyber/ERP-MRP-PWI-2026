import {
  Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../auth/guards/permission.guard';
import { CommunicationSetting } from './entities/communication-setting.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { Notification } from './entities/notification.entity';
import { ErpUser } from '../user/entities/erp-user.entity';
import { sendSmtpEmail } from './providers/smtp-email.provider';

// Communication provider settings (SMTP Email / WhatsApp Cloud API).
// Secrets are stored as environment-variable references ("env:VAR") and are
// never returned in API responses. Test endpoints perform live connection
// tests using the configured references.

@ApiTags('communication/settings')
@Controller('communication/settings')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class CommunicationSettingController {
  constructor(
    @InjectRepository(CommunicationSetting)
    private readonly settingRepo: Repository<CommunicationSetting>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepo: Repository<NotificationDelivery>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(ErpUser)
    private readonly erpUserRepo: Repository<ErpUser>,
  ) {}

  private mask(config: Record<string, any> | null | undefined): Record<string, any> | null {
    if (!config || typeof config !== 'object') return config ?? null;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(config)) {
      if (/password|secret|token|api.?key/i.test(k)) out[k] = '********';
      else out[k] = v;
    }
    return out;
  }

  /**
   * Real-time communication summary for the header icons + centers.
   * Returns live delivery counts (queued/sending/sent/failed) and provider
   * config status for EMAIL and WHATSAPP, plus unread notification count.
   * All counts come from the database — never hardcoded.
   */
  @Get('summary')
  @ApiOperation({ summary: 'Communication status summary (unread + delivery counts)' })
  async summary(@Query('companyId') companyId?: string, @Req() req?: any) {
    // Resolve the user's company server-side (authoritative, RLS-safe)
    let scopedCompany = companyId;
    if (!scopedCompany && req?.user?.id) {
      const erp = await this.erpUserRepo.findOne({ where: { authUserId: req.user.id }, select: ['defaultCompanyId'] });
      scopedCompany = erp?.defaultCompanyId || undefined;
    }
    const where = scopedCompany ? { companyId: scopedCompany } : {};

    const [emailSetting, whatsappSetting] = await Promise.all([
      this.settingRepo.findOne({ where: { settingType: 'EMAIL', ...where } }),
      this.settingRepo.findOne({ where: { settingType: 'WHATSAPP', ...where } }),
    ]);

    const [emailQueued, emailSending, emailSent, emailFailed, waQueued, waSending, waSent, waFailed, unread] =
      await Promise.all([
        this.deliveryRepo.count({ where: { channel: 'EMAIL', status: 'QUEUED', ...where } }),
        this.deliveryRepo.count({ where: { channel: 'EMAIL', status: 'SENDING', ...where } }),
        this.deliveryRepo.count({ where: { channel: 'EMAIL', status: 'SENT', ...where } }),
        this.deliveryRepo.count({ where: { channel: 'EMAIL', status: 'FAILED', ...where } }),
        this.deliveryRepo.count({ where: { channel: 'WHATSAPP', status: 'QUEUED', ...where } }),
        this.deliveryRepo.count({ where: { channel: 'WHATSAPP', status: 'SENDING', ...where } }),
        this.deliveryRepo.count({ where: { channel: 'WHATSAPP', status: 'SENT', ...where } }),
        this.deliveryRepo.count({ where: { channel: 'WHATSAPP', status: 'FAILED', ...where } }),
        req?.user?.id ? this.notifRepo.count({ where: { userId: req.user.id, isRead: false } }) : Promise.resolve(0),
      ]);

    const [emailLastDelivery, waLastDelivery] = await Promise.all([
      this.deliveryRepo.findOne({ where: { channel: 'EMAIL', ...where }, order: { createdAt: 'DESC' } }),
      this.deliveryRepo.findOne({ where: { channel: 'WHATSAPP', ...where }, order: { createdAt: 'DESC' } }),
    ]);

    const emailConfigured = !!emailSetting && emailSetting.enabled;
    const whatsappConfigured = !!whatsappSetting && whatsappSetting.enabled;

    return {
      success: true,
      data: {
        unreadCount: unread,
        email: {
          configured: emailConfigured,
          provider: emailSetting?.provider || 'smtp',
          status: emailConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
          queued: emailQueued,
          sending: emailSending,
          sent: emailSent,
          failed: emailFailed,
          lastDeliveryAt: emailLastDelivery?.sentAt || emailLastDelivery?.createdAt || null,
        },
        whatsapp: {
          configured: whatsappConfigured,
          provider: whatsappSetting?.provider || 'whatsapp_meta',
          status: whatsappConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
          queued: waQueued,
          sending: waSending,
          sent: waSent,
          failed: waFailed,
          lastDeliveryAt: waLastDelivery?.sentAt || waLastDelivery?.createdAt || null,
        },
      },
    };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.channels.manage')
  @ApiOperation({ summary: 'List communication provider settings (secrets masked)' })
  async list(@Query('companyId') companyId?: string) {
    const where = companyId ? { companyId } : {};
    const data = await this.settingRepo.find({ where, order: { settingType: 'ASC' } });
    data.forEach((s) => { s.config = this.mask(s.config); });
    return { success: true, data };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.channels.manage')
  @ApiOperation({ summary: 'Upsert a communication provider setting' })
  async upsert(@Body() dto: { settingType: 'EMAIL' | 'WHATSAPP'; provider?: string; config?: Record<string, any>; enabled?: boolean }, @Query('companyId') companyId?: string) {
    if (!dto.settingType) throw new BadRequestException('settingType (EMAIL or WHATSAPP) is required');
    const existing = await this.settingRepo.findOne({ where: { settingType: dto.settingType, ...(companyId ? { companyId } : {}) } });
    if (existing) {
      existing.provider = dto.provider ?? existing.provider;
      existing.config = dto.config ?? existing.config;
      existing.enabled = dto.enabled ?? existing.enabled;
      const saved = await this.settingRepo.save(existing);
      saved.config = this.mask(saved.config);
      return { success: true, data: saved };
    }
    const created = await this.settingRepo.save(this.settingRepo.create({
      companyId: companyId || null,
      settingType: dto.settingType,
      provider: dto.provider || 'smtp',
      config: dto.config || {},
      enabled: dto.enabled ?? false,
    }));
    created.config = this.mask(created.config);
    return { success: true, data: created };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.channels.manage')
  @ApiOperation({ summary: 'Update a communication provider setting' })
  async update(@Param('id') id: string, @Body() dto: any) {
    const existing = await this.settingRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Setting not found');
    Object.assign(existing, dto);
    const saved = await this.settingRepo.save(existing);
    saved.config = this.mask(saved.config);
    return { success: true, data: saved };
  }

  @Post('test-email')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.channels.manage')
  @ApiOperation({ summary: 'Send a test email using configured SMTP (live test)' })
  async testEmail(@Body() dto: { to: string; companyId?: string }) {
    const settings = await this.settingRepo.findOne({ where: { settingType: 'EMAIL', enabled: true, ...(dto.companyId ? { companyId: dto.companyId } : {}) } });
    if (!settings) {
      return { success: false, message: 'Email provider is not configured or disabled' };
    }
    const config = settings.config || {};
    const host = config.host || '';
    const port = Number(config.port) || 25;
    const username = config.username || '';
    const passwordRef = config.passwordRef || '';
    const password = passwordRef.startsWith('env:') ? (process.env[passwordRef.slice(4)] || '') : passwordRef;
    if (!host || !dto.to) {
      return { success: false, message: 'SMTP host and recipient email are required' };
    }
    try {
      const messageId = await sendSmtpEmail({
        host, port, username, password,
        useTls: config.useTls !== false,
        from: config.fromEmail || 'noreply@erp.local',
        fromName: config.fromName || 'ERP System',
        to: dto.to,
        subject: 'ERP Test Email',
        body: '<p>This is a test email from the ERP communication system.</p>',
      });
      return { success: true, message: `Test email sent (${messageId || 'no message-id'})` };
    } catch (error) {
      return { success: false, message: `Test email failed: ${(error as Error).message}` };
    }
  }

  @Post('test-whatsapp')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.channels.manage')
  @ApiOperation({ summary: 'Send a test WhatsApp message using configured provider (live test)' })
  async testWhatsApp(@Body() dto: { to: string; companyId?: string }) {
    const settings = await this.settingRepo.findOne({ where: { settingType: 'WHATSAPP', enabled: true, ...(dto.companyId ? { companyId: dto.companyId } : {}) } });
    if (!settings) {
      return { success: false, message: 'WhatsApp provider is not configured or disabled' };
    }
    const config = settings.config || {};
    const phoneNumberId = config.phoneNumberId || '';
    const tokenRef = config.tokenRef || '';
    const token = tokenRef.startsWith('env:') ? (process.env[tokenRef.slice(4)] || '') : tokenRef;
    if (!phoneNumberId || !token) {
      return { success: false, message: 'WhatsApp credentials are not configured' };
    }
    if (!dto.to) {
      return { success: false, message: 'Recipient phone number is required' };
    }
    try {
      const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: dto.to, type: 'text', text: { body: 'ERP test message' } }),
      });
      const body = await resp.text();
      if (resp.ok) return { success: true, message: `WhatsApp test message sent (${body.slice(0, 200)})` };
      return { success: false, message: `WhatsApp test failed (${resp.status}): ${body.slice(0, 300)}` };
    } catch (error) {
      return { success: false, message: `WhatsApp test failed: ${(error as Error).message}` };
    }
  }
}