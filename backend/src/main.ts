import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as path from 'path';
import * as net from 'net';
import * as https from 'https';
import express, { json, urlencoded } from 'express';

function checkTcpReachable(host: string, port: number, timeoutMs = 3500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function startCloudFallbackGateway(port: number | string) {
  const remoteOrigin = process.env.REMOTE_API_ORIGIN || 'https://erp-mrp-pwi-2026.onrender.com';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const isProduction = process.env.NODE_ENV === 'production';
  const lanFrontendPattern =
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(3000|4174)$/;
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || origin === frontendUrl || (!isProduction && lanFrontendPattern.test(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        req.headers['access-control-request-headers'] || 'Content-Type, Authorization, X-Requested-With, Accept',
      );
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      mode: 'cloud-gateway',
      upstream: `${remoteOrigin}/api/v1`,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/inventory/receipts/material-balances', (_req, res) => {
    res.status(200).json({ success: true, data: {} });
  });

  app.get('/api/docs', (_req, res) => {
    res.status(200).send(
      '<!DOCTYPE html><html><head><title>ERP System API Docs</title></head><body><h1>ERP System API Documentation</h1></body></html>',
    );
  });

  app.use((req, res) => {
    const targetUrl = new URL(req.originalUrl || req.url, remoteOrigin);
    console.log(`[GATEWAY ->] ${req.method} ${targetUrl.pathname}`);
    const headers: Record<string, string | string[]> = {};
    Object.entries(req.headers).forEach(([k, v]) => {
      const lower = k.toLowerCase();
      if (lower === 'host' || lower === 'connection' || lower === 'content-length' || v === undefined) return;
      headers[k] = v;
    });
    headers['host'] = targetUrl.host;

    const proxyReq = https.request(
      targetUrl,
      {
        method: req.method,
        headers,
        timeout: 60000,
      },
      (proxyRes) => {
        console.log(`[GATEWAY <-] ${req.method} ${targetUrl.pathname} status ${proxyRes.statusCode}`);
        res.status(proxyRes.statusCode || 502);
        Object.entries(proxyRes.headers).forEach(([k, v]) => {
          const lower = k.toLowerCase();
          if (
            lower === 'access-control-allow-origin' ||
            lower === 'access-control-allow-credentials' ||
            lower === 'access-control-allow-methods' ||
            lower === 'access-control-allow-headers' ||
            lower === 'transfer-encoding' ||
            v === undefined
          ) {
            return;
          }
          res.setHeader(k, v);
        });
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ message: 'Upstream API gateway error', error: err.message });
      }
    });

    if (req.method === 'GET' || req.method === 'HEAD' || (req.method === 'DELETE' && !req.headers['content-length'])) {
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  });

  await new Promise<void>((resolve) => {
    app.listen(Number(port), '0.0.0.0', () => resolve());
  });
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`API Documentation: http://localhost:${port}/api/docs`);
}

async function bootstrap() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = Number(process.env.DB_PORT || 5432);
  if (process.env.NODE_ENV !== 'production') {
    const dbReachable = await checkTcpReachable(dbHost, dbPort, 3500);
    if (!dbReachable) {
      const fallbackPort = process.env.PORT || 3001;
      console.warn(
        `[DB] Direct TCP to ${dbHost}:${dbPort} is blocked on this network — starting local HTTPS gateway on port ${fallbackPort} -> https://erp-mrp-pwi-2026.onrender.com/api/v1`,
      );
      await startCloudFallbackGateway(fallbackPort);
      return;
    }
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Increase payload limit for base64 audio/voice queries and bulk uploads to prevent 413 Payload Too Large
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Serve uploaded profile avatars (STORAGE_PATH/avatars) at /uploads/...
  const storagePath = process.env.STORAGE_PATH || './storage';
  app.useStaticAssets(path.resolve(storagePath), {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days client cache
    immutable: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS: production accepts only the explicitly configured frontend origin.
  // Private-network development origins are allowed only outside production.
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const isProduction = process.env.NODE_ENV === 'production';
  const lanFrontendPattern =
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(3000|4174)$/;
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || origin === frontendUrl || (!isProduction && lanFrontendPattern.test(origin))) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Do not expose the full API inventory in production unless deliberately enabled.
  if (!isProduction || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('ERP System API')
      .setDescription('Manufacturing ERP System API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`API Documentation: http://localhost:${port}/api/docs`);
}
bootstrap();
