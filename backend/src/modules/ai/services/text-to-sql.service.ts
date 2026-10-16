import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aiConfig } from '../../../config/ai.config';
import { ActivityLogService } from '../../audit/services/activity-log.service';
import {
  AiAnswer,
  AiChartMetadata,
  AiChartSeries,
  GeminiSqlResponse,
  SchemaCatalog,
} from '../interfaces/ai-assistant.interface';
import { ReadOnlyDataSourceService } from './read-only-datasource.service';
import { EmptyResultAdvisorService } from './empty-result-advisor.service';
import { GeminiClientService } from './gemini-client.service';
import { SchemaCatalogService } from './schema-catalog.service';
import { SqlGuardService } from './sql-guard.service';

export interface AskInput {
  question: string;
  /** `undefined` = unrestricted; `[]` = deny-all; otherwise allowed division UUIDs. */
  allowedDivisionIds: string[] | undefined;
  mode: 'text' | 'voice';
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  transcript?: string;
  detectedLanguage?: string;
}

/**
 * TEXT-TO-SQL ORCHESTRATOR
 *
 * Pipeline (every step is defensive):
 *
 *   question ─► Gemini (schema-aware, JSON mode) ─► candidate SELECT
 *              ─► SqlGuard (SELECT-only + division row-scope + LIMIT)
 *                  ✗ rejected ─► feed reason back to Gemini (self-repair ↩)
 *              ─► read-only pg pool (BEGIN READ ONLY + statement_timeout)
 *                  ✗ DB error ─► feed error back to Gemini (self-repair ↩)
 *              ─► rows? ─► answer
 *                      └► zero rows? ─► EmptyResultAdvisor (probes +
 *                                       bilingual "did you mean" chips)
 *              ─► audit log (question + SQL + row count, never the data)
 *
 * The LLM is treated as an untrusted SQL *suggester*: it can never execute
 * anything by itself, and only ever sees the schema allow-list narrowed to
 * the caller's divisions. Maximum attempts = 1 + AI_MAX_REPAIR_ATTEMPTS.
 */
@Injectable()
export class TextToSqlService {
  private readonly logger = new Logger(TextToSqlService.name);
  private readonly cfg = aiConfig(this.config);

