import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as path from 'path';
import { json, urlencoded } from 'express';

async function bootstrap() {
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
      forbidNonWhitelisted: true,
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
