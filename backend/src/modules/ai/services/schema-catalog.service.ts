import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aiConfig } from '../../../config/ai.config';
import {
  CatalogColumn,
  CatalogDivision,
  CatalogForeignKey,
  CatalogTable,
  SchemaCatalog,
} from '../interfaces/ai-assistant.interface';
import { ReadOnlyDataSourceService } from './read-only-datasource.service';

/**
 * Introspects PostgreSQL and builds a compact, LLM-friendly "semantic layer"
 * describing the ERP schema: tables, columns, foreign-key join paths, the
 * division dictionary (SPT / PL / City-CT …) and the department dictionary.
 *
 * Two properties make Text-to-SQL accurate on a 150-table ERP:
 *   1. DOMAIN GROUPING — tables are bucketed into business domains (sales,
 *      production, inventory, hr, finance, …) so the model reaches for the
 *      right table first.
 *   2. SENSITIVE TABLE DENY-LIST — auth/user/permission/audit tables are not
 *      exposed to the LLM at all: it cannot generate SQL for tables it never
 *      sees, and the SQL guard independently rejects anything outside the
 *      allow-list.
 *
 * The catalog is cached in-memory (AI_SCHEMA_CACHE_TTL_MS) and can be
 * force-refreshed, so introspection runs once per TTL instead of per question.
 */

/** Tables the AI must never see or query (auth, access control, privacy). */
const SENSITIVE_TABLES = new Set([
  'erp_users',
  'user_roles',
  'user_organization_scopes',
  'roles',
  'role_permissions',
  'role_permission_division_scopes',
  'permissions',
  'activity_logs',
  'notifications',
  'notification_recipients',
  'visitor_entries',
  'visitor_locations',
  'locations',
  'migrations',
  'typeorm_metadata',
]);

/** Prefix-based sensitive rules (covers future notification_* style tables). */
const SENSITIVE_PREFIXES = ['notification_', 'schema_migrations'];

/** Hard caps keep the prompt small enough for fast, cheap inference. */
const MAX_TABLES = 140;
const MAX_COLUMNS_PER_TABLE = 45;
const MAX_FKS_PER_TABLE = 12;
const MAX_DEPARTMENTS = 250;

/** Business-domain bucketing by table-name prefix (most-specific match wins). */
const DOMAIN_RULES: Array<{ prefix: string; domain: string }> = [
  { prefix: 'sales_', domain: 'sales' },
  { prefix: 'customer', domain: 'sales' },
  { prefix: 'dispatch', domain: 'sales' },
  { prefix: 'stock_', domain: 'inventory' },
  { prefix: 'inventory_', domain: 'inventory' },
  { prefix: 'batch', domain: 'inventory' },
  { prefix: 'serial_', domain: 'inventory' },
  { prefix: 'raw_material_', domain: 'inventory' },
  { prefix: 'production', domain: 'production' },
  { prefix: 'machine', domain: 'production' },
  { prefix: 'routing', domain: 'production' },
  { prefix: 'bom', domain: 'production' },
  { prefix: 'operation', domain: 'production' },
  { prefix: 'purchase_', domain: 'procurement' },
  { prefix: 'supplier', domain: 'procurement' },
  { prefix: 'goods_', domain: 'procurement' },
  { prefix: 'quotation', domain: 'procurement' },
  { prefix: 'request_for', domain: 'procurement' },
  { prefix: 'rfq', domain: 'procurement' },
  { prefix: 'finance_', domain: 'finance' },
  { prefix: 'hr_', domain: 'hr' },
  { prefix: 'item', domain: 'items' },
  { prefix: 'uom', domain: 'items' },
  { prefix: 'store', domain: 'store' },
  { prefix: 'material_', domain: 'store' },
  { prefix: 'qc_', domain: 'quality' },
  { prefix: 'inspection', domain: 'quality' },
  { prefix: 'maintenance_', domain: 'maintenance' },
  { prefix: 'company', domain: 'organization' },
  { prefix: 'branch', domain: 'organization' },
  { prefix: 'division', domain: 'organization' },
  { prefix: 'section', domain: 'organization' },
  { prefix: 'department', domain: 'organization' },
  { prefix: 'warehouse', domain: 'organization' },
  { prefix: 'business_unit', domain: 'organization' },
  { prefix: 'tool', domain: 'tooling' },
];