  constructor(
    private readonly config: ConfigService,
    private readonly gemini: GeminiClientService,
    private readonly catalogService: SchemaCatalogService,
    private readonly guard: SqlGuardService,
    private readonly db: ReadOnlyDataSourceService,
    private readonly advisor: EmptyResultAdvisorService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async ask(input: AskInput): Promise<AiAnswer> {
    const question = (input.question ?? '').trim();
    if (question.length < 2) {
      throw new BadRequestException({
        success: false,
        error: { code: 'AI_EMPTY_QUESTION', message: 'Please ask a question (at least 2 characters).' },
      });
    }
    if (question.length > 2000) {
      throw new BadRequestException({
        success: false,
        error: { code: 'AI_QUESTION_TOO_LONG', message: 'Question is too long (max 2000 characters).' },
      });
    }

    const startedAt = Date.now();
    await this.db.ensureReady();

    const catalog = await this.catalogService.getCatalog();
    const guardCtx = {
      catalog,
      allowedDivisionIds: input.allowedDivisionIds,
      maxRows: this.cfg.query.maxRows,
      actor: { userId: input.userId, email: input.userEmail },
    };

    let llmMs = 0;
    let lastIssue = '';
    let previousSql = '';

    for (let attempt = 1; attempt <= 1 + this.cfg.gemini.maxRepairAttempts; attempt++) {
      // ── 1. LLM ────────────────────────────────────────────────────────────
      const llmStarted = Date.now();
      let candidate: GeminiSqlResponse;
      try {
        candidate = await this.gemini.generateJson<GeminiSqlResponse>(
          this.buildSystemPrompt(catalog, input.allowedDivisionIds),
          this.buildUserPrompt(question, previousSql, lastIssue),
          0,
        );
      } finally {
        llmMs += Date.now() - llmStarted;
      }

      const sql = (candidate?.sql ?? '').trim();
      if (!sql) {
        lastIssue = 'The model returned an empty sql field.';
        continue;
      }

      // ── 2. Guard ──────────────────────────────────────────────────────────
      const validation = this.guard.validate(sql, guardCtx);
      if (!validation.ok || !validation.sql) {
        lastIssue = validation.reason ?? 'SQL failed validation.';
        this.logger.warn(`SQL rejected (attempt ${attempt}): ${lastIssue}`);
        previousSql = sql;
        continue;
      }

      // ── 2b. Key-phrase shape enforcement (deterministic, not probabilistic)
      //      e.g. "machine-wise" MUST group by machine, never by item.
      const shapeIssue = this.assertKeyphraseShape(question, validation.sql);
      if (shapeIssue) {
        lastIssue = shapeIssue;
        previousSql = validation.sql;
        this.logger.warn(`SQL key-phrase shape violated (attempt ${attempt}): ${shapeIssue}`);
        continue;
      }

      // ── 3. Execute on the read-only pool ─────────────────────────────────
      const dbStarted = Date.now();
      const execution = await this.db.runSelect(validation.sql, {
        timeoutMs: this.cfg.query.timeoutMs,
        maxRows: this.cfg.query.maxRows,
      });
      const dbMs = Date.now() - dbStarted;

      if (!execution.ok) {
        lastIssue = execution.error;
        previousSql = validation.sql;
        this.logger.warn(`SQL execution failed (attempt ${attempt}): ${execution.error}`);
        continue;
      }

      // ── 4. Interpret ──────────────────────────────────────────────────────
      const totalMs = Date.now() - startedAt;
      const meta = {
        model: this.cfg.gemini.model,
        attempts: attempt,
        llmMs,
        dbMs,
        totalMs,
        divisionsScopedTo:
          input.allowedDivisionIds === undefined ? ('ALL' as const) : input.allowedDivisionIds.length,
      };

      let answer: AiAnswer;
      if (execution.rowCount === 0) {
        const emptyState = await this.advisor.analyze({
          question,
          sql: validation.sql,
          catalog,
          allowedDivisionIds: input.allowedDivisionIds,
        });
        answer = {
          status: 'empty',
          mode: input.mode,
          question,
          transcript: input.transcript,
          detectedLanguage: input.detectedLanguage,
          sql: validation.sql,
          assumption: candidate.assumption,
          explanation: {
            en: candidate.explanation_en ?? 'The query executed successfully.',
            ur: candidate.explanation_ur ?? 'کوئری درست چلی لیکن کوئی ریکارڈ نہیں ملا۔',
          },
          confidence: candidate.confidence,
          columns: execution.columns,
          rows: [],
          rowCount: 0,
          truncated: false,
          emptyState,
          chart: this.buildChartMetadata(question, execution.columns, candidate.chart),
          meta,
        };
      } else {
        answer = {
          status: 'success',
          mode: input.mode,
          question,
          transcript: input.transcript,
          detectedLanguage: input.detectedLanguage,
          sql: validation.sql,
          assumption: candidate.assumption,
          explanation: {
            en: candidate.explanation_en ?? 'Here are the matching records.',
            ur: candidate.explanation_ur ?? 'مندرجہ ذیل ریکارڈز موجود ہیں۔',
          },
          confidence: candidate.confidence,
          columns: execution.columns,
          rows: execution.rows,
          rowCount: execution.rowCount,
          truncated: execution.truncated,
          chart: this.buildChartMetadata(question, execution.columns, candidate.chart),
          meta,
        };
      }

      this.audit(input, answer);
      return answer;
    }

    // ── All attempts exhausted → explain, never leak internals ──────────────
    this.auditFailure(input, question, lastIssue);
    throw new BadRequestException({
      success: false,
      error: {
        code: 'AI_SQL_FAILED',
        message: `I could not translate that question into a safe query: ${lastIssue}`,
        details:
          'Try naming the division (SPT / PL / City), the item or employee involved, and a date range — ' +
          'for example: "SPT division ki last month ki production entries".',
      },
    });
  }

  // ── prompt engineering ─────────────────────────────────────────────────────

  private buildSystemPrompt(catalog: SchemaCatalog, allowedDivisionIds?: string[]): string {
    const today = new Date().toISOString().slice(0, 10);
    return `You are the SQL engine of "PWI ERP", a manufacturing ERP/MRP system (NestJS + PostgreSQL) 
used by a Pakistani factory with multiple divisions/business units (SPT, PL, City/CT...).

# TASK
Translate the user's question (English, Urdu, or mixed) into ONE PostgreSQL read-only SELECT statement.

# HARD RULES (violating any = query rejected)
1. Produce ONLY a single SELECT statement. No INSERT/UPDATE/DELETE/DDL/CTAS. NO semicolons. NO comments.
2. Use ONLY the tables/columns listed in the SCHEMA section below. Join strictly via the listed foreign keys.
3. Never use positional parameters ($1). Inline literals directly: 'text', 123, DATE '2026-01-01'.
4. ROW-LEVEL SECURITY (critical): if any referenced table is [DIVISION-SCOPED], then \`division_id\` MUST be 
   the FIRST column of the top-level SELECT list (and included in GROUP BY for aggregates). Without it the 
   query is rejected and must be repaired.
5. Always add ORDER BY for deterministic output and LIMIT 200 (aggregates: LIMIT 100). Counts/GROUP BY are 
   fine when the user asks for totals.
6. Prefer explicit JOIN ... ON over implicit joins. Use COALESCE for nullable grouping keys.
7. Dates: columns are snake_case (created_at, order_date, attendance_date...). Today is ${today}.
8. If the user names a division (SPT/PL/City/CT/...), map it to the exact division id from the DIVISIONS 
   section and filter WHERE division_id = '<id>'. ONLY divisions listed there may be used.
9. Ambiguity: choose the most plausible interpretation, prefer a slightly BROADER result set, and state the 
   assumption in "assumption".
10. Urdu/English mixed speech is normal ("SPT ka last month ka production"). Interpret faithfully; romanized 
    numbers ("bees"=20) and months should be resolved to real dates.
11. If the question seems unrelated to the ERP data, still attempt the closest sensible SELECT.

# MANDATORY KEY-PHRASE → QUERY SHAPES (the grouping dimension is dictated by the user's wording — 
# NEVER substitute another dimension, especially NEVER group "machine-wise" questions by item/product)

A) "machine-wise", "machine wise", "per machine", "machine ka production", "each machine", 
   "machine production report", "کون سی مشین", "مشین کے حساب سے" → GROUP BY MACHINE:
   • JOIN the machines table: JOIN machines m ON m.id = pe.machine_id   (pe = production_entries)
   • GROUP BY m.id, m.machine_name, m.machine_code   (machine_name is the label; machine_code is the business code)
   • Aggregates: total = SUM(pe.actual_quantity) AS total_production,
                 avg   = AVG(pe.actual_quantity) AS avg_production,
                 target = SUM(pe.target_quantity) AS target_quantity
   • NEVER group this query by item_id / production_in_item_id — that is an ITEM-wise report, a different question.
   • pe.machine_id is nullable: use JOIN (inner) so unassigned entries are excluded, unless the user asks 
     about entries without machines — then use LEFT JOIN + COALESCE(m.machine_name,'Unassigned').
   • Template:
     SELECT pe.division_id, m.machine_name, m.machine_code,
            SUM(pe.actual_quantity) AS total_production,
            AVG(pe.actual_quantity) AS avg_production,
            SUM(pe.target_quantity)  AS target_quantity
       FROM production_entries pe
       JOIN machines m ON m.id = pe.machine_id
      WHERE <filters>
      GROUP BY pe.division_id, m.id, m.machine_name, m.machine_code
      ORDER BY total_production DESC

B) "item-wise", "product-wise", "per item", "per product", "کس پروڈکٹ" → GROUP BY ITEM:
   • JOIN the item dimension of the entry (production_in_item_id / item_id → items) and GROUP BY item name/SKU.
   • Do NOT join or group by machines for item-wise questions.

C) "shift-wise", "per shift" → GROUP BY shift (shifts.shift_name via pe.shift_id).
D) "division-wise", "per division", "compare divisions" → GROUP BY division (divisions.division_code/name).
E) "day-wise"/"daily"/"by date" → GROUP BY pe.entry_date (date_trunc for wider ranges).
F) "department-wise" → GROUP BY departments.name via pe.department_id.

# RESPONSE FORMAT (JSON only, no prose)
{
  "sql": "SELECT ...",
  "assumption": "one line",
  "explanation_en": "one line",
  "explanation_ur": "one line in Urdu script",
  "confidence": 0.0,
  "chart": {
    "chartType": "bar",                  // bar for wise/per-x comparisons, line for time series,
                                          // pie for share-of-total, table for raw records
    "dimension": "machine",               // machine | item | shift | division | date | department | none
    "xColumn": "machine_name",            // MUST be a column actually present in the SELECT list
    "xLabel": "Machine Names",
    "series": [
      {"column": "total_production",  "label": "Total Production"},
      {"column": "avg_production",    "label": "Average Production"},
      {"column": "target_quantity",   "label": "Target"}
    ]                                     // each "column" MUST exist in the SELECT list
  }
}
For machine-wise reports xColumn MUST be "machine_name" (fallback "machine_code") and the series MUST reference 
the production/target aggregates — NEVER an item/product column. For record listings use "chartType":"table".

# SCHEMA
${this.catalogService.renderSchemaPrompt(catalog)}

# DIVISIONS you may reference
${this.catalogService.renderDivisionsPrompt(catalog, allowedDivisionIds)}`;
  }

  private buildUserPrompt(question: string, previousSql: string, lastIssue: string): string {
    const repair =
      previousSql && lastIssue
        ? `\n\n# PREVIOUS ATTEMPT WAS REJECTED — FIX IT\nSQL:\n${previousSql}\nReason:\n${lastIssue}\nRewrite the full query correcting exactly this problem.`
        : '';
    // The question is user-controlled text; delimiters + explicit framing keep
    // the model from treating instructions inside it as system commands.
    return `Answer the ERP question below.${repair}\n\n<question>\n${question}\n</question>`;
  }

  // ── key-phrase → query-shape enforcement (deterministic) ──────────────────

  /**
   * Grouping-dimension rules derived from the user's wording. These are
   * enforced IN CODE (not just in the prompt) because an LLM can probabilistic-
   * ally drift — e.g. silently producing an ITEM-grouped query for a
   * "machine-wise production" question. A violation feeds the existing
   * self-repair loop with a precise repair hint.
   */
  private static readonly KEYPHRASE_SHAPE_RULES: ReadonlyArray<{
    /** User phrasing (EN + romanized Urdu) that selects this dimension. */
    pattern: RegExp;
    /** SQL must match ALL of these... */
    requireAll: RegExp[];
    /** ...and NONE of these. */
    forbidAny: RegExp[];
    /** Fed back to the LLM on violation. */
    repairHint: string;
  }> = [
    {
      // "machine-wise production", "per machine", "machine ka production"
      pattern: /\b(machine[\s-]?(wise|wise production)|per[\s-]?machine|each machine|machine production|by machine|machine ka (production|output)|machineon ka)\b|مشین/i,
      requireAll: [
        /\bJOIN\s+machines\b/i, // must join the machines dimension table
        /\bm\.id\s*=\s*pe\.machine_id\b|\bpe\.machine_id\s*=\s*m\.id\b/i, // correct FK
        /\bmachine_(name|code)\b/i, // must expose the machine label
        /\bFROM\s+production_entries\b/i,
      ],
      forbidAny: [
        // group by the item dimension = wrong report for a machine-wise ask
        /\bGROUP\s+BY\b[\s\S]*\b(item_id|production_in_item_id|item_name|item_code|sku)\b/i,
      ],
      repairHint:
        'SHAPE REPAIR REQUIRED: the user asked for a MACHINE-wise report. The SQL must ' +
        'JOIN machines m ON m.id = pe.machine_id, GROUP BY m.id, m.machine_name, m.machine_code and ' +
        'aggregate SUM(pe.actual_quantity) AS total_production / AVG(pe.actual_quantity) AS avg_production ' +
        '/ SUM(pe.target_quantity) AS target_quantity. Do NOT group by any item/product column.',
    },
    {
      // "item-wise", "product-wise", "per item/product"
      pattern: /\b((item|product)[\s-]?wise|per[\s-]?(item|product)|by item|by product|کس پروڈکٹ)\b/i,
      requireAll: [/\bFROM\s+production_entries\b/i, /\bitem/i],
      forbidAny: [
        /\bGROUP\s+BY\b[\s\S]*\bmachine_(name|code|id)\b/i,
        /\bJOIN\s+machines\b[\s\S]*\bGROUP\s+BY\b[\s\S]*\bm\./i,
      ],
      repairHint:
        'SHAPE REPAIR REQUIRED: the user asked for an ITEM/PRODUCT-wise report. Group by the item ' +
        'dimension (item name/SKU), not by machine.',
    },
    {
      // "shift-wise", "per shift"
      pattern: /\b(shift[\s-]?wise|per[\s-]?shift|by shift)\b/i,
      requireAll: [/shift/i],
      forbidAny: [],
      repairHint: 'SHAPE REPAIR REQUIRED: the user asked for a SHIFT-wise report — group by shift (pe.shift_id → shifts).',
    },
    {
      // "division-wise", "compare divisions"
      pattern: /\b(division[\s-]?wise|per[\s-]?division|by division|compare divisions?)\b/i,
      requireAll: [/division/i],
      forbidAny: [],
      repairHint:
        'SHAPE REPAIR REQUIRED: the user asked for a DIVISION-wise report — group by division_id / division_code.',
    },
    {
      // "day-wise", "daily", "by date"
      pattern: /\b(day[\s-]?wise|daily|day[\s-]?wise report|by date)\b/i,
      requireAll: [/entry_date|created_at|date/i],
      forbidAny: [],
      repairHint: 'SHAPE REPAIR REQUIRED: the user asked for a DAY-wise report — group by the date column (pe.entry_date).',
    },
  ];

  /** Returns a repair-hint string when the SQL shape contradicts the question, else null. */
  private assertKeyphraseShape(question: string, sql: string): string | null {
    for (const rule of TextToSqlService.KEYPHRASE_SHAPE_RULES) {
      if (!rule.pattern.test(question)) continue;
      for (const required of rule.requireAll) {
        if (!required.test(sql)) return rule.repairHint;
      }
      for (const forbidden of rule.forbidAny) {
        if (forbidden.test(sql)) return rule.repairHint;
      }
    }
    return null;
  }

  // ── UI chart payload builder ──────────────────────────────────────────────

  /**
   * Deterministic chart metadata for the frontend. Built from the ACTUAL
   * result columns (never trusting the LLM blindly): a series/axis column is
   * only advertised if it really exists in the returned rowset, so the UI can
   * bind directly without null checks. Machine-wise results are always mapped
   * to Machine Names + target + average production — never product names.
   */
  private buildChartMetadata(
    question: string,
    columns: string[],
    hint?: GeminiSqlResponse['chart'],
  ): AiChartMetadata {
    const has = (name: string): boolean => columns.includes(name);
    const first = (...names: string[]): string | undefined => names.find(has);

    const seriesOf = (...candidates: Array<[string, string]>): AiChartSeries[] =>
      candidates.filter(([column]) => has(column)).map(([column, label]) => ({ column, label }));

    // ── machine-wise → bar chart on machine names ──────────────────────────
    if (/\bmachine[\s-]?wise\b|\bper[\s-]?machine\b|\beach machine\b|مشین/i.test(question)) {
      const xColumn = first('machine_name', 'machine_code', 'machine_id');
      if (xColumn) {
        return {
          chartType: 'bar',
          dimension: 'machine',
          x: {
            column: xColumn,
            label: xColumn === 'machine_code' ? 'Machine Codes' : 'Machine Names',
          },
          series: seriesOf(
            ['total_production', 'Total Production'],
            ['avg_production', 'Average Production'],
            ['target_quantity', 'Target'],
            ['total_target', 'Target'],
            ['entry_count', 'Entries'],
          ),
        };
      }
    }

    // ── item/product-wise ──────────────────────────────────────────────────
    const itemX = first('item_name', 'item_code', 'sku', 'name');
    if (/\b(item|product)[\s-]?wise\b|\bper[\s-]?(item|product)\b/i.test(question) && itemX) {
      return {
        chartType: 'bar',
        dimension: 'item',
        x: { column: itemX, label: 'Products' },
        series: seriesOf(
          ['total_production', 'Total Production'],
          ['total_quantity', 'Total Quantity'],
          ['total', 'Total'],
        ),
      };
    }

    // ── time-series questions → line chart on the date column ──────────────
    const dateX = first('month', 'day', 'entry_date', 'order_date', 'date', 'created_at');
    if (dateX && /\b(daily|day[\s-]?wise|by date|over time|monthly|trend|per month)\b/i.test(question)) {
      return {
        chartType: 'line',
        dimension: 'date',
        x: { column: dateX, label: 'Date' },
        series: seriesOf(
          ['total_production', 'Total Production'],
          ['total_quantity', 'Total Quantity'],
          ['count', 'Count'],
        ),
      };
    }

    // ── fall back to the LLM hint, but only for columns that really exist ──
    if (hint?.xColumn && has(hint.xColumn)) {
      const validSeries = (hint.series ?? []).filter((s) => has(s.column));
      const chartType: AiChartMetadata['chartType'] =
        hint.chartType === 'bar' || hint.chartType === 'line' || hint.chartType === 'pie'
          ? hint.chartType
          : 'table';
      if (chartType !== 'table' && validSeries.length > 0) {
        return {
          chartType,
          dimension: hint.dimension ?? 'none',
          x: { column: hint.xColumn, label: hint.xLabel ?? hint.xColumn },
          series: validSeries,
        };
      }
    }

    // ── raw records → plain table ──────────────────────────────────────────
    return {
      chartType: 'table',
      dimension: 'none',
      x: { column: columns[0] ?? '', label: '' },
      series: [],
    };
  }

  // ── auditing ──────────────────────────────────────────────────────────────

  private audit(input: AskInput, answer: AiAnswer): void {
    void this.activityLog
      .log({
        actorUserId: input.userId,
        actorEmail: input.userEmail,
        action: `AI_${input.mode.toUpperCase()}_QUERY`,
        targetType: 'ai_assistant',
        targetName: answer.status,
        // Question + SQL + row count only — NEVER the returned business data.
        details: JSON.stringify({
          question: input.question.slice(0, 500),
          sql: answer.sql.slice(0, 2000),
          rowCount: answer.rowCount,
          attempts: answer.meta.attempts,
          totalMs: answer.meta.totalMs,
        }).slice(0, 4000),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      })
      .catch((err: Error) => this.logger.warn(`AI audit log failed: ${err.message}`));
  }

  private auditFailure(input: AskInput, question: string, issue: string): void {
    void this.activityLog
      .log({
        actorUserId: input.userId,
        actorEmail: input.userEmail,
        action: `AI_${input.mode.toUpperCase()}_QUERY_FAILED`,
        targetType: 'ai_assistant',
        targetName: 'failed',
        details: JSON.stringify({ question: question.slice(0, 500), issue: issue.slice(0, 1000) }).slice(0, 4000),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      })
      .catch(() => undefined);
  }
}
