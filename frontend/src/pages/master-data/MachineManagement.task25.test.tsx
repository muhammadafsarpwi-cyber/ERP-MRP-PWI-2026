import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import MachineManagement from './MachineManagement';
import apiService from '../../services/api';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(120000);

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

const machine = {
  id: 'm-t25-1',
  machineId: 'MCH-T25',
  machineCode: 'FT-01',
  machineNumber: 'FT # 01',
  name: 'Flattening Machine FT-01',
  machineType: 'Flattening',
  division: { id: 'd1', name: 'Division A' },
  section: { id: 's1', name: 'Section A' },
  department: { id: 'de1', name: 'Dept A' },
  location: 'Hall A / Bay 3',
  manufacturer: 'Acme',
  model: 'H-200',
  serialNumber: 'SN-T25',
  status: 'ACTIVE',
  criticality: 'HIGH',
  isActive: true,
  capacity: 120,
  powerRating: '15 kW',
  description: 'TASK25 test machine',
  installationDate: '2024-06-15',
  warrantyExpiryDate: '2027-06-15',
  qrPayload: 'QR|T25',
  companyId: 'c1',
  createdAt: '2023-01-15T10:00:00Z',
  updatedAt: '2024-06-01T12:00:00Z',
};

const divisions = [{ id: 'd1', name: 'Division A', divisionCode: 'DIV-1' }];
const sections = [{ id: 's1', name: 'Section A', sectionCode: 'SEC-1', divisionId: 'd1' }];
const departments = [{ id: 'de1', name: 'Dept A', departmentCode: 'DEP-1', divisionId: 'd1', sectionId: 's1' }];

const setupMocks = (overrides?: { entries?: any[]; targets?: any[] }) => {
  localStorage.clear();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();

  apiMock.get.mockImplementation((url: any) => {
    const u = String(url);
    if (u === '/machines') return Promise.resolve({ data: [machine], total: 1 });
    if (u === '/divisions') return Promise.resolve({ data: divisions });
    if (u === '/sections') return Promise.resolve({ data: sections });
    if (u === '/departments') return Promise.resolve({ data: departments });
    if (u === `/machines/${machine.id}`) return Promise.resolve({ success: true, data: { ...machine } });
    if (u === '/production/entries') {
      const entries = overrides?.entries ?? [];
      return Promise.resolve({ data: entries, total: entries.length });
    }
    if (u === '/production/machine-targets') {
      const targets = overrides?.targets ?? [];
      return Promise.resolve({ data: targets, total: targets.length });
    }
    return Promise.resolve({ data: [] });
  });

  apiMock.post.mockResolvedValue({ data: { id: 'new-id', machineId: 'MCH-NEW' }, success: true });
  apiMock.patch.mockResolvedValue({ data: { id: machine.id }, success: true });
};

let container: HTMLElement;
const renderPage = () => {
  const r = render(
    <AntApp>
      <MemoryRouter>
        <MachineManagement />
      </MemoryRouter>
    </AntApp>,
  );
  container = r.container;
};

const openDetail = async () => {
  renderPage();
  await screen.findByText('Flattening Machine FT-01', undefined, { timeout: 30000 });
  fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));
  await waitFor(() => {
    expect(document.body.querySelectorAll('.erp-draggable-modal').length).toBe(1);
    expect(
      Array.from(document.body.querySelectorAll('.ant-modal-title')).some((t) =>
        t.textContent?.includes('Machine Details'),
      ),
    ).toBe(true);
  }, { timeout: 30000 });
  return document.querySelector('.erp-draggable-modal') as HTMLElement;
};

const openProduction = async () => {
  const modal = await openDetail();
  fireEvent.click(within(modal).getByText('Production'));
  await waitFor(() => {
    expect(within(modal).getByText('Machine Targets')).toBeInTheDocument();
  }, { timeout: 30000 });
  return modal;
};

/** Master-table header cells that contain a given token. */
const headerCellsWith = (token: string): HTMLElement[] =>
  (Array.from(document.querySelectorAll('.ant-table-thead th')) as HTMLElement[]).filter((th) =>
    (th.textContent ?? '').includes(token),
  );

/* ===================================================================
   TASK25 — MASTER TABLE (Part A): merged Code/No. column + tone
   =================================================================== */
describe('TASK25 — Master table refinement', () => {
  beforeEach(() => setupMocks());

  it('1. merged "Code / No." column shows the code chip with machine number as secondary', async () => {
    renderPage();
    await screen.findByText('Flattening Machine FT-01', undefined, { timeout: 30000 });
    // The machine number now renders inside the code cell (secondary line).
    expect(screen.getByText('FT # 01')).toBeInTheDocument();
    // The merged header is "Code / No." (single column, not two separate ones).
    document.querySelectorAll('.ant-table-thead th').forEach((th) => {
      const t = th.textContent ?? '';
      expect(t).not.toContain('Machine\nNo.');
      expect(t).not.toContain('MachineNo.');
    });
    expect(
      Array.from(document.querySelectorAll('.ant-table-thead th')).some((th) =>
        th.textContent?.includes('Code /'),
      ),
    ).toBe(true);
  });

  it('2. code chip styling still shows full machine code', async () => {
    renderPage();
    await screen.findByText('Flattening Machine FT-01', undefined, { timeout: 30000 });
    expect(screen.getAllByText('FT-01').length).toBeGreaterThanOrEqual(1);
  });

  it('3. duplicate Section column removed (single "Section" token left in the combined Division/Section header)', async () => {
    renderPage();
    await screen.findByText('Flattening Machine FT-01', undefined, { timeout: 30000 });
    // One column only: the "Division / Section" combined header.
    const sectionCols = headerCellsWith('Section');
    expect(sectionCols.length).toBe(1);
    expect(sectionCols[0].textContent).toContain('Division');
  });

  it('4. row actions (View/Edit/QR/Print/Status/Delete) remain', async () => {
    renderPage();
    await screen.findByText('Flattening Machine FT-01', undefined, { timeout: 30000 });
    expect(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Edit machine — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `QR code — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Print barcode — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Change status — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete machine — ${machine.machineCode}` })).toBeInTheDocument();
  });
});