function domainOf(tableName: string): string {
  for (const rule of DOMAIN_RULES) {
    if (tableName.startsWith(rule.prefix)) return rule.domain;
  }
  return 'other';
}

function isSensitive(tableName: string): boolean {
  if (SENSITIVE_TABLES.has(tableName)) return true;
  return SENSITIVE_PREFIXES.some((p) => tableName.startsWith(p));
}

/** Compress `character varying` → `varchar`, `timestamp without time zone` → `timestamp`. */
function shortType(type: string): string {
  switch (type) {
    case 'character varying':
      return 'varchar';
    case 'timestamp without time zone':
      return 'timestamp';
    case 'timestamp with time zone':
      return 'timestamptz';
    case 'double precision':
      return 'float';
    case 'boolean':
      return 'bool';
    case 'integer':
      return 'int';
    case 'jsonb':
    case 'json':
      return type;
    default:
      return type.length > 22 ? type.slice(0, 20) + '~' : type;
  }
}

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  ordinal_position: number;
}

interface ForeignKeyRow {
  table_name: string;
  column_name: string;
  ref_table: string;
  ref_column: string;
}

interface DivisionRow {
  id: string;
  division_code: string;
  name: string;
}

interface DepartmentRow {
  id: string;
  name: string;
  division_id: string | null;
}

