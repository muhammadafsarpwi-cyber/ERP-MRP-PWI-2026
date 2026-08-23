import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerContact, CustomerAddress } from './entities';
import { CustomerService } from './services/customer.service';
import { CustomerController } from './controllers/customer.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { NotificationsModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerContact, CustomerAddress]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    NotificationsModule,
  ],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}