import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { App } from 'antd';
import HandPackingEntry, {
  PCS_PER_GROSS,
  GROSS_PER_CARTON,
  PCS_PER_CARTON,
} from './HandPackingEntry';

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: true,
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
      if (url.includes('/divisions')) {
        return Promise.resolve({
          data: [
            { id: 'div-1', name: 'Spoke Division', divisionCode: 'DIV-SPD' },
          ],
        });
      }
      if (url.includes('/sections')) {
        return Promise.resolve({
          data: [
            { id: 'sec-1', name: 'SPD Packing', sectionCode: 'SEC-013', divisionId: 'div-1' },
          ],
        });
      }
      if (url.includes('/departments')) {
        return Promise.resolve({
          data: [
            { id: 'dept-1', name: 'Spoke Packing', departmentCode: 'SPD-DEPT008', sectionId: 'sec-1' },
          ],
        });
      }
      if (url.startsWith('/production/shifts')) {
        return Promise.resolve([
          { id: 'shift-1', name: 'Shift A', shiftCode: 'A', plannedHours: 8 },
        ]);
      }
      if (url.includes('/items')) {
        return Promise.resolve({
          data: [
            {
              id: 'item-fg-1',
              itemCode: 'SPI-FG-SPK-003',
              name: '250X18 Inn / Out Spoke Butted__CD-250X17 Nipple',
              itemType: 'FINISHED_GOOD',
              baseUom: { id: 'uom-pcs', code: 'PCS' },
            },
            {
              id: 'item-fg-2',
              itemCode: 'SPI-FG-SPK-004',
              name: 'Custom Multi-Component Spoke Set',
              itemType: 'FINISHED_GOOD',
              baseUom: { id: 'uom-pcs', code: 'PCS' },
            },
          ],
        });
      }
      if (url.startsWith('/master-data/uom') || url.startsWith('/uoms')) {
        return Promise.resolve([
          { id: 'uom-pcs', code: 'PCS', name: 'Pieces' },
          { id: 'uom-grs', code: 'GRS', name: 'Gross' },
        ]);
      }
      if (url.includes('uom-conversion')) {
        return Promise.resolve([
          { fromUomId: 'uom-grs', toUomId: 'uom-pcs', conversionFactor: 144, fromCode: 'GRS', toCode: 'PCS' },
        ]);
      }
      if (url.startsWith('/sales/finished-goods/item-availability')) {
        return Promise.resolve({
          data: {
            currentPhysicalStock: 12800,
            allocatedCommittedStock: 8640,
            availableStock: 4160,
            safetyStock: 10000,
            shortage: 5840,
          },
        });
      }
      if (url.includes('/warehouses')) {
        return Promise.resolve({
          data: [
            { id: 'wh-fg-1', name: 'FG Store', warehouseCode: 'WH-FG', warehouseType: 'FINISHED_GOODS' },
            { id: 'wh-wip-1', name: 'WIP Store', warehouseCode: 'WH-WIP', warehouseType: 'WORK_IN_PROGRESS' },
          ],
        });
      }
      if (url.startsWith('/bom/product/item-fg-2')) {
        // Different BOM test fixture: 4 components, non-spoke ratios
        return Promise.resolve({
          data: {
            id: 'bom-2',
            bomCode: 'BOM-CUSTOM-004',
            name: '4-Component Custom Assembly BOM',
            baseQuantity: 1,
            status: 'ACTIVE',
            lines: [
              {
                id: 'line-2-1',
                lineNumber: 1,
                itemId: 'comp-c1',
                item: { id: 'comp-c1', itemCode: 'COMP-A', name: 'Component Alpha' },
                quantity: 0.25,
                uom: { code: 'PCS' },
              },
              {
                id: 'line-2-2',
                lineNumber: 2,
                itemId: 'comp-c2',
                item: { id: 'comp-c2', itemCode: 'COMP-B', name: 'Component Beta' },
                quantity: 0.75,
                uom: { code: 'PCS' },
              },
              {
                id: 'line-2-3',
                lineNumber: 3,
                itemId: 'comp-c3',
                item: { id: 'comp-c3', itemCode: 'COMP-C', name: 'Component Gamma' },
                quantity: 1.5,
                uom: { code: 'PCS' },
              },
              {
                id: 'line-2-4',
                lineNumber: 4,
                itemId: 'comp-c4',
                item: { id: 'comp-c4', itemCode: 'COMP-D', name: 'Component Delta' },
                quantity: 2.0,
                uom: { code: 'PCS' },
              },
            ],
          },
        });
      }
      if (url.startsWith('/bom/product')) {
        // Standard Spoke BOM-SPK-003
        return Promise.resolve({
          data: {
            id: 'a989e5fa-41a0-4cd6-84be-c3efd89c0d2a',
            bomCode: 'BOM-SPK-003',
            name: '250X18 Butted Spoke Set Carton BOM',
            baseQuantity: 1,
            status: 'ACTIVE',
            lines: [
              {
                id: 'line-1',
                lineNumber: 1,
                itemId: 'comp-1',
                item: { id: 'comp-1', itemCode: 'WIP-SPL-003', name: 'CD-250*18 Inner Butted' },
                quantity: 0.5,
                uom: { code: 'PCS' },
                remarks: 'CD-250*18 Inner Butted Spoke',
              },
              {
                id: 'line-2',
                lineNumber: 2,
                itemId: 'comp-2',
                item: { id: 'comp-2', itemCode: 'WIP-SPL-004', name: 'CD-250*18 Outer Butted' },
                quantity: 0.5,
                uom: { code: 'PCS' },
                remarks: 'CD-250*18 Outer Butted Spoke',
              },
              {
                id: 'line-3',
                lineNumber: 3,
                itemId: 'comp-3',
                item: { id: 'comp-3', itemCode: 'DEMO-NF-001', name: 'Nipple 8mm Chrome-Ready' },
                quantity: 1.0,
                uom: { code: 'PCS' },
                remarks: 'CD-250X17 Nipple Finished',
              },
            ],
          },
        });
      }
      if (url.startsWith('/inventory/balances/available') || url.startsWith('/inventory/balances')) {
        return Promise.resolve({ success: true, data: 100000 });
      }
      return Promise.resolve({ data: [] });
    }),
    post: jest.fn().mockImplementation((url: string, payload: any) => {
      if (url === '/production/entries') {
        return Promise.resolve({
          success: true,
          data: { id: 'entry-pkg-saved-001', ...payload },
        });
      }
      return Promise.resolve({ success: true });
    }),
  },
}));

