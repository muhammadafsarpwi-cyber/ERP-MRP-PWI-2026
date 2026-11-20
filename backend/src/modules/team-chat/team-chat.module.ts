import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamChatController } from './team-chat.controller';
import { TeamChatService } from './team-chat.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamChatController],
  providers: [TeamChatService],
  exports: [TeamChatService],
})
export class TeamChatModule {}
