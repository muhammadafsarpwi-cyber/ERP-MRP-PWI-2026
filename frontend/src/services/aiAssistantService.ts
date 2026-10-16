import { apiService } from './api';

/**
 * Typed client for the backend AI assistant module
 * (backend/src/modules/ai → POST /ai/assistant/{query,voice,transcribe}).
 *
 * The interfaces below mirror backend/src/modules/ai/interfaces/ai-assistant.interface.ts.
 * All endpoints return the house envelope `{ success, data }` and are already
 * division-scoped server-side (DivisionScopeGuard) — the frontend must never
 * trust or forward its own division filters to widen access.
 */

// ── Chart payload (deterministically validated server-side) ─────────────────

export type AiChartType = 'bar' | 'line' | 'pie' | 'table';

export interface AiChartSeries {
  /** Result column name, e.g. 'total_production'. */
  column: string;
  /** Human label, e.g. 'Total Production'. */
  label: string;
}

export interface AiChartMetadata {
  chartType: AiChartType;
  /** Grouping dimension that drove the chart: 'machine' | 'item' | 'date' | ... */
  dimension: string;
  /** Category axis — bound directly to <XAxis dataKey>. */
  x: { column: string; label: string };
  series: AiChartSeries[];
}

// ── Intelligent empty state ("No records found") ────────────────────────────

export type AiSuggestionType = 'division' | 'period' | 'department' | 'filter' | 'tip';

export interface AiEmptyStateSuggestion {
  type: AiSuggestionType;
  /** English label, e.g. "SPT — Sialkot Production Tools (1,240 rows)". */
  label: string;
  /** Urdu label for the bilingual UI. */
  labelUr: string;
  /** Division UUID / ISO date / free-text tip (null for pure tips). */
  value: string | null;
}

export interface AiEmptyStateResult {
  reasons: string[];
  message: { en: string; ur: string };
  suggestions: AiEmptyStateSuggestion[];
}

// ── AiAnswer: the single payload the chat renders ───────────────────────────

export interface AiAnswerMeta {
  model: string;
  attempts: number;
  llmMs: number;
  dbMs: number;
  totalMs: number;
  divisionsScopedTo: 'ALL' | number;
}

export interface AiAnswer {
  status: 'success' | 'empty';
  mode: 'text' | 'voice';
  question: string;
  /** What Whisper understood (voice mode only) — let the user verify/correct it. */
  transcript?: string;
  detectedLanguage?: string;
  sql: string;
  assumption?: string;
  explanation: { en: string; ur: string };
  confidence?: number;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  emptyState?: AiEmptyStateResult;
  /** Chart mapping (machine-wise → bar on machine_name, …). Validated vs columns. */
  chart?: AiChartMetadata;
  meta: AiAnswerMeta;
}

export interface AiSchemaInfo {
  schema: string;
  generatedAt: string;
  tableCount: number;
  domains: string[];
  tablesByDomain: Record<string, string[]>;
  divisions: Array<{ id: string; code: string; name: string }>;
  examples: string[];
}

export interface AiHealthInfo {
  database: { ok: boolean; latencyMs?: number; error?: string };
  providers: { gemini: boolean; whisper: boolean };
}

interface AiApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: { code: string; message: string; details?: string };
}

/** Whisper language hints the backend DTO accepts. */
export type AiVoiceLanguage = 'ur' | 'en' | 'pa';

// ── Service ─────────────────────────────────────────────────────────────────

class AiAssistantService {
  /** Natural-language question → read-only SQL → rows + chart payload. */
  async askQuestion(question: string): Promise<AiAnswer> {
    const res = await apiService.post<AiApiEnvelope<AiAnswer>>('/ai/assistant/query', { question });
    if (!res?.success || !res?.data) {
      throw new Error(res?.message || 'The AI assistant returned an empty response.');
    }
    return res.data;
  }

  /**
   * Base64 audio → Whisper transcript → Text-to-SQL answer.
   *
   * The backend deliberately accepts JSON { audioBase64, mimeType, language }
   * (class-validator verified, size-guarded) rather than multipart — keep this
   * contract unless the backend endpoint is changed first.
   */
  async voiceQuery(
    audioBase64: string,
    mimeType: string,
    language: AiVoiceLanguage = 'ur',
  ): Promise<AiAnswer> {
    const res = await apiService.post<AiApiEnvelope<AiAnswer>>('/ai/assistant/voice', {
      audioBase64,
      mimeType,
      language,
    });
    if (!res?.success || !res?.data) {
      throw new Error(res?.message || 'Voice request returned an empty response.');
    }
    return res.data;
  }

  /** Speech-to-Text only — for review-before-submit voice flows. */
  async transcribe(
    audioBase64: string,
    mimeType: string,
    language: AiVoiceLanguage = 'ur',
  ): Promise<{ text: string; language?: string }> {
    const res = await apiService.post<AiApiEnvelope<{ text: string; language?: string }>>(
      '/ai/assistant/transcribe',
      { audioBase64, mimeType, language },
    );
    if (!res?.success || !res?.data) {
      throw new Error(res?.message || 'Transcription returned an empty response.');
    }
    return res.data;
  }

  /** Schema summary for the caller (drives "what can I ask?" chips). */
  async schema(): Promise<AiSchemaInfo> {
    const res = await apiService.get<AiApiEnvelope<AiSchemaInfo>>('/ai/assistant/schema');
    if (!res?.success || !res?.data) {
      throw new Error(res?.message || 'Schema endpoint returned an empty response.');
    }
    return res.data;
  }

  /** Read-only DB pool + provider key readiness. */
  async health(): Promise<AiHealthInfo> {
    const res = await apiService.get<AiApiEnvelope<AiHealthInfo>>('/ai/assistant/health');
    if (!res?.success || !res?.data) {
      throw new Error(res?.message || 'Health endpoint returned an empty response.');
    }
    return res.data;
  }
}

export const aiAssistantService = new AiAssistantService();
export default aiAssistantService;

// ── Error classification helpers ────────────────────────────────────────────

/**
 * True when the AI backend itself is unavailable — network failure, an older
 * backend without the /ai routes (404), not implemented (501) or the AI
 * infra not configured (503, e.g. missing erp_ai_reader role / API keys).
 * In that case callers may fall back to the legacy client-side report engine.
 */
export function isAiBackendUnavailable(err: unknown): boolean {
  const axiosErr = err as { response?: { status?: number } };
  if (!axiosErr?.response) return true; // network / CORS / timeout
  const status = axiosErr.response.status;
  return status === 404 || status === 501 || status === 503;
}

/**
 * Pull the friendly message out of the backend error envelope
 * `{ success:false, error:{ code, message, details } }`, falling back to the
 * axios message and finally a generic sentence.
 */
export function extractAiErrorMessage(err: unknown): string {
  const anyErr = err as {
    response?: { data?: { error?: { message?: string; details?: string }; message?: string } };
    message?: string;
  };
  const envelope = anyErr?.response?.data;
  if (envelope?.error?.message) {
    return envelope.error.details
      ? `${envelope.error.message} ${envelope.error.details}`
      : envelope.error.message;
  }
  if (envelope?.message) return envelope.message;
  if (anyErr?.message) return anyErr.message;
  return 'Something went wrong while contacting the AI assistant.';
}
