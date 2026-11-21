import { Controller, Get, Post, Param, Query, Req, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { NotificationsService } from './notifications.service';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(SupabaseJwtGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private authUserId(req: any): string {
    return req.user?.id;
  }

  @Get()
  @ApiOperation({ summary: 'List recent notifications for the current user' })
  async list(
    @Req() req: Request & { user?: any },
    @Res({ passthrough: true }) res: Response,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    const userId = this.authUserId(req);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const includeAll = all === 'true' || all === '1';
    const delta = await this.notificationsService.listDelta(userId);
    const etag = `W/"nl-${safeLimit}-${delta.count}-${delta.maxCreatedAt || '0'}-${delta.maxUpdatedAt || '0'}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }
    const data = await this.notificationsService.listForUser(userId, safeLimit, includeAll);
    return { success: true, data };
  }

  @Get('paginated')
  @ApiOperation({ summary: 'Paginated, filterable notification list' })
  async listPaginated(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: 'all' | 'unread' | 'read',
    @Query('type') type?: string,
  ) {
    const result = await this.notificationsService.listForUserPaginated(
      this.authUserId(req),
      Number(page) || 1,
      Number(limit) || 20,
      filter,
      type,
    );
    return { success: true, ...result };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Lightweight unread notification count and latest timestamp delta check' })
  async unreadCount(@Req() req: Request & { user?: any }, @Res({ passthrough: true }) res: Response) {
    const delta = await this.notificationsService.unreadDelta(this.authUserId(req));
    const etag = `W/"nu-${delta.count}-${delta.maxCreatedAt || '0'}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }
    return { success: true, data: delta };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single notification as read (scoped to current user)' })
  async markRead(@Req() req: any, @Param('id') id: string) {
    await this.notificationsService.markRead(id, this.authUserId(req));
    const count = await this.notificationsService.unreadCount(this.authUserId(req));
    return { success: true, data: { count } };
  }

  @Post(':id/unread')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single notification as unread (scoped to current user)' })
  async markUnread(@Req() req: any, @Param('id') id: string) {
    await this.notificationsService.markUnread(id, this.authUserId(req));
    const count = await this.notificationsService.unreadCount(this.authUserId(req));
    return { success: true, data: { count } };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read for the current user' })
  async markAllRead(@Req() req: any) {
    const updated = await this.notificationsService.markAllRead(this.authUserId(req));
    return { success: true, data: { updated } };
  }
}
