import { Injectable, Logger } from '@nestjs/common';
import { CatalogTable, SchemaCatalog, SqlValidationResult } from '../interfaces/ai-assistant.interface';
import {
  extractSqlTableNames,
  firstSelectProjection,
  maskSqlLiterals,
  validateReadOnlySql,
} from '../utils/read-only-sql.util';

/**
 * SQL GUARD — application-side defense layer for AI-generated SQL.
 *
 * Delegates the read-only/keyword/allow-list validation to the pure utility
 * `utils/read-only-sql.util.ts` and adds the ERP-specific layer this engine
 * cannot live without: FAIL-CLOSED DIVISION ROW-LEVEL SCOPING.
 *
 * When a caller only has access to a subset of divisions (SPT / PL / City-CT …),
 * the final SQL is wrapped so PostgreSQL can only ever return rows whose
 * `division_id` is in the caller's allow-list — no matter what WHERE the LLM
 * wrote. If the model forgot to expose `division_id`, the query is REJECTED
 * (and the orchestrator asks the model to repair it), never silently widened.
 *
 * SECURITY ALERTS: every blocked statement is logged at `warn` level with a
 * `[SECURITY]` marker, the violation category, the caller context and the SQL
 * snippet — so blocked injection attempts are visible in log aggregation.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SqlGuardContext {
  catalog: SchemaCatalog;
  /** `undefined` = unrestricted (admin). `[]` = deny-all. Otherwise: allowed division UUIDs. */
  allowedDivisionIds: string[] | undefined;
  maxRows: number;
  /** Optional caller context (user id / email) included in security alerts. */
  actor?: { userId?: string; email?: string };
}

@Injectable()
export class SqlGuardService {
  private readonly logger = new Logger(SqlGuardService.name);

  /**
   * Validate + division-scope a piece of LLM-generated SQL.
   * Returns `ok: false` with a reason the orchestrator can feed back to the
   * LLM (self-repair), or `ok: true` with the FINAL executable SQL.
   */
  validate(sqlRaw: string, ctx: SqlGuardContext): SqlValidationResult {
    // ── Layer 3a: generic read-only validation (pure utility) ───────────────
    const allowedTables = new Set(ctx.catalog.tables.map((t) => t.name.toLowerCase()));
    const base = validateReadOnlySql(sqlRaw, {
      allowedTables,
      allowedSchema: ctx.catalog.schema,
      maxRows: ctx.maxRows,
    });

    if (!base.ok || !base.sql) {
      this.alert('READ_ONLY_VIOLATION', base.violation ?? 'unknown', base.reason ?? '', sqlRaw, ctx);
      return { ok: false, reason: base.reason };
    }

    // ── Layer 3b: ERP division row-level scoping (fail-closed) ──────────────
    const scoped = this.applyDivisionScope(base.sql, ctx);
    if (!scoped.ok) {
      this.alert('DIVISION_SCOPE_VIOLATION', 'scope', scoped.reason ?? '', sqlRaw, ctx);
      return scoped;
    }
    return scoped;
  }

  /**
   * Wrap the query so PostgreSQL itself can only return rows inside the
   * caller's allowed divisions. Fail-closed: anything we cannot prove is
   * scoped gets rejected (the LLM then repairs it with division_id exposed).
   */
  private applyDivisionScope(sql: string, ctx: SqlGuardContext): SqlValidationResult {
    // Unrestricted (SUPER_ADMIN / company-wide scope) → no wrapper needed.
    if (ctx.allowedDivisionIds === undefined) return { ok: true, sql };

    // Deny-all: the guard chain resolved an empty effective division set.
    if (ctx.allowedDivisionIds.length === 0) {
      return {
        ok: false,
        reason: 'Blocked: your account has no division access, so no ERP data can be queried.',
      };
    }

    const masked = maskSqlLiterals(sql);
    const tables = extractSqlTableNames(masked);
    const byName = new Map<string, CatalogTable>(ctx.catalog.tables.map((t) => [t.name.toLowerCase(), t]));
    const scopedTables = tables.filter((t) => byName.get(t)?.divisionScoped);
    const projection = firstSelectProjection(masked);
    const exposesDivisionId = /\bdivision_id\b/i.test(projection);

    // Validate every id strictly before embedding it in SQL (fail-closed).
    const ids: string[] = [];
    for (const id of ctx.allowedDivisionIds) {
      if (!UUID_RE.test(id)) {
        return {
          ok: false,
          reason: 'Blocked: invalid division scope identifier resolved for your account.',
        };
      }
      ids.push(id.toLowerCase());
    }
    const inList = ids.map((id) => `'${id}'`).join(', ');

    if (scopedTables.length > 0) {
      if (!exposesDivisionId) {
        return {
          ok: false,
          reason:
            'REPAIR REQUIRED: the query touches division-scoped tables but does not expose `division_id`. ' +
            'Rewrite the SELECT list so `division_id` is the FIRST selected column ' +
            '(also for aggregates: add it to GROUP BY).',
        };
      }
      return {
        ok: true,
        sql: `SELECT * FROM (\n${sql}\n) AS _ai_scope\nWHERE _ai_scope.division_id IN (${inList})`,
      };
    }

    // Not division-scoped tables, but the divisions dictionary itself was used:
    // scope it by `id` so a restricted user can only enumerate their own rows.
    if (tables.includes('divisions')) {
      if (/\bid\b/i.test(projection)) {
        return {
          ok: true,
          sql: `SELECT * FROM (\n${sql}\n) AS _ai_scope\nWHERE _ai_scope.id IN (${inList})`,
        };
      }
      return {
        ok: false,
        reason:
          'REPAIR REQUIRED: a query against `divisions` must expose the `id` column so it can be division-scoped.',
      };
    }

    // Reference/master tables only (no division column exists) → nothing can
    // leak, the query is safe as-is.
    return { ok: true, sql };
  }

  /**
   * Security alert: a structured WARN log line per blocked statement.
   * Surfaced in log aggregation (and greppable via the `[SECURITY]` marker).
   */
  private alert(
    category: string,
    violation: string,
    reason: string,
    sql: string,
    ctx: SqlGuardContext,
  ): void {
    this.logger.warn(
      `[SECURITY] AI SQL blocked | category=${category} violation=${violation} ` +
        `actor=${ctx.actor?.userId ?? 'unknown'}${ctx.actor?.email ? ` (${ctx.actor.email})` : ''} ` +
        `| ${reason} | sql=${(sql ?? '').slice(0, 300)}`,
    );
  }
}
