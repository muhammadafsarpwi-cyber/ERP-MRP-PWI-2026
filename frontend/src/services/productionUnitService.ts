import { apiService } from './api';

export enum ProductionUnitStatus {
  GENERATED = 'GENERATED',
  PRINTED   = 'PRINTED',
  ACTIVE    = 'ACTIVE',
  USED      = 'USED',
  VOID      = 'VOID',
  CANCELLED = 'CANCELLED',
}

export enum ProductionUnitCodeType {
  QR_ONLY      = 'QR_ONLY',
  BARCODE_ONLY = 'BARCODE_ONLY',
  QR_BARCODE   = 'QR_BARCODE',
}

export interface ProductionUnitItem {
  id: string;
  companyId: string;
  productionEntryId: string | null;
  itemId: string;
  item?: { id: string; itemCode: string; name: string; wireSizeMm?: number | null };
  uomId: string | null;
  unitSerialNo: string;
  coilNo: string;
  qrPayload: string;
  barcodePayload: string;
  codeType: ProductionUnitCodeType;
  productionDate: string;
  batchNo: string | null;
  pvcBatchNo: string | null;
  shiftId: string | null;
  shiftName: string | null;
  operatorName: string | null;
  machineId: string | null;
  machineNo: string | null;
  departmentName: string | null;
  lengthMeters: number | null;
  weightKg: number | null;
  jointCount: number | null;
  stValue: string | null;
  qualityStatus: string | null;
  remarks: string | null;
  status: ProductionUnitStatus;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  firstPrintedAt: string | null;
  firstPrintedBy: string | null;
  printCount: number;
  labelTemplate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionUnitPrintLog {
  id: string;
  productionUnitId: string;
  printJobId: string | null;
  eventType: 'PRINT' | 'REPRINT';
  printedBy: string | null;
  printedAt: string;
  printerName: string | null;
  copies: number;
  labelTemplate: string | null;
  createdAt: string;
}

export interface GenerateProductionUnitsPayload {
  companyId?: string;
  productionEntryId?: string | null;
  itemId: string;
  uomId?: string | null;
  productionDate: string;
  batchNo?: string | null;
  pvcBatchNo?: string | null;
  shiftId?: string | null;
  shiftName?: string | null;
  operatorName?: string | null;
  machineId?: string | null;
  machineNo?: string | null;
  departmentName?: string | null;
  lengthMeters?: number | null;
  quantity: number;
  coilPrefix?: string;
  codeType?: ProductionUnitCodeType;
  labelTemplate?: string;
}

export interface BulkUpdateUnitRow {
  id: string;
  weightKg?: number;
  jointCount?: number;
  stValue?: string;
  qualityStatus?: string;
  remarks?: string;
  lengthMeters?: number;
}

export interface ListProductionUnitsQuery {
  productionEntryId?: string;
  itemId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LabelTemplateOption {
  key: string;
  label: string;
  fields: string[];
}

export const productionUnitService = {
  async list(query?: ListProductionUnitsQuery): Promise<{ success: boolean; data: ProductionUnitItem[]; total: number }> {
    return apiService.get('/production/units', query as any);
  },

  async getOne(id: string): Promise<{ success: boolean; data: ProductionUnitItem }> {
    return apiService.get(`/production/units/${id}`);
  },

  async getStats(): Promise<{ success: boolean; data: Record<string, number> }> {
    return apiService.get('/production/units/stats');
  },

  async getTemplates(): Promise<{ success: boolean; data: LabelTemplateOption[] }> {
    return apiService.get('/production/units/templates');
  },

  async generate(payload: GenerateProductionUnitsPayload): Promise<{ success: boolean; data: ProductionUnitItem[]; count: number }> {
    return apiService.post('/production/units/generate', payload);
  },

  async bulkUpdate(units: BulkUpdateUnitRow[]): Promise<{ success: boolean; data: ProductionUnitItem[]; count: number }> {
    return apiService.patch('/production/units/bulk-update', { units });
  },

  async updateOne(id: string, payload: Partial<BulkUpdateUnitRow>): Promise<{ success: boolean; data: ProductionUnitItem }> {
    return apiService.patch(`/production/units/${id}`, payload);
  },

  async recordPrint(payload: { unitIds: string[]; copies?: number; printerName?: string; labelTemplate?: string }): Promise<{
    success: boolean;
    printJobId: string;
    printed: number;
    data: ProductionUnitItem[];
  }> {
    return apiService.post('/production/units/print', payload);
  },

  async voidUnit(id: string, payload: { status: 'VOID' | 'CANCELLED'; reason: string }): Promise<{ success: boolean; data: ProductionUnitItem }> {
    return apiService.patch(`/production/units/${id}/void`, payload);
  },

  async getPrintLogs(id: string): Promise<{ success: boolean; data: ProductionUnitPrintLog[] }> {
    return apiService.get(`/production/units/${id}/print-logs`);
  },

  async scanLookup(payload: string): Promise<{ success: boolean; data: ProductionUnitItem }> {
    return apiService.get(`/production/units/scan/${encodeURIComponent(payload)}`);
  },

  async findBySerial(serialNo: string): Promise<{ success: boolean; data: ProductionUnitItem }> {
    return apiService.get(`/production/units/serial/${encodeURIComponent(serialNo)}`);
  },
};
