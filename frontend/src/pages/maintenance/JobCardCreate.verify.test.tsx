import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { JobCardCreate, machineCodeMatches } from './JobCardCreate';
import apiService from '../../services/api';

jest.mock('../../services/api');
jest.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({
    user: {
      id: 'u-1',
      displayName: 'System Admin',
      email: 'system.admin@erp.com',
      defaultCompanyId: '7725aa04-a270-4314-9e82-90949cbe7791',
    },
    can: () => true,
    isLoaded: true,
  }),
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(60000);

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

// ── Fixtures (same shapes as JobCardCreate.hierarchy.test.tsx) ──────────────
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002';
const SEC_RAW = '2eabc3e1-a4c3-426d-9b5c-60e48d9d30fe';
const MACHINE_ID = '142f60f7-6644-4263-a40f-000000000001';
const QR_PAYLOAD = `/production/machines/${MACHINE_ID}`;

const DIVISIONS = [
  { id: DIV_CCD, name: 'Control Cable Division', divisionCode: 'DIV-CCD', companyId: COMPANY, status: 'ACTIVE' },
  { id: '0653339b-94d0-4cc5-b880-e07908b2015f', name: 'NB Division', divisionCode: 'DIV-NB', companyId: COMPANY, status: 'ACTIVE' },
];

const SECTIONS = [
  { id: SEC_RAW, name: 'CCD Raw Material Store', sectionCode: 'SEC-111', divisionId: DIV_CCD, companyId: COMPANY, status: 'ACTIVE' },
  { id: 'd2000000-0000-0000-0000-000000000006', name: 'Spiral', sectionCode: 'SEC-015', divisionId: DIV_CCD, companyId: COMPANY, status: 'ACTIVE' },
];

const MACHINES = [
  {
    id: MACHINE_ID,
    name: 'Wire Drawing Machine',
    machineCode: 'MCH-001',
    machineId: 'MCH-001',
    machineName: 'Wire Drawing Machine',
    qrPayload: QR_PAYLOAD,
    divisionId: DIV_CCD,
    sectionId: SEC_RAW,
    companyId: COMPANY,
    status: 'ACTIVE',
  },
];

function installApi() {
  apiMock.get.mockImplementation(((url: any, params: any) => {
    const u = String(url);
    const p = params || {};
    if (u === '/divisions') return Promise.resolve({ success: true, data: DIVISIONS });
    if (u === '/sections') return Promise.resolve({ success: true, data: SECTIONS });
    if (u === '/departments') return Promise.resolve({ success: true, data: [] });
    if (u === '/machines') {
      return Promise.resolve({
        success: true,
        data: MACHINES.filter((m) => (!p.divisionId || m.divisionId === p.divisionId) && (!p.sectionId || m.sectionId === p.sectionId)),
      });
    }
    if (u.startsWith('/master-data/maintenance/categories')) return Promise.resolve({ success: true, data: [] });
    // Server-side resolution must NOT be needed once a machine is selected —
    // local verification is required, so a regression to the API path fails.
    if (u.startsWith('/machines/by-code/')) {
      return Promise.reject({ message: 'Machine not found', response: { status: 404, data: { message: 'Machine not found' } } });
    }
    return Promise.resolve({ success: true, data: [] });
  }) as any);
  apiMock.post.mockResolvedValue({ success: true, data: { id: 'jc-1', jobCardNo: 'JC-2026-0001' } } as any);
}

function renderJobCard() {
  return render(
    <MemoryRouter initialEntries={['/maintenance/job-cards/new']}>
      <AntApp>
        <JobCardCreate />
      </AntApp>
    </MemoryRouter>,
  );
}

// ── Select helpers (copied from the hierarchy suite) ────────────────────────
const formItem = (labelStartsWith: string): HTMLElement => {
  const items = Array.from(document.querySelectorAll('.erp-jc-form-pane .ant-form-item'));
  const found = items.find((item) => {
    const lab = item.querySelector('label');
    if (!lab) return false;
    const text = lab.textContent!.replace(/\(optional\)/gi, '').replace(/\s+/g, ' ').trim();
    return text === labelStartsWith || text.startsWith(labelStartsWith);
  });
  if (!found) throw new Error(`Form item not found: ${labelStartsWith}`);
  return found as HTMLElement;
};

const openSelect = (labelStartsWith: string) => {
  const item = formItem(labelStartsWith);
  const selector = item.querySelector('.ant-select-selector') as HTMLElement;
  expect(selector).toBeTruthy();
  fireEvent.mouseDown(selector);
};

const visibleOptions = (text: string): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')).filter((o) => {
    const dd = o.closest('.ant-select-dropdown');
    if (!dd || dd.classList.contains('ant-select-dropdown-hidden')) return false;
    return (o.textContent || '').trim() === text;
  });

const pickOption = async (text: string) => {
  await waitFor(() => expect(visibleOptions(text).length).toBeGreaterThan(0), { timeout: 15000 });
  fireEvent.click(visibleOptions(text)[0]);
};

const selectionText = (labelStartsWith: string): string => {
  const item = formItem(labelStartsWith);
  return item.querySelector('.ant-select-selection-item')?.textContent?.trim() || '';
};

const scanInput = (): HTMLInputElement =>
  screen.getByPlaceholderText('Scan QR or enter machine code and press Enter...') as HTMLInputElement;

const verifyButton = (): HTMLElement => screen.getByRole('button', { name: 'Verify Code' });

const banner = (): HTMLElement | null => document.querySelector('.erp-jc-machine-banner');

