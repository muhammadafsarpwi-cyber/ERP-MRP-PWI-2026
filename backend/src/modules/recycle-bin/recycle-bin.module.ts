import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';

import { ProductionEntry } from '../production/entities/production-entry.entity';
import { ProductionEntryItem } from '../production/entities/production-entry-item.entity';
import { MaintenanceJobCard } from '../maintenance/entities/maintenance-job-card.entity';
import { MaintenanceJobCardPart } from '../maintenance/entities/maintenance-job-card-part.entity';
import { DispatchPackage } from '../dispatch/entities/dispatch-package.entity';
import { DispatchPackageUnit } from '../dispatch/entities/dispatch-package-unit.entity';
import { Customer } from '../customer/entities/customer.entity';
import { CustomerContact } from '../customer/entities/customer-contact.entity';
import { CustomerAddress } from '../customer/entities/customer-address.entity';
import { SalesQuotation } from '../sales/entities/sales-quotation.entity';
import { SalesQuotationItem } from '../sales/entities/sales-quotation-item.entity';
import { ProductionOrder } from '../production/entities/production-order.entity';
import { ProductionOrderOperation } from '../production/entities/production-order-operation.entity';
import { BillOfMaterials } from '../bom/entities/bill-of-materials.entity';
import { BomLine } from '../bom/entities/bom-line.entity';
import { MaintenancePmPlan } from '../maintenance/entities/maintenance-pm-plan.entity';
import { MaintenancePmSchedule } from '../maintenance/entities/maintenance-pm-schedule.entity';
import { MaterialIssue } from '../store/entities/material-issue.entity';
import { MaterialIssueLine } from '../store/entities/material-issue-line.entity';
import { MaterialReturn } from '../store/entities/material-return.entity';
import { MaterialReturnLine } from '../store/entities/material-return-line.entity';
import { MaterialRequest } from '../store/entities/material-request.entity';
import { MaterialRequestLine } from '../store/entities/material-request-line.entity';
import { QcInspectionPlan } from '../qc/entities/qc-inspection-plan.entity';
import { QcQualityCharacteristic } from '../qc/entities/qc-entities';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { SalesOrderItem } from '../sales/entities/sales-order-item.entity';
import { SalesInvoice } from '../sales/entities/sales-invoice.entity';
import { SalesDelivery } from '../sales/entities/sales-delivery.entity';
import { SalesDeliveryLine } from '../sales/entities/sales-delivery-line.entity';
import { ErpUser } from '../user/entities/erp-user.entity';

import { RecycleBinController } from './controllers/recycle-bin.controller';
import { RecycleBinPurgeService } from './services/recycle-bin-purge.service';
import { RecycleBinService } from './services/recycle-bin.service';

/**
 * Universal Recycle Bin — the one tray that owns recovery and permanent purge
 * for every soft-deletable module.
 *
 * Deliberately SELF-CONTAINED: it registers the entities it reads through
 * `TypeOrmModule.forFeature` and issues the restore/purge statements itself,
 * rather than importing the owning modules' services. Those modules export
 * nothing today and adding exports to four of them would thread new
 * dependencies through Production, Maintenance, Customer and Dispatch (two of
 * which already rely on `forwardRef`) purely for one endpoint each.
 *
 * The DELETES themselves still live in the owning services — each module
 * remains responsible for stamping its own rows — so this module only ever
 * answers "what is in the bin, put it back, or make it gone for good".
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionEntry,
      ProductionEntryItem,
      MaintenanceJobCard,
      MaintenanceJobCardPart,
      DispatchPackage,
      DispatchPackageUnit,
      Customer,
      CustomerContact,
      CustomerAddress,
      SalesQuotation,
      SalesQuotationItem,
      ProductionOrder,
      ProductionOrderOperation,
      BillOfMaterials,
      BomLine,
      MaintenancePmPlan,
      MaintenancePmSchedule,
      MaterialIssue,
      MaterialIssueLine,
      MaterialReturn,
      MaterialReturnLine,
      MaterialRequest,
      MaterialRequestLine,
      QcInspectionPlan,
      QcQualityCharacteristic,
      SalesOrder,
      SalesOrderItem,
      SalesInvoice,
      SalesDelivery,
      SalesDeliveryLine,
      ErpUser,
    ]),
    AuthModule,
    PermissionModule,
    UserModule,
  ],
  controllers: [RecycleBinController],
  providers: [RecycleBinService, RecycleBinPurgeService],
  exports: [RecycleBinService],
})
export class RecycleBinModule {}
