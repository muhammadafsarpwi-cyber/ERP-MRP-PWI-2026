import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { aiReadonlyDataSourceOptions } from '../../../config/ai-datasource.config';
import { QueryExecutionResult } from '../interfaces/ai-assistant.interface';

export interface RunSelectOptions {
  timeoutMs?: number;
  maxRows?: number;
  params?: unknown[];
}

/**
 * READ-ONLY TypeORM DataSource runner — the ONLY database access path the AI
 * assistant is allowed to use.
 *
 * This wraps the secondary `ai-readonly` DataSource (see
 * src/config/ai-datasource.config.ts), which authenticates as the unprivileged
 * `erp_ai_reader` role. Every execution is additionally fenced in-process:
 *
 *   BEGIN TRANSACTION READ ONLY      ← PostgreSQL rejects any write, even for
 *   SET LOCAL statement_timeout=…      a hypothetical privilege escalation
 *   <generated SELECT>
 *   COMMIT / ROLLBACK
 *
 * ── Why lazy initialisation? ────────────────────────────────────────────────
 * If the `erp_ai_reader` role has not been provisioned yet (fresh clone,
 * migration pending), a eagerly-registered second DataSource would crash
 * NestJS bootstrap and take the whole ERP offline. Instead the DataSource is
 * created on first use; failures surface as an actionable 503 ONLY on the AI
 * endpoints, exactly like the app's existing offline-mode convention.
 */
@Injectable()
export class ReadOnlyDataSourceService implements OnModuleDestroy {
  private readonly logger = new Logger(ReadOnlyDataSourceService.name);
  private dataSource: DataSource | null = null;
  private initializing: Promise<DataSource> | null = null;
  private initFailure: Error | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Lazily create + initialise the read-only DataSource (deduped). */
  private async acquire(): Promise<DataSource> {
    if (this.dataSource?.isInitialized) return this.dataSource;
    if (this.initFailure) throw this.initFailure;

    if (!this.initializing) {
      const options = aiReadonlyDataSourceOptions(this.config);
      this.initializing = new DataSource(options)
        .initialize()
        .then((ds) => {
          this.dataSource = ds;
          // Structural narrowing (avoids a deep typeorm/* import that breaks
          // ts-jest module resolution): the options are always postgres here.
          const pg = options as unknown as { username?: string; host?: string; port?: number; database?: string };
          this.logger.log(
            `AI read-only DataSource [${options.name}] connected → ` +
              `${pg.username}@${pg.host}:${pg.port}/${pg.database}`,
          );
          return ds;
        })
        .catch((err: Error) => {
          this.initializing = null; // allow retry after the role is provisioned
          this.initFailure = err;
          this.logger.error(`AI read-only DataSource failed to connect: ${err.message}`);
          throw err;
        });
    }
    return this.initializing;
  }

  /**
   * Execute a single guarded SELECT inside a READ-ONLY transaction with a hard
   * statement timeout and an application-side row cap.
   *
   * NEVER throws — failures are returned as `{ ok: false }` so the orchestrator
   * can feed the error back to the LLM for self-repair.
   */
  async runSelect<T = Record<string, unknown>>(
    sql: string,
    options: RunSelectOptions = {},
  ): Promise<QueryExecutionResult<T>> {
    const timeoutMs = Math.max(1_000, Math.floor(options.timeoutMs ?? 15_000));
    const maxRows = Math.max(1, Math.floor(options.maxRows ?? 500));

    let queryRunner: QueryRunner | null = null;
    try {
      const dataSource = await this.acquire();
      queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();

      // Defense in depth: even though the role/pool is read-only at session
      // level, re-assert it per transaction. The timeout value is Math.floor-ed
      // above, so this interpolation is not an injection vector.
      await queryRunner.query('BEGIN TRANSACTION READ ONLY');
      await queryRunner.query(`SET LOCAL statement_timeout = ${timeoutMs}`);

      const rows = (await queryRunner.query(sql, options.params)) as T[];

      await queryRunner.query('COMMIT');

      const truncated = rows.length > maxRows;
      return {
        ok: true,
        rows: truncated ? rows.slice(0, maxRows) : rows,
        columns: rows[0] ? Object.keys(rows[0] as object) : [],
        rowCount: rows.length,
        truncated,
      };
    } catch (err) {
      if (queryRunner) {
        try {
          await queryRunner.query('ROLLBACK');
        } catch {
          /* connection already broken; TypeORM discards it */
        }
      }
      this.initFailure = null; // transient failures may recover
      this.logger.warn(`AI read-only query failed: ${(err as Error)?.message}`);
      return { ok: false, error: this.humanizeError(err), code: (err as { code?: string })?.code };
    } finally {
      await queryRunner?.release();
    }
  }

  /** Cheap readiness probe. Never throws. */
  async probe(): Promise<{ ready: boolean; detail: string }> {
    try {
      const result = await this.runSelect('SELECT 1 AS ok', { maxRows: 1, timeoutMs: 5_000 });
      return result.ok
        ? { ready: true, detail: 'read-only DataSource connected' }
        : { ready: false, detail: result.error };
    } catch (err) {
      return { ready: false, detail: (err as Error)?.message ?? String(err) };
    }
  }

  /** Guard used before any AI work: actionable 503 when the role is missing. */
  async ensureReady(): Promise<void> {
    const probe = await this.probe();
    if (probe.ready) return;
    throw new ServiceUnavailableException({
      success: false,
      error: {
        code: 'AI_DB_UNAVAILABLE',
        message: `The AI assistant's read-only database connection is unavailable: ${probe.detail}`,
        details:
          'Run supabase/migrations/20261015000000_erp_00073_ai_assistant.sql to create the ' +
          "'erp_ai_reader' role, then set AI_DB_USERNAME / AI_DB_PASSWORD in backend/.env.",
      },
    });
  }

  /** Translate cryptic PostgreSQL/Node error codes into operator-friendly text. */
  private humanizeError(err: unknown): string {
    const error = err as { message?: string; code?: string };
    switch (error?.code) {
      case '42501':
        return 'Permission denied: the AI role lacks SELECT on this table (add it to migration erp_00073, section 4).';
      case '25P02':
        return 'In failed transaction state (the read-only guard rejected a write attempt).';
      case '28P01':
        return 'Authentication failed for the AI read-only role (check AI_DB_USERNAME / AI_DB_PASSWORD).';
      case '3D000':
        return 'Database does not exist for the AI read-only role (check DB_DATABASE).';
      case '57014':
        return 'Query cancelled: the statement exceeded AI_QUERY_TIMEOUT_MS. Narrow the date range or add filters.';
      case '25006':
        return 'Write attempted inside a read-only transaction — blocked by the database.';
      case '42P01':
        return 'Referenced table does not exist (the generated SQL used an unknown table).';
      case '42703':
        return 'Referenced column does not exist (the generated SQL used an unknown column).';
      case 'ECONNREFUSED':
      case 'ENOTFOUND':
      case 'ETIMEDOUT':
        return 'Cannot reach PostgreSQL (check DB_HOST / DB_PORT).';
      default:
        return error?.message ?? String(err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
    this.dataSource = null;
    this.initializing = null;
  }
}
