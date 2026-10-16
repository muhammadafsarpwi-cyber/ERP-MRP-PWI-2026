import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aiConfig } from '../../../config/ai.config';
import {
  CatalogTable,
  EmptyStateResult,
  EmptyStateSuggestion,
  GeminiNarrationResponse,
  SchemaCatalog,
} from '../interfaces/ai-assistant.interface';
import { GeminiClientService } from './gemini-client.service';
import { ReadOnlyDataSourceService } from './read-only-datasource.service';
import { extractSqlTableNames, maskSqlLiterals } from '../utils/read-only-sql.util';

/**
 * INTELLIGENT EMPTY-STATE HANDLER — "No records found" is never a dead end.
 *
 * When a query executes successfully but returns zero rows (the classic case:
 * "SPT logs for March" when the department only started logging in June), this
 * service diagnoses WHY by probing the (read-only, time-boxed) database:
 *
 *   1. DIVISION probe — which divisions actually have rows in the queried
 *      table (optionally within the detected period)?
 *   2. PERIOD probe   — which recent months have data for the scoped divisions?
 *   3. TOTAL probe    — is the table simply empty? (different message entirely)
 *   4. NAME matching  — near-miss division / department names from the user's
 *      own wording ("SPTT" → "SPT", "Produktion" → "Production").
 *
 * The findings are turned into a friendly bilingual (English + Urdu) response
 * plus machine-readable `suggestions` the frontend can render as clickable
 * chips — one click re-runs the query with the corrected parameter. When
 * AI_EMPTY_STATE_NARRATE=true, Gemini polishes the prose; if it fails, the
 * deterministic template is used, so the feature can never break a response.
 */

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Columns that look like "the date this record is about". */
const PERIOD_COLUMN_HINTS = [
  '_date', 'date_', 'month', 'period', 'day', '_at',
];

/** Identifiers that would be unsafe/meaningless to inline into a probe query. */
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;

interface DetectedFilters {
  /** ISO year detected in question/SQL, e.g. 2026. */
  year?: number;
  /** 1-12 detected month. */
  month?: number;
  /** Human label, e.g. "March 2026". */
  periodLabel?: string;
  /** Division names/codes mentioned by the user (upper-cased tokens). */
  divisionTerms: string[];
  /** Department-ish words mentioned by the user. */
  departmentTerms: string[];
}

@Injectable()
export class EmptyResultAdvisorService {
  private readonly logger = new Logger(EmptyResultAdvisorService.name);
  private readonly cfg = aiConfig(this.config);

  constructor(
    private readonly config: ConfigService,
    private readonly db: ReadOnlyDataSourceService,
    private readonly gemini: GeminiClientService,
  ) {}

