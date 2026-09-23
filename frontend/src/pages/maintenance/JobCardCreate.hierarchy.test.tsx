import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { JobCardCreate } from './JobCardCreate';
import { JOB_CARD_BASE } from './jobCards.types';
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

jest.setTimeout(120000);

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

// ── Fixtures (real Organisation / Master Data shapes, all UUID keys) ────────
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002'; // Control Cable Division
const DIV_NB = '0653339b-94d0-4cc5-b880-e07908b2015f'; // NB Division
const SEC_RAW = '2eabc3e1-a4c3-426d-9b5c-60e48d9d30fe'; // CCD Raw Material Store
const SEC_SPIRAL = 'd2000000-0000-0000-0000-000000000006'; // Spiral
const SEC_NB = 'b2000000-0000-0000-0000-000000000001'; // NB Assembly
const SEC_NB2 = 'b2000000-0000-0000-0000-000000000002'; // NB Finishing
const DEPT_STORES = 'd8cf64a6-ebfc-4a94-a807-4960d3166752'; // CCD Stores
const DEPT_SPIRAL = 'd3000000-0000-0000-0000-000000000011'; // Spiral
const MACHINE_ID = '142f60f7-6644-4263-a40f-000000000001';

const DIVISIONS = [
  { id: DIV_CCD, name: 'Control Cable Division', divisionCode: 'DIV-CCD', companyId: COMPANY, status: 'ACTIVE' },
  { id: DIV_NB, name: 'NB Division', divisionCode: 'DIV-NB', companyId: COMPANY, status: 'ACTIVE' },
];

const SECTIONS = [
  { id: SEC_RAW, name: 'CCD Raw Material Store', sectionCode: 'SEC-111', divisionId: DIV_CCD, companyId: COMPANY, status: 'ACTIVE' },
  { id: SEC_SPIRAL, name: 'Spiral', sectionCode: 'SEC-015', divisionId: DIV_CCD, companyId: COMPANY, status: 'ACTIVE' },
  { id: SEC_NB, name: 'NB Assembly', sectionCode: 'SEC-NB', divisionId: DIV_NB, companyId: COMPANY, status: 'ACTIVE' },
  // Second NB section: prevents the component's "auto-select single section"
  // shortcut so the Division-change reset stays observable in test 4.
  { id: SEC_NB2, name: 'NB Finishing', sectionCode: 'SEC-NB2', divisionId: DIV_NB, companyId: COMPANY, status: 'ACTIVE' },
];

const DEPARTMENTS = [
  { id: DEPT_STORES, name: 'CCD Stores', departmentCode: 'CCD-DEPT111', divisionId: DIV_CCD, sectionId: SEC_RAW, companyId: COMPANY, status: 'ACTIVE' },
  { id: DEPT_SPIRAL, name: 'Spiral', departmentCode: 'CCD-DEPT002', divisionId: DIV_CCD, sectionId: SEC_SPIRAL, companyId: COMPANY, status: 'ACTIVE' },
];

const MACHINES = [
  {
    id: MACHINE_ID,
    name: 'Wire Drawing Machine',
    machineCode: 'MCH-001',
    machineId: 'MCH-001',
    machineName: 'Wire Drawing Machine',
    divisionId: DIV_CCD,
    sectionId: SEC_RAW,
    departmentId: DEPT_STORES,
    companyId: COMPANY,
    status: 'ACTIVE',
  },
];

type Opts = {
  divisions?: any[];
  divisionError?: { message: string; response?: any };
};

