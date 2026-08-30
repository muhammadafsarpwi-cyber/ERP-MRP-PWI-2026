import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../auth/guards/permission.guard';
import { NotificationRule } from './entities/notification-rule.entity';
import { NotificationEvent } from './entities/notification-event.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationChannel } from './entities/notification-channel.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationEngineService } from './notification-engine.service';

// Communication Admin — management endpoints for the notification catalog
// (events, rules, templates, channels) and the delivery log. All endpoints
// require the notifications.manage permission and are company-scoped via RLS.

@ApiTags('notifications/admin')
@Controller('notifications/admin')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class NotificationAdminController {
  constructor(
    @InjectRepository(NotificationRule) private readonly ruleRepo: Repository<NotificationRule>,
    @InjectRepository(NotificationEvent) private readonly eventRepo: Repository<NotificationEvent>,
    @InjectRepository(NotificationTemplate) private readonly templateRepo: Repository<NotificationTemplate>,
    @InjectRepository(NotificationChannel) private readonly channelRepo: Repository<NotificationChannel>,
    @InjectRepository(NotificationDelivery) private readonly deliveryRepo: Repository<NotificationDelivery>,
    private readonly engine: NotificationEngineService,
  ) {}

  private companyWhere(companyId?: string): Record<string, string> {
    return companyId ? { companyId } : {};
  }

  private companyOr(companyId?: string): Record<string, string> {
    return companyId ? { companyId } : {};
  }

  // ── EVENTS ──────────────────────────────────────────────
  @Get('events')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.rules.view')
  @ApiOperation({ summary: 'List notification events (catalog)' })
  async listEvents(@Query('companyId') companyId?: string) {
    const data = await this.eventRepo.find({ where: this.companyWhere(companyId), order: { module: 'ASC', eventCode: 'ASC' } });
    return { success: true, data };
  }

  @Post('events')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.rules.manage')
  @ApiOperation({ summary: 'Register a notification event' })
  async createEvent(@Body() dto: any, @Query('companyId') companyId?: string) {
    if (!dto.eventCode || !dto.eventName || !dto.module) throw new BadRequestException('eventCode, eventName and module are required');
    const existing = await this.eventRepo.findOne({
      where: { eventCode: dto.eventCode, ...(companyId ? { companyId } : {}) } as any,
    });
    if (existing) throw new BadRequestException(`Event '${dto.eventCode}' already registered`);
    const entity = this.eventRepo.create({ ...dto, ...(companyId ? { companyId } : {}) });
    const saved = await this.eventRepo.save(entity);
    return { success: true, data: saved };
  }

  @Patch('events/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.rules.manage')
  @ApiOperation({ summary: 'Update a notification event' })
  async updateEvent(@Param('id') id: string, @Body() dto: any) {
    const existing = await this.eventRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Event not found');
    Object.assign(existing, dto);
    const saved = await this.eventRepo.save(existing);
    return { success: true, data: saved };
  }

  // ── RULES ───────────────────────────────────────────────
  @Get('rules')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.rules.view')
  @ApiOperation({ summary: 'List notification rules' })
  async listRules(@Query('companyId') companyId?: string) {
    const data = await this.ruleRepo.find({ where: this.companyWhere(companyId), order: { eventCode: 'ASC' } });
    return { success: true, data };
  }

  @Post('rules')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.rules.manage')
  @ApiOperation({ summary: 'Create a notification rule' })
  async createRule(@Body() dto: any, @Query('companyId') companyId?: string) {
    if (!dto.ruleCode || !dto.eventCode) throw new BadRequestException('ruleCode and eventCode are required');
    const existing = await this.ruleRepo.findOne({
      where: { ruleCode: dto.ruleCode, ...(companyId ? { companyId } : {}) } as any,
    });
    if (existing) throw new BadRequestException(`Rule '${dto.ruleCode}' already exists`);
    const entity = this.ruleRepo.create({
      ...dto,
      ...(companyId ? { companyId } : {}),
      enabled: dto.enabled ?? true,
      inApp: dto.inApp ?? true,
    } as DeepPartial<NotificationRule>);
    const saved = await this.ruleRepo.save(entity);
    return { success: true, data: saved };
  }

  @Patch('rules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.rules.manage')
  @ApiOperation({ summary: 'Update a notification rule' })
  async updateRule(@Param('id') id: string, @Body() dto: any) {
    const existing = await this.ruleRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Rule not found');
    Object.assign(existing, dto);
    const saved = await this.ruleRepo.save(existing);
    return { success: true, data: saved };
  }

  @Delete('rules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.rules.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification rule' })
  async deleteRule(@Param('id') id: string) {
    await this.ruleRepo.delete({ id });
    return { success: true, message: 'Rule deleted' };
  }

  // ── TEMPLATES ───────────────────────────────────────────
  @Get('templates')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.templates.view')
  @ApiOperation({ summary: 'List notification templates' })
  async listTemplates(@Query('companyId') companyId?: string) {
    const data = await this.templateRepo.find({ where: this.companyWhere(companyId), order: { templateCode: 'ASC' } });
    return { success: true, data };
  }

  @Post('templates')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.templates.manage')
  @ApiOperation({ summary: 'Create a notification template' })
  async createTemplate(@Body() dto: any, @Query('companyId') companyId?: string) {
    if (!dto.templateCode || !dto.body || !dto.channel) throw new BadRequestException('templateCode, body and channel are required');
    const entity = this.templateRepo.create({ ...dto, ...(companyId ? { companyId } : {}) });
    const saved = await this.templateRepo.save(entity);
    return { success: true, data: saved };
  }

  @Patch('templates/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.templates.manage')
  @ApiOperation({ summary: 'Update a notification template' })
  async updateTemplate(@Param('id') id: string, @Body() dto: any) {
    const existing = await this.templateRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Template not found');
    Object.assign(existing, dto);
    const saved = await this.templateRepo.save(existing);
    return { success: true, data: saved };
  }

  @Delete('templates/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.templates.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification template' })
  async deleteTemplate(@Param('id') id: string) {
    await this.templateRepo.delete({ id });
    return { success: true, message: 'Template deleted' };
  }

  // ── CHANNELS ────────────────────────────────────────────
  @Get('channels')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.channels.manage')
  @ApiOperation({ summary: 'List notification channels' })
  async listChannels(@Query('companyId') companyId?: string) {
    const data = await this.channelRepo.find({ where: this.companyWhere(companyId), order: { channelCode: 'ASC' } });
    return { success: true, data };
  }

  @Patch('channels/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.channels.manage')
  @ApiOperation({ summary: 'Update a notification channel' })
  async updateChannel(@Param('id') id: string, @Body() dto: any) {
    const existing = await this.channelRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Channel not found');
    if (dto.config && typeof dto.config === 'object' && ('password' in dto.config || 'token' in dto.config)) {
      throw new BadRequestException('Secrets must be configured via the provider settings endpoint');
    }
    Object.assign(existing, dto);
    const saved = await this.channelRepo.save(existing);
    return { success: true, data: saved };
  }

  // ── DELIVERY LOG ────────────────────────────────────────
  @Get('deliveries')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.audit.view')
  @ApiOperation({ summary: 'List delivery records (log)' })
  async listDeliveries(
    @Query('companyId') companyId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('event') eventCode?: string,
    @Query('recipient') recipient?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const qb = this.deliveryRepo.createQueryBuilder('d');
    if (companyId) qb.andWhere('d.companyId = :companyId', { companyId });
    if (channel) qb.andWhere('d.channel = :channel', { channel });
    if (status) qb.andWhere('d.status = :status', { status });
    if (eventCode) qb.andWhere('d.templateCode = :eventCode', { eventCode });
    if (recipient) qb.andWhere('d.recipientAddress ILIKE :recipient', { recipient: `%${recipient}%` });
    if (dateFrom) qb.andWhere('d.createdAt >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('d.createdAt <= :dateTo', { dateTo });
    qb.orderBy('d.created_at', 'DESC');
    qb.skip((Number(page) - 1) * Number(limit));
    qb.take(Number(limit));
    const [data, total] = await qb.getManyAndCount();
    return { success: true, data, total, page: Number(page), limit: Number(limit) };
  }

  // ── MANUAL EVENT EMIT (admin test) ──────────────────────
  @Post('test-event')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.manage')
  @ApiOperation({ summary: 'Manually emit an event for testing' })
  async testEmit(@Body() dto: { eventCode: string; companyId: string; title?: string; message?: string; context?: Record<string, any> }) {
    if (!dto.eventCode || !dto.companyId) throw new BadRequestException('eventCode and companyId are required');
    await this.engine.emit({
      eventCode: dto.eventCode,
      companyId: dto.companyId,
      title: dto.title || dto.eventCode,
      message: dto.message,
      context: dto.context || {},
    });
    return { success: true, message: `Event ${dto.eventCode} emitted` };
  }
}