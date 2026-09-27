import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerContact, CustomerAddress, CustomerLedgerEntry } from './entities';
import { CustomerService } from './services/customer.service';
import { CustomerLedgerService } from './services/customer-ledger.service';
import { CustomerDemoSeederService } from './services/customer-demo-seeder.service';
import { CustomerController } from './controllers/customer.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { NotificationsModule } from '../notification/notification.module';
import { BarcodeModule } from '../barcode/barcode.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerContact, CustomerAddress, CustomerLedgerEntry]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    NotificationsModule,
    forwardRef(() => BarcodeModule),
  ],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerLedgerService, CustomerDemoSeederService],
  exports: [CustomerService, CustomerLedgerService, CustomerDemoSeederService],
})
export class CustomerModule {}