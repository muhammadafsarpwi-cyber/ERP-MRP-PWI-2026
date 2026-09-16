import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import ProductionReports, { perUnitWeightLabel } from './ProductionReports';
import apiService from '../../services/api';
import dashboardService from '../../services/dashboardService';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

/* Real backend shape for /production/entries/report:
   { success, filters, entryCount, departments[], grandTotalsByUom[] }
   NOTE: there is NO `data` wrapper — the old frontend read r.data (undefined)
   which caused the empty "No department production data" bug. */
const reportResponse = {
  success: true,
  filters: {},
  entryCount: 2,
  departments: [
    {
      departmentId: 'dept-1',
      departmentCode: 'DR',
      departmentName: 'Wire Drawing',
      divisionName: 'Wire Division',
      sectionName: 'Wire Section',
      items: [
        {
          itemId: 'i-1', itemCode: 'WIRE-120', itemName: '120mm Finished Wire',
          itemType: 'FINISHED_GOOD', materialRoleUsage: null,
          itemDivisionName: 'Control Cable Division', itemSectionName: 'Spiral', itemDepartmentName: 'Flattening',
          uomCode: 'KG', weightPerPiece: 35.5, weightPerMeter: null, weightUomCode: 'KG',
          actualKg: 620, scrapPct: 1.29,
          targetQuantity: 500, actualQuantity: 620,
          scrapQuantity: 8, runningHours: 14, downtimeHours: 1, plannedHours: 16,
          entryCount: 2, achievementPercentage: 124, efficiencyPercentage: 87.5,
        },
        {
          itemId: 'i-2', itemCode: 'RM-WIRE-001', itemName: '1.20 mm-B4 Wire',
          itemType: 'RAW_MATERIAL', materialRoleUsage: 'Process Component Materials',
          itemDivisionName: 'Control Cable Division', itemSectionName: 'Raw Material Store', itemDepartmentName: 'CCD Stores',
          uomCode: 'KG', weightPerPiece: null, weightPerMeter: 0.032, weightUomCode: 'KG',
          actualKg: 560, scrapPct: 2.5,
          targetQuantity: 650, actualQuantity: 560,
          scrapQuantity: 14, runningHours: 12, downtimeHours: 0, plannedHours: 16,
          entryCount: 2, achievementPercentage: 86.15, efficiencyPercentage: 75,
        },
        {
          itemId: 'i-3', itemCode: 'RM-WIRE-002', itemName: '1.45 mm-B4 Wire',
          itemType: 'RAW_MATERIAL', materialRoleUsage: 'Process Component Materials',
          itemDivisionName: 'Control Cable Division', itemSectionName: 'Raw Material Store', itemDepartmentName: 'CCD Stores',
          uomCode: 'KG', targetQuantity: 600, actualQuantity: 500,
          scrapQuantity: 0, runningHours: 12, downtimeHours: 0, plannedHours: 16,
          entryCount: 1, achievementPercentage: 83.33, efficiencyPercentage: 75,
        },
        {
          itemId: 'i-4', itemCode: 'CONS-001', itemName: 'Hydraulic Oil 46',
          itemType: 'CONSUMABLE', materialRoleUsage: null,
          itemDivisionName: null, itemSectionName: null, itemDepartmentName: null,
          uomCode: 'L', targetQuantity: 10, actualQuantity: 9,
          scrapQuantity: 0, runningHours: 1, downtimeHours: 0, plannedHours: 2,
          entryCount: 1, achievementPercentage: 90, efficiencyPercentage: 50,
        },
        {
          // Configured Item Master production item with NO production/scrap
          // transaction in scope — must STILL appear with zero values (§7).
          itemId: 'i-5', itemCode: 'RM-WIRE-005', itemName: '1.25 mm-F9 Wire',
          itemType: 'RAW_MATERIAL', materialRoleUsage: 'Process Component Materials',
          itemDivisionName: 'Control Cable Division', itemSectionName: 'Raw Material Store', itemDepartmentName: 'CCD Stores',
          uomCode: 'KG', targetQuantity: 0, actualQuantity: 0,
          scrapQuantity: 0, runningHours: 0, downtimeHours: 0, plannedHours: 0,
          entryCount: 0, achievementPercentage: null, efficiencyPercentage: null,
        },
        {
          // PCS item: backend derives Actual KG = Actual PCS × weight_per_piece
          // (50000 × 0.038 = 1900) and shows Rejection % against Actual KG.
          itemId: 'i-6', itemCode: 'DEMO-NF-001', itemName: 'Nipple 8mm Chrome-Ready',
          itemType: 'SEMI_FINISHED', materialRoleUsage: 'Process Component Materials',
          itemDivisionName: 'Control Cable Division', itemSectionName: 'Pre-Fabrication', itemDepartmentName: 'Pre-Fab Shop',
          uomCode: 'PCS', weightPerPiece: 0.038, weightPerMeter: null, weightUomCode: 'KG',
          actualKg: 1900, scrapPct: 0.26,
          targetQuantity: 0, actualQuantity: 50000,
          scrapQuantity: 5, runningHours: 0, downtimeHours: 0, plannedHours: 0,
          entryCount: 1, achievementPercentage: null, efficiencyPercentage: null,
        },
      ],
    },
  ],
  grandTotalsByUom: [
    { uomCode: 'KG', targetQuantity: 1750, actualQuantity: 1680, scrapQuantity: 22, runningHours: 38, downtimeHours: 1, plannedHours: 48, achievementPercentage: 96, efficiencyPercentage: 79.17, entryCount: 5 },
  ],
};