  /**
   * Diagnose an empty result and build the friendly response. Never throws —
   * a degraded answer always beats a 500.
   */
  async analyze(args: {
    question: string;
    sql: string;
    catalog: SchemaCatalog;
    allowedDivisionIds: string[] | undefined;
  }): Promise<EmptyStateResult> {
    const { question, sql, catalog, allowedDivisionIds } = args;
    const filters = this.detectFilters(question, sql, catalog);

    const masked = maskSqlLiterals(sql);
    const tableNames = extractSqlTableNames(masked).filter((name) =>
      catalog.tables.some((t) => t.name === name),
    );
    const primary = catalog.tables.find((t) => t.name === tableNames[0]);

    const suggestions: EmptyStateSuggestion[] = [];
    const reasons: string[] = [];

    if (!primary) {
      // We could not identify the table — give generic, still-useful guidance.
      return {
        reasons: ['unknown_table'],
        message: {
          en: 'The query ran successfully but matched no records. Try rephrasing with a division (SPT, PL, City) or a wider date range.',
          ur: 'کوئری درست چلی لیکن کوئی ریکارڈ نہیں ملا۔ کسی ڈویژن (SPT، PL، City) یا وسیع تری تاریخ کے ساتھ دوبارہ کوشش کریں۔',
        },
        suggestions: [],
      };
    }

    // ── 1. Is the table empty altogether? (different problem entirely) ──────
    const total = await this.countRows(primary, undefined);
    if (total === 0) {
      return {
        reasons: ['table_empty'],
        message: {
          en: `No records exist in "${primary.name}" yet — this table has never been populated, so no query against it can return data.`,
          ur: `"${primary.name}" میں ابھی کوئی ریکارڈ موجود نہیں یہ ٹیبل خالی ہے، اس لیے کوئی بھی کوئری کوئی ڈیٹا نہیں دے سکتی۔`,
        },
        suggestions: this.crossDomainTips(catalog),
      };
    }

    // ── 2. Division probe: who DOES have data (in the detected period)? ─────
    if (primary.divisionScoped) {
      reasons.push('division');
      const divisionRows = await this.divisionCounts(primary, filters);
      const byId = new Map(catalog.divisions.map((d) => [d.id, d]));

      for (const row of divisionRows) {
        const division = byId.get(row.division_id);
        if (!division) continue;
        // Do not suggest divisions the caller is not allowed to see.
        if (allowedDivisionIds && !allowedDivisionIds.includes(division.id)) continue;

        const label = `${division.code} — ${division.name} (${row.count.toLocaleString('en-US')} rows)`;
        const labelUr = `${division.code} — ${division.name} (${row.count.toLocaleString('en-US')} ریکارڈز)`;
        const mentioned = filters.divisionTerms.some(
          (term) => division.code.toUpperCase().includes(term) || division.name.toUpperCase().includes(term),
        );
        if (mentioned) continue; // they already asked for this one and it was empty

        suggestions.push({ type: 'division', label, labelUr, value: division.id });
      }

      if (suggestions.length === 0) {
        reasons.push('division_empty');
      }
    }

    // ── 3. Period probe: which recent months have data? ─────────────────────
    const dateColumn = this.pickPeriodColumn(primary);
    if (dateColumn) {
      const periodRows = await this.periodCounts(primary, dateColumn, allowedDivisionIds);
      for (const row of periodRows) {
        const monthDate = new Date(row.month);
        if (Number.isNaN(monthDate.getTime())) continue;
        const label = this.formatMonth(monthDate);
        const alreadyAsked =
          filters.month === monthDate.getMonth() + 1 && filters.year === monthDate.getFullYear();
        if (alreadyAsked) continue;
        suggestions.push({
          type: 'period',
          label: `${label} (${Number(row.count).toLocaleString('en-US')} rows)`,
          labelUr: `${label} (${Number(row.count).toLocaleString('en-US')} ریکارڈز)`,
          value: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`,
        });
      }
    }

    // ── 4. Near-miss names (typo'd department / division) ───────────────────
    if (filters.departmentTerms.length > 0) {
      const matches = this.fuzzyDepartments(catalog, filters.departmentTerms, allowedDivisionIds);
      for (const match of matches.slice(0, 3)) {
        suggestions.push({
          type: 'department',
          label: `Did you mean: ${match.name}?`,
          labelUr: `کیا آپ کا مطلب یہ ہے: ${match.name}?`,
          value: match.id,
        });
      }
    }

    // ── 5. Compose the bilingual message ────────────────────────────────────
    const template = this.composeMessage(filters, primary, total, suggestions.length, reasons);

    let message = template;
    if (this.cfg.query.emptyStateNarrate) {
      message = await this.narrate(question, filters, primary, template);
    }

    // Generic widening tip is always the last suggestion.
    suggestions.push({
      type: 'tip',
      label: 'Tip: remove the date filter, or widen it — the data may start in a later month.',
      labelUr: 'تجویز: تاریخ کا فلٹر ہٹائیں یا وسیع کریں، ڈیٹا شاید کسی بعد کے مہینے سے شروع ہوتا ہے۔',
      value: null,
    });

    return { reasons, message, suggestions };
  }

  // ── filter detection ───────────────────────────────────────────────────────

  private detectFilters(question: string, sql: string, catalog: SchemaCatalog): DetectedFilters {
    const haystack = `${question} ${sql}`.toLowerCase();

    const filters: DetectedFilters = { divisionTerms: [], departmentTerms: [] };

    // Year: 20xx (SQL literals like '2026-03-01' are covered by this too).
    const yearMatch = haystack.match(/\b(20[0-9]{2})\b/);
    if (yearMatch) filters.year = Number(yearMatch[1]);

    // Month: english name or 1-12 next to the word "month"/"مہینہ" — keep it
    // conservative: only pick an english month name or an ISO 'YYYY-MM'.
    for (let i = 0; i < MONTH_NAMES.length; i++) {
      if (haystack.includes(MONTH_NAMES[i])) {
        filters.month = i + 1;
        break;
      }
    }
    if (!filters.month) {
      const iso = haystack.match(/\b(20[0-9]{2})-(0[1-9]|1[0-2])\b/);
      if (iso) {
        filters.year = Number(iso[1]);
        filters.month = Number(iso[2]);
      }
    }
    if (filters.month || filters.year) {
      filters.periodLabel = this.formatMonth(
        new Date((filters.year ?? new Date().getFullYear()), (filters.month ?? 1) - 1, 1),
      );
    }

    // Division terms: match user tokens against known division codes/names.
    const tokens = question.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 2);
    for (const division of catalog.divisions) {
      const code = division.code.toUpperCase();
      const name = division.name.toUpperCase();
      if (tokens.some((t) => code.includes(t) || t.includes(code) || name.includes(t))) {
        filters.divisionTerms.push(code);
      }
    }

    // Department terms: user tokens that are not division terms.
    filters.departmentTerms = [...new Set(tokens)].slice(0, 8);
    return filters;
  }

  // ── probes (all read-only, capped, failure-tolerant) ──────────────────────

  private async countRows(
    table: CatalogTable,
    divisionId: string | undefined,
  ): Promise<number> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (divisionId && table.divisionScoped) {
      params.push(divisionId);
      where.push(`division_id = $${params.length}`);
    }
    const result = await this.db.runSelect<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${table.name}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
      { params, maxRows: 1, timeoutMs: 8_000 },
    );
    if (!result.ok || !result.rows[0]) return 0;
    return Number(result.rows[0].count ?? 0) || 0;
  }

  private async divisionCounts(
    table: CatalogTable,
    filters: DetectedFilters,
  ): Promise<Array<{ division_id: string; count: number }>> {
    const params: unknown[] = [];
    const where: string[] = [];

    const dateColumn = this.pickPeriodColumn(table);
    if (filters.year && dateColumn) {
      // Narrow window when both month+year were detected, else the whole year.
      const start = filters.month
        ? new Date(filters.year, filters.month - 1, 1)
        : new Date(filters.year, 0, 1);
      const end = filters.month
        ? new Date(filters.year, filters.month, 1)
        : new Date(filters.year + 1, 0, 1);
      params.push(start.toISOString(), end.toISOString());
      where.push(`${dateColumn} >= $${params.length - 1} AND ${dateColumn} < $${params.length}`);
    }

    const result = await this.db.runSelect<{ division_id: string; count: string }>(
      `SELECT division_id, count(*)::text AS count
         FROM ${table.name}
        ${where.length ? `WHERE ${where.join(' AND ')} AND ` : 'WHERE '}division_id IS NOT NULL
        GROUP BY division_id
        ORDER BY count(*) DESC
        LIMIT 10`,
      { params, maxRows: 10, timeoutMs: 8_000 },
    );
    if (!result.ok) return [];
    return result.rows.map((r) => ({ division_id: r.division_id, count: Number(r.count) || 0 }));
  }

  private async periodCounts(
    table: CatalogTable,
    dateColumn: string,
    allowedDivisionIds: string[] | undefined,
  ): Promise<Array<{ month: string; count: number }>> {
    if (!IDENT_RE.test(dateColumn)) return [];

    const params: unknown[] = [];
    let scope = '';
    if (table.divisionScoped && allowedDivisionIds && allowedDivisionIds.length > 0) {
      params.push(allowedDivisionIds);
      scope = `division_id = ANY($${params.length}::uuid[]) AND `;
    }

    const result = await this.db.runSelect<{ month: string; count: string }>(
      `SELECT date_trunc('month', ${dateColumn})::text AS month, count(*)::text AS count
         FROM ${table.name}
        WHERE ${scope}${dateColumn} >= NOW() - INTERVAL '18 months' AND ${dateColumn} IS NOT NULL
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 12`,
      { params, maxRows: 12, timeoutMs: 8_000 },
    );
    if (!result.ok) return [];
    return result.rows.map((r) => ({ month: r.month, count: Number(r.count) || 0 }));
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Pick the most "business-date-like" column of the table (fallback: created_at). */
  private pickPeriodColumn(table: CatalogTable): string | undefined {
    const candidates = table.columns
      .map((c) => c.name)
      .filter((name) => PERIOD_COLUMN_HINTS.some((hint) => name.includes(hint)));

    const rank = (name: string): number => {
      if (name === 'created_at') return 50;
      if (name.endsWith('_date')) return 10;
      if (name.startsWith('date_')) return 15;
      if (name.includes('month') || name.includes('period')) return 5;
      return 30;
    };

    return candidates.sort((a, b) => rank(a) - rank(b))[0];
  }

  private fuzzyDepartments(
    catalog: SchemaCatalog,
    terms: string[],
    allowedDivisionIds: string[] | undefined,
  ): Array<{ id: string; name: string }> {
    const scored = catalog.departments
      .filter((d) => !allowedDivisionIds || !d.divisionId || allowedDivisionIds.includes(d.divisionId))
      .map((d) => {
        const name = d.name.toUpperCase();
        const score = terms.reduce(
          (acc, term) => acc + (name.includes(term) ? term.length : this.levenshtein(name, term) <= 2 ? 1 : 0),
          0,
        );
        return { id: d.id, name: d.name, score };
      })
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored;
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return matrix[a.length][b.length];
  }

  private formatMonth(date: Date): string {
    return `${MONTH_NAMES[date.getMonth()][0].toUpperCase()}${MONTH_NAMES[date.getMonth()].slice(1)} ${date.getFullYear()}`;
  }

  private composeMessage(
    filters: DetectedFilters,
    table: CatalogTable,
    totalRows: number,
    suggestionCount: number,
    reasons: string[],
  ): { en: string; ur: string } {
    const period = filters.periodLabel ? ` for ${filters.periodLabel}` : '';
    const division = filters.divisionTerms.length ? ` in ${filters.divisionTerms.join('/')}` : '';
    const divisionUr = filters.divisionTerms.length ? ` ${filters.divisionTerms.join('/')} ڈویژن میں` : '';
    const periodUr = filters.periodLabel ? ` ${filters.periodLabel} کے دوران` : '';

    const en =
      `Your query ran successfully but returned no rows${period}${division}. ` +
      `"${table.name}" holds ${totalRows.toLocaleString('en-US')} records overall, so this particular ` +
      `division + date combination simply has no matching data yet. ` +
      (suggestionCount > 0
        ? 'Here are the closest alternatives that DO have data — click one to re-run.'
        : 'Try widening the date range or removing filters.');

    const ur =
      `آپ کی کوئری درست چلی لیکن${periodUr}${divisionUr} کوئی ریکارڈ نہیں ملا۔ ` +
      `"${table.name}" ٹیبل میں کل ${totalRows.toLocaleString('en-US')} ریکارڈز موجود ہیں، ` +
      `لیکن اس مخصوص تاریخ اور ڈویژن کے لیے کوئی ڈیٹا نہیں۔ ` +
      (suggestionCount > 0
        ? 'نیچے دی گئی متبادل کے ساتھ دوبارہ کوشش کریں۔'
        : 'تاریخ کی حد وسیع کریں یا فلٹر ہٹا دیں۔');

    void reasons; // reserved for future per-reason copy (division_empty vs period)
    return { en, ur };
  }

  /** Gemini-polished prose; falls back to the deterministic template. */
  private async narrate(
    question: string,
    filters: DetectedFilters,
    table: CatalogTable,
    template: { en: string; ur: string },
  ): Promise<{ en: string; ur: string }> {
    try {
      const result = await this.gemini.generateJson<GeminiNarrationResponse>(
        'You are a friendly assistant inside a manufacturing ERP used by Pakistani factory staff. ' +
          'Explain why a query returned no records, in a warm, practical tone. Be concise (max 2 sentences per language). ' +
          'Respond ONLY with JSON: {"message_en": "...", "message_ur": "..."} — the Urdu must be natural Urdu script.',
        `User asked: "${question}"\n` +
          `Detected period: ${filters.periodLabel ?? 'none'}\n` +
          `Detected divisions: ${filters.divisionTerms.join(', ') || 'none'}\n` +
          `Queried table: ${table.name}\n` +
          `Deterministic draft to improve:\nEN: ${template.en}\nUR: ${template.ur}`,
        0.4,
      );
      if (result?.message_en && result?.message_ur) {
        return { en: result.message_en, ur: result.message_ur };
      }
      return template;
    } catch (err) {
      this.logger.debug(`Empty-state narration skipped: ${(err as Error)?.message}`);
      return template;
    }
  }

  private crossDomainTips(catalog: SchemaCatalog): EmptyStateSuggestion[] {
    const populatedDomains = [...new Set(catalog.tables.map((t) => t.domain))].slice(0, 6);
    return [
      {
        type: 'tip',
        label: `Available data domains: ${populatedDomains.join(', ')} — try asking about one of these.`,
        labelUr: `دستیاب ڈیٹا: ${populatedDomains.join(', ')} — ان میں سے کسی کے بارے میں پوچھیں۔`,
        value: null,
      },
    ];
  }
}
