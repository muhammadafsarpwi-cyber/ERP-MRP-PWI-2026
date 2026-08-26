import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const sslEnabled = configService.get<string>('DB_SSL', 'false') === 'true';
  const sslServername = configService.get<string>('DB_SSL_SERVERNAME', '');
  const rejectUnauthorized = configService.get<string>('DB_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false';

  const sslConfig = sslEnabled
    ? { rejectUnauthorized, servername: sslServername || undefined }
    : false;

  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: configService.get<number>('DB_PORT', 5432),
    username: configService.get<string>('DB_USERNAME', 'postgres'),
    password: configService.get<string>('DB_PASSWORD', 'postgres'),
    database: configService.get<string>('DB_DATABASE', 'erp_database'),
    schema: configService.get<string>('DB_SCHEMA', 'public'),
    entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
    synchronize: configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
    logging: configService.get<string>('DB_LOGGING', 'false') === 'true',
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    connectTimeoutMS: 30000,
    retryAttempts: 5,
    retryDelay: 2000,
    keepConnectionAlive: true,
    extra: {
      ssl: sslConfig,
      max: 10,
      idleTimeoutMillis: 30000,
    },
  };
};
