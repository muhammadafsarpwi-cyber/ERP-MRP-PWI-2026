import { Injectable } from '@nestjs/common';
import * as net from 'net';

@Injectable()
export class AppService {
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

  async getStatus() {
    const dbStatus = await this.checkDatabase();
    return {
      frontend: { status: 'ok' },
      backend: { status: 'ok' },
      database: dbStatus,
      supabase: { status: 'configured', url: process.env.SUPABASE_URL ? 'configured' : 'not configured' },
      timestamp: new Date().toISOString(),
    };
  }

  private checkDatabase(): Promise<{ status: string; host?: string; port?: number }> {
    return new Promise((resolve) => {
      const host = process.env.DB_HOST || 'localhost';
      const port = parseInt(process.env.DB_PORT || '5432', 10);
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ status: 'unreachable', host, port });
      }, 3000);
      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ status: 'connected', host, port });
      });
      socket.on('error', () => {
        clearTimeout(timer);
        resolve({ status: 'unreachable', host, port });
      });
    });
  }
}
