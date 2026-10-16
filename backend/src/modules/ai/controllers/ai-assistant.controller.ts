import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard, divisionFilterFromRequest } from '../../auth/guards/division-scope.guard';
import { AskAiDto, TranscribeAudioDto } from '../dto/ai-assistant.dto';
import { ReadOnlyDataSourceService } from '../services/read-only-datasource.service';
import { SchemaCatalogService } from '../services/schema-catalog.service';
import { TextToSqlService } from '../services/text-to-sql.service';
import { WhisperSttService } from '../services/whisper-stt.service';

/**
 * AI ASSISTANT API — Text-to-SQL + Voice.
 *
 * Auth/authorization follows the exact house pattern (see item.controller.ts):
 * class-level SupabaseJwtGuard + OrgScopeGuard + DivisionScopeGuard, and a
 * per-route PermissionGuard with a dedicated `ai.*` permission code (seeded by
 * migration erp_00073).
 *
 * The division scope resolved by DivisionScopeGuard (`request.allowedDivisionIds`)
 * is passed straight into the Text-to-SQL engine, which enforces it as a SQL
 * wrapper — the LLM literally cannot widen a restricted user's access.
 */
@ApiTags('ai/assistant')
@Controller('ai/assistant')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class AiAssistantController {
  constructor(
    private readonly textToSql: TextToSqlService,
    private readonly whisper: WhisperSttService,
    private readonly catalogService: SchemaCatalogService,
    private readonly dbPool: ReadOnlyDataSourceService,
  ) {}

  /** Division UUIDs the caller may read (`undefined` = unrestricted). */
  private divisions(req: any): string[] | undefined {
    return divisionFilterFromRequest(req.allowedDivisionIds);
  }

  // ── Text-to-SQL ────────────────────────────────────────────────────────────

  @Post('query')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask a question in natural language (English/Urdu) and get rows back',
    description:
      'Translates the question into a read-only SQL SELECT via Google Gemini, enforces division ' +
      'row-level scoping, executes it on a read-only DB role and returns rows — or an intelligent ' +
      'bilingual "no records found" response with clickable suggestions.',
  })
  async ask(@Body() dto: AskAiDto, @Req() req: any) {
    const answer = await this.textToSql.ask({
      question: dto.question,
      allowedDivisionIds: this.divisions(req),
      mode: 'text',
      userId: req.user?.id,
      userEmail: req.user?.email,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
    return { success: true, data: answer };
  }

  // ── Voice-to-Text → Text-to-SQL ───────────────────────────────────────────

  @Post('voice')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.voice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Speak your question: audio → Whisper transcript → Text-to-SQL answer',
    description:
      'Upload a microphone recording (base64). The backend transcribes it with OpenAI Whisper ' +
      '(Urdu/English code-switching aware) and feeds the transcript into the Text-to-SQL engine. ' +
      'The response echoes `transcript` so the UI can show (and let the user correct) what was heard.',
  })
  async voice(@Body() dto: TranscribeAudioDto, @Req() req: any) {
    const audio = this.decodeAudio(dto.audioBase64);
    const transcription = await this.whisper.transcribe(audio, {
      mimeType: dto.mimeType,
      language: dto.language,
    });

    const answer = await this.textToSql.ask({
      question: transcription.text,
      allowedDivisionIds: this.divisions(req),
      mode: 'voice',
      userId: req.user?.id,
      userEmail: req.user?.email,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      transcript: transcription.text,
      detectedLanguage: transcription.language,
    });

    return { success: true, data: answer };
  }

  @Post('transcribe')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.voice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Speech-to-Text only (no SQL execution)', description: 'Useful for building a voice UI that lets the user review/edit the transcript before submitting it as a query.' })
  async transcribe(@Body() dto: TranscribeAudioDto) {
    const audio = this.decodeAudio(dto.audioBase64);
    const result = await this.whisper.transcribe(audio, {
      mimeType: dto.mimeType,
      language: dto.language,
    });
    return { success: true, data: result };
  }

  // ── Introspection helpers for the frontend ────────────────────────────────

  @Get('schema')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.query')
  @ApiOperation({ summary: 'Schema summary visible to the caller (domains, tables, divisions)', description: 'Drives the frontend suggestion chips and "what can I ask?" UI. Already narrowed by division scope; sensitive tables are never exposed.' })
  async schema(@Req() req: any) {
    const catalog = await this.catalogService.getCatalog();
    const allowed = this.divisions(req);
    const divisions = this.catalogService.visibleDivisions(catalog, allowed);

    const domains = [...new Set(catalog.tables.map((t) => t.domain))].sort();
    return {
      success: true,
      data: {
        schema: catalog.schema,
        generatedAt: catalog.generatedAt,
        tableCount: catalog.tables.length,
        domains,
        tablesByDomain: Object.fromEntries(
          domains.map((d) => [d, catalog.tables.filter((t) => t.domain === d).map((t) => t.name)]),
        ),
        divisions: divisions.map((d) => ({ id: d.id, code: d.code, name: d.name })),
        examples: [
          'SPT division ki last month ki production kitni thi?',
          'Show top 10 customers by invoice amount this year',
          'کون سی مشینوں کا ڈاؤن ٹائم سب سے زیادہ ہے؟',
          'Which items are below reorder level in City warehouse?',
        ],
      },
    };
  }

  @Get('health')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.query')
  @ApiOperation({ summary: 'AI assistant readiness (read-only DB pool + provider keys)' })
  async health() {
    const db = await this.dbPool.probe();
    return {
      success: true,
      data: {
        database: db,
        providers: {
          gemini: Boolean(process.env.GEMINI_API_KEY),
          whisper: this.whisper.enabled,
        },
      },
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Strict base64 decoding with a size guard BEFORE allocation.
   * (No multer in this project on purpose — the JSON/base64 contract keeps the
   * upload path framework-agnostic and class-validator-verified.)
   */
  private decodeAudio(audioBase64: string): Buffer {
    const normalized = audioBase64.startsWith('data:')
      ? audioBase64.slice(audioBase64.indexOf(',') + 1)
      : audioBase64;

    if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'AI_INVALID_AUDIO', message: 'audioBase64 is not valid base64.' },
      });
    }

    const buffer = Buffer.from(normalized, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException({
        success: false,
        error: { code: 'AI_EMPTY_AUDIO', message: 'The decoded audio is empty.' },
      });
    }
    return buffer;
  }
}
