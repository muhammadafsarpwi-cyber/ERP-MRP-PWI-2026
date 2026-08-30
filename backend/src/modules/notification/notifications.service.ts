import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErpUser, ErpUserStatus } from '../user/entities/erp-user.entity';
import { Notification } from './entities/notification.entity';

export interface NotifyEvent {
  type: string;
  title: string;
  message?: string | null;
  entityType?: string;
  entityId?: string;
  actorAuthUserId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @InjectRepository(ErpUser)
    private readonly erpUserRepo: Repository<ErpUser>,
  ) {}

  /**
   * Fan out one notification row per active user (deduped per user+entity via
   * the unique index). Never throws into the caller's business flow.
   */
  async notifyActiveUsers(event: NotifyEvent): Promise<void> {
    try {
      const users = await this.erpUserRepo.find({
        where: { status: ErpUserStatus.ACTIVE, isActive: true },
        select: ['authUserId'],
      });
      if (users.length === 0) return;

      const rows = users.map((u) =>
        this.repo.create({
          userId: u.authUserId,
          type: event.type,
          title: event.title,
          message: event.message ?? null,
          entityType: event.entityType ?? null,
          entityId: event.entityId ?? null,
          isRead: false,
          readAt: null,
          createdBy: event.actorAuthUserId ?? null,
        }),
      );
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values(
          rows.map((r) => ({
            userId: r.userId,
            type: r.type,
            title: r.title,
            message: r.message,
            entityType: r.entityType,
            entityId: r.entityId,
            isRead: false,
            readAt: null as Date | null,
            createdBy: r.createdBy,
          })),
        )
        .orIgnore()
        .execute();
    } catch (error) {
      this.logger.warn(`notifyActiveUsers failed for ${event.type}: ${(error as Error).message}`);
    }
  }

  async listForUser(authUserId: string, limit = 20): Promise<Notification[]> {
    return this.repo.find({
      where: { userId: authUserId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 50),
    });
  }

  async unreadCount(authUserId: string): Promise<number> {
    return this.repo.count({ where: { userId: authUserId, isRead: false } });
  }

  async markRead(id: string, authUserId: string): Promise<boolean> {
    const notification = await this.repo.findOne({ where: { id, userId: authUserId } });
    if (!notification || notification.isRead) return !!notification;
    notification.isRead = true;
    notification.readAt = new Date();
    await this.repo.save(notification);
    return true;
  }

  async markAllRead(authUserId: string): Promise<number> {
    const unread = await this.repo.find({
      where: { userId: authUserId, isRead: false },
      select: ['id'],
    });
    if (unread.length === 0) return 0;
    const now = new Date();
    await this.repo.update(
      { id: In(unread.map((n) => n.id)) },
      { isRead: true, readAt: now, updatedAt: now },
    );
    return unread.length;
  }

  /** Mark a single notification as UNREAD (only the owning user). */
  async markUnread(id: string, authUserId: string): Promise<boolean> {
    const notification = await this.repo.findOne({ where: { id, userId: authUserId } });
    if (!notification || !notification.isRead) return !!notification;
    notification.isRead = false;
    notification.readAt = null;
    await this.repo.save(notification);
    return true;
  }

  /** Paginated list of notifications for the current user. */
  async listForUserPaginated(
    authUserId: string,
    page = 1,
    limit = 20,
    filter?: 'all' | 'unread' | 'read',
    type?: string,
  ): Promise<{ data: Notification[]; total: number; page: number; limit: number }> {
    const qb = this.repo.createQueryBuilder('n').where('n.userId = :authUserId', { authUserId });
    if (filter === 'unread') qb.andWhere('n.isRead = false');
    if (filter === 'read') qb.andWhere('n.isRead = true');
    if (type) qb.andWhere('n.type = :type', { type });
    qb.orderBy('n.created_at', 'DESC');
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    qb.skip((safePage - 1) * safeLimit);
    qb.take(safeLimit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: safePage, limit: safeLimit };
  }
}