function installApi(opts: Opts = {}) {
  apiMock.get.mockImplementation(((url: any, params: any) => {
    const u = String(url);
    const p = params || {};
    if (u === '/divisions') {
      if (opts.divisionError) return Promise.reject(opts.divisionError);
      return Promise.resolve({ success: true, data: opts.divisions ?? DIVISIONS });
    }
    if (u === '/sections') {
      return Promise.resolve({
        success: true,
        data: SECTIONS.filter((s) => !p.divisionId || s.divisionId === p.divisionId),
      });
    }
    if (u === '/departments') {
      return Promise.resolve({
        success: true,
        data: DEPARTMENTS.filter(
          (d) => (!p.sectionId || d.sectionId === p.sectionId) && (!p.divisionId || d.divisionId === p.divisionId),
        ),
      });
    }
    if (u === '/machines') {
      return Promise.resolve({
        success: true,
        data: MACHINES.filter(
          (m) =>
            (!p.divisionId || m.divisionId === p.divisionId) &&
            (!p.sectionId || m.sectionId === p.sectionId) &&
            (!p.departmentId || m.departmentId === p.departmentId),
        ),
      });
    }
    if (u.startsWith('/master-data/maintenance/categories')) {
      return Promise.resolve({ success: true, data: [] });
    }
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

// ── Select helpers (Job Card runs inside a modal, options portal to body) ──
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

const visibleDropdowns = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.ant-select-dropdown')).filter(
    (d) => !d.classList.contains('ant-select-dropdown-hidden'),
  );

const pickOption = async (text: string) => {
  await waitFor(() => expect(visibleOptions(text).length).toBeGreaterThan(0));
  fireEvent.click(visibleOptions(text)[0]);
};

const selectionText = (labelStartsWith: string): string => {
  const item = formItem(labelStartsWith);
  return item.querySelector('.ant-select-selection-item')?.textContent?.trim() || '';
};

const isDisabled = (labelStartsWith: string) =>
  formItem(labelStartsWith).querySelector('.ant-select')!.classList.contains('ant-select-disabled');

describe('Maintenance → Open Job Card organisational hierarchy', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    installApi();
  });

  it('1. loads real Division records from the existing Division master API (company-scoped)', async () => {
    renderJobCard();

    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/divisions',
        expect.objectContaining({ status: 'ACTIVE', companyId: COMPANY, limit: 500 }),
      ),
    );

    // Real API response -> Select state -> first division auto-selected
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'));
  });

  it('2. Division dropdown opens and renders the real Division options', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'));

    openSelect('Division');

    await waitFor(() => expect(visibleOptions('Control Cable Division').length).toBeGreaterThan(0));
    expect(visibleOptions('NB Division').length).toBeGreaterThan(0);
    expect(visibleOptions('Spoke Division').length).toBe(0); // only what the API returned

    // Stacking regression guard: this dialog's menus carry the raised-z class
    expect(visibleDropdowns()[0].className).toContain('erp-jc-select-dropdown');
  });

  it('3. selecting a Division requests Sections for that Division only, company-scoped', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'));

    openSelect('Division');
    await pickOption('NB Division');

    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/sections',
        expect.objectContaining({ divisionId: DIV_NB, companyId: COMPANY, status: 'ACTIVE' }),
      ),
    );

    openSelect('Section');
    await waitFor(() => expect(visibleOptions('NB Assembly').length).toBeGreaterThan(0));
    expect(visibleOptions('CCD Raw Material Store').length).toBe(0);
    expect(visibleOptions('Spiral').length).toBe(0);
  });

  it('4. changing Division clears Section, Department and Machine, then reloads Sections', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'));

    openSelect('Section');
    await pickOption('CCD Raw Material Store');
    await waitFor(() => expect(selectionText('Section')).toBe('CCD Raw Material Store'));

    openSelect('Department');
    await pickOption('CCD Stores');
    await waitFor(() => expect(selectionText('Department')).toBe('CCD Stores'));

    openSelect('Select Machine');
    await pickOption('MCH-001 — Wire Drawing Machine');
    await waitFor(() => expect(selectionText('Select Machine')).toContain('MCH-001'));

    // Change the Division -> everything downstream must be reset
    openSelect('Division');
    await pickOption('NB Division');

    await waitFor(() => expect(selectionText('Division')).toBe('NB Division'));
    await waitFor(() => expect(selectionText('Section')).toBe(''));
    await waitFor(() => expect(selectionText('Department')).toBe(''));
    await waitFor(() => expect(selectionText('Select Machine')).toBe(''));

    // ... and Sections are reloaded for the new Division
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/sections',
        expect.objectContaining({ divisionId: DIV_NB }),
      ),
    );
  });

  it('5. Department loads only for the selected Section, and changing Section clears it', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'));

    expect(isDisabled('Department')).toBe(true);

    openSelect('Section');
    await pickOption('CCD Raw Material Store');
    await waitFor(() => expect(selectionText('Section')).toBe('CCD Raw Material Store'));

    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/departments',
        expect.objectContaining({ sectionId: SEC_RAW, divisionId: DIV_CCD, companyId: COMPANY, status: 'ACTIVE' }),
      ),
    );

    await waitFor(() => expect(isDisabled('Department')).toBe(false));
    openSelect('Department');
    await waitFor(() => expect(visibleOptions('CCD Stores').length).toBeGreaterThan(0));
    await pickOption('CCD Stores');
    await waitFor(() => expect(selectionText('Department')).toBe('CCD Stores'));

    // Section change -> Department must be cleared and re-fetched
    openSelect('Section');
    await pickOption('Spiral');
    await waitFor(() => expect(selectionText('Section')).toBe('Spiral'));
    await waitFor(() => expect(selectionText('Department')).toBe(''));
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/departments',
        expect.objectContaining({ sectionId: SEC_SPIRAL, divisionId: DIV_CCD }),
      ),
    );
  });

  it('6. Machine lookup follows Division → Section → Department', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'));

    openSelect('Section');
    await pickOption('CCD Raw Machine Store'.replace('Machine', 'Material'));
    await waitFor(() => expect(selectionText('Section')).toBe('CCD Raw Material Store'));

    openSelect('Department');
    await pickOption('CCD Stores');
    await waitFor(() => expect(selectionText('Department')).toBe('CCD Stores'));

    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/machines',
        expect.objectContaining({ divisionId: DIV_CCD, sectionId: SEC_RAW, departmentId: DEPT_STORES }),
      ),
    );

    // Optional Department: clearing it keeps the machine list working
    openSelect('Department');
    const clear = formItem('Department').querySelector('.ant-select-clear') as HTMLElement;
    if (clear) fireEvent.click(clear);
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/machines',
        expect.objectContaining({ divisionId: DIV_CCD, sectionId: SEC_RAW }),
      ),
    );
  });

  it('7. detail sheet shows the same selected hierarchy (single source of truth)', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'));

    openSelect('Section');
    await pickOption('CCD Raw Material Store');
    await waitFor(() => expect(selectionText('Section')).toBe('CCD Raw Material Store'));

    openSelect('Department');
    await pickOption('CCD Stores');
    await waitFor(() => expect(selectionText('Department')).toBe('CCD Stores'));

    const preview = document.querySelector('.erp-jc-preview-pane') as HTMLElement;
    expect(preview).toBeTruthy();
    expect(preview.textContent).toContain('Control Cable Division');
    expect(preview.textContent).toContain('CCD Raw Material Store');
    expect(preview.textContent).toContain('CCD Stores');
  });

  it('8. API failure shows an explicit error state instead of a silent empty list', async () => {
    apiMock.get.mockReset();
    installApi({
      divisionError: {
        message: 'Request failed with status code 403',
        response: { status: 403, data: { message: 'Missing required permission: division.view' } },
      },
    });
    renderJobCard();

    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/divisions', expect.objectContaining({ status: 'ACTIVE' })),
    );

    openSelect('Division');
    await waitFor(() =>
      expect(document.body.textContent).toContain('Unable to load divisions. Please try again.'),
    );
    expect(document.body.textContent).toContain('Missing required permission: division.view');
    expect(selectionText('Division')).toBe('');
  });

  it('9. empty Division response shows a distinct empty state', async () => {
    apiMock.get.mockReset();
    installApi({ divisions: [] });
    renderJobCard();

    openSelect('Division');
    await waitFor(() =>
      expect(document.body.textContent).toContain('No divisions available for your company.'),
    );
    expect(selectionText('Division')).toBe('');
  });

  it('10. keeps company isolation on the whole cascade (divisions/sections/departments)', async () => {
    renderJobCard();
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/divisions', expect.objectContaining({ companyId: COMPANY })),
    );

    openSelect('Division');
    await pickOption('Control Cable Division');
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/sections', expect.objectContaining({ companyId: COMPANY })),
    );

    openSelect('Section');
    await pickOption('CCD Raw Material Store');
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/departments', expect.objectContaining({ companyId: COMPANY })),
    );
  });

  it('11. save/submit still posts the selected organisation ids', async () => {
    renderJobCard();
    await waitFor(() => expect(selectionText('Division')).toBe('Control Cable Division'));

    openSelect('Section');
    await pickOption('CCD Raw Material Store');
    await waitFor(() => expect(selectionText('Section')).toBe('CCD Raw Material Store'));

    openSelect('Select Machine');
    await pickOption('MCH-001 — Wire Drawing Machine');
    await waitFor(() => expect(selectionText('Select Machine')).toContain('MCH-001'));

    fireEvent.change(screen.getByPlaceholderText(/Describe the problem/), {
      target: { value: 'Machine overheating and tripping during production run.' },
    });

    const submit = screen.getByRole('button', { name: /Submit Job Card/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    const confirm = await screen.findByRole('button', { name: /Yes, Confirm & Submit/i });
    fireEvent.click(confirm);

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith(
      JOB_CARD_BASE,
      expect.objectContaining({
        companyId: COMPANY,
        divisionId: DIV_CCD,
        sectionId: SEC_RAW,
        machineId: MACHINE_ID,
        priority: 'MEDIUM',
        maintenanceType: 'BREAKDOWN',
      }),
    );
    // jsdom + antd CSS-in-JS is CPU-bound (jsdom's nwsapi selector engine does
    // the CSS matching a real browser does natively), so this heavier
    // interaction test needs more than the file-level 120s budget.
  }, 420000);
});
