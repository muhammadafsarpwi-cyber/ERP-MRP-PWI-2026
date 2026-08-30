import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { NotificationDelivery, NotificationDeliveryStatus } from './entities/notification-delivery.entity';
import { CommunicationSetting } from './entities/communication-setting.entity';
import { sendSmtpEmail } from './providers/smtp-email.provider';

/**
 * In-process delivery queue processor. Polls for QUEUED deliveries every
 * N seconds, attempts delivery via the configured provider (SMTP/Meta),
 * and updates the delivery record with status + provider response.
 *
 * Started on module init via onApplicationBootstrap. No external cron
 * dependency required — uses setInterval for the polling loop.
 */
@Injectable()
export class NotificationDeliveryProcessorService {
  private readonly logger = new Logger(NotificationDeliveryProcessorService.name);
  private readonly POLL_INTERVAL_MS = 15_000;
  private readonly MAX_RETRIES = 3;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepo: Repository<NotificationDelivery>,
    @InjectRepository(CommunicationSetting)
    private readonly settingRepo: Repository<CommunicationSetting>,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => this.processQueue(), this.POLL_INTERVAL_MS);
    this.logger.log(`Notification delivery processor started (poll every ${this.POLL_INTERVAL_MS}ms)`);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async processQueue(): Promise<void> {
    try {
      const queued = await this.deliveryRepo.find({
        where: { status: 'QUEUED' },
        take: 20,
        order: { createdAt: 'ASC' },
      });
      for (const delivery of queued) {
        await this.processDelivery(delivery);
      }
    } catch (error) {
      this.logger.error(`Queue processor error: ${(error as Error).message}`);
    }
  }

  private async processDelivery(delivery: NotificationDelivery): Promise<void> {
    try {
      delivery.status = 'SENDING';
      await this.deliveryRepo.save(delivery);

      if (delivery.channel === 'EMAIL') {
        await this.sendEmail(delivery);
      } else if (delivery.channel === 'WHATSAPP') {
        await this.sendWhatsApp(delivery);
      } else {
        delivery.status = 'CANCELLED';
        await this.deliveryRepo.save(delivery);
        return;
      }

      delivery.sentAt = new Date();
      delivery.status = 'SENT';
      await this.deliveryRepo.save(delivery);
    } catch (error) {
      delivery.retryCount += 1;
      delivery.errorMessage = (error as Error).message;
      delivery.status = delivery.retryCount >= (delivery.maxRetries || this.MAX_RETRIES) ? 'FAILED' : 'QUEUED';
      await this.deliveryRepo.save(delivery);
      this.logger.warn(`Delivery ${delivery.id} channel=${delivery.channel} address=${delivery.recipientAddress} failed: ${(error as Error).message} (retry ${delivery.retryCount}/${delivery.maxRetries || this.MAX_RETRIES})`);
    }
  }

  private async sendEmail(delivery: NotificationDelivery): Promise<void> {
    const settings = await this.settingRepo.findOne({ where: { settingType: 'EMAIL', enabled: true, isActive: true, companyId: delivery.companyId || undefined } as any });
    if (!settings) {
      throw new Error('Email provider not configured or disabled');
    }
    const config = settings.config || {};
    const host = config.host || 'localhost';
    const port = Number(config.port) || 25;
    const username = config.username || '';
    const passwordRef = config.passwordRef || '';
    // Resolve password from environment variable if reference starts with "env:"
    const password = passwordRef.startsWith('env:') ? (process.env[passwordRef.slice(4)] || '') : passwordRef;

    // Use SMTP directly via TCP socket (no nodemailer dependency required)
    const providerMsgId = await sendSmtpEmail({
      host, port, username, password,
      useTls: config.useTls !== false,
      from: config.fromEmail || 'noreply@erp.local',
      fromName: config.fromName || 'ERP System',
      to: delivery.recipientAddress || '',
      subject: delivery.renderedSubject || '',
      body: delivery.renderedBody || '',
    });
    delivery.provider = 'smtp';
    delivery.providerMessageId = providerMsgId || null;
  }

  private async sendWhatsApp(delivery: NotificationDelivery): Promise<void> {
    const settings = await this.settingRepo.findOne({ where: { settingType: 'WHATSAPP', enabled: true, isActive: true, companyId: delivery.companyId || undefined } as any });
    if (!settings) {
      throw new Error('WhatsApp provider not configured or disabled');
    }
    const config = settings.config || {};
    const phoneNumberId = config.phoneNumberId || '';
    const tokenRef = config.tokenRef || '';
    const token = tokenRef.startsWith('env:') ? (process.env[tokenRef.slice(4)] || '') : tokenRef;
    const apiVersion = config.apiVersion || 'v18.0';
    const to = delivery.recipientAddress || '';

    if (!token || !phoneNumberId) {
      throw new Error('WhatsApp provider credentials not configured');
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: delivery.renderedBody || delivery.renderedSubject || '' },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const responseBody = await response.text();
    delivery.provider = 'whatsapp_meta';
    delivery.providerResponse = responseBody.slice(0, 2000);

    if (!response.ok) {
      throw new Error(`WhatsApp API error ${response.status}: ${responseBody.slice(0, 500)}`);
    }

    try {
      const parsed = JSON.parse(responseBody);
      delivery.providerMessageId = parsed.messages?.[0]?.id || null;
    } catch {
      // ignore parse errors
    }
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
}