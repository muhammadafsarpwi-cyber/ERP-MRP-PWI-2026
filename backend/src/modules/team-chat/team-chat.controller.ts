import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import {
  TeamChatService,
  SendChatMessageDto,
  CreateGroupConversationDto,
} from './team-chat.service';

@ApiTags('team-chat')
@ApiBearerAuth()
@Controller('team-chat')
@UseGuards(SupabaseJwtGuard)
export class TeamChatController {
  constructor(private readonly teamChatService: TeamChatService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all active ERP users with online status and unread direct-message counts' })
  async getUsers(@Req() req: any) {
    const data = await this.teamChatService.getUsers(req.user);
    return { success: true, data };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List user direct and group conversations sorted by latest activity' })
  async getConversations(@Req() req: any) {
    const data = await this.teamChatService.getConversations(req.user);
    return { success: true, data };
  }

  @Post('conversations/direct/:targetUserId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open or create a 1-on-1 direct conversation with targetUserId' })
  async openDirect(@Req() req: any, @Param('targetUserId') targetUserId: string) {
    const data = await this.teamChatService.openOrCreateDirectConversation(req.user, targetUserId);
    return { success: true, data };
  }

  @Post('conversations/group')
  @ApiOperation({ summary: 'Create a new factory group channel and enroll selected team members' })
  async createGroup(@Req() req: any, @Body() body: CreateGroupConversationDto) {
    const data = await this.teamChatService.createGroupConversation(req.user, body);
    return { success: true, data };
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Fetch paginated conversation messages without base64 blobs and mark conversation as read' })
  async getMessages(
    @Req() req: Request & { user?: any },
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const safeLimit = Number(limit) || 60;
    const version = await this.teamChatService.getMessagesVersion(req.user, id);
    const etag = `W/"tcm-${id}-${safeLimit}-${version.count}-${version.maxCreatedAt || '0'}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }
    const data = await this.teamChatService.getMessages(req.user, id, safeLimit);
    return { success: true, data };
  }

  @Get('messages/:messageId/attachment')
  @ApiOperation({ summary: 'Lazy-load full attachment or voice audio payload for a specific message' })
  async getMessageAttachment(@Req() req: any, @Param('messageId') messageId: string) {
    const data = await this.teamChatService.getMessageAttachment(req.user, messageId);
    return { success: true, data };
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a new text, attachment, or voice message in a conversation' })
  async sendMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SendChatMessageDto,
  ) {
    const data = await this.teamChatService.sendMessage(req.user, id, body);
    return { success: true, data };
  }

  @Get('unread-summary')
  @ApiOperation({ summary: 'Lightweight unread message count summary for sidebar and top header badges' })
  async getUnreadSummary(
    @Req() req: Request & { user?: any },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.teamChatService.getUnreadSummary(req.user);
    const etag = `W/"tcu-${data.totalUnread}-${data.directUnread}-${data.groupUnread}-${data.maxCreatedAt || '0'}-${data.latestUnreadMessage?.id || '0'}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }
    return { success: true, data };
  }
}
