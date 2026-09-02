import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Supplier, SupplierItem,
  PurchaseRequisition, PurchaseRequisitionLine,
  RequestForQuotation, RfqLine,
  Quotation, QuotationLine,
  PurchaseOrder, PurchaseOrderLine,
  GoodsReceipt, GoodsReceiptLine,
  PurchaseReturn, PurchaseReturnLine,
  PurchaseInvoice, PurchaseInvoiceLine,
} from './entities';
import { SupplierService } from './services/supplier.service';
import { PurchaseRequisitionService } from './services/purchase-requisition.service';
import { RfqService } from './services/rfq.service';
import { QuotationService } from './services/quotation.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { PurchaseReturnService } from './services/purchase-return.service';
import { PurchaseInvoiceService } from './services/purchase-invoice.service';
import { SupplierController } from './controllers/supplier.controller';
import { PurchaseRequisitionController } from './controllers/purchase-requisition.controller';
import { RfqController } from './controllers/rfq.controller';
import { QuotationController } from './controllers/quotation.controller';
import { PurchaseOrderController } from './controllers/purchase-order.controller';
import { GoodsReceiptController } from './controllers/goods-receipt.controller';
import { PurchaseReturnController } from './controllers/purchase-return.controller';
import { PurchaseInvoiceController } from './controllers/purchase-invoice.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier, SupplierItem,
      PurchaseRequisition, PurchaseRequisitionLine,
      RequestForQuotation, RfqLine,
      Quotation, QuotationLine,
      PurchaseOrder, PurchaseOrderLine,
      GoodsReceipt, GoodsReceiptLine,
      PurchaseReturn, PurchaseReturnLine,
      PurchaseInvoice, PurchaseInvoiceLine,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => UserModule),
    forwardRef(() => FinanceModule),
    forwardRef(() => InventoryModule),
  ],
  controllers: [
    SupplierController,
    PurchaseRequisitionController,
    RfqController,
    QuotationController,
    PurchaseOrderController,
    GoodsReceiptController,
    PurchaseReturnController,
    PurchaseInvoiceController,
  ],
  providers: [
    SupplierService,
    PurchaseRequisitionService,
    RfqService,
    QuotationService,
    PurchaseOrderService,
    GoodsReceiptService,
    PurchaseReturnService,
    PurchaseInvoiceService,
  ],
  exports: [
    SupplierService,
    PurchaseOrderService,
    GoodsReceiptService,
  ],
})
export class ProcurementModule {}
