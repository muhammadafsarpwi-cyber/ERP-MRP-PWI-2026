import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { AiAssistantController } from './controllers/ai-assistant.controller';
import { EmptyResultAdvisorService } from './services/empty-result-advisor.service';
import { GeminiClientService } from './services/gemini-client.service';
import { ReadOnlyDataSourceService } from './services/read-only-datasource.service';
import { SchemaCatalogService } from './services/schema-catalog.service';
import { SqlGuardService } from './services/sql-guard.service';
import { TextToSqlService } from './services/text-to-sql.service';
import { WhisperSttService } from './services/whisper-stt.service';

/**
 * AI ASSISTANT MODULE — Text-to-SQL + Voice for the ERP.
 */
@Module({
  imports: [
    AuditModule,
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
  ],
  controllers: [AiAssistantController],
  providers: [
    ReadOnlyDataSourceService,
    SchemaCatalogService,
    SqlGuardService,
    GeminiClientService,
    WhisperSttService,
    EmptyResultAdvisorService,
    TextToSqlService,
  ],
  exports: [TextToSqlService, SchemaCatalogService],
})
export class AiModule {}