/* ===================================================================
   TASK25 — PRODUCTION TAB (Part A): item name first, summary strip,
   semantic achievement
   =================================================================== */
describe('TASK25 — Production tab: name-primary items, summary, semantic achievement', () => {
  beforeEach(() => setupMocks());

  const entry = (over: any = {}) => ({
    id: 'e1',
    entryDate: '2026-09-01',
    shift: { name: 'Shift B' },
    item: { itemCode: 'ITM-10', name: 'Flat Wire' },
    targetQuantity: 100,
    actualQuantity: 95,
    achievementPercentage: 95,
    ...over,
  });

  it('5. Item column shows the NAME as primary display with the code secondary', async () => {
    setupMocks({ entries: [entry()], targets: [entry()] });
    const modal = await openProduction();
    expect(within(modal).getAllByText('Flat Wire').length).toBeGreaterThanOrEqual(1);
    // The code is still present as the secondary line.
    expect(within(modal).getAllByText('ITM-10').length).toBeGreaterThanOrEqual(1);
  });

  it('6. legacy records without a name render the code as plain text (ITM-X regression)', async () => {
    setupMocks({ entries: [{ ...entry(), item: { itemCode: 'ITM-X' } }], targets: [] });
    const modal = await openProduction();
    expect(within(modal).getAllByText('ITM-X').length).toBeGreaterThanOrEqual(1);
  });

  it('7. production opens with the Target / Actual / Achievement summary strip', async () => {
    setupMocks({ entries: [entry()], targets: [{ id: 't1', shift: { name: 'Shift B' }, item: { itemCode: 'ITM-10', name: 'Flat Wire' }, targetQuantity: 100 }] });
    const modal = await openProduction();
    expect(within(modal).getByText('Production Summary')).toBeInTheDocument();
    expect(within(modal).getAllByText('Target').length).toBeGreaterThanOrEqual(1);
    expect(within(modal).getAllByText('Actual').length).toBeGreaterThanOrEqual(1);
    expect(within(modal).getAllByText('Achievement').length).toBeGreaterThanOrEqual(1);
  });

  it('8. summary achievement is computed (actual/target) and painted semantically (95% green ▲)', async () => {
    setupMocks({ entries: [entry(), { ...entry(), id: 'e2', targetQuantity: 100, actualQuantity: 95, achievementPercentage: 95 }], targets: [] });
    const modal = await openProduction();
    await waitFor(() => {
      // Target 200 / Actual 190 → 95% → green up-arrow tone.
      expect(within(modal).getAllByText('95%').length).toBeGreaterThanOrEqual(1);
      expect(modal.querySelector('.anticon-arrow-up')).not.toBeNull();
    }, { timeout: 30000 });
  });

  it('9. sub-70 achievement paints red with a down arrow (60%)', async () => {
    setupMocks({ entries: [{ ...entry(), targetQuantity: 100, actualQuantity: 60, achievementPercentage: 60 }], targets: [] });
    const modal = await openProduction();
    await waitFor(() => {
      expect(within(modal).getAllByText('60%').length).toBeGreaterThanOrEqual(1);
      expect(modal.querySelector('.anticon-arrow-down')).not.toBeNull();
    }, { timeout: 30000 });
  });

  it('10. exactly-70 achievement is neutral amber with a minus sign', async () => {
    setupMocks({ entries: [{ ...entry(), targetQuantity: 100, actualQuantity: 70, achievementPercentage: 70 }], targets: [] });
    const modal = await openProduction();
    await waitFor(() => {
      expect(within(modal).getAllByText('70%').length).toBeGreaterThanOrEqual(1);
      expect(modal.querySelector('.anticon-minus')).not.toBeNull();
    }, { timeout: 30000 });
  });

  it('11. the production endpoints are still fetched from the real API', async () => {
    const modal = await openProduction();
    expect(apiMock.get.mock.calls.some(([u]) => String(u).includes('/production/entries'))).toBe(true);
    expect(apiMock.get.mock.calls.some(([u]) => String(u).includes('/production/machine-targets'))).toBe(true);
  });

  it('12. summary shows — when there is no target data', async () => {
    setupMocks({ entries: [], targets: [] });
    const modal = await openProduction();
    expect(within(modal).getByText('Production Summary')).toBeInTheDocument();
    expect(
      Array.from(modal.querySelectorAll('span.ant-typography-secondary')).some((s) => s.textContent === '—'),
    ).toBe(true);
  });
});