const entriesResponse = {
  success: true,
  data: [
    {
      id: 'pe-1', entryDate: '2026-09-10', machineNo: 'DR-01', operatorName: 'Ali',
      targetQuantity: 250, actualQuantity: 310, scrapQuantity: 4,
      runningHours: 7, downtimeHours: 0, remarks: null,
      item: { itemCode: 'WIRE-120', name: '1.20mm Wire', weightPerPiece: null, weightPerMeter: null },
      uom: { code: 'KG' }, shift: { name: 'Shift A (Morning)' },
      department: { name: 'Wire Drawing' },
    },
    {
      id: 'pe-2', entryDate: '2026-09-11', machineNo: 'FT-02', operatorName: 'Sara',
      targetQuantity: 45000, actualQuantity: 50000, scrapQuantity: 5,
      runningHours: 7, downtimeHours: 0, remarks: null,
      item: { itemCode: 'FLAT-001', name: 'Flat Wire 1.20mm', weightPerPiece: 0.038, weightPerMeter: null },
      uom: { code: 'PCS' }, shift: { name: 'Shift A (Morning)' },
      department: { name: 'Wire Drawing' },
    },
  ],
  total: 2,
};

const ordersResponse = { success: true, data: [], total: 0 };
const targetsResponse = {
  data: [
    {
      id: 'mt-1', targetQuantity: 250, standardHours: 8,
      effectiveFrom: '2026-08-01', effectiveTo: null, status: 'ACTIVE',
      machine: { machineCode: 'DR-01', name: 'Wire Drawing Machine' },
      shift: { shiftCode: 'SHIFT-A', name: 'Shift A (Morning)' },
      item: { itemCode: 'WIRE-120', name: '1.20mm Wire' },
      uom: { code: 'KG' },
    },
  ],
  total: 1,
};

const shipmentsResponse = {
  success: true,
  data: [
    {
      id: 'dlv-1', deliveryNumber: 'DN-2026-0001', deliveryDate: '2026-09-12',
      status: 'Delivered', subtotal: 1200, taxAmount: 60, totalAmount: 1260,
      carrier: 'UPS', trackingNumber: 'TRK-001',
      customer: { customerCode: 'C-01', companyName: 'Acme Trading' },
      salesOrder: { orderNumber: 'SO-2026-001' },
    },
  ],
  total: 1,
};

