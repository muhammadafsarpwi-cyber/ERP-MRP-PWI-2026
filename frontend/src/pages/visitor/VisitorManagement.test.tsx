import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import dayjs from 'dayjs';
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
  // jsdom has no 2D canvas and never loads an <img>; the signature pad and the
  // slip's image inlining both rely on both, so both are stubbed here. The
  // stubs are deliberately faithful about *shape* (a context with the drawing
  // calls, an export that returns a PNG data URL) without pretending to render.
  //
  // These are PLAIN functions, not `jest.fn()`: Create React App configures
  // `resetMocks: true`, which would strip every mock implementation before each
  // test and silently turn the canvas into `undefined`.
  (HTMLCanvasElement.prototype as any).getContext = function getContext() {
    return {
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      strokeStyle: '#000',
      fillStyle: '#000',
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      clearRect: () => {},
      fillRect: () => {},
      drawImage: () => {},
    };
  };
  (HTMLCanvasElement.prototype as any).toDataURL = () =>
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // jsdom reports a zero-sized rect for every element, which the pad's
  // coordinate mapping would treat as "not drawable".
  (HTMLCanvasElement.prototype as any).getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 460,
      bottom: 160,
      width: 460,
      height: 160,
      toJSON: () => ({}),
    }) as DOMRect;
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    width = 0;
    height = 0;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      setTimeout(() => this.onload?.(), 0);
    }
  }
  (global as any).Image = StubImage;
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
  visitorReference: 'VIS-2026-000001',
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

/**
 * Prompt #19 — what `GET /visitor/entries/:id/slip` returns.
 *
 * A purpose-built VIEW, deliberately shaped differently from the detail row:
 * a masked CNIC (§6), a real company name, host department, and a
 * `hostConfirmation` block. Crucially it carries NO `photoPath` /
 * `signaturePath` — only the authorised endpoint URLs, so a storage path can
 * never reach the print surface (§6/§22).
 */
const SLIP_PENDING = {
  visitorReference: 'VIS-2026-000001',
  companyName: 'PAKISTAN WIRE INDUSTRIES (PVT) LTD.',
  visitorName: 'Muhammad Test',
  cnic: '12345-*******-1',
  mobile: '0300-1234567',
  visitorCompany: 'PakWiz Trading',
  hostName: 'Muhammad Zeeshan',
  hostDepartment: 'Cutting & Packing',
  division: { code: 'DIV-CCD', name: 'Control Cable Division' },
  location: { code: 'GATE-01', name: 'Main Gate' },
  timeIn: '2026-09-28 10:30',
  timeOut: null,
  status: 'PENDING',
  hostConfirmation: {
    confirmed: false,
    confirmedAt: null,
    confirmedBy: null,
    signatureCapturedAt: null,
    signatureCapturedBy: null,
    hostIdentityVerified: false,
  },
  hasPhoto: true,
  photoUrl: `/visitor/entries/${ENTRY}/photo`,
  hasSignature: false,
  signatureUrl: null,
  createdBy: 'u1000000-0000-0000-0000-000000000001',
  createdAt: '2026-09-28 10:30',
};

/** The same slip after the host confirmed and the visit was closed. */
const SLIP_CONFIRMED = {
  ...SLIP_PENDING,
  status: 'COMPLETED',
  timeOut: '2026-09-28 13:40',
  hostConfirmation: {
    confirmed: true,
    confirmedAt: '2026-09-28 11:05',
    confirmedBy: 'u1000000-0000-0000-0000-000000000001',
    signatureCapturedAt: '2026-09-28 11:05',
    signatureCapturedBy: 'u1000000-0000-0000-0000-000000000001',
    hostIdentityVerified: false,
  },
  hasSignature: true,
  signatureUrl: `/visitor/entries/${ENTRY}/signature`,
};

/** A visitor record after the host confirmed — still PENDING, still on site. */
const HOST_CONFIRMED_ROW = {
  ...LIST_ROW,
  hostConfirmed: true,
  hostConfirmedAt: '2026-09-28T11:05:00.000Z',
  hostConfirmedBy: 'u1000000-0000-0000-0000-000000000001',
  hasSignature: true,
  signatureUrl: `/visitor/entries/${ENTRY}/signature`,
  // §28 — the confirmation changed NONE of these.
  timeOut: null,
  status: 'PENDING',
  onSite: true,
};

