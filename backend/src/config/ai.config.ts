import { ConfigService } from '@nestjs/config';

/**
 * Central configuration for the AI assistant module (Text-to-SQL + Voice).
 *
 * All values are environment-driven with safe development defaults so the
 * backend still boots when no AI keys are configured — every service fails
 * gracefully with an actionable message instead of crashing bootstrap.
 *
 * See `backend/.env.example` for the documented list of variables.
 */
export interface AiAssistantConfig {
  gemini: {
    apiKey: string;
    model: string;
    timeoutMs: number;
    /** How many times the engine may ask Gemini to repair a rejected/failed SQL. */
    maxRepairAttempts: number;
  };
  openai: {
    apiKey: string;
    sttModel: string;
    timeoutMs: number;
    /** Hard cap on uploaded audio size (Whisper API limit is 25 MB). */
    maxAudioBytes: number;
  };
  db: {
    host: string;
    port: number;
    /** Dedicated READ-ONLY role created by migration erp_00073. */
    user: string;
    password: string;
    database: string;
    schema: string;
    poolMax: number;
    connectTimeoutMs: number;
  };
  query: {
    /** Per-statement timeout enforced inside the read-only transaction. */
    timeoutMs: number;
    /** Hard row cap applied to every AI query result. */
    maxRows: number;
    /** Schema-catalog introspection cache TTL. */
    schemaCacheTtlMs: number;
    /** Let Gemini polish the "no records found" message (falls back to templates). */
    emptyStateNarrate: boolean;
  };
}

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value === '' ? fallback : value === 'true';

export const aiConfig = (configService: ConfigService): AiAssistantConfig => ({
  gemini: {
    apiKey: configService.get<string>('GEMINI_API_KEY', ''),
    model: configService.get<string>('GEMINI_MODEL', 'gemini-2.0-flash'),
    timeoutMs: num(configService.get<string>('GEMINI_TIMEOUT_MS'), 30_000),
    maxRepairAttempts: num(configService.get<string>('AI_MAX_REPAIR_ATTEMPTS'), 2),
  },
  openai: {
    apiKey: configService.get<string>('OPENAI_API_KEY', ''),
    sttModel: configService.get<string>('OPENAI_STT_MODEL', 'whisper-1'),
    timeoutMs: num(configService.get<string>('AI_STT_TIMEOUT_MS'), 60_000),
    maxAudioBytes: num(configService.get<string>('AI_MAX_AUDIO_BYTES'), 25 * 1024 * 1024),
  },
  db: {
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: num(configService.get<string>('DB_PORT'), 5432),
    // Falls back to the app credentials only when the read-only role has not
    // been provisioned yet (dev bootstrap). Production MUST set AI_DB_USERNAME
    // to the `erp_ai_reader` role from migration erp_00073.
    user: configService.get<string>('AI_DB_USERNAME', 'erp_ai_reader'),
    password: configService.get<string>('AI_DB_PASSWORD', 'ChangeMe_AiReader_Str0ng!'),
    database: configService.get<string>('DB_DATABASE', 'erp_database'),
    schema: configService.get<string>('DB_SCHEMA', 'public'),
    poolMax: num(configService.get<string>('AI_DB_POOL_MAX'), 4),
    connectTimeoutMs: num(configService.get<string>('AI_DB_CONNECT_TIMEOUT_MS'), 10_000),
  },
  query: {
    timeoutMs: num(configService.get<string>('AI_QUERY_TIMEOUT_MS'), 15_000),
    maxRows: num(configService.get<string>('AI_QUERY_MAX_ROWS'), 500),
    schemaCacheTtlMs: num(configService.get<string>('AI_SCHEMA_CACHE_TTL_MS'), 15 * 60 * 1000),
    emptyStateNarrate: bool(configService.get<string>('AI_EMPTY_STATE_NARRATE'), true),
  },
});
