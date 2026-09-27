export enum BarcodeEntityType {
  ITEM = 'ITEM',
  CUSTOMER = 'CUSTOMER',
  MACHINE = 'MACHINE',
  WAREHOUSE = 'WAREHOUSE',
  EMPLOYEE = 'EMPLOYEE',
  PRODUCTION_ENTRY = 'PRODUCTION_ENTRY',
  PRODUCTION_UNIT = 'PRODUCTION_UNIT',
  DISPATCH_PACKAGE = 'DISPATCH_PACKAGE',
  JOB_CARD = 'JOB_CARD',
  GATE_PASS = 'GATE_PASS',
}

export enum BarcodeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface BarcodeRecord {
  id: string;
  companyId: string;
  barcodeValue: string;
  entityType: BarcodeEntityType;
  entityId: string;
  barcodeLabel: string | null;
  entityLabel: string | null;
  entityCode: string | null;
  status: BarcodeStatus;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BarcodeStats {
  total: number;
  ITEM?: number;
  CUSTOMER?: number;
  MACHINE?: number;
  WAREHOUSE?: number;
  EMPLOYEE?: number;
  PRODUCTION_ENTRY?: number;
  PRODUCTION_UNIT?: number;
  DISPATCH_PACKAGE?: number;
  JOB_CARD?: number;
  GATE_PASS?: number;
}

export const ENTITY_TYPE_LABELS: Record<BarcodeEntityType, string> = {
  [BarcodeEntityType.ITEM]: 'Item',
  [BarcodeEntityType.CUSTOMER]: 'Customer',
  [BarcodeEntityType.MACHINE]: 'Machine',
  [BarcodeEntityType.WAREHOUSE]: 'Warehouse',
  [BarcodeEntityType.EMPLOYEE]: 'Employee',
  [BarcodeEntityType.PRODUCTION_ENTRY]: 'Production Entry',
  [BarcodeEntityType.PRODUCTION_UNIT]: 'Production Unit / Coil',
  [BarcodeEntityType.DISPATCH_PACKAGE]: 'Dispatch Package',
  [BarcodeEntityType.JOB_CARD]: 'Job Card',
  [BarcodeEntityType.GATE_PASS]: 'Outward Gate Pass',
};

export const ENTITY_TYPE_ROUTES: Record<BarcodeEntityType, string> = {
  [BarcodeEntityType.ITEM]: '/master-data/items',
  [BarcodeEntityType.CUSTOMER]: '/customers',
  [BarcodeEntityType.MACHINE]: '/master-data/machines',
  [BarcodeEntityType.WAREHOUSE]: '/organization/warehouses',
  [BarcodeEntityType.EMPLOYEE]: '/hr/employees',
  [BarcodeEntityType.PRODUCTION_ENTRY]: '/production/entries',
  [BarcodeEntityType.PRODUCTION_UNIT]: '/production/units',
  [BarcodeEntityType.DISPATCH_PACKAGE]: '/sales/packages',
  [BarcodeEntityType.JOB_CARD]: '/maintenance/job-cards',
  [BarcodeEntityType.GATE_PASS]: '/sales/deliveries',
};
