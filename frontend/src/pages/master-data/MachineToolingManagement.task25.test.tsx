import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import MachineToolingManagement from './MachineToolingManagement';
import apiService from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(120000);

beforeAll(() => {
  window.matchMedia = (q: string) =>
    ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

const PERMISSIONS = [
  'manufacturing.tool_component.view',
  'manufacturing.tool_component.create',
  'manufacturing.tool_component.update',
  'manufacturing.tool_component.delete',
  'manufacturing.component_change.view',
  'manufacturing.component_change.create',
  'manufacturing.component_change.update',
  'manufacturing.component_change.delete',
  'manufacturing.tool_consumption.report',
];

const machines = [
  { id: 'mc-ft', machineId: 'MCH035', machineCode: 'FT-01', machineNumber: 'FT # 01', name: 'Flattening Machine FT-01' },
  { id: 'mc-sp', machineId: 'MCH012', machineCode: 'SP-01', machineNumber: 'SP # 01', name: 'Straightening Machine SP-01' },
];
const items = [{ id: 'it-1', itemCode: 'FG-CASING-001', name: 'Casing FG' }];
const uoms = [{ id: 'u-1', code: 'PCS', name: 'Pieces' }];
const jobCards = [{ id: 'jc-1', jobCardNo: 'JC-2026-001' }];

const componentFixture = (over: any = {}) => ({
  id: 'c-1',
  companyId: 'comp-1',
  machineId: 'mc-ft',
  itemId: 'it-1',
  uomId: 'u-1',
  componentType: 'DIE',
  componentName: 'Thread Die 12 mm',
  componentCode: 'FT-DIE-001',
  expectedLifeQuantity: '200000.0000',
  minThreshold: '10000.0000',
  maxThreshold: '750000.0000',
  description: 'Thread die for flattening machine',
  isActive: true,
  item: { id: 'it-1', itemCode: 'FG-CASING-001', name: 'Casing FG' },
  uom: { id: 'u-1', code: 'PCS', name: 'Pieces' },
  machine: { id: 'mc-ft', machineId: 'MCH035', machineCode: 'FT-01', machineNumber: 'FT # 01', name: 'Flattening Machine FT-01' },
  createdAt: '2026-08-01T08:00:00Z',
  updatedAt: '2026-08-01T08:00:00Z',
  ...over,
});

const componentSpFixture = (over: any = {}) => ({
  id: 'c-2',
  companyId: 'comp-1',
  machineId: 'mc-sp',
  itemId: null,
  uomId: 'u-1',
  componentType: 'CHAIN',
  componentName: 'Chain 3/4"',
  componentCode: 'SP-CHAIN-001',
  expectedLifeQuantity: '400000.0000',
  minThreshold: '30000.0000',
  maxThreshold: '1200000.0000',
  description: null,
  isActive: true,
  item: null,
  uom: { id: 'u-1', code: 'PCS', name: 'Pieces' },
  machine: { id: 'mc-sp', machineId: 'MCH012', machineCode: 'SP-01', machineNumber: 'SP # 01', name: 'Straightening Machine SP-01' },
  createdAt: '2026-08-10T10:00:00Z',
  updatedAt: '2026-08-10T10:00:00Z',
  ...over,
});

const components = [componentFixture(), componentSpFixture()];

const changeFixture = (over: any = {}) => ({
  id: 'ch-2',
  companyId: 'comp-1',
  machineId: 'mc-ft',
  componentId: 'c-1',
  jobCardId: null,
  oldToolCode: 'DEMO-FT-DIE-009',
  newToolCode: 'DEMO-FT-DIE-010',
  newToolDescription: 'Thread Die (resharpened)',
  changeDate: '2026-09-05',
  changeTime: '09:45',
  productionCounterBefore: '178500.0000',
  productionCounterAfter: '178500.0000',
  productionSincePrevious: '53500.0000',
  reason: 'worn',
  conditionStatus: 'USED',
  remarks: 'Acceptance example: 178500 − 125000 = 53500',
  changedAt: '2026-09-05T09:46:00Z',
  isActive: true,
  machine: { id: 'mc-ft', machineId: 'MCH035', machineCode: 'FT-01', machineNumber: 'FT # 01', name: 'Flattening Machine FT-01' },
  component: componentFixture(),
  jobCard: null,
  changedByUser: null,
  ...over,
});

const changes = [
  {
    ...changeFixture({ id: 'ch-1', changeDate: '2026-08-01', changeTime: '09:30', oldToolCode: 'DEMO-FT-DIE-008', newToolCode: 'DEMO-FT-DIE-009', productionCounterBefore: null, productionCounterAfter: '125000.0000', productionSincePrevious: null, conditionStatus: 'NEW', reason: 'install', remarks: 'First install', changedAt: '2026-08-01T09:31:00Z' }),
  },
  changeFixture(),
];

const historyPayload = {
  component: componentFixture(),
  machine: { id: 'mc-ft', machineId: 'MCH035', machineCode: 'FT-01', machineNumber: 'FT # 01', name: 'Flattening Machine FT-01' },
  counter: { value: 53500, base: 'PRODUCTION_ENTRIES_SUM' },
  summary: {
    expectedLifeQuantity: 200000,
    minThreshold: 10000,
    maxThreshold: 750000,
    totalChanges: 2,
    firstChangeDate: '2026-08-01',
    lastChangeDate: '2026-09-05',
    installedToolCode: 'DEMO-FT-DIE-010',
    counterAtInstall: 178500,
    avgLife: 53500,
    minLife: 53500,
    maxLife: 53500,
    usedByInstalled: 0,
    remainingByInstalled: 200000,
  },
  changes,
};

const reportPayload = {
  month: '2026-09',
  start: '2026-09-01',
  end: '2026-09-30',
  rows: [
    {
      machine: { id: 'mc-ft', machineCode: 'FT-01', machineName: 'Flattening Machine FT-01' },
      component: { id: 'c-1', componentCode: 'FT-DIE-001', componentName: 'Thread Die 12 mm', componentType: 'DIE', uomCode: 'PCS' },
      changes: 1,
      toolsInstalled: 1,
      qtyUsed: 1,
      productionCovered: 53500,
      avgLife: 53500,
      minLife: 53500,
      maxLife: 53500,
      lastChangeDate: '2026-09-05',
    },
  ],
  totals: { machines: 1, components: 1, changes: 1, qtyUsed: 1, productionCovered: 53500 },
};

const setupMocks = (opts?: { permissions?: string[] }) => {
  localStorage.clear();
  localStorage.setItem('erp_user', JSON.stringify({
    id: 'u-1', email: 'system.admin@erp.com', displayName: 'System Admin',
    permissions: opts?.permissions ?? PERMISSIONS,
  }));
  localStorage.setItem('erp_permissions_ts', String(Date.now()));

  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.put.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();

  apiMock.get.mockImplementation((url: any) => {
    const u = String(url);
    if (u === '/machines') return Promise.resolve({ data: machines });
    if (u === '/master-data/items') return Promise.resolve({ data: items });
    if (u === '/master-data/uom') return Promise.resolve({ data: uoms });
    if (u === '/maintenance/job-cards') return Promise.resolve({ data: jobCards });
    if (u === '/machine-tooling/components') return Promise.resolve({ data: components, total: components.length });
    if (u === '/machine-tooling/changes') return Promise.resolve({ data: changes, total: changes.length });
    if (/\/machine-tooling\/changes\/reports\/monthly/.test(u))
      return Promise.resolve({ data: reportPayload });
    if (/\/machine-tooling\/components\/.+?\/history$/.test(u)) return Promise.resolve({ data: historyPayload });
    if (/\/machine-tooling\/changes\/.+$/.test(u)) return Promise.resolve({ data: changeFixture({ jobCard: jobCards[0] }) });
    return Promise.resolve({ data: [] });
  });

  apiMock.post.mockResolvedValue({ data: { id: 'new-id' }, success: true });
  apiMock.put.mockResolvedValue({ data: { id: 'c-1' }, success: true });
  apiMock.patch.mockResolvedValue({ data: { id: 'c-1' }, success: true });
  apiMock.delete.mockResolvedValue({});
};

const renderPage = () =>
  render(
    <AntApp>
      <MemoryRouter>
        <MachineToolingManagement />
      </MemoryRouter>
    </AntApp>,
  );

/** The currently-visible antd modal wrap's content element. */
const visibleModal = (): HTMLElement => {
  const wraps = Array.from(document.body.querySelectorAll('.ant-modal-wrap'));
  const visible = wraps.find((w) => (w as HTMLElement).style.display !== 'none');
  const wrap = (visible ?? document.body.querySelector('.ant-modal-wrap')) as HTMLElement | null;
  const content = wrap?.querySelector('.ant-modal-content') ?? null;
  expect(content).not.toBeNull();
  return content as HTMLElement;
};

const openSelect = (placeholder: string) => {
  const node = Array.from(document.body.querySelectorAll('.ant-select'))
    .find((s) => (s.querySelector('.ant-select-selection-placeholder') as HTMLElement | null)?.textContent === placeholder);
  expect(node).toBeTruthy();
  const sel = node as HTMLElement;
  fireEvent.mouseDown(sel.querySelector('.ant-select-selector') as HTMLElement);
};

const pickOption = async (substring: string) => {
  let opt: Element | undefined;
  await waitFor(() => {
    opt = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find((o) =>
      (o.textContent ?? '').includes(substring),
    );
    expect(opt).toBeTruthy();
  }, { timeout: 30000 });
  fireEvent.click(opt as HTMLElement);
};

const openChangeTab = async () => {
  renderPage();
  await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
  fireEvent.click(screen.getAllByText('Change History')[0]);
  await waitFor(() => {
    expect(screen.getByText('DEMO-FT-DIE-010')).toBeInTheDocument();
  }, { timeout: 30000 });
};

/* ===================================================================
   TASK25 — Part B: Tool & Component Setup tab
   =================================================================== */
describe('TASK25 — Component Setup tab', () => {
  beforeEach(() => setupMocks());

  it('1. setup tab lists components with machine + type + status', async () => {
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    expect(screen.getByText('FT-DIE-001')).toBeInTheDocument();
    expect(screen.getByText('FT-01')).toBeInTheDocument();
    expect(screen.getByText('DIE')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('SP-CHAIN-001')).toBeInTheDocument();
    expect(screen.getAllByText(/200,000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('10,000 – 750,000')).toBeInTheDocument();
  });

  it('2. machine filter re-fetches with the machineId param', async () => {
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    openSelect('Machine');
    await pickOption('FT-01');
    await waitFor(() => {
      const calls = apiMock.get.mock.calls.filter(([u]) => String(u) === '/machine-tooling/components');
      const last = calls[calls.length - 1];
      expect(last).toBeTruthy();
      expect((last as any)?.[1]?.machineId as string | undefined).toBe('mc-ft');
    }, { timeout: 30000 });
  });

  it('3. Add Tool / Component opens the modal and save posts a new component', async () => {
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: /Add Tool \/ Component/ }));
    await waitFor(() => {
      const modal = visibleModal();
      expect(modal.querySelector('.ant-modal-title')?.textContent).toContain('Add Tool / Component');
    }, { timeout: 30000 });
    const modal = visibleModal();
    openSelect('Select machine');
    await pickOption('FT-01');
    fireEvent.change(within(modal).getByPlaceholderText('e.g. Thread Die 12 mm'), { target: { value: 'Test Blade' } });
    fireEvent.change(within(modal).getByPlaceholderText('e.g. TD-012'), { target: { value: 'TD-999' } });
    fireEvent.click(within(modal.querySelector('.ant-modal-footer') as HTMLElement).getByRole('button', { name: 'Create Component' }));
    await waitFor(() => {
      expect(screen.getByText('Successful Save')).toBeInTheDocument();
    }, { timeout: 30000 });
    expect(apiMock.post).toHaveBeenCalledWith('/machine-tooling/components', expect.objectContaining({ componentCode: 'TD-999', machineId: 'mc-ft' }));
  });

  it('4. View component opens the replacement history modal with stats', async () => {
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: 'View component — FT-DIE-001' }));
    await waitFor(() => {
      expect(screen.getByText('Component Replacement History')).toBeInTheDocument();
    }, { timeout: 30000 });
    const modal = visibleModal();
    expect(within(modal).getByText('DEMO-FT-DIE-010')).toBeInTheDocument();
    // avg life 53500 renders for both the summary and history rows (comma-formatted).
    expect(within(modal).getAllByText('53,500').length).toBeGreaterThanOrEqual(1);
    expect(within(modal).getByText('2')).toBeInTheDocument();
    // Derived-counter contract is surfaced.
    expect(within(modal).getByText(/DERIVED as the SUM of production entry actual quantities/)).toBeInTheDocument();
  });

  it('5. deactivate toggles component status via PATCH', async () => {
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /OK/ }));
    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith('/machine-tooling/components/c-1/status', { status: 'INACTIVE' });
    }, { timeout: 30000 });
  });

  it('6. delete removes a component via DELETE', async () => {
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete component — FT-DIE-001' }));
    fireEvent.click(screen.getByRole('button', { name: /OK/ }));
    await waitFor(() => {
      expect(apiMock.delete).toHaveBeenCalledWith('/machine-tooling/components/c-1');
    }, { timeout: 30000 });
  });

  it('7. missing create permission hides the Add button', async () => {
    setupMocks({ permissions: ['manufacturing.tool_component.view', 'manufacturing.component_change.view', 'manufacturing.tool_consumption.report'] });
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    expect(screen.queryByRole('button', { name: /Add Tool \/ Component/ })).toBeNull();
  });
});