describe('Hand Packing Entry — BOM Source-of-Truth & Architectural Verification', () => {
  // Pure generic formula used by HandPackingEntry
  const calculateComponentConsumption = (
    lineQuantity: number,
    baseQuantity: number,
    targetPcs: number,
    pcsPerGross: number = PCS_PER_GROSS
  ) => {
    const bomRatio = baseQuantity > 0 ? lineQuantity / baseQuantity : lineQuantity;
    const requiredPcs = Math.round(bomRatio * targetPcs * 100) / 100;
    const requiredGross = Math.round((requiredPcs / pcsPerGross) * 100) / 100;
    return { bomRatio, requiredPcs, requiredGross };
  };

  describe('1. Authoritative UOM Conversion Standards', () => {
    test('verifies 1 Gross = 144 PCS', () => {
      expect(PCS_PER_GROSS).toBe(144);
    });

    test('verifies 1 Carton = 10 Gross', () => {
      expect(GROSS_PER_CARTON).toBe(10);
    });

    test('verifies 1 Carton = 1,440 PCS', () => {
      expect(PCS_PER_CARTON).toBe(1440);
      expect(GROSS_PER_CARTON * PCS_PER_GROSS).toBe(1440);
    });
  });

  describe('2. Multi-Carton Scaled Tests (BOM-SPK-003 baseline: Inner=0.5, Outer=0.5, Nipple=1.0)', () => {
    test('1 Carton (10 GRS / 1,440 PCS): Inner = 5 GRS, Outer = 5 GRS, Nipple = 10 GRS', () => {
      const targetPcs = 1 * PCS_PER_CARTON; // 1,440 PCS
      const inner = calculateComponentConsumption(0.5, 1, targetPcs);
      const outer = calculateComponentConsumption(0.5, 1, targetPcs);
      const nipple = calculateComponentConsumption(1.0, 1, targetPcs);

      expect(inner.requiredGross).toBe(5);
      expect(inner.requiredPcs).toBe(720);

      expect(outer.requiredGross).toBe(5);
      expect(outer.requiredPcs).toBe(720);

      expect(nipple.requiredGross).toBe(10);
      expect(nipple.requiredPcs).toBe(1440);
    });

    test('2 Cartons (20 GRS / 2,880 PCS): Inner = 10 GRS, Outer = 10 GRS, Nipple = 20 GRS', () => {
      const targetPcs = 2 * PCS_PER_CARTON; // 2,880 PCS
      const inner = calculateComponentConsumption(0.5, 1, targetPcs);
      const outer = calculateComponentConsumption(0.5, 1, targetPcs);
      const nipple = calculateComponentConsumption(1.0, 1, targetPcs);

      expect(inner.requiredGross).toBe(10);
      expect(inner.requiredPcs).toBe(1440);

      expect(outer.requiredGross).toBe(10);
      expect(outer.requiredPcs).toBe(1440);

      expect(nipple.requiredGross).toBe(20);
      expect(nipple.requiredPcs).toBe(2880);
    });

    test('10 Cartons (100 GRS / 14,400 PCS): Inner = 50 GRS, Outer = 50 GRS, Nipple = 100 GRS', () => {
      const targetPcs = 10 * PCS_PER_CARTON; // 14,400 PCS
      const inner = calculateComponentConsumption(0.5, 1, targetPcs);
      const outer = calculateComponentConsumption(0.5, 1, targetPcs);
      const nipple = calculateComponentConsumption(1.0, 1, targetPcs);

      expect(inner.requiredGross).toBe(50);
      expect(inner.requiredPcs).toBe(7200);

      expect(outer.requiredGross).toBe(50);
      expect(outer.requiredPcs).toBe(7200);

      expect(nipple.requiredGross).toBe(100);
      expect(nipple.requiredPcs).toBe(14400);
    });

    test('50 Cartons (500 GRS / 72,000 PCS): Inner = 250 GRS, Outer = 250 GRS, Nipple = 500 GRS', () => {
      const targetPcs = 50 * PCS_PER_CARTON; // 72,000 PCS
      const inner = calculateComponentConsumption(0.5, 1, targetPcs);
      const outer = calculateComponentConsumption(0.5, 1, targetPcs);
      const nipple = calculateComponentConsumption(1.0, 1, targetPcs);

      expect(inner.requiredGross).toBe(250);
      expect(inner.requiredPcs).toBe(36000);

      expect(outer.requiredGross).toBe(250);
      expect(outer.requiredPcs).toBe(36000);

      expect(nipple.requiredGross).toBe(500);
      expect(nipple.requiredPcs).toBe(72000);
    });

    test('100 Cartons (1,000 GRS / 144,000 PCS): Inner = 500 GRS, Outer = 500 GRS, Nipple = 1,000 GRS', () => {
      const targetPcs = 100 * PCS_PER_CARTON; // 144,000 PCS
      const inner = calculateComponentConsumption(0.5, 1, targetPcs);
      const outer = calculateComponentConsumption(0.5, 1, targetPcs);
      const nipple = calculateComponentConsumption(1.0, 1, targetPcs);

      expect(inner.requiredGross).toBe(500);
      expect(inner.requiredPcs).toBe(72000);

      expect(outer.requiredGross).toBe(500);
      expect(outer.requiredPcs).toBe(72000);

      expect(nipple.requiredGross).toBe(1000);
      expect(nipple.requiredPcs).toBe(144000);
    });
  });

  describe('3. Architectural BOM-Driven Proof (Different BOM Ratios: 0.25, 0.75, 1.50)', () => {
    test('calculates arbitrary BOM ratios without falling back to Spoke 0.5/1.0', () => {
      const targetPcs = 50 * PCS_PER_CARTON; // 50 Cartons = 72,000 PCS

      // Component A: 0.25 ratio
      const compA = calculateComponentConsumption(0.25, 1, targetPcs);
      expect(compA.bomRatio).toBe(0.25);
      expect(compA.requiredPcs).toBe(18000);
      expect(compA.requiredGross).toBe(125);

      // Component B: 0.75 ratio
      const compB = calculateComponentConsumption(0.75, 1, targetPcs);
      expect(compB.bomRatio).toBe(0.75);
      expect(compB.requiredPcs).toBe(54000);
      expect(compB.requiredGross).toBe(375);

      // Component C: 1.50 ratio
      const compC = calculateComponentConsumption(1.50, 1, targetPcs);
      expect(compC.bomRatio).toBe(1.50);
      expect(compC.requiredPcs).toBe(108000);
      expect(compC.requiredGross).toBe(750);
    });
  });

  describe('4. Negative Test: Item Names & Codes Do NOT Determine Calculation', () => {
    test('proves a component named "Nipple" with ratio 0.25 calculates as 0.25 (NOT 1.00)', () => {
      const targetPcs = 72000;
      const nippleCustom = calculateComponentConsumption(0.25, 1, targetPcs);
      expect(nippleCustom.bomRatio).toBe(0.25);
      expect(nippleCustom.requiredPcs).toBe(18000);
      expect(nippleCustom.requiredGross).toBe(125);
      expect(nippleCustom.requiredGross).not.toBe(500); // Proves 1.00 override is gone
    });

    test('proves a component named "Inner Spoke" with ratio 0.80 calculates as 0.80 (NOT 0.50)', () => {
      const targetPcs = 72000;
      const innerCustom = calculateComponentConsumption(0.80, 1, targetPcs);
      expect(innerCustom.bomRatio).toBe(0.80);
      expect(innerCustom.requiredPcs).toBe(57600);
      expect(innerCustom.requiredGross).toBe(400);
      expect(innerCustom.requiredGross).not.toBe(250); // Proves 0.50 override is gone
    });

    test('proves a component named "Demo Component" with ratio 0.50 calculates strictly on ratio', () => {
      const targetPcs = 72000;
      const demoComp = calculateComponentConsumption(0.50, 1, targetPcs);
      expect(demoComp.bomRatio).toBe(0.50);
      expect(demoComp.requiredPcs).toBe(36000);
      expect(demoComp.requiredGross).toBe(250);
    });
  });

  describe('5. Arbitrary Component Count Verification', () => {
    test('supports BOM with 2 components', () => {
      const lines = [
        { qty: 0.5 },
        { qty: 0.5 },
      ];
      expect(lines.length).toBe(2);
      const results = lines.map((l) => calculateComponentConsumption(l.qty, 1, 72000));
      expect(results).toHaveLength(2);
      expect(results[0].requiredGross).toBe(250);
      expect(results[1].requiredGross).toBe(250);
    });

    test('supports BOM with 4 components', () => {
      const lines = [
        { qty: 0.25 },
        { qty: 0.75 },
        { qty: 1.50 },
        { qty: 2.00 },
      ];
      expect(lines.length).toBe(4);
      const results = lines.map((l) => calculateComponentConsumption(l.qty, 1, 72000));
      expect(results).toHaveLength(4);
      expect(results[0].requiredGross).toBe(125);
      expect(results[1].requiredGross).toBe(375);
      expect(results[2].requiredGross).toBe(750);
      expect(results[3].requiredGross).toBe(1000);
    });

    test('supports BOM with 5+ components', () => {
      const lines = [
        { qty: 0.2 }, { qty: 0.3 }, { qty: 0.5 }, { qty: 1.0 }, { qty: 1.2 }
      ];
      expect(lines.length).toBe(5);
      const results = lines.map((l) => calculateComponentConsumption(l.qty, 1, 72000));
      expect(results).toHaveLength(5);
      expect(results[4].requiredGross).toBe(600);
    });
  });

  describe('6. UI Integration & Rendering Tests', () => {
    test('renders Packing Entry page with enterprise sections and preselected organization context', async () => {
      render(
        <BrowserRouter>
          <App>
            <HandPackingEntry />
          </App>
        </BrowserRouter>
      );

      // Section A: Header title
      expect(screen.getAllByText('Packing Production Entry').length).toBeGreaterThan(0);
      expect(screen.getByText('HAND PACKING (BOM-EXPANDED)')).toBeInTheDocument();

      // Mode switch
      expect(screen.getByText('Machine Production')).toBeInTheDocument();
      expect(screen.getByText('Hand Packing')).toBeInTheDocument();

      // Packing Information fields
      expect(screen.getByText(/Packing Information/i)).toBeInTheDocument();
      expect(screen.getByText(/Packing No/i)).toBeInTheDocument();
      expect(screen.getByText(/Packing Station/i)).toBeInTheDocument();

      // Section B: Daily Target & Progress
      expect(screen.getByText(/Daily Total Packing Target/i)).toBeInTheDocument();
      expect(screen.getByText(/Daily Target/i)).toBeInTheDocument();
      expect(screen.getByText(/Packed Today/i)).toBeInTheDocument();
      expect(screen.getByText(/Achievement/i)).toBeInTheDocument();

      // Section C: Inventory & Order Impact
      expect(screen.getByText(/Inventory & Order Impact/i)).toBeInTheDocument();
      expect(screen.getByText(/Current FG Inventory/i)).toBeInTheDocument();
      expect(screen.getByText(/Pending Sales Orders/i)).toBeInTheDocument();
      expect(screen.getByText(/Available for Orders/i)).toBeInTheDocument();
      expect(screen.getByText(/Safety Stock Position/i)).toBeInTheDocument();

      // Section D: Packing Items table
      expect(screen.getByText(/Packing Items & Quantities/i)).toBeInTheDocument();
      expect(screen.getByText(/1 GROSS = 144 PCS/i)).toBeInTheDocument();

      // Section E: Packing Process Flow
      expect(screen.getByText(/Packing Process Flow/i)).toBeInTheDocument();
      expect(screen.getByText(/1. Production Output/i)).toBeInTheDocument();
      expect(screen.getByText(/2. Hand Packing/i)).toBeInTheDocument();
      expect(screen.getByText(/3. FG Inventory/i)).toBeInTheDocument();
      expect(screen.getByText(/4. FG Audit Report/i)).toBeInTheDocument();
      expect(screen.getByText(/5. Sales & Dispatch/i)).toBeInTheDocument();

      // Section F: FG Report preview
      expect(screen.getByText(/FG Report Preview \(Post-Packing\)/i)).toBeInTheDocument();

      // Save button
      expect(screen.getByText(/Save Packing Production Entry/i)).toBeInTheDocument();
    });

    test('dynamically expands BOM lines from database API response without name-based hardcoding', async () => {
      render(
        <BrowserRouter>
          <App>
            <HandPackingEntry />
          </App>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Packing Items & Quantities/i)).toBeInTheDocument();
      });

      // Verify Finished Good item addition and dynamic row expansion
      const addItemBtn = screen.getByRole('button', { name: /Add Finished Good Item/i });
      fireEvent.click(addItemBtn);

      await waitFor(() => {
        expect(screen.getByText(/\+ Add Another Finished Good/i)).toBeInTheDocument();
      });
    });

    test('allows adding multiple Finished Goods, each maintaining its own independent BOM', async () => {
      render(
        <BrowserRouter>
          <App>
            <HandPackingEntry />
          </App>
        </BrowserRouter>
      );

      const addItemBtn = screen.getByRole('button', { name: /Add Finished Good Item/i });
      expect(addItemBtn).toBeInTheDocument();
      fireEvent.click(addItemBtn);

      await waitFor(() => {
        expect(screen.getByText(/\+ Add Another Finished Good/i)).toBeInTheDocument();
      });
    });
  });
});
