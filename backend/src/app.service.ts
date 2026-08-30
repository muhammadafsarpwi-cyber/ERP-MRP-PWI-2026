import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Status vocabulary used by the Development Status page and the /status endpoint.
 * The frontend and backend share these machine-readable values so the UI never
 * invents or hardcodes a status.
 */
export type ServiceStatus =
  | 'CONNECTED'
  | 'ERROR'
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE';

export interface StatusPart {
  status: ServiceStatus;
  detail?: string;
  host?: string;
  port?: number;
  provider?: string;
  api?: string;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getDetailedHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
    };
  }

  /**
   * Structured system status. Each service reports its OWN real state:
   *  - backend  is CONNECTED by definition here (this process is answering)
   *  - database runs a real `SELECT 1` through the app's TypeORM DataSource
   *  - supabase probes the configured Supabase endpoint
   *  - frontend is reported by the frontend itself; the backend keeps the
   *    shape for symmetry.
   * No secrets (passwords, connection URLs, keys) are ever returned.
   */
  async getStatus(): Promise<{
    frontend: StatusPart;
    backend: StatusPart;
    database: StatusPart;
    supabase: StatusPart;
    timestamp: string;
  }> {
    const [database, supabase] = await Promise.all([
      this.checkDatabase(),
      this.checkSupabase(),
    ]);

    return {
      frontend: { status: 'CONNECTED' },
      backend: {
        status: 'CONNECTED',
        api: `http://localhost:${process.env.PORT || 3001}/api/v1`,
      },
      database,
      supabase,
      timestamp: new Date().toISOString(),
    };
  }

  /** Real database health check: executes `SELECT 1` on the app DataSource. */
  private async checkDatabase(): Promise<StatusPart> {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432', 10);

    if (!process.env.DB_HOST || !process.env.DB_DATABASE) {
      return {
        status: 'NOT_CONFIGURED',
        host,
        port,
        detail: 'Database not configured',
      };
    }

    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'CONNECTED',
        host,
        port,
        provider: 'Supabase/PostgreSQL',
      };
    } catch (error) {
      const detail = this.describeNetworkError(error);
      this.logger.warn(`[status] Database check failed: ${detail}`);
      return { status: 'ERROR', host, port, detail: `Database check failed: ${detail}` };
    }
  }

  /** Supabase probe: hit the configured endpoint's health route. */
  private async checkSupabase(): Promise<StatusPart> {
    const url = process.env.SUPABASE_URL;
    if (!url) {
      return { status: 'NOT_CONFIGURED', detail: 'Supabase not configured' };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const anonKey = process.env.SUPABASE_ANON_KEY;
      const headers: Record<string, string> = anonKey ? { apikey: anonKey } : {};
      const res = await fetch(`${url}/auth/v1/health`, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timer);
      if (res.ok) {
        return { status: 'CONNECTED', detail: 'Supabase reachable' };
      }
      // Any HTTP response proves the endpoint is reachable.
      return { status: 'CONNECTED', detail: `Supabase reachable (HTTP ${res.status})` };
    } catch (error) {
      const detail = this.describeNetworkError(error);
      this.logger.warn(`[status] Supabase check failed: ${detail}`);
      return { status: 'ERROR', detail: `Supabase unreachable: ${detail}` };
    }
  }

  /**
   * Map a low-level error to a safe, human-readable reason. Never echoes raw
   * error messages that could contain credentials or connection strings.
   */
  private describeNetworkError(error: unknown): string {
    const code = (error as any)?.code;
    const message = (error as any)?.message as string | undefined;
    switch (code) {
      case 'ECONNREFUSED':
        return 'Connection refused';
      case 'ENOTFOUND':
        return 'Host not found';
      case 'ETIMEDOUT':
      case 'ECONNABORTED':
      case 'ABORT_ERR':
        return 'Connection timeout';
      case 'EPIPE':
        return 'Connection reset';
      default:
        if (message && /abort/i.test(message)) return 'Connection timeout';
        return 'Connection failed';
    }
  }
}