async function selectMachine() {
  await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'), { timeout: 15000 });
  openSelect('Section');
  await pickOption('CCD Raw Material Store');
  await waitFor(() => expect(selectionText('Section')).toBe('CCD Raw Material Store'), { timeout: 15000 });
  openSelect('Select Machine');
  await pickOption('MCH-001 — Wire Drawing Machine');
  await waitFor(() => expect(banner()).not.toBeNull(), { timeout: 15000 });
}

// ── Pure matcher unit tests (CASE B / C / D identifier rules) ───────────────
describe('machineCodeMatches — authoritative identifier comparison', () => {
  const machine = {
    id: MACHINE_ID,
    machineCode: 'FT-01',
    machineId: 'MCH001',
    qrPayload: QR_PAYLOAD,
  };

  it('accepts the human-readable machine code (case-insensitive, machine: prefix tolerated)', () => {
    expect(machineCodeMatches('FT-01', machine)).toBe(true);
    expect(machineCodeMatches('  ft-01  ', machine)).toBe(true);
    expect(machineCodeMatches('machine:FT-01', machine)).toBe(true);
  });

  it('accepts the system machine id, stored QR payload and primary UUID', () => {
    expect(machineCodeMatches('MCH001', machine)).toBe(true);
    expect(machineCodeMatches(QR_PAYLOAD, machine)).toBe(true);
    expect(machineCodeMatches(MACHINE_ID, machine)).toBe(true);
  });

  it('accepts a full scanned QR URL wrapping the stored payload / UUID', () => {
    expect(machineCodeMatches(`https://erp.example.com${QR_PAYLOAD}`, machine)).toBe(true);
    expect(machineCodeMatches(`https://erp.example.com/production/machines/${MACHINE_ID}?t=1`, machine)).toBe(true);
  });

  it('rejects a wrong code and empty input', () => {
    expect(machineCodeMatches('XYZ-99', machine)).toBe(false);
    expect(machineCodeMatches('', machine)).toBe(false);
    expect(machineCodeMatches('FT-01', null)).toBe(false);
  });
});

// ── UI workflow tests ───────────────────────────────────────────────────────
describe('Maintenance → Open Job Card machine verification workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    installApi();
  });

  it('TEST 4 — Verify Code with empty input warns and never reports success', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'), { timeout: 15000 });

    fireEvent.click(verifyButton());

    await screen.findByText('Please scan or enter a machine code first.');
    expect(screen.queryByText(/Machine Verified/)).toBeNull();
    expect(banner()).toBeNull();
  });

  it('TEST 5 — correct machine code verifies against the selected machine (no server round-trip)', async () => {
    renderJobCard();
    await selectMachine();

    fireEvent.change(scanInput(), { target: { value: 'MCH-001' } });
    fireEvent.click(verifyButton());

    await screen.findByText('✓ Machine Verified');
    await screen.findByText('Machine Verified: Wire Drawing Machine');
    expect(document.querySelector('.erp-jc-machine-banner--verified')).not.toBeNull();
    expect(document.querySelector('.erp-jc-machine-banner-error-msg')).toBeNull();
    // Local validation: the by-code endpoint must not have been consulted.
    expect(apiMock.get).not.toHaveBeenCalledWith('/machines/by-code/MCH-001', expect.anything());
  });

  it('TEST 6 — incorrect code fails clearly and keeps the selected machine', async () => {
    renderJobCard();
    await selectMachine();

    fireEvent.change(scanInput(), { target: { value: 'XYZ-99' } });
    fireEvent.click(verifyButton());

    const errors = await screen.findAllByText('Machine code does not match the selected machine.');
    expect(errors.length).toBeGreaterThan(0);
    expect(document.querySelector('.erp-jc-machine-banner--error')).not.toBeNull();
    expect(screen.queryByText('✓ Machine Verified')).toBeNull();
    // The machine selection must NOT be cleared by a failed verification.
    expect(selectionText('Select Machine')).toContain('MCH-001');
  });

  it('TEST 7 — pressing Enter runs the same verification as the button', async () => {
    renderJobCard();
    await selectMachine();

    fireEvent.change(scanInput(), { target: { value: 'MCH-001' } });
    fireEvent.keyDown(scanInput(), { key: 'Enter', code: 'Enter' });

    await screen.findByText('✓ Machine Verified');
    expect(document.querySelector('.erp-jc-machine-banner--verified')).not.toBeNull();
  });

  it('TEST 10 — changing machine clears the previous verification and scanned code', async () => {
    renderJobCard();
    await selectMachine();

    fireEvent.change(scanInput(), { target: { value: 'MCH-001' } });
    fireEvent.click(verifyButton());
    await screen.findByText('✓ Machine Verified');

    // "Change" clears the machine → verification state and scan input reset.
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(banner()).toBeNull(), { timeout: 15000 });
    expect(scanInput().value).toBe('');
    expect(screen.queryByText('✓ Machine Verified')).toBeNull();

    // Re-select the machine → banner is back but NOT verified.
    openSelect('Select Machine');
    await pickOption('MCH-001 — Wire Drawing Machine');
    await waitFor(() => expect(banner()).not.toBeNull(), { timeout: 15000 });
    expect(screen.queryByText('✓ Machine Verified')).toBeNull();
    expect(document.querySelector('.erp-jc-machine-banner--verified')).toBeNull();
  });

  it('TEST 8 — the scan icon opens the shared camera scanner modal', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'), { timeout: 15000 });

    const suffixIcon = formItem('Scan Machine Barcode / QR Code').querySelector('.ant-input-suffix .anticon');
    expect(suffixIcon).toBeTruthy();
    fireEvent.click(suffixIcon!);

    await screen.findByText('Machine QR / Barcode Scanner');
    // Manual-entry fallback inside the scanner stays available.
    expect(screen.getByPlaceholderText('Type or paste code e.g. 0201000000100...')).toBeInTheDocument();
  });
});