@Injectable()
export class SchemaCatalogService {
  private readonly logger = new Logger(SchemaCatalogService.name);
  private readonly cfg = aiConfig(this.config);
  private cache: SchemaCatalog | null = null;
  private cacheAt = 0;
  /** In-flight introspection dedupe (concurrent requests share one refresh). */
  private refreshing: Promise<SchemaCatalog> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly db: ReadOnlyDataSourceService,
  ) {}

  /** Cached catalog; first call introspects the database. */
  async getCatalog(options: { force?: boolean } = {}): Promise<SchemaCatalog> {
    const now = Date.now();
    if (!options.force && this.cache && now - this.cacheAt < this.cfg.query.schemaCacheTtlMs) {
      return this.cache;
    }
    if (this.refreshing) return this.refreshing;

    this.refreshing = this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<SchemaCatalog> {
    const schema = this.cfg.db.schema;

    const columnResult = await this.db.runSelect<ColumnRow>(
      `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.ordinal_position
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = $1 AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name, c.ordinal_position`,
      { params: [schema], maxRows: 20_000 },
    );
    if (!columnResult.ok) {
      this.logger.warn(`Schema introspection failed: ${columnResult.error}`);
      // Serve a stale catalog when possible; otherwise fail with the driver error.
      if (this.cache) return this.cache;
      throw new Error(columnResult.error);
    }

    const fkResult = await this.db.runSelect<ForeignKeyRow>(
      `SELECT tc.table_name, kcu.column_name,
              ccu.table_name AS ref_table, ccu.column_name AS ref_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1`,
      { params: [schema], maxRows: 5_000 },
    );

    const divisionResult = await this.db.runSelect<DivisionRow>(
      `SELECT id, division_code, name FROM divisions ORDER BY name ASC`,
      { maxRows: 100 },
    );

    const departmentResult = await this.db.runSelect<DepartmentRow>(
      `SELECT id, name, division_id FROM departments ORDER BY name ASC LIMIT ${MAX_DEPARTMENTS}`,
      { maxRows: MAX_DEPARTMENTS },
    );

    // ── assemble tables ──
    const tableMap = new Map<string, CatalogTable>();
    for (const row of columnResult.rows) {
      if (isSensitive(row.table_name)) continue;
      let table = tableMap.get(row.table_name);
      if (!table) {
        if (tableMap.size >= MAX_TABLES) continue;
        table = {
          name: row.table_name,
          domain: domainOf(row.table_name),
          columns: [],
          foreignKeys: [],
          divisionScoped: false,
        };
        tableMap.set(row.table_name, table);
      }
      if (table.columns.length < MAX_COLUMNS_PER_TABLE) {
        const column: CatalogColumn = {
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
        };
        table.columns.push(column);
        if (row.column_name === 'division_id') table.divisionScoped = true;
      }
    }

    if (fkResult.ok) {
      for (const fk of fkResult.rows) {
        const table = tableMap.get(fk.table_name);
        if (!table || table.foreignKeys.length >= MAX_FKS_PER_TABLE) continue;
        // Only surface joins into tables the LLM can actually see.
        if (isSensitive(fk.ref_table) && fk.ref_table !== 'divisions') continue;
        table.foreignKeys.push({
          column: fk.column_name,
          refTable: fk.ref_table,
          refColumn: fk.ref_column,
        } as CatalogForeignKey);
      }
    }

    const catalog: SchemaCatalog = {
      tables: [...tableMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      divisions: divisionResult.ok ? divisionResult.rows.map((d) => ({
        id: d.id,
        code: d.division_code,
        name: d.name,
      })) : [],
      departments: departmentResult.ok ? departmentResult.rows.map((d) => ({
        id: d.id,
        name: d.name,
        divisionId: d.division_id,
      })) : [],
      schema,
      generatedAt: new Date().toISOString(),
    };

    this.cache = catalog;
    this.cacheAt = Date.now();
    this.logger.log(
      `Schema catalog refreshed: ${catalog.tables.length} tables, ` +
        `${catalog.divisions.length} divisions, ${catalog.departments.length} departments`,
    );
    return catalog;
  }

  /** Division dictionary restricted to what the caller may see (`undefined` = all). */
  visibleDivisions(catalog: SchemaCatalog, allowedDivisionIds?: string[]): CatalogDivision[] {
    if (!allowedDivisionIds) return catalog.divisions;
    const allowed = new Set(allowedDivisionIds);
    return catalog.divisions.filter((d) => allowed.has(d.id));
  }

  /** Compact schema rendering for the LLM prompt (tables + FK join paths). */
  renderSchemaPrompt(catalog: SchemaCatalog): string {
    const lines: string[] = [`# ERP SCHEMA (postgres schema: ${catalog.schema}) — ${catalog.tables.length} tables`];

    const byDomain = new Map<string, CatalogTable[]>();
    for (const table of catalog.tables) {
      const bucket = byDomain.get(table.domain) ?? [];
      bucket.push(table);
      byDomain.set(table.domain, bucket);
    }

    for (const [domain, tables] of [...byDomain.entries()].sort()) {
      lines.push(`\n## domain: ${domain}`);
      for (const table of tables) {
        const scopedTag = table.divisionScoped ? '  [DIVISION-SCOPED: has division_id]' : '';
        lines.push(`\n${table.name}${scopedTag}`);
        lines.push(
          `  cols: ${table.columns
            .map((c) => `${c.name}:${shortType(c.type)}${c.nullable ? '?' : ''}`)
            .join(', ')}`,
        );
        for (const fk of table.foreignKeys) {
          lines.push(`  join ${table.name}.${fk.column} → ${fk.refTable}.${fk.refColumn}`);
        }
      }
    }

    return lines.join('\n');
  }

  /** Division dictionary for the prompt, already narrowed to the caller's scope. */
  renderDivisionsPrompt(catalog: SchemaCatalog, allowedDivisionIds?: string[]): string {
    const divisions = this.visibleDivisions(catalog, allowedDivisionIds);
    if (divisions.length === 0) return '(no divisions visible to this user)';
    return divisions.map((d) => `- ${d.code} | ${d.name} | id=${d.id}`).join('\n');
  }

  /** Department dictionary for the prompt, already narrowed to the caller's scope. */
  renderDepartmentsPrompt(catalog: SchemaCatalog, allowedDivisionIds?: string[]): string {
    const allowed = allowedDivisionIds ? new Set(allowedDivisionIds) : null;
    const depts = allowed
      ? catalog.departments.filter((d) => !d.divisionId || allowed.has(d.divisionId))
      : catalog.departments;
    if (depts.length === 0) return '(no departments configured)';
    return depts
      .slice(0, 100)
      .map((d) => `- ${d.name} | id=${d.id}${d.divisionId ? ` | division_id=${d.divisionId}` : ''}`)
      .join('\n');
  }
}
