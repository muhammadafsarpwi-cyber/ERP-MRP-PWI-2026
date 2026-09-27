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
import { FinanceModule } from '../finance/finance.module';

import { ProductionOrder } from '../production/entities/production-order.entity';
import { CustomerLedgerEntry } from '../customer/entities/customer-ledger.entity';
import { InventoryBalance } from '../inventory/entities/inventory-balance.entity';
import { StockLedger, InventoryPolicy } from '../inventory/entities';
import { Warehouse } from '../organization/entities/warehouse.entity';
import { Item } from '../item/entities/item.entity';
import { Customer } from '../customer/entities/customer.entity';
import { CustomerModule } from '../customer/customer.module';
import { ProductionModule } from '../production/production.module';
import { SalesAnalyticsService } from './services/sales-analytics.service';
import { SalesAnalyticsController } from './controllers/sales-analytics.controller';
import { FinishedGoodsInventoryService } from './services/finished-goods-inventory.service';
import { FinishedGoodsInventoryController } from './controllers/finished-goods-inventory.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesCustomer,
      SalesQuotation, SalesQuotationItem,
      SalesOrder, SalesOrderItem,
      SalesDelivery, SalesDeliveryLine,
      SalesInvoice,
      SalesReturn, SalesReturnLine,
      ProductionOrder,
      CustomerLedgerEntry,
      InventoryBalance,
      InventoryPolicy,
      StockLedger,
      Item,
      Customer,
      Warehouse,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => InventoryModule),
    NotificationsModule,
    forwardRef(() => FinanceModule),
    forwardRef(() => CustomerModule),
    forwardRef(() => ProductionModule),
  ],
  controllers: [
    SalesAnalyticsController,
    FinishedGoodsInventoryController,
    SalesQuotationController,
    SalesOrderController,
    SalesDeliveryController,
    SalesInvoiceController,
    SalesReturnController,
  ],
  providers: [
    SalesAnalyticsService,
    FinishedGoodsInventoryService,
    SalesQuotationService,
    SalesOrderService,
    SalesDeliveryService,
    SalesInvoiceService,
    SalesReturnService,
  ],
  exports: [
    SalesAnalyticsService,
    FinishedGoodsInventoryService,
    SalesQuotationService,
    SalesOrderService,
    SalesDeliveryService,
    SalesInvoiceService,
    SalesReturnService,
  ],
})
export class SalesModule {}