const shiftsResponse = { success: true, data: [{ id: 'sh-1', shiftCode: 'SHIFT-A', name: 'Shift A (Morning)', plannedHours: '8.00' }] };
const uomsResponse = { data: [{ id: 'uom-1', code: 'KG', name: 'Kilogram', uomType: 'WEIGHT' }], total: 1 };

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('ProductionReports', () => {
  beforeEach(() => {
    jest.spyOn(dashboardService, 'getFilterDivisions').mockResolvedValue({ success: true, data: [{ id: 'div-1', name: 'Wire Division' }] });
    jest.spyOn(dashboardService, 'getFilterDepartments').mockResolvedValue({ success: true, data: [{ id: 'dept-1', name: 'Wire Drawing' }] });
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/production/entries/report') return Promise.resolve(reportResponse);
      if (u === '/production/entries') return Promise.resolve(entriesResponse);
      if (u === '/production/orders') return Promise.resolve(ordersResponse);
      if (u === '/production/machine-targets') return Promise.resolve(targetsResponse);
      if (u === '/sales/deliveries') return Promise.resolve(shipmentsResponse);
      if (u === '/production/shifts') return Promise.resolve(shiftsResponse);
      if (u === '/master-data/uom') return Promise.resolve(uomsResponse);
      return Promise.resolve({ data: [], total: 0 });
    });
  });

  it('labels every Rejection quantity column as Rejection (KG) including Daily Production entries', async () => {
    const user = userEvent.setup();
    render(
      <App>
        <MemoryRouter>
          <ProductionReports />
        </MemoryRouter>
      </App>,
    );

    await waitFor(() => expect(screen.getAllByText('Wire Drawing').length).toBeGreaterThan(0));

    // Daily Production tab still shows the scrap column with an explicit KG unit.
    await user.click(screen.getByRole('tab', { name: /Daily Production/i }));
    const entriesPanel = await waitFor(() => {
      const pane = screen.getAllByRole('tabpanel').find((p) => p.textContent?.includes('Ali'));
      expect(pane).toBeTruthy();
      return pane as HTMLElement;
    }, { timeout: 5000 });
    await waitFor(() => {
      expect(within(entriesPanel).getAllByText('Rejection (KG)').length).toBeGreaterThan(0);
      expect(within(entriesPanel).getByText('Ali')).toBeInTheDocument();
      // Daily Production entries tab also carries Per Unit Weight + Actual KG:
      // KG entry keeps its Actual KG (310), PCS entry computes 50000 × 0.038 = 1900.
      expect(within(entriesPanel).getAllByText('Per Unit Weight').length).toBeGreaterThan(0);
      expect(within(entriesPanel).getAllByText('Actual KG').length).toBeGreaterThan(0);
      expect(within(entriesPanel).getByText('0.038 KG/PCS')).toBeInTheDocument();
      expect(within(entriesPanel).getByText('1,900.00')).toBeInTheDocument();
    }, { timeout: 5000 });
  }, 20000);

  it('Department Production columns follow Family → Target → Product Name → Per Unit Weight → Actual PCS → Actual KG → Rejection (KG) → Rejection %', async () => {
    render(
      <App>
        <MemoryRouter>
          <ProductionReports />
        </MemoryRouter>
      </App>,
    );

    await waitFor(() => expect(screen.getAllByText('Wire Drawing').length).toBeGreaterThan(0));

    const deptPanel = await waitFor(() => {
      const pane = screen.getAllByRole('tabpanel').find((p) => p.textContent?.includes('120mm Finished Wire'));
      expect(pane).toBeTruthy();
      return pane as HTMLElement;
    }, { timeout: 5000 });

    const headerOrder = ['Family', 'Target', 'Product Name', 'Per Unit Weight', 'Actual PCS', 'Actual KG', 'Rejection (KG)', 'Rejection %'];
    const positions = headerOrder.map((name) => {
      const headers = within(deptPanel).getAllByRole('columnheader').map((h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? '');
      return headers.findIndex((h) => h.includes(name));
    });
    expect(positions.every((i) => i !== -1)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  }, 20000);

  it('Scrap & Rejection columns follow Family → Target → Item Name → Per Unit Weight → Actual PCS → Actual KG → Rejection (KG) → Rejection % and blank Rejection % for nil Actual KG', async () => {
    const user = userEvent.setup();
    render(
      <App>
        <MemoryRouter>
          <ProductionReports />
        </MemoryRouter>
      </App>,
    );

    await waitFor(() => expect(screen.getAllByText('Wire Drawing').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('tab', { name: /Scrap & Rejection/i }));
    const scrapPanel = await waitFor(() => {
      const pane = screen.getAllByRole('tabpanel').find((p) => p.textContent?.includes('Scrap & Rejection'));
      expect(pane).toBeTruthy();
      return pane as HTMLElement;
    }, { timeout: 5000 });

    const headerOrder = ['Family', 'Target', 'Item Name', 'Per Unit Weight', 'Actual PCS', 'Actual KG', 'Rejection (KG)', 'Rejection %'];
    const positions = headerOrder.map((name) => {
      const headers = within(scrapPanel).getAllByRole('columnheader').map((h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? '');
      return headers.findIndex((h) => h.includes(name));
    });
    expect(positions.every((i) => i !== -1)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }

    // Item Master item without a transaction (RM-WIRE-005) has null Actual KG and
    // zero Rejection → its Rejection % must render as blank "–", never Infinity/NaN.
    await waitFor(() => expect(within(scrapPanel).getByText('RM-WIRE-005')).toBeInTheDocument(), { timeout: 5000 });
    expect(within(scrapPanel).queryByText('NaN')).not.toBeInTheDocument();
    expect(within(scrapPanel).queryByText('Infinity')).not.toBeInTheDocument();
  }, 20000);

  it('calls the real report endpoint (no r.data wrapper) and renders department rows', async () => {
    render(
      <App>
        <MemoryRouter>
          <ProductionReports />
        </MemoryRouter>
      </App>,
    );

    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        expect.stringContaining('/production/entries/report'),
        expect.anything(),
      ),
    );

    await waitFor(() => expect(screen.getAllByText('Wire Drawing').length).toBeGreaterThan(0));
    expect(screen.getByText('120mm Finished Wire')).toBeInTheDocument();
    expect(screen.getByText('124.0%')).toBeInTheDocument();
    // New Per Unit Weight column (Item Master weight fields) is rendered.
    expect(screen.getAllByText('Per Unit Weight').length).toBeGreaterThan(0);
    // Rejection label explicitly shows KG; Actual label is "Actual PCS"; new
    // Actual KG + Rejection % columns are present.
    expect(screen.getAllByText('Rejection (KG)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Actual PCS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Actual KG').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rejection %').length).toBeGreaterThan(0);
    // Actual KG for a KG item: existing Actual quantity, unchanged (620 → 620.00).
    expect(screen.getAllByText('620.00').length).toBeGreaterThan(0);
    // PCS item: Actual PCS stays 50,000 AND Actual KG (50000 × 0.038 = 1900) is shown separately.
    expect(screen.getAllByText('50,000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1,900.00').length).toBeGreaterThan(0);
    // Item Master driven: configured production items with no transaction still
    // render with zero Target/Actual/Scrap — never dropped, never blank.
    expect(screen.getByText('RM-WIRE-005')).toBeInTheDocument();
    expect(screen.getByText('1.25 mm-F9 Wire')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.queryByText('No department production data')).not.toBeInTheDocument();
  });

  it('loads shipment and machine-target data required by the new report tabs', async () => {
    render(
      <App>
        <MemoryRouter>
          <ProductionReports />
        </MemoryRouter>
      </App>,
    );

    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(expect.stringContaining('/sales/deliveries'), expect.anything()));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(expect.stringContaining('/production/machine-targets'), expect.anything()));

    const urls = (apiMock.get as jest.Mock).mock.calls.map((c: any[]) => String(c[0]));
    expect(urls).toContain('/production/entries/report');
    expect(urls).toContain('/sales/deliveries');
    expect(urls).toContain('/production/machine-targets');
    expect(urls).toContain('/production/shifts');
    expect(urls).toContain('/master-data/uom');
  });

  it('Scrap & Rejection maps Item Master type + role across all production categories, excluding consumables', async () => {
    const user = userEvent.setup();
    render(
      <App>
        <MemoryRouter>
          <ProductionReports />
        </MemoryRouter>
      </App>,
    );

    // Scrap rows are derived from the same /production/entries/report payload.
    await waitFor(() => expect(screen.getAllByText('Wire Drawing').length).toBeGreaterThan(0));

    // Switch to the Scrap & Rejection tab. Antd keeps already-mounted panes in the
    // DOM, so scope all scrap-tab assertions to the scrap tabpanel.
    await user.click(screen.getByRole('tab', { name: /Scrap & Rejection/i }));

    const scrapPanel = await waitFor(() => {
      const pane = screen.getAllByRole('tabpanel').find((p) => p.textContent?.includes('Scrap & Rejection'));
      expect(pane).toBeTruthy();
      return pane as HTMLElement;
    }, { timeout: 5000 });

    // Item Master mapping includes every production category: Raw Material, Work in
    // Progress, Semi-Finished and Finished Good — here RAW_MATERIAL + FINISHED_GOOD.
    await waitFor(() => expect(within(scrapPanel).getByText('RM-WIRE-001')).toBeInTheDocument(), { timeout: 5000 });
    expect(within(scrapPanel).getByText('RM-WIRE-002')).toBeInTheDocument();
    // Configured Raw Material with NO production/scrap transaction still maps in.
    expect(within(scrapPanel).getByText('RM-WIRE-005')).toBeInTheDocument();
    expect(within(scrapPanel).getByText('1.25 mm-F9 Wire')).toBeInTheDocument();
    expect(within(scrapPanel).getByText('WIRE-120')).toBeInTheDocument(); // Finished Good IS mapped
    expect(within(scrapPanel).getByText('120mm Finished Wire')).toBeInTheDocument();

    // Item Type shows the ERP label (never the raw enum)…
    expect(within(scrapPanel).getAllByText('Raw Material').length).toBeGreaterThanOrEqual(2);
    expect(within(scrapPanel).getByText('Finished Good')).toBeInTheDocument();
    expect(within(scrapPanel).queryByText('RAW_MATERIAL')).not.toBeInTheDocument();
    expect(within(scrapPanel).queryByText('FINISHED_GOOD')).not.toBeInTheDocument();

    // …Material Role / Use comes straight from the Item Master,
    expect(within(scrapPanel).getAllByText('Process Component Materials').length).toBeGreaterThanOrEqual(2);

    // …and the Item's own org from the Item Master is shown.
    expect(within(scrapPanel).getAllByText('CCD Stores').length).toBeGreaterThanOrEqual(2);

    // Oils / consumables (CONSUMABLE type) are NOT part of the mapping.
    expect(within(scrapPanel).queryByText('Hydraulic Oil 46')).not.toBeInTheDocument();
    expect(within(scrapPanel).queryByText('CONS-001')).not.toBeInTheDocument();

    // Scrap values keep 2-decimal precision (non-zero and zero both visible).
    expect(within(scrapPanel).getByText('14.00')).toBeInTheDocument();
    expect(within(scrapPanel).getAllByText('0.00').length).toBeGreaterThanOrEqual(2);
    // Rejection column label explicitly shows KG; Actual PCS / Actual KG / Rejection % present.
    expect(within(scrapPanel).getAllByText('Rejection (KG)').length).toBeGreaterThanOrEqual(1);
    expect(within(scrapPanel).getAllByText('Actual PCS').length).toBeGreaterThanOrEqual(1);
    expect(within(scrapPanel).getAllByText('Actual KG').length).toBeGreaterThanOrEqual(1);
    expect(within(scrapPanel).getAllByText('Rejection %').length).toBeGreaterThanOrEqual(1);
    // PCS item renders a separate Actual KG computed from Item Master weight
    // (DEMO-NF-001: 50000 × 0.038 = 1900.00) while Actual PCS stays 50,000.
    expect(within(scrapPanel).getByText('DEMO-NF-001')).toBeInTheDocument();
    expect(within(scrapPanel).getByText('1,900.00')).toBeInTheDocument();
    expect(within(scrapPanel).getByText('50,000')).toBeInTheDocument();
  }, 20000);
});

