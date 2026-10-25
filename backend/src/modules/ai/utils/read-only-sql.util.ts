/**
 * READ-ONLY SQL VALIDATION UTILITY (pure functions — no NestJS dependencies).
 *
 * This is application guardrail layer #2 of the AI assistant. The LLM only
 * ever *suggests* SQL, and its output must be PROVEN read-only before it may
 * reach the (already read-only) database connection:
 *
 *   1. single statement only  (no stacked queries / `;`),
 *   2. no comments and no dollar-quoted bodies,
 *   3. statement must START with SELECT or WITH,
 *   4. deny-list of DDL/DML/admin keywords (INSERT, UPDATE, DELETE, DROP,
 *      ALTER, TRUNCATE, CREATE, GRANT, COPY, …),
 *   5. deny-list of dangerous functions (pg_sleep, pg_read_file, dblink, …),
 *   6. no system catalogs (pg_catalog / information_schema) or foreign schemas,
 *   7. only tables on the allow-list may be referenced,
 *   8. a LIMIT is always enforced.
 *
 * String literals are MASKED before keyword scanning so values like
 * 'October drop table' cannot cause false rejections — and so quoted
 * identifiers like "delete" are never mistaken for keywords.
 *
 * Kept dependency-free and side-effect free so it can be unit-tested in
 * isolation (see read-only-sql.util.spec.ts) and reused by any service.
 * Security ALERT LOGGING happens in the caller (SqlGuardService).
 */

export interface ReadOnlySqlValidationOptions {
  /** Table names the query is allowed to reference (lowercase). */
  allowedTables: Set<string>;
  /** Schema the assistant may qualify tables with, e.g. 'public'. */
  allowedSchema?: string;
  /** Hard row cap appended as `LIMIT n` when the query has none. */
  maxRows?: number;
}

export interface ReadOnlySqlValidationResult {
  ok: boolean;
  /** Why the statement was blocked (fed back to the LLM for self-repair). */
  reason?: string;
  /** Machine-readable violation category for security alerting/metrics. */
  violation?:
    | 'empty'
    | 'multiple_statements'
    | 'comments'
    | 'dollar_quote'
    | 'not_select'
    | 'forbidden_keyword'
    | 'forbidden_function'
    | 'system_catalog'
    | 'schema_violation'
    | 'unknown_table'
    | 'no_table';
  /** Final SQL with LIMIT enforced (only when ok). */
  sql?: string;
}

/** Statements containing any of these word-tokens are blocked outright. */
export const FORBIDDEN_KEYWORDS: readonly string[] = [
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UPSERT', 'REPLACE',
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
  'GRANT', 'REVOKE', 'COMMENT', 'COPY', 'VACUUM', 'ANALYZE', 'CLUSTER', 'REINDEX',
  'CALL', 'DO', 'EXECUTE', 'PREPARE', 'DEALLOCATE', 'SET', 'RESET', 'SHOW',
  'LISTEN', 'NOTIFY', 'LOCK', 'REFRESH', 'CHECKPOINT', 'DISCARD',
  'INTO', // blocks SELECT ... INTO <table> and CTAS smuggling
];

/** Function calls that must never run, even inside a SELECT. */
export const FORBIDDEN_FUNCTIONS: readonly string[] = [
  'pg_sleep', 'pg_sleep_for', 'pg_sleep_until',
  'pg_terminate_backend', 'pg_cancel_backend', 'pg_reload_conf',
  'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'pg_stat_file',
  'pg_create_restore_point', 'pg_advisory_lock', 'pg_advisory_xact_lock',
  'pg_export_snapshot', 'pg_switch_wal', 'pg_promote',
  'lo_import', 'lo_export', 'lo_unlink',
  'dblink', 'dblink_exec', 'dblink_connect',
  'set_config', 'current_setting',
  'query_to_xml', 'cursor_to_xml',
];

/** Schemas that must never be referenced. */
export const FORBIDDEN_SCHEMA_REFS: readonly string[] = ['pg_catalog', 'information_schema', 'pg_toast'];

/**
 * Replace string literals / quoted identifiers / dollar-quoted blocks with a
 * neutral placeholder so keyword scanning cannot be fooled or broken by values
 * such as 'DROP TABLE x' or a column literally named "delete".
 */
export function maskSqlLiterals(sql: string): string {
  return sql
    .replace(/\$([a-z_][\w]*)?\$[\s\S]*?\$\1\$/gi, "''") // dollar-quoted bodies
    .replace(/'(?:[^']|'')*'/g, "''") // standard + escaped string literals
    .replace(/\bE'(?:[^']|'')*'/gi, "''") // E'...' strings
    .replace(/"(?:[^"]|"")*"/g, '"x"'); // quoted identifiers
}

/** Top-level table references (FROM/JOIN targets), skipping CTEs and subqueries. */
export function extractSqlTableNames(maskedSql: string): string[] {
  const cteNames = new Set<string>();
  const cteRe = /(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([a-z_][a-z0-9_]*)\s+AS\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = cteRe.exec(maskedSql)) !== null) {
    cteNames.add(match[1].toLowerCase());
  }

  const tables = new Set<string>();
  const refRe = /(?<!\bEXTRACT\s*\([^)]*)\b(?:FROM|JOIN)\s+(?:([a-z_][a-z0-9_]*)\s*\.\s*)?([a-z_][a-z0-9_]*)/gi;
  while ((match = refRe.exec(maskedSql)) !== null) {
    const name = (match[2] || match[1]).toLowerCase();
    if (['lateral', 'only', 'into'].includes(name)) continue;
    if (cteNames.has(name)) continue;
    tables.add(name);
  }
  return [...tables];
}

