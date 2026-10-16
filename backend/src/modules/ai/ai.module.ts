import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
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
 *
 * Architecture:
 *
 *   controllers/ai-assistant.controller.ts    REST API (query / voice / transcribe / schema)
 *   services/text-to-sql.service.ts           orchestrator + LLM self-repair loop
 *   services/read-only-datasource.service.ts  secondary READ-ONLY TypeORM DataSource runner
 *   config/ai-datasource.config.ts            'ai-readonly' connection options
 *   services/gemini-client.service.ts         Google Gemini REST client (zero-dep)
 *   services/whisper-stt.service.ts           OpenAI Whisper speech-to-text (zero-dep)
 *   services/schema-catalog.service.ts        DB introspection → LLM semantic layer
 *   services/sql-guard.service.ts             SELECT-only guard + division row-scoping
 *   utils/read-only-sql.util.ts               pure SQL validation (unit-tested)
 *   services/empty-result-advisor.service.ts  "no records found" intelligence
 *
 * SECURITY — 3 independent layers, each sufficient on its own:
 *   1. DATABASE  `erp_ai_reader` role (migration erp_00073): explicit
 *      SELECT-only grants, default_transaction_read_only=on, 15s statement
 *      timeout, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS.
 *   2. TYPEORM   The 'ai-readonly' DataSource is a separate connection with
 *      its own small pool; every query runs inside `READ ONLY` +
 *      `SET LOCAL statement_timeout` via a dedicated QueryRunner.
 *   3. APP       read-only-sql.util.ts proves each statement is a single
 *      allow-listed SELECT (keyword/function deny-list, LIMIT enforced) and
 *      SqlGuardService fail-closes division row-level scoping. Violations are
 *      logged as `[SECURITY]` alerts with the actor context.
 *
 * Exports TextToSqlService so other modules (dashboards, notifications) can
 * embed "ask your data" features without duplicating the pipeline.
 */
@Module({
  imports: [AuditModule],
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
