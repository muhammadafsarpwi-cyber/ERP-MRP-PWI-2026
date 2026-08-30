import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationRule } from './entities/notification-rule.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationRecipientResolver, ResolvedRecipient } from './notification-recipient-resolver.service';

export interface EmitEventPayload {
  eventCode: string;
  companyId: string;
  /** Short title used in the in-app notification. */
  title: string;
  /** Brief message body for the in-app notification. */
  message?: string;
  /** Entity type (e.g. 'job_card', 'purchase_order') for linking. */
  entityType?: string;
  /** Entity UUID for deep-linking back to the record. */
  entityId?: string;
  /** AuthUserId of the person who performed the action. */
  actorAuthUserId?: string;
  /** Extra context used by template rendering and recipient resolution. */
  context?: Record<string, any>;
}

/**
 * Central notification event engine. Emits a business event, evaluates
 * matching rules, resolves recipients, renders templates, persists
 * in-app notifications + delivery queue records, and respects user
 * channel preferences. Every important business action in the ERP
 * routes through this service.
 */
@Injectable()
export class NotificationEngineService {
  private readonly logger = new Logger(NotificationEngineService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(NotificationRule)
    private readonly ruleRepo: Repository<NotificationRule>,
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepo: Repository<NotificationDelivery>,
    @InjectRepository(NotificationPreference)
    private readonly prefRepo: Repository<NotificationPreference>,
    private readonly recipientResolver: NotificationRecipientResolver,
  ) {}