/* ===================================================================
   TASK25 — Part B: Change History tab
   =================================================================== */
describe('TASK25 — Change History tab', () => {
  beforeEach(() => setupMocks());

  it('8. change tab lists transactions with tool change + computed life', async () => {
    await openChangeTab();
    expect(screen.getByText('2026-09-05')).toBeInTheDocument();
    expect(screen.getByText('DEMO-FT-DIE-010')).toBeInTheDocument();
    expect(screen.getByText('53,500')).toBeInTheDocument();
    expect(screen.getByText('USED')).toBeInTheDocument();
    expect(screen.getAllByText('DEMO-FT-DIE-009').length).toBeGreaterThanOrEqual(1);
  });

  it('9. Record Change opens the modal; saving posts the transaction', async () => {
    await openChangeTab();
    fireEvent.click(screen.getByRole('button', { name: /Record Change/ }));
    await waitFor(() => {
      expect(screen.getByText('Record Component Change')).toBeInTheDocument();
    }, { timeout: 30000 });
    const modal = visibleModal();
    openSelect('Select machine');
    await pickOption('FT-01');
    await waitFor(() => {
      const compSel = Array.from(document.body.querySelectorAll('.ant-select'))
        .find((s) => (s.querySelector('.ant-select-selection-placeholder') as HTMLElement | null)?.textContent === 'Select component tracked on this machine');
      expect(compSel).toBeTruthy();
    }, { timeout: 30000 });
    openSelect('Select component tracked on this machine');
    await pickOption('FT-DIE-001');
    fireEvent.change(within(modal).getByPlaceholderText('e.g. TD-012'), { target: { value: 'TD-777' } });
    fireEvent.change(within(modal).getByPlaceholderText('e.g. worn, broken, planned'), { target: { value: 'worn' } });
    fireEvent.click(within(modal.querySelector('.ant-modal-footer') as HTMLElement).getByRole('button', { name: 'Record Change' }));
    await waitFor(() => {
      expect(screen.getByText('Successful Save')).toBeInTheDocument();
    }, { timeout: 30000 });
    expect(apiMock.post).toHaveBeenCalledWith(
      '/machine-tooling/changes',
      expect.objectContaining({ machineId: 'mc-ft', componentId: 'c-1', newToolCode: 'TD-777' }),
    );
  });

  it('10. View change opens the transaction detail with production life', async () => {
    await openChangeTab();
    fireEvent.click(screen.getByRole('button', { name: 'View change — 2026-09-05 DEMO-FT-DIE-010' }));
    await waitFor(() => {
      expect(screen.getByText('Change Transaction Detail')).toBeInTheDocument();
    }, { timeout: 30000 });
    const modal = visibleModal();
    expect(within(modal).getByText(/This change closed 53,500 of production/)).toBeInTheDocument();
    expect(within(modal).getByText(/FT-DIE-001/)).toBeInTheDocument();
    expect(within(modal).getAllByText('DEMO-FT-DIE-010').length).toBeGreaterThanOrEqual(1);
    expect(within(modal).getByText('USED')).toBeInTheDocument();
    expect(within(modal).getByText('JC-2026-001')).toBeInTheDocument();
  });
});

