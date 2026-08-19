import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { OfflineModule } from './offline.module';
import * as net from 'net';

function checkDatabase(host: string, port: number, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);
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

async function bootstrap() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);

  const dbAvailable = await checkDatabase(dbHost, dbPort, 10000);

  let app: any;

  if (dbAvailable) {
    console.log(`[DB] PostgreSQL reachable at ${dbHost}:${dbPort}`);
    app = await NestFactory.create(AppModule);
    console.log('[DB] Database connection established');
  } else {
    console.warn(`[DB] PostgreSQL not reachable at ${dbHost}:${dbPort} - starting in offline mode`);
    app = await NestFactory.create(OfflineModule);
  }

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('ERP System API')
    .setDescription('Manufacturing ERP System API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('health', 'Health and status endpoints')
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('products', 'Product management')
    .addTag('customers', 'Customer management')
    .addTag('sales', 'Sales management')
    .addTag('inventory', 'Inventory management')
    .addTag('production', 'Production management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`API Documentation: http://localhost:${port}/api/docs`);
  console.log(`Database status: ${dbAvailable ? 'CONNECTED' : 'OFFLINE'}`);
}
bootstrap();
