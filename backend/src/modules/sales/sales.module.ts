import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SalesCustomer,
  SalesQuotation, SalesQuotationItem,
  SalesOrder, SalesOrderItem,
  SalesDelivery, SalesDeliveryLine,
  SalesInvoice,
  SalesReturn, SalesReturnLine,
} from './entities';
import { SalesQuotationService } from './services/sales-quotation.service';
import { SalesOrderService } from './services/sales-order.service';
import { SalesDeliveryService } from './services/sales-delivery.service';
import { SalesInvoiceService } from './services/sales-invoice.service';
import { SalesReturnService } from './services/sales-return.service';
import { SalesQuotationController } from './controllers/sales-quotation.controller';
import { SalesOrderController } from './controllers/sales-order.controller';
import { SalesDeliveryController } from './controllers/sales-delivery.controller';
import { SalesInvoiceController } from './controllers/sales-invoice.controller';
import { SalesReturnController } from './controllers/sales-return.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesCustomer,
      SalesQuotation, SalesQuotationItem,
      SalesOrder, SalesOrderItem,
      SalesDelivery, SalesDeliveryLine,
      SalesInvoice,
      SalesReturn, SalesReturnLine,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => InventoryModule),
    NotificationsModule,
  ],
  controllers: [
    SalesQuotationController,
    SalesOrderController,
    SalesDeliveryController,
    SalesInvoiceController,
    SalesReturnController,
  ],
  providers: [
    SalesQuotationService,
    SalesOrderService,
    SalesDeliveryService,
    SalesInvoiceService,
    SalesReturnService,
  ],
  exports: [
    SalesQuotationService,
    SalesOrderService,
    SalesDeliveryService,
    SalesInvoiceService,
    SalesReturnService,
  ],
})
export class SalesModule {}
