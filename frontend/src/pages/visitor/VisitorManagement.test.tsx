import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import VisitorManagement from './VisitorManagement';
import apiService from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(120000);

/**
 * jsdom implements neither `matchMedia` nor `ResizeObserver`; antd's responsive
 * observer and grid require both, so every antd page test in this project
 * installs the same polyfill before rendering.
 */
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
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ── Fixtures (ids are real-shaped; nothing is hard-coded into the page) ─────
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const CCD = 'd1000000-0000-0000-0000-000000000002';
const SPD = 'd1000000-0000-0000-0000-000000000001';
const NB = '0653339b-94d0-4cc5-b880-e07908b2015f';
const LOC_CCD = 'a1000000-0000-0000-0000-00000000000c';
const LOC_SPD = 'a1000000-0000-0000-0000-00000000000d';
const HOST_CCD = 'e1000000-0000-0000-0000-00000000000c';
const ENTRY = 'f1000000-0000-0000-0000-000000000001';

const ALL_DIVISIONS = [
  { id: CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division', status: 'ACTIVE' },
  { id: SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division', status: 'ACTIVE' },
  // Deliberately out of scope for the seeded test user — never offered.
  { id: NB, divisionCode: 'DIV-NB', name: 'Nooriabad Division', status: 'ACTIVE' },
];

const LOCATIONS: Record<string, any[]> = {
  [CCD]: [{ id: LOC_CCD, locationCode: 'GATE-01', name: 'Main Gate', divisionId: CCD, status: 'ACTIVE' }],
  [SPD]: [{ id: LOC_SPD, locationCode: 'GATE-02', name: 'Spoke Gate', divisionId: SPD, status: 'ACTIVE' }],
};

const HOSTS = [
  {
    id: HOST_CCD,
    employeeCode: '00400218',
    name: 'Muhammad Zeeshan',
    department: 'Cutting & Packing',
    divisionId: CCD,
  },
];

/** List row — CNIC already masked by the API, internal paths never present. */
const LIST_ROW = {
  id: ENTRY,
  companyId: COMPANY,
  divisionId: CCD,
  locationId: LOC_CCD,
  visitorName: 'Muhammad Test',
  cnic: '12345-*******-1',
  mobile: '0300-1234567',
  visitorCompany: 'PakWiz Trading',
  hostEmployeeId: HOST_CCD,
  hostNameSnapshot: 'Muhammad Zeeshan',
  division: { id: CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
  location: { id: LOC_CCD, locationCode: 'GATE-01', name: 'Main Gate' },
  timeIn: '2026-09-28T10:30:00.000Z',
  timeOut: null,
  status: 'PENDING',
  hasPhoto: false,
  createdAt: '2026-09-28T10:30:00.000Z',
  createdBy: 'u1000000-0000-0000-0000-000000000001',
};

/** Detail row — full CNIC (§14) plus the authenticated photo endpoint. */
const DETAIL_ROW = {
  ...LIST_ROW,
  cnic: '12345-1234567-1',
  hasPhoto: true,
  photoUrl: `/visitor/entries/${ENTRY}/photo`,
};

const CREATED_ROW = { ...LIST_ROW, cnic: '12345-1234567-1' };

const ALL_PERMISSIONS = [
  'visitor.entry.view',
  'visitor.entry.create',
  'location.view',
  'location.create',
  'location.update',
  'location.delete',
];

function seedUser(permissions: string[] = ALL_PERMISSIONS) {
  localStorage.setItem(
    'erp_user',
    JSON.stringify({
      id: 'u1000000-0000-0000-0000-000000000001',
      email: 'gate@erp.test',
      displayName: 'Gate Officer',
      permissions,
      // Restricted user: two divisions — Nooriabad is never in scope.
      divisions: {
        unrestricted: false,
        items: [
          { id: CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
          { id: SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division' },
        ],
        permissionScopes: {},
      },
    }),
  );
  localStorage.setItem('erp_permissions_ts', String(Date.now()));
  localStorage.setItem('token', 'test-token');
}

function mockApi({ listReject }: { listReject?: any } = {}) {
  apiMock.get.mockImplementation((url: any, params?: any) => {
    const u = String(url);
    if (u === '/visitor/entries') {
      return listReject
        ? Promise.reject(listReject)
        : Promise.resolve({ data: [LIST_ROW], total: 1 });
    }
    if (u.startsWith('/visitor/entries/')) return Promise.resolve({ data: DETAIL_ROW });
    if (u === '/divisions') return Promise.resolve({ data: ALL_DIVISIONS });
    if (u === '/locations') {
      const key = String(params?.divisionId || '');
      return Promise.resolve({ data: LOCATIONS[key] ?? [] });
    }
    if (u === '/visitor/hosts') return Promise.resolve({ data: HOSTS });
    return Promise.resolve({ data: [] });
  });
  apiMock.post.mockResolvedValue({ data: CREATED_ROW });
  apiMock.upload.mockResolvedValue({ success: true });
  apiMock.getFile.mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
}

async function renderPage() {
  const view = render(
    <AntApp>
      <MemoryRouter>
        <VisitorManagement />
      </MemoryRouter>
    </AntApp>,
  );
  await screen.findByTestId('visitor-page', {}, { timeout: 15000 });
  return view;
}

const form = () => screen.getByTestId('visitor-form');

/**
 * Resolve a Form.Item by its label text — tolerant of the required asterisk
 * antd may render, so the lookup never depends on presentation details.
 */
function formItemByLabel(labelText: string): HTMLElement {
  const labels = within(form()).queryAllByText(
    (_content, element) =>
      !!element &&
      element.tagName === 'LABEL' &&
      (element.textContent || '').replace(/^\*/, '').trim() === labelText,
  );
  expect(labels.length).toBeGreaterThan(0);
  return labels[0].closest('.ant-form-item') as HTMLElement;
}

/** What the Select currently shows ('' when nothing is selected). */
function selectionText(labelText: string): string {
  const matches = within(formItemByLabel(labelText)).queryAllByText(/.+/, {
    selector: '[class*="ant-select-selection-item"]',
  });
  return matches[0]?.textContent ?? '';
}

/** Placeholder text of the Select (null when a value is selected). */
function placeholderText(labelText: string): string | null {
  const match = within(formItemByLabel(labelText)).queryByText(/^(Select|Search)/, {
    selector: '[class*="ant-select-selection-placeholder"]',
  });
  return match?.textContent ?? null;
}

/**
 * Open a Select. rc-select binds its mousedown handler to the SELECTOR element,
 * so the event has to be dispatched on something INSIDE it — the placeholder
 * (empty Select) or the current selection (already has a value). Events bubble
 * up to the selector, which is what opens the dropdown.
 */
function openSelect(labelText: string) {
  const item = formItemByLabel(labelText);
  const anchor =
    within(item).queryByText(/^(Select|Search)/, {
      selector: '[class*="ant-select-selection-placeholder"]',
    }) ??
    within(item).queryAllByText(/.+/, {
      selector: '[class*="ant-select-selection-item"]',
    })[0];
  expect(anchor).not.toBeNull();
  fireEvent.mouseDown(anchor as HTMLElement);
}

async function pickOption(labelText: string, optionText: string) {
  openSelect(labelText);
  const option = await screen.findByText(
    optionText,
    { selector: '.ant-select-item-option-content' },
    { timeout: 15000 },
  );
  fireEvent.click(option);
}

async function openCreate() {
  fireEvent.click(await screen.findByTestId('new-visitor-button', {}, { timeout: 15000 }));
  await screen.findByTestId('visitor-form', {}, { timeout: 15000 });
}

/** Fill the whole visitor form for division CCD. */
async function fillCreateForm() {
  await pickOption('Division', 'DIV-CCD · Control Cable Division');
  await waitFor(() => expect(placeholderText('Location')).toBe('Select location'));
  await pickOption('Location', 'GATE-01 · Main Gate');
  await waitFor(() => expect(placeholderText('Person Being Visited')).toMatch(/^Search employee/));

  fireEvent.change(within(form()).getByPlaceholderText('Full name'), {
    target: { value: 'Muhammad Test' },
  });
  fireEvent.change(within(form()).getByPlaceholderText('12345-1234567-1'), {
    target: { value: '1234512345671' },
  });
  fireEvent.change(within(form()).getByPlaceholderText('0300-1234567'), {
    target: { value: '0300-1234567' },
  });
  fireEvent.change(within(form()).getByPlaceholderText('Company or source (optional)'), {
    target: { value: 'PakWiz Trading' },
  });

  await pickOption('Person Being Visited', 'Muhammad Zeeshan · 00400218');
}

describe('VisitorManagement', () => {
  beforeEach(() => {
    localStorage.clear();
    seedUser();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.upload.mockReset();
    apiMock.getFile.mockReset();
    mockApi();
  });

  afterEach(() => {
    delete (URL as any).createObjectURL;
    delete (URL as any).revokeObjectURL;
  });

  // ── 1 ────────────────────────────────────────────────────────────────────
  it('renders the visitor list with the masked CNIC and PENDING status', async () => {
    await renderPage();

    expect(await screen.findByText('Muhammad Test', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText('12345-*******-1')).toBeInTheDocument();
    // The unmasked CNIC must never reach the list (§13/§19).
    expect(screen.queryByText('12345-1234567-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('visitor-status-PENDING')).toHaveTextContent('PENDING');
    expect(screen.getByText('Muhammad Zeeshan')).toBeInTheDocument();
    expect(screen.getByText('DIV-CCD · Control Cable Division')).toBeInTheDocument();
    expect(screen.getByText('GATE-01 · Main Gate')).toBeInTheDocument();
    // Time-Out stays empty until Prompt #18.
    expect(screen.queryByText('2026-09-28T10:30:00.000Z')).not.toBeInTheDocument();
  });

  // ── 2 ────────────────────────────────────────────────────────────────────
  it('offers only the authorized divisions in the division picker', async () => {
    await renderPage();
    await openCreate();

    openSelect('Division');

    expect(
      await screen.findByText(
        'DIV-CCD · Control Cable Division',
        { selector: '.ant-select-item-option-content' },
        { timeout: 15000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('DIV-SPD · Spoke Division', { selector: '.ant-select-item-option-content' }),
    ).toBeInTheDocument();
    // Out-of-scope division is not offered, even though /divisions returned it.
    expect(
      screen.queryByText('DIV-NB · Nooriabad Division', { selector: '.ant-select-item-option-content' }),
    ).not.toBeInTheDocument();
  });

  // ── 3 ────────────────────────────────────────────────────────────────────
  it('reloads locations on division change and clears a stale location selection', async () => {
    await renderPage();
    await openCreate();

    await pickOption('Division', 'DIV-CCD · Control Cable Division');
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/locations', expect.objectContaining({ divisionId: CCD })),
    );
    await pickOption('Location', 'GATE-01 · Main Gate');
    await waitFor(() => expect(selectionText('Location')).toContain('GATE-01 · Main Gate'));

    // Change the division — the old location must not survive the change.
    await pickOption('Division', 'DIV-SPD · Spoke Division');
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/locations', expect.objectContaining({ divisionId: SPD })),
    );
    await waitFor(() => expect(placeholderText('Location')).toBe('Select location'));
    expect(selectionText('Location')).toBe('');

    // The refreshed options belong to the new division only.
    await pickOption('Location', 'GATE-02 · Spoke Gate');
    await waitFor(() => expect(selectionText('Location')).toContain('GATE-02 · Spoke Gate'));
    expect(
      screen.queryByText('GATE-01 · Main Gate', { selector: '.ant-select-item-option-content' }),
    ).not.toBeInTheDocument();
  });

  // ── 4 / 5 / 6 ────────────────────────────────────────────────────────────
  it('creates a visitor without a client Time-In and shows the server result read-only', async () => {
    await renderPage();
    await openCreate();
    await fillCreateForm();

    fireEvent.click(screen.getByTestId('new-visitor-submit'));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1), { timeout: 15000 });
    const [url, payload] = apiMock.post.mock.calls[0] as [string, any];
    expect(url).toBe('/visitor/entries');
    expect(payload).toEqual(
      expect.objectContaining({
        divisionId: CCD,
        locationId: LOC_CCD,
        visitorName: 'Muhammad Test',
        cnic: '12345-1234567-1',
        mobile: '03001234567',
        visitorCompany: 'PakWiz Trading',
        hostEmployeeId: HOST_CCD,
      }),
    );
    // Nothing server-owned may be supplied by the client (§8).
    for (const key of [
      'time_in',
      'timeIn',
      'time_out',
      'timeOut',
      'status',
      'companyId',
      'hostNameSnapshot',
      'photoPath',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }

    const created = await screen.findByTestId('visitor-created', {}, { timeout: 15000 });
    expect(within(created).getByTestId('created-status')).toHaveTextContent('PENDING');

    const timeIn = within(created).getByTestId('created-time-in');
    expect(timeIn.tagName).toBe('SPAN');
    expect(timeIn.textContent).toMatch(/^\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}$/);
    // Display only — no control of any kind can edit Time-In.
    expect(within(created).queryByRole('textbox')).toBeNull();
    expect(within(created).queryByRole('combobox')).toBeNull();
    expect(within(created).queryByRole('spinbutton')).toBeNull();
    expect(within(created).getByText('Time-Out')).toBeInTheDocument();
    expect(within(created).getByText('—')).toBeInTheDocument();
    // The list is refreshed with the new entry.
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/visitor/entries', expect.anything()));
  });

  it('uploads the photo only after the entry exists', async () => {
    await renderPage();
    await openCreate();
    await fillCreateForm();

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'visitor.jpg', { type: 'image/jpeg' });
    // The page passes testId="visitor-photo", so the preview carries that prefix.
    fireEvent.change(screen.getByTestId('visitor-photo-file'), { target: { files: [file] } });
    await screen.findByTestId('visitor-photo-preview', {}, { timeout: 15000 });

    fireEvent.click(screen.getByTestId('new-visitor-submit'));
    await waitFor(() => expect(apiMock.upload).toHaveBeenCalledTimes(1), { timeout: 15000 });

    const [uploadUrl, formData] = apiMock.upload.mock.calls[0] as [string, FormData];
    expect(uploadUrl).toBe(`/visitor/entries/${ENTRY}/photo`);
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('file')).toBeInstanceOf(File);
    // The entry must exist before its photo can be attached.
    expect(apiMock.post.mock.invocationCallOrder[0]).toBeLessThan(
      apiMock.upload.mock.invocationCallOrder[0],
    );
  });

  // ── 7 ────────────────────────────────────────────────────────────────────
  it('rejects an invalid CNIC before anything is sent', async () => {
    await renderPage();
    await openCreate();
    await fillCreateForm();

    fireEvent.change(within(form()).getByPlaceholderText('12345-1234567-1'), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByTestId('new-visitor-submit'));

    expect(
      await screen.findByText(
        'CNIC must be 13 digits or formatted as 00000-0000000-0',
        {},
        { timeout: 15000 },
      ),
    ).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(screen.queryByTestId('visitor-created')).not.toBeInTheDocument();
  });

  // ── 8 ────────────────────────────────────────────────────────────────────
  it('surfaces a server-side division/location mismatch without claiming success', async () => {
    apiMock.post.mockRejectedValue({
      response: {
        status: 400,
        data: { message: 'Selected location does not belong to the selected division' },
      },
    });
    await renderPage();
    await openCreate();
    await fillCreateForm();

    fireEvent.click(screen.getByTestId('new-visitor-submit'));

    expect(
      await screen.findByText(
        'Selected location does not belong to the selected division',
        {},
        { timeout: 15000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('visitor-created')).not.toBeInTheDocument();
    // The form keeps the entered values so the user can correct them.
    expect(within(form()).getByPlaceholderText('Full name')).toHaveValue('Muhammad Test');
  });

  // ── 9 ────────────────────────────────────────────────────────────────────
  it('handles a 403 on the list with a clear message and no crash', async () => {
    mockApi({ listReject: { response: { status: 403 } } });

    await renderPage();

    expect(
      await screen.findByText('You do not have permission to view visitor entries.', {}, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('visitor-page')).toBeInTheDocument();
    expect(screen.queryByText('Muhammad Test')).not.toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  // ── 10 ───────────────────────────────────────────────────────────────────
  it('opens the detail view with the full CNIC and the authorized photo endpoint', async () => {
    (URL as any).createObjectURL = jest.fn(() => 'blob:visitor-photo');
    (URL as any).revokeObjectURL = jest.fn();

    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /View/ }, { timeout: 15000 }));

    const detail = await screen.findByTestId('visitor-detail', {}, { timeout: 15000 });
    // Full CNIC is available here (§14) — the list stays masked.
    expect(within(detail).getByText('12345-1234567-1')).toBeInTheDocument();

    const photo = await within(detail).findByTestId('visitor-detail-photo', {}, { timeout: 15000 });
    expect(photo).toHaveAttribute('src', 'blob:visitor-photo');
    expect(apiMock.getFile).toHaveBeenCalledWith(`/visitor/entries/${ENTRY}/photo`);
    expect(within(detail).getByText('Time-In')).toBeInTheDocument();
  });

  // ── 11 ───────────────────────────────────────────────────────────────────
  it('hides the create action from a user without visitor.entry.create', async () => {
    seedUser(['visitor.entry.view']);

    await renderPage();
    expect(await screen.findByText('Muhammad Test', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.queryByTestId('new-visitor-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('visitor-refresh')).toBeInTheDocument();
  });

  // ── 12 ───────────────────────────────────────────────────────────────────
  it('validates the mobile number the same way the API does', async () => {
    await renderPage();
    await openCreate();

    fireEvent.change(within(form()).getByPlaceholderText('Full name'), {
      target: { value: 'Muhammad Test' },
    });
    fireEvent.change(within(form()).getByPlaceholderText('12345-1234567-1'), {
      target: { value: '1234512345671' },
    });
    fireEvent.change(within(form()).getByPlaceholderText('0300-1234567'), {
      target: { value: 'call-me-maybe' },
    });
    fireEvent.click(screen.getByTestId('new-visitor-submit'));

    expect(
      await screen.findByText(
        'Mobile number must be a valid number, e.g. 0300-1234567',
        {},
        { timeout: 15000 },
      ),
    ).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
