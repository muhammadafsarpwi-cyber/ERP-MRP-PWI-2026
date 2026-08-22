import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database.config';
import { OrganizationModule } from './modules/organization/organization.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { RoleModule } from './modules/role/role.module';
import { PermissionModule } from './modules/permission/permission.module';
import { ItemModule } from './modules/item/item.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { CustomerModule } from './modules/customer/customer.module';
import { SalesModule } from './modules/sales/sales.module';
import { BomModule } from './modules/bom/bom.module';
import { ProductionRoutingModule } from './modules/production-routing/production-routing.module';
import { ProductionModule } from './modules/production/production.module';
import { MachineModule } from './modules/machine/machine.module';
import * as net from 'net';

function isDatabaseAvailable(host: string, port: number, timeout = 3000): Promise<boolean> {
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

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database - TypeORM with graceful degradation when DB unavailable
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const dbHost = configService.get<string>('DB_HOST', 'localhost');
        const dbPort = configService.get<number>('DB_PORT', 5432);

        const available = await isDatabaseAvailable(dbHost, dbPort, 10000);
        if (!available) {
          console.warn(`[DB] PostgreSQL not reachable at ${dbHost}:${dbPort} - starting in offline mode`);
        }

        const config = databaseConfig(configService);
        return {
          ...config,
          autoLoadEntities: true,
        };
      },
    }),

    // Modules
    OrganizationModule,
    AuthModule,
    UserModule,
    RoleModule,
    PermissionModule,
    ItemModule,
    InventoryModule,
    ProcurementModule,
    CustomerModule,
    SalesModule,
    BomModule,
    ProductionRoutingModule,
    ProductionModule,
    MachineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