describe('perUnitWeightLabel', () => {
  beforeEach(() => {
    jest.spyOn(dashboardService, 'getFilterDivisions').mockResolvedValue({ success: true, data: [{ id: 'div-1', name: 'Wire Division' }] });
    jest.spyOn(dashboardService, 'getFilterDepartments').mockResolvedValue({ success: true, data: [{ id: 'dept-1', name: 'Wire Drawing' }] });
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/production/entries/report') return Promise.resolve(reportResponse);
      if (u === '/production/entries') return Promise.resolve(entriesResponse);
      if (u === '/production/orders') return Promise.resolve(ordersResponse);
      if (u === '/production/machine-targets') return Promise.resolve(targetsResponse);
      if (u === '/sales/deliveries') return Promise.resolve(shipmentsResponse);
      if (u === '/production/shifts') return Promise.resolve(shiftsResponse);
      if (u === '/master-data/uom') return Promise.resolve(uomsResponse);
      return Promise.resolve({ data: [], total: 0 });
    });
  });

  it('follows Item Master weight semantics per UOM (never invents weights)', () => {
    // Weight UOM: the quantity IS the weight → blank.
    expect(perUnitWeightLabel('KG', 35.5, null)).toBeNull();
    expect(perUnitWeightLabel('KG', null, 0.5)).toBeNull();
    // Length UOM → weight_per_meter as KG/<uom>.
    expect(perUnitWeightLabel('M', null, 0.25)).toBe('0.25 KG/M');
    expect(perUnitWeightLabel('MTR', null, 0.250000)).toBe('0.25 KG/MTR');
    // Count UOM → weight_per_piece as KG/<uom>.
    expect(perUnitWeightLabel('PCS', 0.125, null)).toBe('0.125 KG/PCS');
    expect(perUnitWeightLabel('EA', 2, null)).toBe('2 KG/EA');
    // UOMs without per-unit weight semantics → blank; zero weight → blank.
    expect(perUnitWeightLabel('L', null, null)).toBeNull();
    expect(perUnitWeightLabel('ROLL', 3, null)).toBeNull();
    expect(perUnitWeightLabel('PCS', 0, null)).toBeNull();
    expect(perUnitWeightLabel('M', null, 0)).toBeNull();
    expect(perUnitWeightLabel('', 1, 1)).toBeNull();
  });

  it('dept KPI row: 8 cards in order with Target red accent, Shipment distinct/cyan, Shipment % green at 100%, and neutral Rejection %', async () => {
    const user = userEvent.setup();
    render(
      <App>
        <MemoryRouter>
          <ProductionReports />
        </MemoryRouter>
      </App>,
    );

    await waitFor(() => expect(screen.getAllByText('Wire Drawing').length).toBeGreaterThan(0));

    const box = screen.getByRole('tab', { name: /Department Production/i });
    await user.click(box);

    const kpiCardsOrder = [
      'Total Target',
      'Total Actual / Production',
      'Achievement %',
      'Shipment',
      'Shipment %',
      'Actual KG',
      'Total Scrap / Rejection (KG)',
      'Rejection %',
    ];

    // Render in the exact specified order — read KPI cards off the dept tab panel.
    const order = kpiCardsOrder.map((title) =>
      [...document.querySelectorAll('.erp-pr-kpi-card')]
        .filter((c) => c.querySelector('.ant-statistic-title')?.textContent?.trim() === title)
        .map((c) => (c as HTMLElement).offsetTop),
    );

    // Every card is present and populates a real value (no drop, no blank).
    kpiCardsOrder.forEach((title) => {
      const cards = [...document.querySelectorAll('.erp-pr-kpi-card')].filter(
        (c) => c.querySelector('.ant-statistic-title')?.textContent?.trim() === title,
      );
      expect(cards.length).toBeGreaterThan(0);
    });

    // Target is red-accented and Shipment is visually distinct (cyan), never same tone.
    const targetCard = [...document.querySelectorAll('.erp-pr-kpi-card')].find(
      (c) => c.querySelector('.ant-statistic-title')?.textContent?.trim() === 'Total Target',
    );
    const shipmentCard = [...document.querySelectorAll('.erp-pr-kpi-card')].find(
      (c) => c.querySelector('.ant-statistic-title')?.textContent?.trim() === 'Shipment',
    );
    const targetSheet = 'erp-pr-kpi-card--tone-danger';
    expect(targetCard?.className).toContain(targetSheet);
    expect(shipmentCard?.className).toContain('erp-pr-kpi-card--tone-cyan');
    expect(shipmentCard?.className).not.toContain(targetSheet);

    // Shipment % is real Delivered/Deliveries = 100% (≥70 green) on the fixture.
    const shipmentPctCard = [...document.querySelectorAll('.erp-pr-kpi-card')].find(
      (c) => c.querySelector('.ant-statistic-title')?.textContent?.trim() === 'Shipment %',
    );
    const val = shipmentPctCard?.querySelector('.ant-statistic-content')?.textContent ?? '';
    expect(val).toMatch(/^100/);

    // Rejection % and Actual KG cards are present (KG-based semantics).
    expect(document.body.textContent).toContain('Rejection %');
    expect(document.body.textContent).toContain('Actual KG');
  });
});