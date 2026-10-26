import apiService from './api';

export interface TouchscreenOperator {
  id: string;
  name: string;
  username: string;
  email: string;
}

export interface TouchscreenMachineOption {
  id: string;
  machineCode: string;
  name: string;
  departmentId: string | null;
}

export interface TouchscreenShiftOption {
  id: string;
  name: string;
}

export interface TouchscreenTelemetry {
  operators: TouchscreenOperator[];
  machines: TouchscreenMachineOption[];
  shifts: TouchscreenShiftOption[];
}

export interface TouchscreenSegment {
  key: string;
  title: string;
  code: string;
  departmentNames: string[];
  departmentIds: string[];
  description: string;
  icon: string;
  color: string;
  bgGradient: string;
  activeMachinesCount: number;
  activeContractsCount: number;
}

export interface TouchscreenContractJob {
  salesOrderId: string;
  salesOrderItemId: string;
  contractNumber: string;
  customerName: string;
  customerCode?: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  departmentId: string;
  departmentName: string;
  routingId?: string;
  operationName: string;
  sequenceNo: number;
  targetQuantity: number;
  stageProduced: number;
  remainingQuantity: number;
  completionPercentage: number;
  availableMachines: Array<{ id: string; machineCode: string; machineName: string }>;
}

export interface SubmitShiftReportPayload {
  salesOrderId: string;
  salesOrderItemId: string;
  contractNumber?: string;
  routingId?: string;
  itemId: string;
  segmentKey: string;
  departmentId: string;
  machineId?: string;
  machineNo?: string;
  operatorId?: string;
  operatorName?: string;
  shiftId?: string;
  totalOutputQty: number; // Mandatory Field 1 (OK Pieces)
  scrapQty: number;       // Mandatory Field 2 (Rejected Pieces)
  machineDowntimeMinutes: number; // Mandatory Field 3 (Downtime in Minutes)
  supervisorName?: string;
  supervisorPin?: string;
  supervisorOverride?: boolean;
  notes?: string;
}

export interface ShiftReportSubmissionResult {
  success: boolean;
  message: string;
  data: {
    entryNumber: string;
    entryId: string;
    entryDate: string;
    departmentName: string;
    itemName: string;
    actualQuantity: number;
    scrapQuantity: number;
    runningHours: number;
    downtimeHours: number;
    updatedRemainingQty: number;
    newCompletionPercentage: number;
  };
}

export const shopfloorTouchscreenService = {
  /**
   * Fetches telemetry for Step 1: Operators, Machines, and Shifts (Zero typing)
   */
  async getTelemetry(): Promise<{ success: boolean; data: TouchscreenTelemetry }> {
    try {
      return await apiService.get('/production/touchscreen/init-telemetry');
    } catch (err) {
      // Robust offline/fallback telemetry for shop floor terminal resilience
      return {
        success: true,
        data: {
          operators: [
            { id: 'op-1', name: 'Junaid Kareem', username: 'Junaid', email: 'pwijunaid@gmail.com' },
            { id: 'op-2', name: 'Muhammad Alam', username: 'Admin', email: 'admin@pakistanwire.com' },
            { id: 'op-3', name: 'Ashraf Ali', username: 'Ashraf', email: 'ashrafali.pwi@gmail.com' },
            { id: 'op-4', name: 'Anus Anees ur Rehman', username: 'Anas', email: 'Anasccd71@gmail.com' },
            { id: 'op-5', name: 'Muhammad Afsar', username: 'Admin', email: 'muhammadafsarpwi@gmail.com' },
          ],
          machines: [
            { id: 'm-01', machineCode: 'ST-01', name: 'Wire Straightener #1', departmentId: 'd3000000-0000-0000-0000-000000000001' },
            { id: 'm-02', machineCode: 'SW-01', name: 'High-Speed Swager #1', departmentId: 'd3000000-0000-0000-0000-000000000002' },
            { id: 'm-03', machineCode: 'HD-01', name: 'Spoke Heading Station #1', departmentId: 'd3000000-0000-0000-0000-000000000004' },
            { id: 'm-04', machineCode: 'PL-01', name: 'Zinc Plating Tank Alpha', departmentId: 'd3000000-0000-0000-0000-000000000006' },
            { id: 'm-05', machineCode: 'PK-01', name: 'Bulk Export Packing Unit', departmentId: 'd3000000-0000-0000-0000-000000000008' },
          ],
          shifts: [
            { id: '4ff84e90-bbb2-4ef5-9c79-e193a3ffa37e', name: 'Shift A (Morning)' },
            { id: '58d9ed01-5c7d-4b60-a748-16cb4117afdc', name: 'Shift B (Afternoon)' },
            { id: 'b9ff6e3c-9861-4080-800c-32190a21b3cf', name: 'Shift C (Night)' },
          ],
        },
      };
    }
  },

  /**
   * Fetches the 5 visual manufacturing department segments
   */
  async getDepartments(): Promise<{ success: boolean; data: TouchscreenSegment[] }> {
    return apiService.get('/production/touchscreen/departments');
  },

  /**
   * Fetches active Sales Order Contracts assigned to the selected sector
   */
  async getActiveContracts(segmentKey: string): Promise<{
    success: boolean;
    data: TouchscreenContractJob[];
    segment: TouchscreenSegment;
  }> {
    return apiService.get('/production/touchscreen/contracts', { segmentKey });
  },

  /**
   * Submits shift report and decrements remaining balances
   */
  async submitShiftReport(payload: SubmitShiftReportPayload): Promise<ShiftReportSubmissionResult> {
    return apiService.post('/production/touchscreen/submit-entry', payload);
  },
};

export default shopfloorTouchscreenService;
