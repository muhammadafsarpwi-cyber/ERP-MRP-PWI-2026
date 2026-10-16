import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

/**
 * SECONDARY, INDEPENDENT TypeORM connection for the AI assistant.
 *
 * The primary DataSource (src/config/database.config.ts) authenticates as a
 * privileged user (postgres) because migrations and CRUD need write access.
 * AI-generated SQL must NEVER run on that connection — so this factory builds
 * a completely separate TypeORM DataSource that authenticates as the dedicated
 * read-only role created by migration `erp_00073`:
 *
 *   erp_ai_reader  →  SELECT-only grants
 *                     default_transaction_read_only = on  (DB-enforced)
 *                     statement_timeout = 15s / lock_timeout = 3s
 *                     NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
 *
 * Both layers are wired independently:
 *   • session layer: `options: '-c default_transaction_read_only=on'` +
 *     `statement_timeout` in `extra` (applied by pg to every pooled connection)
 *   • statement layer: the runner service issues `SET LOCAL statement_timeout`
 *     inside a `READ ONLY` transaction per query (see
 *     services/read-only-datasource.service.ts)
 *
 * No entities/migrations are attached: this connection can only ever run raw
 * SQL issued by the guarded Text-to-SQL pipeline.
 */
export const AI_READONLY_DATASOURCE_NAME = 'ai-readonly';

export const aiReadonlyDataSourceOptions = (configService: ConfigService): DataSourceOptions => {
  const sslEnabled = configService.get<string>('DB_SSL', 'false') === 'true';
  const sslServername = configService.get<string>('DB_SSL_SERVERNAME', '');
  const rejectUnauthorized =
    configService.get<string>('DB_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false';

  const sslConfig = sslEnabled
    ? { rejectUnauthorized, servername: sslServername || undefined }
    : false;

  return {
    name: AI_READONLY_DATASOURCE_NAME,
    type: 'postgres',
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: Number(configService.get<string>('DB_PORT', '5432')),
    // ── the whole point: a DIFFERENT, unprivileged identity ─────────────────
    username: configService.get<string>('AI_DB_USERNAME', 'erp_ai_reader'),
    password: configService.get<string>('AI_DB_PASSWORD', 'ChangeMe_AiReader_Str0ng!'),
    database: configService.get<string>('DB_DATABASE', 'erp_database'),
    schema: configService.get<string>('DB_SCHEMA', 'public'),
    // Raw-SQL only connection: no entities, no migrations, never synchronize.
    entities: [],
    migrations: [],
    synchronize: false,
    migrationsRun: false,
    logging: configService.get<string>('AI_DB_LOGGING', 'false') === 'true',
    // Keep this pool deliberately small — it exists only for AI queries.
    extra: {
      max: Number(configService.get<string>('AI_DB_POOL_MAX', '4')),
      connectTimeout: Number(configService.get<string>('AI_DB_CONNECT_TIMEOUT_MS', '10000')),
      idleTimeoutMillis: 30_000,
      application_name: 'erp-ai-assistant-readonly',
      ssl: sslConfig,
      // Session-level guardrails applied by pg to EVERY connection this
      // DataSource opens — even before any statement runs:
      statement_timeout: Number(configService.get<string>('AI_QUERY_TIMEOUT_MS', '15000')),
      options: `-c search_path=${configService.get<string>('DB_SCHEMA', 'public')} -c default_transaction_read_only=on`,
    },
  };
};