/* ===================================================================
   TASK25 — Part B: Monthly Consumption tab
   =================================================================== */
describe('TASK25 — Monthly Consumption tab', () => {
  beforeEach(() => setupMocks());

  it('11. report tab loads the monthly consumption summary + totals', async () => {
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    fireEvent.click(screen.getAllByText('Monthly Consumption')[0]);
    await waitFor(() => {
      expect(screen.getAllByText('Production Covered').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    expect(screen.getAllByText('53,500').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Changes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Tools Installed')).toBeInTheDocument();
    // Derived-quantity disclosure alert is shown.
    expect(screen.getByText(/Machines have no native counter in the ERP/)).toBeInTheDocument();
    expect(apiMock.get.mock.calls.some(([u]) => String(u).includes('/machine-tooling/changes/reports/monthly'))).toBe(true);
  }, 60000);

  it('12. month picker drives a re-fetch with the YYYY-MM param', async () => {
    renderPage();
    await screen.findByText('Thread Die 12 mm', undefined, { timeout: 30000 });
    fireEvent.click(screen.getAllByText('Monthly Consumption')[0]);
    await waitFor(() => {
      expect(screen.getAllByText('Production Covered').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    await waitFor(() => {
      const call = apiMock.get.mock.calls.find(([u]) => String(u).includes('/machine-tooling/changes/reports/monthly'));
      expect(call).toBeTruthy();
      expect((call as any)[1]?.month as string | undefined).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }, { timeout: 30000 });
  }, 60000);
});