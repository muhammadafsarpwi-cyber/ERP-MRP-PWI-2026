import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchPackage } from './entities/dispatch-package.entity';
import { DispatchPackageUnit } from './entities/dispatch-package-unit.entity';
import { DispatchPackageAuditLog } from './entities/dispatch-package-audit.entity';
import { ProductionUnit } from '../production/entities/production-unit.entity';
import { SalesDelivery } from '../sales/entities/sales-delivery.entity';
import { DispatchPackageService } from './services/dispatch-package.service';
import { DispatchPackageController } from './controllers/dispatch-package.controller';

import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DispatchPackage,
      DispatchPackageUnit,
      DispatchPackageAuditLog,
      ProductionUnit,
      SalesDelivery,
    ]),
    AuthModule,
    PermissionModule,
    UserModule,
  ],
  controllers: [DispatchPackageController],
  providers: [DispatchPackageService],
  exports: [DispatchPackageService],
})
export class DispatchModule {}