const ALL_PERMISSIONS = [
  'visitor.entry.view',
  'visitor.entry.create',
  // Prompt #18 §21 — the exit is its own permission, in the same family.
  'visitor.entry.update',
  // Prompt #19 §19 — printing the physical document is a separate capability.
  'visitor.slip.print',
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
    // Slip first: it also starts with '/visitor/entries/'.
    if (u.endsWith('/slip')) return Promise.resolve({ data: SLIP_PENDING });
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
 * The page renders stored ISO timestamps in the browser's local zone, so an
 * assertion about a *time* has to be computed the same way instead of hard-coded
 * — otherwise the test only passes on a UTC machine.
 */
const asDisplayed = (iso: string) => dayjs(iso).format('DD-MMM-YYYY HH:mm');

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
    apiMock.patch.mockReset();
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
    expect(within(created).getByTestId('created-time-out')).toHaveTextContent('—');
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

  // ==========================================================================
  // Prompt #18 §28 — Visitor Exit / Time-Out + pending / completed visitors
  //
  //   1  a pending visitor displays PENDING
  //   2  a pending visitor shows the Time Out action
  //   3  a completed visitor displays COMPLETED
  //   4  a completed visitor displays the server Time-Out
  //   5  a completed visitor has no active Time Out action
  //   6  a confirmation dialog appears before any request is sent
  //   7  a successful checkout refreshes the visitor data
  //   8  the Pending filter is sent to the server and drives the table
  //   9  the Completed filter is sent to the server and drives the table
  //   10 an unauthorized / rejected exit is handled without a false success
  //   11 visitor creation from Prompt #17 still works (outer suite)
  // ==========================================================================
  describe('Prompt #18 — exit / Time-Out', () => {
    /**
     * A finished visit. A different visitor name AND a different day for
     * Time-In keep every assertion below unambiguous in a two-row list.
     */
    const EXITED = {
      ...LIST_ROW,
      id: 'f1000000-0000-0000-0000-000000000002',
      visitorName: 'Ahmed Khan',
      hostNameSnapshot: 'Usman Ali',
      timeIn: '2026-09-14T10:15:00.000Z',
      timeOut: '2026-09-21T13:40:00.000Z',
      status: 'COMPLETED',
      onSite: false,
      exitedBy: 'u1000000-0000-0000-0000-000000000001',
    };
    const EXITED_ID = EXITED.id;
    const PENDING_ROW = { ...LIST_ROW, onSite: true };

    /**
     * What the server returns from the exit endpoint: the SAME row, now closed.
     * (A different id would make the in-place row update a no-op and hide a real
     * bug, so the fixture deliberately keeps the identity.)
     */
    const CHECKED_OUT = {
      ...PENDING_ROW,
      timeOut: '2026-09-21T13:40:00.000Z',
      status: 'COMPLETED',
      onSite: false,
      exitedBy: 'u1000000-0000-0000-0000-000000000001',
    };

    /**
     * NOTE ON "IS THE DIALOG GONE?"
     *   A closed antd Modal leaves its panel mounted in jsdom and hides it with
     *   CSS-in-JS that jsdom never applies, so visibility is NOT observable
     *   here (probed, not guessed). What IS observable — and what actually
     *   matters — is that closing the dialog performs no request and leaves the
     *   visit untouched, which is what the cancellation and 403 tests assert.
     */

    const listCalls = () =>
      apiMock.get.mock.calls.filter(([url]: any[]) => String(url) === '/visitor/entries') as any[];

    /**
     * A server-side filter: the API decides what the table shows. The pending
     * answer deliberately contains no completed row (and vice versa), so a
     * client-side filter would be visible immediately.
     */
    function mockFilteredList(detailRow: any = DETAIL_ROW) {
      apiMock.get.mockImplementation((url: any, params?: any) => {
        const u = String(url);
        if (u === '/visitor/entries') {
          if (params?.status === 'PENDING') return Promise.resolve({ data: [PENDING_ROW], total: 1 });
          if (params?.status === 'COMPLETED') return Promise.resolve({ data: [EXITED], total: 1 });
          if (params?.today === true) return Promise.resolve({ data: [PENDING_ROW], total: 1 });
          return Promise.resolve({ data: [PENDING_ROW, EXITED], total: 2 });
        }
        if (u.startsWith('/visitor/entries/')) return Promise.resolve({ data: detailRow });
        if (u === '/divisions') return Promise.resolve({ data: ALL_DIVISIONS });
        if (u === '/locations') {
          const key = String(params?.divisionId || '');
          return Promise.resolve({ data: LOCATIONS[key] ?? [] });
        }
        if (u === '/visitor/hosts') return Promise.resolve({ data: HOSTS });
        return Promise.resolve({ data: [] });
      });
    }

    /**
     * rc-select binds its mousedown handler to the SELECTOR wrapper, so a
     * mousedown on the combobox input inside it bubbles up and opens the list.
     */
    function openStatusSelect() {
      const combo = within(screen.getByTestId('visitor-status-filter')).getByRole('combobox');
      fireEvent.mouseDown(combo);
    }

    async function pickStatusOption(label: string) {
      openStatusSelect();
      const option = await screen.findByText(
        label,
        { selector: '.ant-select-item-option-content' },
        { timeout: 15000 },
      );
      fireEvent.click(option);
    }

    async function openExitDialog() {
      fireEvent.click(await screen.findByTestId(`visitor-exit-${ENTRY}`, {}, { timeout: 15000 }));
      return screen.findByTestId('visitor-exit-body', {}, { timeout: 15000 });
    }

    beforeEach(() => {
      seedUser(); // ALL_PERMISSIONS now includes visitor.entry.update
      mockFilteredList();
      apiMock.patch.mockResolvedValue({ success: true, data: CHECKED_OUT });
    });

    // ── 1 / 2 ──────────────────────────────────────────────────────────────
    it('1+2. marks a pending visitor as PENDING with a Pending Time-Out and a Time Out action', async () => {
      await renderPage();

      expect(await screen.findByText('Muhammad Test', {}, { timeout: 15000 })).toBeInTheDocument();
      expect(screen.getByTestId('visitor-status-PENDING')).toHaveTextContent('PENDING');
      // §10 — the pending state is spelled out, not only coloured.
      expect(screen.getByTestId(`visitor-timeout-pending-${ENTRY}`)).toHaveTextContent('Pending');
      expect(screen.getByTestId(`visitor-exit-${ENTRY}`)).toBeInTheDocument();
    });

    // ── 3 / 4 / 5 ──────────────────────────────────────────────────────────
    it('3+4+5. shows the server Time-Out for a completed visitor and offers no Time Out action', async () => {
      // A list that contains ONLY the closed visit.
      apiMock.get.mockImplementation((url: any) => {
        const u = String(url);
        if (u === '/visitor/entries') return Promise.resolve({ data: [EXITED], total: 1 });
        if (u.startsWith('/visitor/entries/')) return Promise.resolve({ data: EXITED });
        if (u === '/divisions') return Promise.resolve({ data: ALL_DIVISIONS });
        return Promise.resolve({ data: [] });
      });

      await renderPage();

      expect(await screen.findByText('Ahmed Khan', {}, { timeout: 15000 })).toBeInTheDocument();
      expect(screen.getByTestId('visitor-status-COMPLETED')).toHaveTextContent('COMPLETED');
      // §11 — the real server Time-Out, formatted, and no "Pending" marker.
      expect(screen.getByTestId(`visitor-timeout-${EXITED_ID}`)).toHaveTextContent(/21-[A-Za-z]{3}-2026/);
      expect(screen.queryByTestId(`visitor-timeout-pending-${EXITED_ID}`)).not.toBeInTheDocument();
      // §20 — no active Time Out action on a closed visit.
      expect(screen.queryByTestId(`visitor-exit-${EXITED_ID}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`visitor-view-${EXITED_ID}`)).toBeInTheDocument();
    });

    // ── 6 ─────────────────────────────────────────────────────────────────
    it('6. asks for confirmation before any request is sent', async () => {
      await renderPage();
      const body = await openExitDialog();

      // Visitor, Time-In and the explicit question are all shown.
      expect(within(body).getByText('Muhammad Test')).toBeInTheDocument();
      expect(within(body).getByTestId('visitor-exit-time-in')).toBeInTheDocument();
      expect(
        screen.getByText('Are you sure this visitor has exited the premises?'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('visitor-exit-cancel')).toBeInTheDocument();
      expect(screen.getByTestId('visitor-exit-confirm')).toHaveTextContent('Confirm Time-Out');
      // §14 — nothing is sent until the user confirms.
      expect(apiMock.patch).not.toHaveBeenCalled();
    });

    it('6b. cancelling the dialog leaves the visitor untouched', async () => {
      await renderPage();
      await openExitDialog();

      fireEvent.click(screen.getByTestId('visitor-exit-cancel'));

      // Nothing was sent, and the visit is exactly as it was.
      expect(apiMock.patch).not.toHaveBeenCalled();
      expect(screen.getByTestId('visitor-status-PENDING')).toBeInTheDocument();
      expect(screen.getByTestId(`visitor-exit-${ENTRY}`)).toBeInTheDocument();
    });

    // ── 7 ─────────────────────────────────────────────────────────────────
    it('7. checks the visitor out and refreshes the row from the server response', async () => {
      await renderPage();
      await openExitDialog();

      fireEvent.click(screen.getByTestId('visitor-exit-confirm'));

      await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(1), { timeout: 15000 });
      const [url, body] = apiMock.patch.mock.calls[0] as [string, any];
      expect(url).toBe(`/visitor/entries/${ENTRY}/exit`);
      // §4 — the client sends no Time-Out, status or actor at all.
      expect(body ?? {}).toEqual({});

      // The table now shows what the SERVER recorded for THIS row.
      const timeOutCell = await screen.findByTestId(
        `visitor-timeout-${ENTRY}`,
        {},
        { timeout: 15000 },
      );
      expect(timeOutCell).toHaveTextContent(/21-[A-Za-z]{3}-2026/);
      expect(screen.queryByTestId(`visitor-timeout-pending-${ENTRY}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`visitor-exit-${ENTRY}`)).not.toBeInTheDocument();
      // The pending visit is now the closed one: two completed, none pending.
      expect(screen.getAllByTestId('visitor-status-COMPLETED')).toHaveLength(2);
      expect(screen.queryByTestId('visitor-status-PENDING')).not.toBeInTheDocument();
    });

    it('7b. refetches the list when a filter is active, so the closed visit leaves the view', async () => {
      await renderPage();
      await pickStatusOption('Pending (still on site)');
      await waitFor(() =>
        expect(apiMock.get).toHaveBeenCalledWith(
          '/visitor/entries',
          expect.objectContaining({ status: 'PENDING' }),
        ),
      );
      const before = listCalls().length;

      await openExitDialog();
      fireEvent.click(screen.getByTestId('visitor-exit-confirm'));

      await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(1), { timeout: 15000 });
      // The pending query is re-issued — the visitor must not linger in a
      // "still on site" view.
      await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
      const last = listCalls()[listCalls().length - 1][1];
      expect(last).toEqual(expect.objectContaining({ status: 'PENDING' }));
    });

    // ── 8 ─────────────────────────────────────────────────────────────────
    it('8. filters by Pending on the server and shows only the pending visit', async () => {
      await renderPage();
      // Unfiltered, the table holds both rows.
      expect(await screen.findByText('Muhammad Test', {}, { timeout: 15000 })).toBeInTheDocument();

      await pickStatusOption('Pending (still on site)');

      await waitFor(() =>
        expect(apiMock.get).toHaveBeenCalledWith(
          '/visitor/entries',
          expect.objectContaining({ status: 'PENDING' }),
        ),
      );
      // §12 — the server answer is what is rendered, so the completed row from
      // the unfiltered load is gone.
      await waitFor(() => expect(screen.getAllByTestId('visitor-status-PENDING')).toHaveLength(1));
      expect(screen.queryByTestId('visitor-status-COMPLETED')).not.toBeInTheDocument();
    });

    // ── 9 ─────────────────────────────────────────────────────────────────
    it('9. filters by Completed on the server and shows only the closed visit', async () => {
      await renderPage();
      await screen.findByText('Muhammad Test', {}, { timeout: 15000 });

      await pickStatusOption('Completed');

      await waitFor(() =>
        expect(apiMock.get).toHaveBeenCalledWith(
          '/visitor/entries',
          expect.objectContaining({ status: 'COMPLETED' }),
        ),
      );
      // §12 — the server answer replaces the previous two-row list, so the
      // pending visit disappears from a Completed view.
      await waitFor(() => expect(screen.queryByTestId('visitor-status-PENDING')).not.toBeInTheDocument());
    });

    it('9b. limits the list to the current day using the server-side flag', async () => {
      await renderPage();
      await screen.findByText('Muhammad Test', {}, { timeout: 15000 });

      fireEvent.click(screen.getByTestId('visitor-today-only'));

      await waitFor(() =>
        expect(apiMock.get).toHaveBeenCalledWith('/visitor/entries', expect.objectContaining({ today: true })),
      );
      // §19 — the browser never sends a day boundary of its own.
      const params = listCalls()[listCalls().length - 1][1];
      expect(params.from).toBeUndefined();
      expect(params.to).toBeUndefined();
    });

    // ── 10 ────────────────────────────────────────────────────────────────
    it('10a. hides the Time Out action from a user without visitor.entry.update', async () => {
      seedUser(['visitor.entry.view', 'visitor.entry.create']);

      await renderPage();
      expect(await screen.findByText('Muhammad Test', {}, { timeout: 15000 })).toBeInTheDocument();
      // §23 — UX only; the backend is the real gate.
      expect(screen.queryByTestId(`visitor-exit-${ENTRY}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`visitor-view-${ENTRY}`)).toBeInTheDocument();
      expect(screen.getByTestId('new-visitor-button')).toBeInTheDocument();
    });

    it('10b. reports a 403 from the exit endpoint without claiming success', async () => {
      apiMock.patch.mockRejectedValue({
        response: { status: 403, data: { message: 'You do not have access to this visitor record.' } },
      });

      await renderPage();
      await openExitDialog();
      fireEvent.click(screen.getByTestId('visitor-exit-confirm'));

      expect(
        await screen.findByText('You do not have permission to perform this action.', {}, { timeout: 15000 }),
      ).toBeInTheDocument();
      // The visit is still open and the action is still offered.
      expect(screen.getByTestId('visitor-status-PENDING')).toBeInTheDocument();
      expect(screen.getByTestId(`visitor-exit-${ENTRY}`)).toBeInTheDocument();
      // No success was claimed.
      expect(screen.queryByText(/Visitor exit recorded/)).not.toBeInTheDocument();
    });

    it('10c. reports an already-completed visitor (double click / second officer) and reloads', async () => {
      apiMock.patch.mockRejectedValue({
        response: { status: 409, data: { message: 'Visitor has already checked out.' } },
      });

      await renderPage();
      await openExitDialog();
      fireEvent.click(screen.getByTestId('visitor-exit-confirm'));

      expect(
        await screen.findByText('Visitor has already checked out.', {}, { timeout: 15000 }),
      ).toBeInTheDocument();
      // The truth is re-read instead of guessed (§15).
      await waitFor(() =>
        expect(
          apiMock.get.mock.calls.filter(([u]: any[]) => String(u) === '/visitor/entries').length,
        ).toBeGreaterThan(1),
      );
    });

    // ── 16 — detail view ───────────────────────────────────────────────────
    it('16a. the detail view spells out a pending Time-Out and shows the record fields', async () => {
      await renderPage();

      fireEvent.click(await screen.findByTestId(`visitor-view-${ENTRY}`, {}, { timeout: 15000 }));
      const detail = await screen.findByTestId('visitor-detail', {}, { timeout: 15000 });

      // §16 — a pending visit reads "Pending", never a blank.
      expect(within(detail).getByTestId('detail-time-out-pending')).toHaveTextContent('Pending');
      expect(within(detail).getByText('PENDING')).toBeInTheDocument();
      // No exit actor exists before the Time-Out is recorded.
      expect(within(detail).queryByTestId('detail-exited-by')).not.toBeInTheDocument();
      for (const label of ['Visitor', 'CNIC', 'Mobile', 'Host', 'Division', 'Location', 'Time-In', 'Time-Out', 'Status', 'Created At', 'Created By']) {
        expect(within(detail).getByText(label)).toBeInTheDocument();
      }
      // The full record is on screen, unmasked CNIC included.
      expect(within(detail).getByText('12345-1234567-1')).toBeInTheDocument();
    });

    it('16b. a completed detail shows the real Time-Out and who recorded it', async () => {
      apiMock.get.mockImplementation((url: any) => {
        const u = String(url);
        if (u === '/visitor/entries') return Promise.resolve({ data: [EXITED], total: 1 });
        if (u.startsWith('/visitor/entries/')) return Promise.resolve({ data: EXITED });
        if (u === '/divisions') return Promise.resolve({ data: ALL_DIVISIONS });
        return Promise.resolve({ data: [] });
      });

      await renderPage();
      fireEvent.click(await screen.findByTestId(`visitor-view-${EXITED_ID}`, {}, { timeout: 15000 }));
      const detail = await screen.findByTestId('visitor-detail', {}, { timeout: 15000 });

      await waitFor(() => expect(within(detail).getByTestId('detail-time-out')).toBeInTheDocument());
      expect(within(detail).getByTestId('detail-time-out')).toHaveTextContent(/21-[A-Za-z]{3}-2026/);
      expect(within(detail).getByText('COMPLETED')).toBeInTheDocument();
      expect(within(detail).queryByTestId('detail-time-out-pending')).not.toBeInTheDocument();
      // §17 — the exit actor is preserved next to the record.
      expect(within(detail).getByTestId('detail-exited-by')).toHaveTextContent(
        'u1000000-0000-0000-0000-000000000001',
      );
      // §20 — a closed visit offers no Time Out action anywhere, detail included.
      expect(screen.queryByTestId('visitor-detail-exit')).not.toBeInTheDocument();
      expect(screen.queryByTestId(`visitor-exit-${EXITED_ID}`)).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // PROMPT #19 — VISITOR SLIP, PRINT & HOST CONFIRMATION / SIGNATURE
  // ==========================================================================
  //   1  the Print Slip action is offered to a holder of visitor.slip.print
  //   2  it is hidden from a user without it (UX only — the API is the gate)
  //   3  the preview shows the visitor information the slip is required to carry
  //   4  the preview is built from the authorised slip view, not the list row
  //   5  opening/printing the preview mutates nothing (§9 / §25)
  //   6  the photo is inlined from the authorised endpoint, never a public URL
  //   7  a photo that cannot be loaded never blocks the printout (§26)
  //   8  a hostile visitor name cannot inject markup into the slip (§30)
  //   9  the physical signature area is ALWAYS on the printed slip (§13)
  //  10  the digital signature is shown on the slip when one was captured
  //  11  the host confirmation action is offered from the detail (§15)
  //  12  the confirmation dialog sends only the signature and the note (§17)
  //  13  the UI reflects the confirmation, with actor and moment (§16/§24)
  //  14  the confirmation does NOT check the visitor out (§28)
  //  15  a completed visitor stays printable and shows the real Time-Out (§29)
  //  16  the created-visitor success offers the slip (re-print path, §25)
  //  17  a rejected confirmation is reported without a false success
  // ==========================================================================
  describe('Prompt #19 — slip, print & host confirmation', () => {
    /** Every write the page can possibly make, so "mutates nothing" is provable. */
    const writeCalls = () =>
      [
        ...apiMock.post.mock.calls,
        ...apiMock.patch.mock.calls,
        ...apiMock.put.mock.calls,
        ...apiMock.upload.mock.calls,
        ...apiMock.delete.mock.calls,
      ] as any[];

    const listRows = (rows: any[]) => (url: any, params?: any) => {
      const u = String(url);
      if (u === '/visitor/entries') return Promise.resolve({ data: rows, total: rows.length });
      if (u.endsWith('/slip')) return Promise.resolve({ data: SLIP_PENDING });
      if (u.startsWith('/visitor/entries/')) return Promise.resolve({ data: rows[0] ?? DETAIL_ROW });
      if (u === '/divisions') return Promise.resolve({ data: ALL_DIVISIONS });
      if (u === '/locations') {
        const key = String(params?.divisionId || '');
        return Promise.resolve({ data: LOCATIONS[key] ?? [] });
      }
      if (u === '/visitor/hosts') return Promise.resolve({ data: HOSTS });
      return Promise.resolve({ data: [] });
    };

    const COMPLETED_ROW = {
      ...LIST_ROW,
      status: 'COMPLETED',
      timeOut: '2026-09-28T13:40:00.000Z',
      onSite: false,
      hostConfirmed: true,
      hostConfirmedAt: '2026-09-28T11:05:00.000Z',
      hostConfirmedBy: 'u1000000-0000-0000-0000-000000000001',
      exitedBy: 'u1000000-0000-0000-0000-000000000001',
    };

    async function openSlipPreview(rowId: string = ENTRY) {
      fireEvent.click(await screen.findByTestId(`visitor-slip-${rowId}`, {}, { timeout: 15000 }));
      const canvas = await screen.findByTestId(
        'visitor-slip-preview-canvas',
        {},
        { timeout: 15000 },
      );
      return canvas;
    }

    beforeEach(() => {
      seedUser(); // ALL_PERMISSIONS now includes visitor.slip.print
      apiMock.get.mockImplementation(listRows([{ ...LIST_ROW, onSite: true }]));
      apiMock.getFile.mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
      apiMock.post.mockReset();
      apiMock.post.mockResolvedValue({ data: HOST_CONFIRMED_ROW });
      apiMock.put.mockReset();
      apiMock.delete.mockReset();
    });

    // ── 1 / 2 ──────────────────────────────────────────────────────────────
    it('1. offers Print Slip to a holder of visitor.slip.print', async () => {
      await renderPage();
      expect(await screen.findByTestId(`visitor-slip-${ENTRY}`, {}, { timeout: 15000 })).toBeInTheDocument();
    });

    it('2. hides Print Slip from a user without visitor.slip.print, keeping view/exit', async () => {
      seedUser(['visitor.entry.view', 'visitor.entry.update']);
      apiMock.get.mockImplementation(listRows([{ ...LIST_ROW, onSite: true }]));

      await renderPage();
      expect(await screen.findByTestId(`visitor-view-${ENTRY}`, {}, { timeout: 15000 })).toBeInTheDocument();
      // §19/§23 — UX only; the slip endpoint stays server-guarded.
      expect(screen.queryByTestId(`visitor-slip-${ENTRY}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`visitor-exit-${ENTRY}`)).toBeInTheDocument();
    });

    // ── 3 / 4 ──────────────────────────────────────────────────────────────
    it('3. previews the visitor information the slip has to carry, by reference', async () => {
      await renderPage();
      const slip = await openSlipPreview();

      // §3/§4 — every fact the brief requires is on the document.
      for (const text of [
        'VIS-2026-000001', // server-generated reference, not a raw UUID
        'Muhammad Test',
        '12345-*******-1', // masked CNIC (§6)
        '0300-1234567',
        'PakWiz Trading',
        'Muhammad Zeeshan',
        'Cutting & Packing',
        'Control Cable Division',
        'Main Gate',
        asDisplayed(SLIP_PENDING.timeIn), // Time-In, as the slip prints it
        'PAKISTAN WIRE INDUSTRIES (PVT) LTD.',
      ]) {
        expect(within(slip).getByText(text)).toBeInTheDocument();
      }
      // §27 — a pending visit prints "Pending" for the Time-Out, never a blank.
      expect(within(slip).getByText('Time-Out')).toBeInTheDocument();
      expect(within(slip).getByText('Pending')).toBeInTheDocument();
      // The status is shown twice (reference bar + visit block) — both real.
      expect(within(slip).getAllByText('PENDING').length).toBeGreaterThanOrEqual(2);
      // The raw record id is never the human identifier on the document.
      expect(slip.textContent).not.toContain(ENTRY);
    });

    it('4. builds the slip from the authorised slip endpoint, never the list row', async () => {
      await renderPage();
      const slip = await openSlipPreview();

      expect(apiMock.get).toHaveBeenCalledWith(`/visitor/entries/${ENTRY}/slip`);
      // The list row is masked and carries no host department; the slip does.
      expect(within(slip).getByText('Cutting & Packing')).toBeInTheDocument();
      // §6/§22 — the payload must never expose a storage path.
      expect(JSON.stringify(SLIP_PENDING)).not.toMatch(/photoPath|signaturePath/);
    });

    // ── 5 ─────────────────────────────────────────────────────────────────
    it('5. opening, previewing and printing the slip send no write at all', async () => {
      await renderPage();
      await openSlipPreview();

      // §9/§25 — a print is a read.
      expect(writeCalls()).toHaveLength(0);

      // The Print button hands the SAME payload to the existing print pipeline.
      fireEvent.click(screen.getByTestId('visitor-slip-preview-print'));
      expect(writeCalls()).toHaveLength(0);

      // And cancelling the preview writes nothing either.
      fireEvent.click(screen.getByTestId('visitor-slip-preview-cancel'));
      await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/visitor/entries', expect.anything()));
      expect(writeCalls()).toHaveLength(0);
    });

    // ── 6 / 7 ──────────────────────────────────────────────────────────────
    it('6. inlines the photo from the authorised endpoint instead of linking a URL', async () => {
      await renderPage();
      const slip = await openSlipPreview();

      // The image only exists once the authorised fetch has been inlined.
      const image = (await within(slip).findByAltText('Visitor photo')) as HTMLImageElement;
      expect(apiMock.getFile).toHaveBeenCalledWith(`/visitor/entries/${ENTRY}/photo`);
      // A data URL, so the private storage path never becomes a fetchable URL.
      expect(image.getAttribute('src')).toMatch(/^data:image\//);
      expect(image.getAttribute('src')).not.toContain(ENTRY);
    });

    it('7. prints the slip anyway when the photo cannot be loaded', async () => {
      apiMock.getFile.mockRejectedValue({ response: { status: 403 } });
      await renderPage();

      const slip = await openSlipPreview();
      await screen.findByTestId('visitor-slip-preview-image-warning', {}, { timeout: 15000 });
      // §26 — the failure is reported, never hidden, and never fatal.
      expect(within(slip).queryByAltText('Visitor photo')).not.toBeInTheDocument();
      expect(within(slip).getByTestId('visitor-slip-photo-placeholder')).toBeInTheDocument();
      // The document is still complete and still printable.
      expect(within(slip).getByText('VIS-2026-000001')).toBeInTheDocument();
      expect(screen.getByTestId('visitor-slip-preview-print')).not.toBeDisabled();
    });

    // ── 8 ─────────────────────────────────────────────────────────────────
    it('8. escapes a hostile visitor name instead of injecting markup into the slip', async () => {
      const hostile = '<img src=x onerror="window.__pwned=1">';
      apiMock.get.mockImplementation((url: any, params?: any) => {
        const u = String(url);
        if (u.endsWith('/slip')) {
          return Promise.resolve({ data: { ...SLIP_PENDING, visitorName: hostile } });
        }
        return listRows([{ ...LIST_ROW, visitorName: hostile, onSite: true }])(url, params);
      });

      await renderPage();
      const slip = await openSlipPreview();

      // §30 — the value is shown as text; no element is created from it.
      expect(within(slip).getByText(hostile)).toBeInTheDocument();
      expect((window as any).__pwned).toBeUndefined();
      // The only image on the slip is the real photo, not an injected one.
      expect(within(slip).getAllByAltText('Visitor photo')).toHaveLength(1);
    });

    // ── 9 / 10 ─────────────────────────────────────────────────────────────
    it('9. always prints a physical signature area, digital signature or not', async () => {
      await renderPage();
      const slip = await openSlipPreview();

      // §13 — the physical box exists on an unconfirmed, unsigned slip.
      expect(within(slip).getByText('Host Signature')).toBeInTheDocument();
      expect(within(slip).getByText('HOST CONFIRMATION')).toBeInTheDocument();
      expect(within(slip).getAllByText('Host Name').length).toBeGreaterThanOrEqual(1);
      expect(within(slip).getByText('Date / Time')).toBeInTheDocument();
      expect(within(slip).getByText('Security / Reception Use')).toBeInTheDocument();
      expect(within(slip).getAllByText('PENDING').length).toBeGreaterThanOrEqual(1);
    });

    it('10. shows the captured digital signature on the slip when one exists', async () => {
      apiMock.get.mockImplementation((url: any, params?: any) => {
        const u = String(url);
        if (u.endsWith('/slip')) return Promise.resolve({ data: SLIP_CONFIRMED });
        return listRows([{ ...COMPLETED_ROW }])(url, params);
      });
      await renderPage();
      const slip = await openSlipPreview();

      await waitFor(() => expect(apiMock.getFile).toHaveBeenCalledWith(`/visitor/entries/${ENTRY}/signature`));
      const signature = within(slip).getByAltText('Host signature') as HTMLImageElement;
      expect(signature.getAttribute('src')).toMatch(/^data:image\//);
      // §17 — the slip states that the host's identity was NOT verified.
      expect(within(slip).getByText(/host identity not verified/)).toBeInTheDocument();
      // The physical area is still there alongside the digital one.
      expect(within(slip).getAllByText('Host Name').length).toBeGreaterThanOrEqual(2);
    });

    // ── 11 / 12 ────────────────────────────────────────────────────────────
    it('11. offers Confirm Host Visit from the detail, with an optional signature pad', async () => {
      await renderPage();
      fireEvent.click(await screen.findByTestId(`visitor-view-${ENTRY}`, {}, { timeout: 15000 }));
      const detail = await screen.findByTestId('visitor-detail', {}, { timeout: 15000 });

      expect(within(detail).getByTestId('detail-visitor-reference')).toHaveTextContent('VIS-2026-000001');
      expect(within(detail).getByTestId('detail-host-pending')).toHaveTextContent('Pending');
      expect(within(detail).getByTestId('detail-host-identity-note')).toHaveTextContent(
        'The system does not verify that this user is the selected host.',
      );

      fireEvent.click(screen.getByTestId('visitor-detail-confirm-host'));
      const body = await screen.findByTestId('visitor-host-body', {}, { timeout: 15000 });
      expect(within(body).getByTestId('visitor-host-signature')).toBeInTheDocument();
      // §14 — the pad offers draw / clear / save and is explicitly optional.
      expect(within(body).getByTestId('visitor-host-signature-canvas')).toBeInTheDocument();
      expect(within(body).getByTestId('visitor-host-signature-clear')).toBeInTheDocument();
      expect(within(body).getByTestId('visitor-host-signature-save')).toBeInTheDocument();
      expect(within(body).getByTestId('visitor-host-signature-status')).toHaveTextContent('No signature captured');
      // §28 — the dialog says out loud that this is not a departure.
      expect(screen.getByTestId('visitor-host-exit-note')).toHaveTextContent(
        'does NOT record the visitor',
      );
      // Opening the dialog alone sends nothing.
      expect(apiMock.post).not.toHaveBeenCalled();
    });

    it('12. sends only the optional signature and note to the confirmation endpoint', async () => {
      await renderPage();
      fireEvent.click(await screen.findByTestId(`visitor-view-${ENTRY}`, {}, { timeout: 15000 }));
      await screen.findByTestId('visitor-detail', {}, { timeout: 15000 });
      fireEvent.click(screen.getByTestId('visitor-detail-confirm-host'));
      const body = await screen.findByTestId('visitor-host-body', {}, { timeout: 15000 });

      // Sign on the pad, then add a note.
      const pad = within(body).getByTestId('visitor-host-signature-canvas');
      fireEvent.pointerDown(pad, { clientX: 20, clientY: 40, pointerId: 1 });
      fireEvent.pointerMove(pad, { clientX: 140, clientY: 90, pointerId: 1 });
      fireEvent.pointerUp(pad, { clientX: 220, clientY: 60, pointerId: 1 });
      fireEvent.change(within(body).getByTestId('visitor-host-note'), {
        target: { value: 'Host received the visitor' },
      });

      fireEvent.click(screen.getByTestId('visitor-host-confirm'));

      await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1), { timeout: 15000 });
      const [url, payload] = apiMock.post.mock.calls[0] as [string, any];
      expect(url).toBe(`/visitor/entries/${ENTRY}/host-confirmation`);
      expect(payload.signature).toMatch(/^data:image\/png;base64,/);
      expect(payload.note).toBe('Host received the visitor');
      // §17/§28 — nothing the client is not allowed to state (§ backend 400s).
      for (const key of [
        'hostConfirmed',
        'host_confirmed',
        'hostConfirmedAt',
        'host_confirmed_at',
        'hostConfirmedBy',
        'host_confirmed_by',
        'timeOut',
        'time_out',
        'status',
        'timeIn',
        'divisionId',
        'locationId',
        'signaturePath',
      ]) {
        expect(payload).not.toHaveProperty(key);
      }
    });

    // ── 13 / 14 ────────────────────────────────────────────────────────────
    it('13+14. shows the confirmation with its actor while the visit stays PENDING and on site', async () => {
      await renderPage();
      fireEvent.click(await screen.findByTestId(`visitor-view-${ENTRY}`, {}, { timeout: 15000 }));
      const detail = await screen.findByTestId('visitor-detail', {}, { timeout: 15000 });
      fireEvent.click(screen.getByTestId('visitor-detail-confirm-host'));
      await screen.findByTestId('visitor-host-body', {}, { timeout: 15000 });
      fireEvent.click(screen.getByTestId('visitor-host-confirm'));

      await waitFor(() => expect(apiMock.post).toHaveBeenCalled(), { timeout: 15000 });
      expect(await screen.findByText('Host visit confirmed', {}, { timeout: 15000 })).toBeInTheDocument();

      // §16 — the confirmation is now visible in the list, with actor and moment.
      await waitFor(() =>
        expect(screen.getByTestId(`visitor-host-confirmed-${ENTRY}`)).toHaveTextContent('Confirmed'),
      );
      // §28 — and it changed NONE of the departure facts.
      expect(screen.getByTestId('visitor-status-PENDING')).toHaveTextContent('PENDING');
      expect(screen.getByTestId(`visitor-timeout-pending-${ENTRY}`)).toHaveTextContent('Pending');
      expect(within(detail).getByTestId('detail-host-confirmed')).toBeInTheDocument();
      expect(within(detail).getByTestId('detail-host-confirmed-by')).toHaveTextContent(
        'u1000000-0000-0000-0000-000000000001',
      );
      expect(within(detail).getByTestId('detail-host-confirmed-at')).toHaveTextContent(
        asDisplayed(HOST_CONFIRMED_ROW.hostConfirmedAt),
      );
      expect(within(detail).getByTestId('detail-signature-status')).toHaveTextContent('Captured');
      expect(within(detail).getByTestId('detail-time-out-pending')).toHaveTextContent('Pending');
      expect(within(detail).getByText('PENDING')).toBeInTheDocument();
      // The action is gone: a second confirmation would overwrite the first.
      expect(screen.queryByTestId('visitor-detail-confirm-host')).not.toBeInTheDocument();
    });

    // ── 15 ────────────────────────────────────────────────────────────────
    it('15. keeps a completed visitor printable and re-printable from the detail', async () => {
      apiMock.get.mockImplementation((url: any, params?: any) => {
        const u = String(url);
        if (u.endsWith('/slip')) return Promise.resolve({ data: SLIP_CONFIRMED });
        return listRows([{ ...COMPLETED_ROW }])(url, params);
      });

      await renderPage();
      // §29 — a closed visit is still printable from the list…
      const slip = await openSlipPreview();
      expect(within(slip).getAllByText('COMPLETED').length).toBeGreaterThanOrEqual(1);
      expect(within(slip).getByText(asDisplayed(SLIP_CONFIRMED.timeOut))).toBeInTheDocument();
      expect(within(slip).getByText('CONFIRMED')).toBeInTheDocument();
      // No blank/placeholder state: the Time-Out is the real one, not "Pending".
      expect(within(slip).queryByText('Pending')).not.toBeInTheDocument();

      // …and from the detail, which is where a re-print normally happens.
      fireEvent.click(screen.getByTestId('visitor-slip-preview-cancel'));
      fireEvent.click(await screen.findByTestId(`visitor-view-${ENTRY}`, {}, { timeout: 15000 }));
      const detail = await screen.findByTestId('visitor-detail', {}, { timeout: 15000 });
      expect(within(detail).getByTestId('detail-time-out')).toHaveTextContent(
        asDisplayed(COMPLETED_ROW.timeOut),
      );
      expect(screen.getByTestId('visitor-detail-print')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('visitor-detail-print'));
      expect(await screen.findByTestId('visitor-slip-preview-canvas', {}, { timeout: 15000 })).toBeInTheDocument();
      expect(writeCalls()).toHaveLength(0);
    });

    // ── 16 ────────────────────────────────────────────────────────────────
    it('16. offers the slip right after registration, without creating a second record', async () => {
      await renderPage();
      await openCreate();
      await fillCreateForm();
      fireEvent.click(screen.getByTestId('new-visitor-submit'));

      const created = await screen.findByTestId('visitor-created', {}, { timeout: 15000 });
      // §5 — the reference is shown to the officer who just issued the slip.
      expect(within(created).getByTestId('created-visitor-reference')).toHaveTextContent('VIS-2026-000001');
      expect(within(created).getByTestId('created-status')).toHaveTextContent('PENDING');
      expect(within(created).getByTestId('created-time-out')).toHaveTextContent('—');

      fireEvent.click(within(created).getByTestId('created-print-slip'));
      expect(await screen.findByTestId('visitor-slip-preview-canvas', {}, { timeout: 15000 })).toBeInTheDocument();
      // §10 — re-printing is never a create.
      expect(apiMock.post).toHaveBeenCalledTimes(1);
    });

    // ── 17 ────────────────────────────────────────────────────────────────
    it('17. reports a rejected confirmation without claiming the visit was confirmed', async () => {
      apiMock.post.mockRejectedValue({
        response: { status: 409, data: { message: 'Host visit has already been confirmed.' } },
      });
      await renderPage();
      fireEvent.click(await screen.findByTestId(`visitor-view-${ENTRY}`, {}, { timeout: 15000 }));
      await screen.findByTestId('visitor-detail', {}, { timeout: 15000 });
      fireEvent.click(screen.getByTestId('visitor-detail-confirm-host'));
      await screen.findByTestId('visitor-host-body', {}, { timeout: 15000 });
      fireEvent.click(screen.getByTestId('visitor-host-confirm'));

      expect(
        await screen.findByText('Host visit has already been confirmed.', {}, { timeout: 15000 }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/^Host visit confirmed$/)).not.toBeInTheDocument();
      // The truth is re-read instead of guessed.
      await waitFor(() =>
        expect(apiMock.get).toHaveBeenCalledWith('/visitor/entries', expect.anything()),
      );
    });
  });
});