/** Text of the first top-level SELECT list (between SELECT and its FROM). */
export function firstSelectProjection(maskedSql: string): string {
  const selectMatch = /\bSELECT\b/i.exec(maskedSql);
  if (!selectMatch) return '';
  const fromMatch = /\bFROM\b/i.exec(maskedSql.slice(selectMatch.index));
  if (!fromMatch) return maskedSql.slice(selectMatch.index);
  return maskedSql.slice(selectMatch.index, selectMatch.index + fromMatch.index);
}

/**
 * Validate that `sql` is a single, read-only, allow-listed SELECT.
 *
 * Returns a structured result instead of throwing, so callers can both log a
 * security alert and return a friendly error to the UI / the LLM.
 */
export function validateReadOnlySql(
  sqlRaw: string,
  options: ReadOnlySqlValidationOptions,
): ReadOnlySqlValidationResult {
  const trimmed = (sqlRaw ?? '').trim().replace(/;+\s*$/, '');
  if (!trimmed) {
    return { ok: false, reason: 'Empty SQL — no statement was produced.', violation: 'empty' };
  }

  // Dollar-quoted blocks can hide arbitrary statement bodies. Mask only string
  // literals first, so a literal containing '$$' does not false-positive.
  // Regex matches both `$$ ... $$` and `$tag$ ... $tag$`.
  const literalsMasked = trimmed.replace(/'(?:[^']|'')*'/g, "''");
  if (/\$(?:[a-z_][\w]*)?\$/i.test(literalsMasked)) {
    return {
      ok: false,
      reason: 'Blocked: dollar-quoted blocks are not allowed.',
      violation: 'dollar_quote',
    };
  }

  const masked = maskSqlLiterals(trimmed);

  if (masked.includes(';')) {
    return {
      ok: false,
      reason: 'Blocked: multiple SQL statements are not allowed (found ";").',
      violation: 'multiple_statements',
    };
  }
  if (masked.includes('--') || masked.includes('/*') || masked.includes('*/')) {
    return { ok: false, reason: 'Blocked: SQL comments are not allowed.', violation: 'comments' };
  }
  if (!/^\s*(WITH|SELECT)\b/i.test(masked)) {
    return {
      ok: false,
      reason: 'Blocked: only read-only SELECT statements are permitted.',
      violation: 'not_select',
    };
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(masked)) {
      return {
        ok: false,
        reason: `Blocked: forbidden SQL keyword "${keyword}". Only read-only SELECT queries are allowed.`,
        violation: 'forbidden_keyword',
      };
    }
  }

  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`\\b${fn}\\s*\\(`, 'i').test(masked)) {
      return {
        ok: false,
        reason: `Blocked: forbidden function "${fn}()".`,
        violation: 'forbidden_function',
      };
    }
  }

  for (const schemaRef of FORBIDDEN_SCHEMA_REFS) {
    if (new RegExp(`\\b${schemaRef}\\s*\\.`, 'i').test(masked)) {
      return {
        ok: false,
        reason: `Blocked: schema "${schemaRef}" is not queryable by the assistant.`,
        violation: 'system_catalog',
      };
    }
  }

  // Any explicit schema qualification on a table reference (FROM/JOIN <schema>.<table>)
  // must stay inside the configured schema (or erp_sales), while allowing table aliases (pe.col, m.col).
  const tableSchemaRe = /\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\s*\.\s*([a-z_][a-z0-9_]*)/gi;
  let schemaMatch: RegExpExecArray | null;
  while ((schemaMatch = tableSchemaRe.exec(masked)) !== null) {
    const schemaPart = schemaMatch[1].trim().toLowerCase();
    const allowed = options.allowedSchema ? options.allowedSchema.toLowerCase() : 'public';
    if (schemaPart !== allowed && schemaPart !== 'erp_sales') {
      return {
        ok: false,
        reason: `Blocked: schema qualification "${schemaPart}." is not allowed.`,
        violation: 'schema_violation',
      };
    }
  }

  const tables = extractSqlTableNames(masked);
  if (tables.length === 0) {
    return {
      ok: false,
      reason: 'Blocked: no base table could be detected in the query.',
      violation: 'no_table',
    };
  }
  for (const table of tables) {
    if (!options.allowedTables.has(table)) {
      return {
        ok: false,
        reason: `Blocked: table "${table}" is not part of the assistant's schema allow-list.`,
        violation: 'unknown_table',
      };
    }
  }

  // Always enforce a LIMIT (row cap) unless the query already has one.
  let finalSql = trimmed;
  if (!/\bLIMIT\s+\d+/i.test(masked) && !/\bFETCH\s+(FIRST|NEXT)\b/i.test(masked)) {
    finalSql = `${finalSql}\nLIMIT ${Math.floor(options.maxRows ?? 500)}`;
  }

  return { ok: true, sql: finalSql };
}
