import { Controller, Get, Post, Param, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
  async list(@Req() req: any, @Query('limit') limit?: string) {
    const data = await this.notificationsService.listForUser(this.authUserId(req), Number(limit) || 20);
    return { success: true, data };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count for the current user' })
  async unreadCount(@Req() req: any) {
    const count = await this.notificationsService.unreadCount(this.authUserId(req));
    return { success: true, data: { count } };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single notification as read (scoped to current user)' })
  async markRead(@Req() req: any, @Param('id') id: string) {
    await this.notificationsService.markRead(id, this.authUserId(req));
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
