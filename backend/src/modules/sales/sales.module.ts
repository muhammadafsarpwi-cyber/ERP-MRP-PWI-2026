import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SalesCustomer,
  SalesQuotation, SalesQuotationItem,
  SalesOrder, SalesOrderItem,
  SalesDelivery, SalesDeliveryLine,
  SalesInvoice, SalesInvoiceLine,
  SalesReturn, SalesReturnLine,
  CustomerReceipt, CustomerReceiptAllocation,
} from './entities';
import { SalesQuotationService } from './services/sales-quotation.service';
import { SalesOrderService } from './services/sales-order.service';
import { SalesDeliveryService } from './services/sales-delivery.service';
import { SalesInvoiceService } from './services/sales-invoice.service';
import { SalesReturnService } from './services/sales-return.service';
import { CustomerReceiptService } from './services/customer-receipt.service';
import { CustomerCreditService } from './services/customer-credit.service';
import { SalesQuotationController } from './controllers/sales-quotation.controller';
import { SalesOrderController } from './controllers/sales-order.controller';
import { SalesDeliveryController } from './controllers/sales-delivery.controller';
import { SalesInvoiceController } from './controllers/sales-invoice.controller';
import { SalesReturnController } from './controllers/sales-return.controller';
import { SalesReceiptController } from './controllers/sales-receipt.controller';
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
import { Uom } from '../item/entities/uom.entity';
import { UomConversion } from '../item/entities/uom-conversion.entity';
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
      SalesInvoice, SalesInvoiceLine,
      SalesReturn, SalesReturnLine,
      CustomerReceipt, CustomerReceiptAllocation,
      ProductionOrder,
      CustomerLedgerEntry,
      InventoryBalance,
      InventoryPolicy,
      StockLedger,
      Item,
      Uom,
      UomConversion,
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
    SalesReceiptController,
  ],
  providers: [
    SalesAnalyticsService,
    FinishedGoodsInventoryService,
    SalesQuotationService,
    SalesOrderService,
    SalesDeliveryService,
    SalesInvoiceService,
    SalesReturnService,
    CustomerReceiptService,
    CustomerCreditService,
  ],
  exports: [
    SalesAnalyticsService,
    FinishedGoodsInventoryService,
    SalesQuotationService,
    SalesOrderService,
    SalesDeliveryService,
    SalesInvoiceService,
    SalesReturnService,
    CustomerReceiptService,
    CustomerCreditService,
  ],
})
export class SalesModule {}
