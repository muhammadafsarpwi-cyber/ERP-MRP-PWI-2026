import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { AiProviderConfig } from './entities/ai-provider-config.entity';
import { AiAssistantController } from './controllers/ai-assistant.controller';
import { AiProviderConfigController } from './controllers/ai-provider-config.controller';
import { EmptyResultAdvisorService } from './services/empty-result-advisor.service';
import { GeminiClientService } from './services/gemini-client.service';
import { ReadOnlyDataSourceService } from './services/read-only-datasource.service';
import { SchemaCatalogService } from './services/schema-catalog.service';
import { SqlGuardService } from './services/sql-guard.service';
import { TextToSqlService } from './services/text-to-sql.service';
import { WhisperSttService } from './services/whisper-stt.service';
import { UniversalLlmService } from './services/universal-llm.service';
import { AiProviderConfigService } from './services/ai-provider-config.service';

/**
 * AI ASSISTANT MODULE — Text-to-SQL + Voice + Multi-Provider BYOK Engine.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AiProviderConfig]),
    AuditModule,
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [AiAssistantController, AiProviderConfigController],
  providers: [
    ReadOnlyDataSourceService,
    SchemaCatalogService,
    SqlGuardService,
    GeminiClientService,
    WhisperSttService,
    EmptyResultAdvisorService,
    UniversalLlmService,
    AiProviderConfigService,
    TextToSqlService,
  ],
  exports: [TextToSqlService, SchemaCatalogService, UniversalLlmService, AiProviderConfigService],
})
export class AiModule {}