  /**
   * Fire a business event notification. Always runs in a try/catch and
   * never throws into the caller's business flow — notification failures
   * must never break the primary operation.
   */
  async emit(event: EmitEventPayload): Promise<void> {
    try {
      const rules = await this.ruleRepo.find({
        where: {
          eventCode: event.eventCode,
          companyId: event.companyId,
          enabled: true,
          isActive: true,
        },
      });
      if (!rules.length) {
        this.logger.log(`No active rules for event ${event.eventCode} in company ${event.companyId}`);
        return;
      }

      for (const rule of rules) {
        await this.processRule(rule, event);
      }
    } catch (error) {
      this.logger.error(`NotificationEngine.emit failed for ${event.eventCode}: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  private async processRule(rule: NotificationRule, event: EmitEventPayload): Promise<void> {
    const recipients = await this.recipientResolver.resolve(rule, { ...event.context, createdByAuthUserId: event.actorAuthUserId, companyId: event.companyId });
    if (!recipients.length) return;

    // Load templates for each enabled channel
    const templates = await this.templateRepo.find({
      where: { eventCode: event.eventCode, companyId: event.companyId, isActive: true },
    });

    // Load user preferences (module-level, per user)
    const moduleName = this.moduleOf(event.eventCode);
    const userIds = recipients.map((r) => r.userId);
    const prefs = await this.prefRepo.find({
      where: { userId: In(userIds), module: moduleName, isActive: true },
    });
    const prefMap = new Map<string, { inApp: boolean; email: boolean; whatsapp: boolean }>();
    for (const p of prefs) {
      prefMap.set(p.userId, { inApp: p.inApp, email: p.email, whatsapp: p.whatsapp });
    }

    const now = new Date();
    const renderFor = (channel: 'IN_APP' | 'EMAIL' | 'WHATSAPP', recipient: ResolvedRecipient) => {
      const tpl = templates.find((t) => t.channel === channel);
      if (!tpl) return { subject: null, body: null };
      const c = event.context || {};
      const vars: Record<string, string> = {
        jobCardNumber: String(c.jobCardNumber ?? c.jobCardNo ?? c.job_card_no ?? ''),
        jobCardTitle: String(c.jobCardTitle ?? c.title ?? event.title ?? ''),
        machineCode: String(c.machineCode ?? c.machine_code ?? ''),
        machineName: String(c.machineName ?? c.machine_name ?? ''),
        department: String(c.department ?? c.departmentName ?? c.department_name ?? ''),
        priority: String(c.priority ?? ''),
        status: String(c.status ?? ''),
        createdBy: String(c.createdByName ?? c.created_by ?? event.actorAuthUserId ?? ''),
        createdAt: now.toISOString(),
        link: String(
          c.link ||
          (event.entityType && event.entityId ? `/master-data/maintenance/job-cards/${event.entityId}` : ''),
        ),
        recipientName: '',
        recipientEmail: recipient.email || '',
        companyName: String(c.companyName ?? ''),
      };
      const subject = tpl.subject ? this.renderTemplate(tpl.subject, vars) : null;
      const body = tpl.body ? this.renderTemplate(tpl.body, vars) : null;
      return { subject, body };
    };

    for (const recipient of recipients) {
      const userPref = prefMap.get(recipient.userId) ?? { inApp: true, email: true, whatsapp: false };

      // In-app notification
      if (rule.inApp && userPref.inApp) {
        const rendered = renderFor('IN_APP', recipient);
        try {
          await this.notifRepo
            .createQueryBuilder()
            .insert()
            .into(Notification)
            .values({
              userId: recipient.userId,
              type: event.eventCode,
              title: event.title,
              message: rendered.body || event.message || null,
              entityType: event.entityType ?? null,
              entityId: event.entityId ?? null,
              isRead: false,
              readAt: null,
              createdBy: event.actorAuthUserId ?? null,
            } as any)
            .orIgnore()
            .execute();
        } catch (insertError) {
          this.logger.warn(`in-app notification insert failed for user ${recipient.userId}: ${(insertError as Error).message}`);
        }
      }

      // Email delivery
      if (rule.email && userPref.email) {
        const rendered = renderFor('EMAIL', recipient);
        const address = recipient.email || '';
        if (address) {
          try {
            await this.deliveryRepo.save({
              companyId: event.companyId,
              recipientUserId: recipient.userId,
              recipientType: rule.recipientType,
              channel: 'EMAIL',
              templateCode: rule.templateCode || null,
              renderedSubject: rendered.subject,
              renderedBody: rendered.body,
              recipientAddress: address,
              status: 'QUEUED',
              eventId: event.entityId || null,
              maxRetries: 3,
            } as any);
          } catch (delError) {
            this.logger.warn(`email delivery queue failed for ${address}: ${(delError as Error).message}`);
          }
        }
      }

      // WhatsApp delivery
      if (rule.whatsapp && userPref.whatsapp) {
        const rendered = renderFor('WHATSAPP', recipient);
        const phone = recipient.phone || '';
        if (phone) {
          try {
            await this.deliveryRepo.save({
              companyId: event.companyId,
              recipientUserId: recipient.userId,
              recipientType: rule.recipientType,
              channel: 'WHATSAPP',
              templateCode: rule.templateCode || null,
              renderedBody: rendered.body,
              recipientAddress: phone,
              status: 'QUEUED',
              eventId: event.entityId || null,
              maxRetries: 3,
            } as any);
          } catch (delError) {
            this.logger.warn(`whatsapp delivery queue failed for ${phone}: ${(delError as Error).message}`);
          }
        }
      }
    }
  }

  /**
   * Safe {{variable}} replacement. Never executes code — pure string substitution.
   * Unknown variables are replaced with empty string to avoid leaking template syntax.
   */
  private renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      return vars[key] !== undefined ? vars[key] : '';
    });
  }

  /** Map an event code to its module name for preference scoping. */
  private moduleOf(eventCode: string): string {
    const prefix = (eventCode.split('_')[0] || '').toLowerCase();
    const map: Record<string, string> = {
      maint: 'maintenance',
      proc: 'procurement',
      sales: 'sales',
      inv: 'inventory',
      mfg: 'manufacturing',
      qc: 'qc',
      hr: 'hr',
      fin: 'finance',
    };
    return map[prefix] || 'system';
  }
}