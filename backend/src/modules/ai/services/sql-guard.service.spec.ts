import { SqlGuardService } from './sql-guard.service';
import { extractSqlTableNames, maskSqlLiterals } from '../utils/read-only-sql.util';
import { SchemaCatalog } from '../interfaces/ai-assistant.interface';

/**
 * Security regression tests for the AI SQL guard.
 *
 * These encode the invariants the Text-to-SQL engine depends on. If any of
 * them fails, generated SQL must NOT be executed:
 *   1. read-only: only a single SELECT, no DDL/DML/admin verbs,
 *   2. no comments / stacked statements / dollar-quoted bodies,
 *   3. only allow-listed tables, no system catalogs,
 *   4. LIMIT always enforced,
 *   5. division row-level scoping is fail-closed.
 */

const catalog: SchemaCatalog = {
  schema: 'public',
  generatedAt: new Date().toISOString(),
  divisions: [
    { id: '11111111-1111-4111-8111-111111111111', code: 'SPT', name: 'SPT Division' },
    { id: '22222222-2222-4222-8222-222222222222', code: 'PL', name: 'PL Division' },
  ],
  departments: [],
  tables: [
    {
      name: 'production_entries',
      domain: 'production',
      divisionScoped: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'division_id', type: 'uuid', nullable: false },
        { name: 'entry_date', type: 'timestamp without time zone', nullable: false },
        { name: 'quantity', type: 'numeric', nullable: false },
      ],
      foreignKeys: [{ column: 'division_id', refTable: 'divisions', refColumn: 'id' }],
    },
    {
      name: 'divisions',
      domain: 'organization',
      divisionScoped: false,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'division_code', type: 'character varying', nullable: false },
        { name: 'name', type: 'character varying', nullable: false },
      ],
      foreignKeys: [],
    },
    {
      name: 'uoms',
      domain: 'items',
      divisionScoped: false,
      columns: [{ name: 'name', type: 'character varying', nullable: false }],
      foreignKeys: [],
    },
  ],
};

const unrestricted = { catalog, allowedDivisionIds: undefined, maxRows: 500 };
const scopedSpt = {
  catalog,
  allowedDivisionIds: ['11111111-1111-4111-8111-111111111111'],
  maxRows: 500,
};

