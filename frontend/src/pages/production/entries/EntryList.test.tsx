import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { App } from 'antd';
import EntryList, { getEntryStatus, ProductionEntryRow } from './EntryList';

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

// Mock API service
jest.mock('../../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockImplementation((url: string) => {
      if (url === '/production/entries') {
        return Promise.resolve({
          success: true,
          total: 2,
          data: [
            {
              id: 'row-1',
              entryDate: '2026-09-10',
              divisionId: 'div-1',
              sectionId: 'sec-1',
              departmentId: 'dept-1',
              division: { id: 'div-1', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
              section: { id: 'sec-1', name: 'Spiral', sectionCode: 'SEC-015' },
              department: { id: 'dept-1', name: 'Flattening', departmentCode: 'CCD-DEPT001' },
              shift: { id: 'shift-1', name: 'Shift 1 (Morning)', shiftCode: 'SHIFT-A' },
              machineNo: 'FT-04',
              machine: { id: 'm-1', machineCode: 'FT-04', name: 'Flattening Machine FT-04' },
              operatorName: 'Muhammad Ali',
              supervisorName: null,
              coilSize: null,
              itemId: 'item-1',
              item: { id: 'item-1', name: 'Flat Wire T 0.40 × W 2.60 mm', itemCode: 'FLAT-WIRE-001' },
              uomId: 'uom-1',
              uom: { id: 'uom-1', code: 'KG', symbol: 'kg' },
              targetQuantity: 60,
              actualQuantity: 48,
              achievementPercentage: 80,
              efficiencyPercentage: 75,
              runningHours: 6,
              downtimeHours: 1,
              downtimeReasonText: null,
              scrapQuantity: 2,
              remarks: 'Test entry',
              isActive: true,
              inventoryReferenceId: 'inv-ref-1',
            },
            {
              id: 'row-2',
              entryDate: '2026-09-10',
              divisionId: 'div-1',
              sectionId: 'sec-1',
              departmentId: 'dept-2',
              department: { id: 'dept-2', name: 'Spiral', departmentCode: 'CCD-DEPT002' },
              shift: { id: 'shift-2', name: 'Shift 2 (Evening)', shiftCode: 'SHIFT-B' },
              machineNo: 'SR-01',
              machine: { id: 'm-2', machineCode: 'SR-01', name: 'Spiral Machine SR-01' },
              operatorName: 'Tariq Mehmood',
              supervisorName: null,
              coilSize: null,
              itemId: 'item-2',
              item: { id: 'item-2', name: 'Spiral Wire 3.75 mm', itemCode: 'SPIRAL-001' },
              uomId: 'uom-1',
              uom: { id: 'uom-1', code: 'KG', symbol: 'kg' },
              targetQuantity: 100,
              actualQuantity: 105,
              achievementPercentage: 105,
              efficiencyPercentage: 98,
              runningHours: 8,
              downtimeHours: 0,
              downtimeReasonText: null,
              scrapQuantity: 0,
              remarks: null,
              isActive: true,
              inventoryReferenceId: null,
            },
          ],
        });
      }
      if (url === '/production/entries/report') {
        return Promise.resolve({
          success: true,
          entryCount: 2,
          departments: [],
          grandTotalsByUom: [],
        });
      }
      return Promise.resolve({ success: true, data: [] });
    }),
    delete: jest.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock lookups
jest.mock('./lookups', () => ({
  useLookups: () => ({
    divisions: [{ id: 'div-1', name: 'Control Cable Division', divisionCode: 'DIV-CCD' }],
    sections: [{ id: 'sec-1', name: 'Spiral', sectionCode: 'SEC-015', divisionId: 'div-1' }],
    departments: [
      { id: 'dept-1', name: 'Flattening', departmentCode: 'CCD-DEPT001', divisionId: 'div-1', sectionId: 'sec-1' },
      { id: 'dept-2', name: 'Spiral', departmentCode: 'CCD-DEPT002', divisionId: 'div-1', sectionId: 'sec-1' },
    ],
    shifts: [
      { id: 'shift-1', name: 'Shift 1 (Morning)', shiftCode: 'SHIFT-A' },
      { id: 'shift-2', name: 'Shift 2 (Evening)', shiftCode: 'SHIFT-B' },
    ],
    items: [],
    uoms: [],
    uomConversions: [],
    hrEmployees: [],
    employeeFullName: (emp: any) => emp.name || emp.employeeCode,
    sectionsForDivision: () => [],
    departmentsForSection: () => [],
    employeesForDepartment: () => [],
  }),
}));

describe('Daily Production Entry — EntryList Component', () => {
  describe('getEntryStatus logic', () => {
    it('uses row.status if explicitly supplied', () => {
      const row = { status: 'APPROVED', isActive: true } as unknown as ProductionEntryRow;
      expect(getEntryStatus(row)).toBe('APPROVED');
    });

    it('returns CANCELLED when isActive is false', () => {
      const row = { isActive: false, actualQuantity: 50 } as unknown as ProductionEntryRow;
      expect(getEntryStatus(row)).toBe('CANCELLED');
    });

    it('returns COMPLETED when inventoryReferenceId is present', () => {
      const row = { isActive: true, inventoryReferenceId: 'inv-123', actualQuantity: 10 } as unknown as ProductionEntryRow;
      expect(getEntryStatus(row)).toBe('COMPLETED');
    });

    it('returns COMPLETED when actualQuantity > 0', () => {
      const row = { isActive: true, actualQuantity: 25 } as unknown as ProductionEntryRow;
      expect(getEntryStatus(row)).toBe('COMPLETED');
    });

    it('returns DRAFT when actualQuantity is 0 and not posted', () => {
      const row = { isActive: true, actualQuantity: 0 } as unknown as ProductionEntryRow;
      expect(getEntryStatus(row)).toBe('DRAFT');
    });
  });

  describe('UI Rendering', () => {
    it('renders the page title, toolbar controls, and export button without crashing', async () => {
      render(
        <App>
          <BrowserRouter>
            <EntryList />
          </BrowserRouter>
        </App>,
      );

      // Title
      expect(screen.getByText('Daily Production Entry')).toBeInTheDocument();

      // Quick Search input
      expect(screen.getByPlaceholderText('Search entries...')).toBeInTheDocument();

      // Action buttons
      expect(screen.getByText('Search')).toBeInTheDocument();
      expect(screen.getByText('Export')).toBeInTheDocument();
      expect(screen.getByText('Add Entry')).toBeInTheDocument();

      // Tabs
      expect(screen.getByText('Production Records')).toBeInTheDocument();
      expect(screen.getByText('Department-Wise Report')).toBeInTheDocument();
    });
  });
});
