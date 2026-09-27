import { apiService } from './api';

export enum DispatchPackageStatus {
  OPEN       = 'OPEN',
  FINALIZED  = 'FINALIZED',
  DISPATCHED = 'DISPATCHED',
  CANCELLED  = 'CANCELLED',
}

export interface DispatchPackageUnitItem {
  id: string;
  companyId: string;
  packageId: string;
  productionUnitId: string;
  addedAt: string;
  addedBy?: string | null;
  removedAt?: string | null;
  removedBy?: string | null;
  status: 'PACKED' | 'REMOVED';
  productionUnit?: {
    id: string;
    unitSerialNo: string;
    coilNo: string;
    weightKg: number | null;
    lengthMeters: number | null;
    batchNo: string | null;
    item?: { id: string; itemCode: string; name: string };
    operatorName?: string | null;
    productionDate?: string | null;
    shiftName?: string | null;
  };
}

export interface DispatchPackage {
  id: string;
  companyId: string;
  packageNo: string;
  customerId?: string | null;
  customerName?: string | null;
  salesOrderId?: string | null;
  salesOrderNo?: string | null;
  salesDeliveryId?: string | null;
  gatePassNo?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  dispatchLocation?: string | null;
  status: DispatchPackageStatus;
  packageDate: string;
  totalUnits: number;
  totalWeight: number;
  totalLength: number;
  packageQrPayload: string;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  dispatchedAt?: string | null;
  dispatchedBy?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  remarks?: string | null;
  printCount: number;
  lastPrintedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  units?: DispatchPackageUnitItem[];
}

export interface CreateDispatchPackagePayload {
  customerId?: string | null;
  customerName?: string | null;
  salesOrderId?: string | null;
  salesOrderNo?: string | null;
  salesDeliveryId?: string | null;
  gatePassNo?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  dispatchLocation?: string | null;
  packageDate?: string;
  remarks?: string | null;
}

export interface ListDispatchPackagesQuery {
  status?: DispatchPackageStatus;
  search?: string;
  customerId?: string;
  salesOrderId?: string;
  page?: number;
  limit?: number;
}

export const dispatchPackageService = {
  async list(query?: ListDispatchPackagesQuery): Promise<{ success: boolean; data: DispatchPackage[]; total: number }> {
    return apiService.get('/dispatch/packages', query as any);
  },

  async getOne(id: string): Promise<{ success: boolean; data: DispatchPackage }> {
    return apiService.get(`/dispatch/packages/${id}`);
  },

  async create(payload: CreateDispatchPackagePayload): Promise<{ success: boolean; data: DispatchPackage }> {
    return apiService.post('/dispatch/packages', payload);
  },

  async scanAndAddUnit(packageId: string, qrOrSerial: string): Promise<{
    success: boolean;
    data: DispatchPackage;
    unit: any;
    message: string;
  }> {
    return apiService.post(`/dispatch/packages/${packageId}/scan-unit`, { qrOrSerial });
  },

  async removeUnit(packageId: string, unitId: string): Promise<{
    success: boolean;
    data: DispatchPackage;
    removedUnitId: string;
    message: string;
  }> {
    return apiService.delete(`/dispatch/packages/${packageId}/units/${unitId}`);
  },

  async finalize(packageId: string): Promise<{ success: boolean; data: DispatchPackage; message: string }> {
    return apiService.post(`/dispatch/packages/${packageId}/finalize`, {});
  },

  async linkGatePass(packageId: string, payload: {
    salesDeliveryId?: string;
    gatePassNo?: string;
    vehicleNo?: string;
    driverName?: string;
    remarks?: string;
  }): Promise<{ success: boolean; data: DispatchPackage; message: string }> {
    return apiService.post(`/dispatch/packages/${packageId}/link-gate-pass`, payload);
  },

  async recordPrint(packageId: string, payload?: { printerName?: string; labelTemplate?: string }): Promise<{
    success: boolean;
    data: DispatchPackage;
    message: string;
  }> {
    return apiService.post(`/dispatch/packages/${packageId}/print`, payload || {});
  },

  async gateVerify(packageQrOrNo: string): Promise<{ success: boolean; data: DispatchPackage; message: string }> {
    return apiService.get(`/dispatch/packages/gate-verify/${encodeURIComponent(packageQrOrNo)}`);
  },

  async gateExit(packageId: string, payload?: {
    gatePassNo?: string;
    vehicleNo?: string;
    driverName?: string;
    remarks?: string;
  }): Promise<{ success: boolean; data: DispatchPackage; message: string }> {
    return apiService.post(`/dispatch/packages/${packageId}/gate-exit`, payload || {});
  },

  async cancel(packageId: string, reason: string): Promise<{ success: boolean; data: DispatchPackage }> {
    return apiService.post(`/dispatch/packages/${packageId}/cancel`, { reason });
  },

  async traceLookup(searchKey: string): Promise<{
    success: boolean;
    data: {
      type: 'PRODUCTION_UNIT' | 'DISPATCH_PACKAGE';
      productionUnit?: any;
      dispatchPackage?: DispatchPackage;
      gatePass?: any;
    };
  }> {
    return apiService.get(`/dispatch/packages/trace/${encodeURIComponent(searchKey)}`);
  },
};
