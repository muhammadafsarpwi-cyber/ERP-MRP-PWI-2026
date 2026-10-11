import { renderHook, act } from '@testing-library/react';
import { useLookups } from './lookups';
import apiService from '../../../services/api';

jest.mock('../../../services/api');
const apiMock = apiService as jest.Mocked<typeof apiService>;

describe('useLookups — HR Employees & Department Items', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
  });

  it('fetches employees via /hr/employees/lookup and populates hrEmployees', async () => {
    const mockEmps = [
      { id: 'emp-1', employeeCode: 'EMP-001', firstName: 'Ahmed', lastName: 'Raza', departmentId: null, jobTitle: 'Machine Operator', status: 'ACTIVE' },
      { id: 'emp-2', employeeCode: 'EMP-002', firstName: 'Fatima', lastName: 'Khan', departmentId: 'dept-st', jobTitle: 'Supervisor', status: 'ACTIVE' },
    ];

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/hr/employees/lookup' || url === '/hr/employees') return { success: true, data: mockEmps };
      if (url === '/master-data/items') return { success: true, data: [] };
      return { success: true, data: [] };
    });

    const { result } = renderHook(() => useLookups());

    // Wait for effect to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.hrEmployees.length).toBe(2);
    expect(result.current.hrEmployees[0].employeeCode).toBe('EMP-001');

    // employeesForDepartment: when department has an assigned employee
    const deptEmployees = result.current.employeesForDepartment('dept-st');
    expect(deptEmployees.length).toBe(1);
    expect(deptEmployees[0].firstName).toBe('Fatima');

    // employeesForDepartment: when department has no assigned employee, falls back to all employees
    const fallbackEmployees = result.current.employeesForDepartment('dept-other');
    expect(fallbackEmployees.length).toBe(2);
  });

  it('loadDepartmentItems fetches items for a specific department and caches them in deptItemsMap', async () => {
    const straightenerItems = [
      { id: 'item-st-1', itemCode: 'WIP-ST-011', name: '250*17 Outer Straight', departmentId: 'dept-st', isManufacturable: true, status: 'ACTIVE', baseUomId: 'uom-1' },
      { id: 'item-st-2', itemCode: 'WIP-ST-012', name: '250*18 Inner Straight', departmentId: 'dept-st', isManufacturable: true, status: 'ACTIVE', baseUomId: 'uom-1' },
    ];

    apiMock.get.mockImplementation(async (url: string, params?: any) => {
      if (url === '/master-data/items' && params?.departmentId === 'dept-st') {
        return { success: true, data: straightenerItems };
      }
      return { success: true, data: [] };
    });

    const { result } = renderHook(() => useLookups());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    let loaded: any[] = [];
    await act(async () => {
      loaded = await result.current.loadDepartmentItems('dept-st');
    });

    expect(loaded.length).toBe(2);
    expect(loaded[0].itemCode).toBe('WIP-ST-011');
    expect(result.current.deptItemsMap['dept-st'].length).toBe(2);
  });

  it('loadDepartmentItems strictly excludes non-WIP/RM items such as tools, spare parts, and breakers', async () => {
    const mixedItems = [
      { id: 'item-spk-1', itemCode: 'WIP-SP-018', name: '225*17 Outer Straight', itemType: 'WORK_IN_PROGRESS', departmentId: 'dept-spk' },
      { id: 'item-spk-2', itemCode: 'RM-WIRE-01', name: 'Wire Rod 2.6mm', itemType: 'RAW_MATERIAL', departmentId: 'dept-spk' },
      { id: 'item-spk-3', itemCode: 'SP-117026', name: 'SPOKE BENDING PUNCH', itemType: 'SPARE_PART', departmentId: 'dept-spk' },
      { id: 'item-spk-4', itemCode: 'SP-216008', name: 'SPOKE HEADING PUNCH', itemType: 'TOOLS', departmentId: 'dept-spk' },
      { id: 'item-spk-5', itemCode: '175007A', name: 'BREAKER MCB 3 POLE 32AMP', itemType: 'ELECTRICAL', departmentId: 'dept-spk' },
      { id: 'item-other-1', itemCode: 'WIP-CCD-01', name: 'Control Cable WIP', itemType: 'WORK_IN_PROGRESS', departmentId: 'dept-other' },
    ];

    apiMock.get.mockImplementation(async (url: string, params?: any) => {
      if (url === '/master-data/items' && params?.departmentId === 'dept-spk') {
        return { success: true, data: mixedItems };
      }
      return { success: true, data: [] };
    });

    const { result } = renderHook(() => useLookups());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    let loaded: any[] = [];
    await act(async () => {
      loaded = await result.current.loadDepartmentItems('dept-spk');
    });

    expect(loaded.length).toBe(2);
    expect(loaded.map((i) => i.itemCode)).toEqual(['WIP-SP-018', 'RM-WIRE-01']);
    expect(result.current.deptItemsMap['dept-spk'].map((i) => i.itemCode)).toEqual(['WIP-SP-018', 'RM-WIRE-01']);
  });
});