describe('SqlGuardService', () => {
  const guard = new SqlGuardService();

  // ── read-only invariants ──────────────────────────────────────────────────

  it('accepts a plain SELECT and passes it through', () => {
    const result = guard.validate(
      'SELECT division_id, count(*) AS c FROM production_entries GROUP BY division_id',
      unrestricted,
    );
    expect(result.ok).toBe(true);
    expect(result.sql).toContain('production_entries');
  });

  it.each([
    'DELETE FROM production_entries',
    'UPDATE production_entries SET quantity = 0',
    'INSERT INTO production_entries (id) VALUES (1)',
    'DROP TABLE production_entries',
    'TRUNCATE production_entries',
    'CREATE TABLE pwned (id int)',
    'GRANT SELECT ON production_entries TO public',
    'COPY production_entries TO STDOUT',
    'SELECT * INTO new_table FROM production_entries',
    'CALL some_procedure()',
    'VACUUM',
    'SET role admin',
    'REFRESH MATERIALIZED VIEW x',
  ])('rejects write/admin statement: %s', (sql) => {
    expect(guard.validate(sql, unrestricted).ok).toBe(false);
  });

  it('rejects stacked statements (SQL injection classic)', () => {
    const result = guard.validate(
      'SELECT division_id FROM production_entries; DROP TABLE production_entries',
      unrestricted,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/multiple SQL statements/i);
  });

  it('rejects SQL comments used to hide payloads', () => {
    expect(guard.validate('SELECT division_id FROM production_entries -- x', unrestricted).ok).toBe(false);
    expect(guard.validate('SELECT division_id FROM production_entries /* x */', unrestricted).ok).toBe(false);
  });

  it('rejects dollar-quoted bodies', () => {
    expect(guard.validate('SELECT division_id FROM production_entries $$ pwn $$', unrestricted).ok).toBe(false);
  });

  it('rejects dangerous functions', () => {
    expect(guard.validate('SELECT pg_sleep(60) FROM production_entries', unrestricted).ok).toBe(false);
    expect(guard.validate("SELECT division_id, pg_read_file('/etc/passwd') FROM production_entries", unrestricted).ok).toBe(false);
    expect(guard.validate('SELECT division_id FROM production_entries WHERE 1 = set_config(\'x\',\'y\',false)', unrestricted).ok).toBe(false);
  });

  it('rejects system catalog probing', () => {
    expect(guard.validate('SELECT * FROM pg_catalog.pg_authid', unrestricted).ok).toBe(false);
    expect(guard.validate('SELECT * FROM information_schema.tables', unrestricted).ok).toBe(false);
  });

  it('rejects tables outside the allow-list (incl. sensitive tables)', () => {
    const result = guard.validate('SELECT id FROM erp_users', unrestricted);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/allow-list/);
  });

  it('does NOT false-positive on forbidden words inside string literals', () => {
    // The literal contains "drop table" and "delete" — masking must neutralise it.
    const result = guard.validate(
      "SELECT division_id FROM production_entries WHERE entry_date > '2026-01-01 drop table delete'",
      unrestricted,
    );
    expect(result.ok).toBe(true);
  });

  it('enforces a LIMIT when the model forgot one', () => {
    const result = guard.validate('SELECT division_id FROM production_entries', unrestricted);
    expect(result.ok).toBe(true);
    expect(result.sql).toMatch(/LIMIT 500$/);
  });

  it('keeps an explicit LIMIT', () => {
    const result = guard.validate('SELECT division_id FROM production_entries LIMIT 10', unrestricted);
    expect(result.ok).toBe(true);
    expect(result.sql).not.toMatch(/LIMIT 500/);
  });

  // ── division row-level scoping ────────────────────────────────────────────

  it('wraps division-scoped queries so only allowed divisions can return rows', () => {
    const result = guard.validate(
      "SELECT division_id, quantity FROM production_entries WHERE entry_date > '2026-01-01'",
      scopedSpt,
    );
    expect(result.ok).toBe(true);
    expect(result.sql).toContain('_ai_scope');
    expect(result.sql).toContain("division_id IN ('11111111-1111-4111-8111-111111111111')");
  });

  it('REJECTS (fail-closed) a division-scoped query that hides division_id', () => {
    const result = guard.validate('SELECT quantity FROM production_entries', scopedSpt);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/division_id/);
  });

  it('deny-all scope (empty array) never returns data', () => {
    const result = guard.validate('SELECT division_id FROM production_entries', {
      catalog,
      allowedDivisionIds: [],
      maxRows: 500,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no division access/i);
  });

  it('rejects a corrupted division scope (non-UUID) instead of interpolating it', () => {
    const result = guard.validate('SELECT division_id FROM production_entries', {
      catalog,
      allowedDivisionIds: ["' OR 1=1 --"],
      maxRows: 500,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid division scope/i);
  });

  it('scopes the divisions dictionary itself by id', () => {
    const result = guard.validate('SELECT id, division_code FROM divisions', scopedSpt);
    expect(result.ok).toBe(true);
    expect(result.sql).toContain('_ai_scope.id IN');
  });

  it('allows reference-only tables without scoping (no division column exists)', () => {
    const result = guard.validate('SELECT name FROM uoms ORDER BY name', scopedSpt);
    expect(result.ok).toBe(true);
    expect(result.sql).not.toContain('_ai_scope');
  });
});

describe('maskSqlLiterals', () => {
  it('neutralises string literals, quoted identifiers and dollar blocks', () => {
    expect(maskSqlLiterals("SELECT 'drop table x' FROM t")).toBe("SELECT '' FROM t");
    expect(maskSqlLiterals('SELECT "delete" FROM t')).toBe('SELECT "x" FROM t');
    expect(maskSqlLiterals('SELECT $$ delete $$ FROM t')).toBe("SELECT '' FROM t");
  });
});

describe('extractSqlTableNames', () => {
  it('collects FROM/JOIN targets and skips CTEs and subqueries', () => {
    const masked = maskSqlLiterals(
      'WITH recent AS (SELECT * FROM production_entries) SELECT * FROM recent JOIN divisions ON 1 = 1',
    );
    expect(extractSqlTableNames(masked).sort()).toEqual(['divisions', 'production_entries']);
  });
});
