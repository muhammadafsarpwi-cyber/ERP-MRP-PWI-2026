/**
 * Shared types for the AI assistant module (Text-to-SQL + Voice).
 */

// ── Schema catalog (introspected from PostgreSQL) ────────────────────────────

export interface CatalogColumn {
  name: string;
  /** Full postgres type, e.g. `character varying`, `timestamp without time zone`. */
  type: string;
  nullable: boolean;
}

export interface CatalogForeignKey {
  column: string;
  refTable: string;
  refColumn: string;
}

export interface CatalogTable {
  name: string;
  /** Business domain grouping (sales, production, inventory, hr, ...) — improves LLM accuracy. */
  domain: string;
  columns: CatalogColumn[];
  foreignKeys: CatalogForeignKey[];
  /** True when the table carries a `division_id` FK → row-level division scoping applies. */
  divisionScoped: boolean;
}

export interface CatalogDivision {
  id: string;
  code: string;
  name: string;
}

export interface CatalogDepartment {
  id: string;
  name: string;
  divisionId: string | null;
}

export interface SchemaCatalog {
  tables: CatalogTable[];
  divisions: CatalogDivision[];
  departments: CatalogDepartment[];
  schema: string;
  generatedAt: string;
}

// ── SQL guard ────────────────────────────────────────────────────────────────

export interface SqlValidationResult {
  ok: boolean;
  /** Human-readable rejection reason (also fed back to the LLM for self-repair). */
  reason?: string;
  /** Final, scoped SQL ready for execution (only when ok). */
  sql?: string;
}

// ── Query execution ──────────────────────────────────────────────────────────

export type QueryExecutionResult<T = Record<string, unknown>> =
  | {
      ok: true;
      rows: T[];
      columns: string[];
      rowCount: number;
      truncated: boolean;
    }
  | { ok: false; error: string; code?: string };

// ── Empty-state ("No records found") intelligence ────────────────────────────

export type SuggestionType = 'division' | 'period' | 'department' | 'filter' | 'tip';

export interface EmptyStateSuggestion {
  type: SuggestionType;
  /** English label, e.g. "SPT — Sialkot Production Tools (1,240 rows)". */
  label: string;
  /** Urdu/romanized-Urdu label for bilingual UIs. */
  labelUr: string;
  /** Machine-readable value (division UUID, ISO date, department UUID, or null). */
  value: string | null;
}

export interface EmptyStateResult {
  /** Structured reason keywords, e.g. ['division', 'period']. */
  reasons: string[];
  message: { en: string; ur: string };
  suggestions: EmptyStateSuggestion[];
}

// ── LLM contract ─────────────────────────────────────────────────────────────

export interface GeminiSqlResponse {
  sql: string;
  /** One-line assumption the model made about an ambiguous question. */
  assumption?: string;
  explanation_en?: string;
  explanation_ur?: string;
  confidence?: number;
  /** Chart hint for the UI payload (validated against actual result columns). */
  chart?: {
    chartType?: 'bar' | 'line' | 'pie' | 'table';
    /** e.g. 'machine' | 'item' | 'division' | 'shift' | 'date' */
    dimension?: string;
    xColumn?: string;
    xLabel?: string;
    series?: Array<{ column: string; label: string }>;
  };
}

// ── UI chart payload (deterministic, built from actual result columns) ──────

export interface AiChartSeries {
  column: string;
  label: string;
}

export interface AiChartMetadata {
  chartType: 'bar' | 'line' | 'pie' | 'table';
  /** Grouping dimension that drove the chart, e.g. 'machine' or 'item'. */
  dimension: string;
  x: { column: string; label: string };
  series: AiChartSeries[];
}

export interface GeminiNarrationResponse {
  message_en: string;
  message_ur: string;
}

// ── Final API payload ────────────────────────────────────────────────────────

export interface AiAnswer {
  status: 'success' | 'empty';
  mode: 'text' | 'voice';
  question: string;
  /** Present for voice requests: what Whisper understood. */
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
  /** Only present when status === 'empty'. */
  emptyState?: EmptyStateResult;
  /** UI rendering hint — machine-wise/item-wise/… results arrive pre-mapped. */
  chart?: AiChartMetadata;
  meta: {
    model: string;
    attempts: number;
    llmMs: number;
    dbMs: number;
    totalMs: number;
    divisionsScopedTo: 'ALL' | number;
  };
}
