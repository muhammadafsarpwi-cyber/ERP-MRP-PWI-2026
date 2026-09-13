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
  window.matchMedia = (q: string) =>
    ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

const machine = {
  id: 'm-t22-1',
  machineId: 'MCH-T22',
  machineCode: 'T22-CODE',
  machineNumber: 'TN-22',
  name: 'T22 Machine',
  machineType: 'Hydraulic Press',
  division: { id: 'd1', name: 'Division A' },
  section: { id: 's1', name: 'Section A' },
  department: { id: 'de1', name: 'Dept A' },
  location: 'Hall A / Bay 3',
  manufacturer: 'Acme Corp',
  model: 'H-200',
  serialNumber: 'SN-T22',
  status: 'ACTIVE',
  criticality: 'HIGH',
  isActive: true,
  capacity: '200',
  powerRating: '30 kW',
  description: 'TASK22 test machine',
  installationDate: '2023-01-15',
  warrantyExpiryDate: '2026-01-15',
  qrPayload: 'QR|T22',
  companyId: 'c1',
  createdAt: '2023-01-15T10:00:00Z',
  updatedAt: '2024-06-01T12:00:00Z',
  createdBy: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  updatedBy: 'ffffffff-1111-2222-3333-444444444444',
};

const divisions = [{ id: 'd1', name: 'Division A', divisionCode: 'DIV-A' }];
const sections = [{ id: 's1', name: 'Section A', sectionCode: 'SEC-A', divisionId: 'd1' }];
const departments = [{ id: 'de1', name: 'Dept A', departmentCode: 'DEP-A', divisionId: 'd1', sectionId: 's1' }];

const setupMocks = (opts?: { entries?: any[]; targets?: any[] }) => {
  localStorage.clear();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();

  apiMock.get.mockImplementation((url: any, params?: any) => {
    const u = String(url);
    if (u === '/machines') return Promise.resolve({ data: [machine], total: 1 });
    if (u === '/divisions') return Promise.resolve({ data: divisions });
    if (u === '/sections') return Promise.resolve({ data: sections });
    if (u === '/departments') return Promise.resolve({ data: departments });
    if (u === `/machines/${machine.id}`) return Promise.resolve({ success: true, data: { ...machine } });
    if (u === '/production/entries') return Promise.resolve({ data: opts?.entries ?? [], total: opts?.entries?.length ?? 0 });
    if (u === '/production/machine-targets') return Promise.resolve({ data: opts?.targets ?? [], total: opts?.targets?.length ?? 0 });
    return Promise.resolve({ data: [] });
  });

  apiMock.post.mockResolvedValue({ data: { id: 'new-id', machineId: 'MCH-NEW' }, success: true });
  apiMock.patch.mockResolvedValue({ data: { id: machine.id }, success: true });
};

const renderPage = () =>
  render(
    <AntApp>
      <MemoryRouter>
        <MachineManagement />
      </MemoryRouter>
    </AntApp>,
  );

/** Render the header-registered toolbar actions (PageHeader renders through the header store). */
const renderToolbar = () => {
  const { extra } = useHeaderActions.getState();
  expect(extra).not.toBeUndefined();
  render(<AntApp>{extra}</AntApp>);
};

/** Titles of currently-visible modals (antd keeps closed modal content mounted but hides `.ant-modal-wrap`). */
const visibleModalTitles = (): string[] =>
  Array.from(document.body.querySelectorAll('.ant-modal-content'))
    .filter((c) => {
      const wrap = c.closest('.ant-modal-wrap') as HTMLElement | null;
      return !wrap || wrap.style.display !== 'none';
    })
    .map((c) => (c.querySelector('.ant-modal-title') as HTMLElement | null)?.textContent ?? '');

const openCreate = async () => {
  renderPage();
  await screen.findByText('T22 Machine', undefined, { timeout: 30000 });
  renderToolbar();
  fireEvent.click(screen.getByRole('button', { name: /Add Machine$/ }));
};

const openDetail = async () => {
  renderPage();
  await screen.findByText('T22 Machine', undefined, { timeout: 30000 });
  fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));
  await waitFor(() => {
    expect(document.body.querySelector('.ant-modal-content')).not.toBeNull();
  }, { timeout: 30000 });
  return document.body.querySelector('.ant-modal-content') as HTMLElement;
};

/** The single visible React portal modal (the unified Add/Edit workspace or the View modal). */
const workspace = (): HTMLElement => {
  const modals = Array.from(document.body.querySelectorAll('.ant-modal-content'));
  const visible = modals.find((m) => {
    const wrap = m.closest('.ant-modal-wrap') as HTMLElement | null;
    return !wrap || wrap.style.display !== 'none';
  });
  return ((visible ?? modals[0]) as HTMLElement);
};

/** The read-only Machine Details pane inside the unified Add/Edit workspace. */
const detailsPane = (): HTMLElement => {
  const w = workspace();
  const pane = w.querySelector('.erp-pane-details') as HTMLElement | null;
  expect(pane).not.toBeNull();
  return pane as HTMLElement;
};

/** The Form pane inside the unified Add/Edit workspace. */
const formPane = (): HTMLElement => {
  const w = workspace();
  const pane = w.querySelector('.erp-pane-form') as HTMLElement | null;
  expect(pane).not.toBeNull();
  return pane as HTMLElement;
};

/** Get the first visible result dialog (loading/success/error). */
const getResultDialog = () => document.body.querySelectorAll('.ant-modal-content');

/* ===================================================================
   PART A — View Modal Section Navigation (7 tests)
   =================================================================== */

describe('TASK22 — View Modal Section Navigation', () => {
  beforeEach(() => setupMocks());

  it('1. opens with identity section selected by default', async () => {
    const modal = await openDetail();
    await waitFor(() => {
      expect(within(modal).getByText('Machine Identity')).toBeInTheDocument();
      expect(within(modal).getAllByText('MCH-T22').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('T22-CODE').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    // Org/tech data not rendered in default identity section.
    expect(within(modal).queryByText('Hall A / Bay 3')).toBeNull();
    expect(within(modal).queryByText('SN-T22')).toBeNull();
  });

  it('2. all six section tabs are rendered in the Segmented control', async () => {
    const modal = await openDetail();
    await waitFor(() => {
      expect(within(modal).getByText('Machine Identity')).toBeInTheDocument();
      expect(within(modal).getByText('Organization + Location')).toBeInTheDocument();
      expect(within(modal).getByText('Technical Information')).toBeInTheDocument();
      expect(within(modal).getByText('Production')).toBeInTheDocument();
      expect(within(modal).getByText('Job Cards')).toBeInTheDocument();
      expect(within(tabWrap(modal)).getByText('Dates + Description')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('3. switches to Organization + Location and shows location', async () => {
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Organization + Location'));
    await waitFor(() => {
      expect(within(modal).getByText('Hall A / Bay 3')).toBeInTheDocument();
      expect(within(modal).getByText('Division A')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('4. switches to Technical Information and shows model/serial', async () => {
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Technical Information'));
    await waitFor(() => {
      expect(within(modal).getByText('SN-T22')).toBeInTheDocument();
      expect(within(modal).getByText('H-200')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('5. switches to Dates + Description and shows description', async () => {
    const modal = await openDetail();
    fireEvent.click(within(tabWrap(modal)).getByText('Dates + Description'));
    await waitFor(() => {
      expect(within(modal).getByText('TASK22 test machine')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('6. switches to Production showing empty state and links', async () => {
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Production'));
    await waitFor(() => {
      expect(within(modal).getByText('Open Machine Targets')).toBeInTheDocument();
      expect(within(modal).getByText('Open Daily Production Entry')).toBeInTheDocument();
    }, { timeout: 30000 });
    // Fetch calls should have been made with the machine id.
    expect(apiMock.get.mock.calls.some(([u]) => String(u).includes('/production/entries'))).toBe(true);
    expect(apiMock.get.mock.calls.some(([u]) => String(u).includes('/production/machine-targets'))).toBe(true);
  });

  it('7. production section renders real table rows when data exists', async () => {
    const entry = { id: 'e1', entryDate: '2024-06-01', shift: { name: 'Shift A' }, item: { itemCode: 'ITM-1' }, targetQuantity: 100, actualQuantity: 95, achievementPercentage: 95 };
    const target = { id: 't1', shift: { name: 'Shift A' }, item: { itemCode: 'ITM-1' }, targetQuantity: 100, standardHours: 8 };
    setupMocks({ entries: [entry], targets: [target] });
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Production'));
    await waitFor(() => {
      expect(within(modal).getAllByText('Shift A').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('ITM-1').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });
});

/* ===================================================================
   PART B — Unified Add Workspace (ONE popup, two panes) (8 tests)
   =================================================================== */

/** Helper: find tab-segmented label within the modal that might be nested. */
function tabWrap(modal: HTMLElement) { return modal; }

describe('TASK22 — Unified Add Workspace', () => {
  beforeEach(() => setupMocks());

  it('8. Add Machine opens ONE unified workspace with Form and Details panes', async () => {
    await openCreate();
    const modals = document.body.querySelectorAll('.ant-modal-content');
    const visible = Array.from(modals).filter((m) => {
      const wrap = m.closest('.ant-modal-wrap') as HTMLElement | null;
      return !wrap || wrap.style.display !== 'none';
    });
    // A single parent popup (no second independent window).
    expect(visible.length).toBe(1);
    const w = workspace();
    // Pane titles are present inside the workspace.
    expect(within(w).getByText('Add Machine Form')).toBeInTheDocument();
    expect(within(w).getByText('Machine Details')).toBeInTheDocument();
    // The read-only pane shows detail rows.
    expect(detailsPane().querySelectorAll('.erp-detail-row').length).toBeGreaterThanOrEqual(4);
  });

  it('9. preview mirrors machineCode from the form input', async () => {
    await openCreate();
    const codeInput = screen.getByPlaceholderText('e.g. HD-04');
    fireEvent.change(codeInput, { target: { value: 'LIVE-CODE' } });
    await waitFor(() => {
      expect(within(detailsPane()).getAllByText('LIVE-CODE').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('10. Edit opens ONE unified workspace with an Edit Machine Form + live preview pane', async () => {
    renderPage();
    await screen.findByText('T22 Machine', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await waitFor(() => {
      const w = workspace();
      expect(within(w).getByText('Edit Machine Form')).toBeInTheDocument();
      expect(within(w).getByText('Machine Details')).toBeInTheDocument();
    }, { timeout: 30000 });
    // No "Pre-save preview" floating window (unified workspace instead).
    const titles = Array.from(document.body.querySelectorAll('.ant-modal-title'));
    expect(titles.every((t) => !t.textContent?.includes('Pre-save preview'))).toBe(true);
    // Preview is live: the edited machine code appears in the details pane.
    await waitFor(() => {
      expect(within(detailsPane()).getAllByText('T22-CODE').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('11. preview shows "—" for machineId (auto-generated)', async () => {
    await openCreate();
    await waitFor(() => {
      const previewNote = screen.getByText(/Machine ID and Status are generated on save/);
      expect(previewNote).toBeInTheDocument();
    }, { timeout: 30000 });
    const pane = detailsPane();
    const text = pane.textContent ?? '';
    expect(text).toContain('—');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    expect(text).not.toContain('NaN');
  });

  it('12. Cancel closes the unified workspace', async () => {
    await openCreate();
    const footer = workspace().querySelector('.ant-modal-footer') as HTMLElement;
    fireEvent.click(within(footer).getByRole('button', { name: /Cancel/ }));
    await waitFor(() => {
      expect(visibleModalTitles().filter((t) => t.includes('Add Machine')).length).toBe(0);
    }, { timeout: 30000 });
  });

  it('13. exactly one header close (X) closes the whole workspace', async () => {
    await openCreate();
    const w = workspace();
    const closeButtons = w.querySelectorAll('.ant-modal-close');
    expect(closeButtons.length).toBe(1);
    fireEvent.click(closeButtons[0] as HTMLElement);
    await waitFor(() => {
      expect(visibleModalTitles().length).toBe(0);
    }, { timeout: 30000 });
  });

  it('14. the unified workspace is a SINGLE draggable/resizable modal', async () => {
    await openCreate();
    const draggables = document.body.querySelectorAll('.erp-draggable-modal');
    expect(draggables.length).toBe(1);
    // The popup is the one movable/resizable unit (no separate panes moving).
    expect(document.body.querySelectorAll('.erp-draggable-modal-resize-handle').length).toBe(1);
  });

  it('15. subtitle names the form and preview inside the single workspace', async () => {
    await openCreate();
    const subtitles = Array.from(document.body.querySelectorAll('.erp-draggable-modal-subtitle'));
    expect(subtitles.length).toBe(1);
    const text = subtitles[0]?.textContent ?? '';
    expect(text).toContain('Form');
    expect(text.toLowerCase()).toContain('preview');
    // Pane titles identify both panes within the one popup.
    const w = workspace();
    expect(within(w).getByText('Add Machine Form')).toBeInTheDocument();
    expect(within(w).getByText('Machine Details')).toBeInTheDocument();
  });
});

/* ===================================================================
   PART C — Save Status Popup (9 tests)
   =================================================================== */

describe('TASK22 — Save Status Popup', () => {
  beforeEach(() => setupMocks());

  const fillRequiredFields = () => {
    fireEvent.change(screen.getByPlaceholderText('e.g. HD-04'), { target: { value: 'SAV-001' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Header Machine 04'), { target: { value: 'Save Test Machine' } });
  };

  it('16. clicking OK shows the loading spinner in the result dialog', async () => {
    await openCreate();
    fillRequiredFields();
    // Make the API call hang so we can inspect the loading state.
    apiMock.post.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      const spinners = document.body.querySelectorAll('[data-testid="save-result-spinner"]');
      expect(spinners.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('17. successful save shows success phase with "Successful Save" title', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockResolvedValue({ data: { id: 'n1', machineId: 'MCH-N1' }, success: true });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Successful Save')).toBeInTheDocument();
      // code appears in the title line and again as the record code chip.
      expect(screen.getAllByText(/SAV-001/).length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('18. clicking OK on success closes all windows and refreshes list', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockResolvedValue({ data: { id: 'n1' }, success: true });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => { expect(screen.getByText('Successful Save')).toBeInTheDocument(); }, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: /OK/ }));
    await waitFor(() => {
      expect(screen.queryByText('Successful Save')).toBeNull();
      // Form + preview windows are closed.
      expect(visibleModalTitles().length).toBe(0);
    }, { timeout: 30000 });
    // List refreshed: fetchMachines called again.
    expect(apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines').length).toBeGreaterThanOrEqual(2);
  });

  it('19. API error shows error phase with message', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockRejectedValue({ response: { data: { message: 'Duplicate code' } } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Failed')).toBeInTheDocument();
      expect(screen.getByText('Duplicate code')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('20. error state shows Retry button', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockRejectedValue({ response: { data: { message: 'Server error' } } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => { expect(screen.getByText('Save Failed')).toBeInTheDocument(); }, { timeout: 30000 });
    const errEl = screen.getByTestId('save-result-error');
    expect(within(errEl).getByRole('button', { name: /Retry$/ })).toBeInTheDocument();
    expect(within(errEl).getByRole('button', { name: /^Close$/ })).toBeInTheDocument();
  });

  it('21. Retry re-submits the same payload', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockRejectedValueOnce({ response: { data: { message: 'Transient' } } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => { expect(screen.getByText('Save Failed')).toBeInTheDocument(); }, { timeout: 30000 });
    // Now make retry succeed.
    apiMock.post.mockResolvedValue({ data: { id: 'n1' }, success: true });
    fireEvent.click(screen.getByRole('button', { name: /Retry$/ }));
    await waitFor(() => {
      expect(screen.getByText('Successful Save')).toBeInTheDocument();
    }, { timeout: 30000 });
    expect(apiMock.post).toHaveBeenCalledTimes(2);
  });

  it('22. double-click OK does not double-submit', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    }, { timeout: 30000 });
    expect(apiMock.post).toHaveBeenCalledTimes(1);
  });

  it('23. validation failure blocks submission', async () => {
    await openCreate();
    // Leave both required fields empty and submit.
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Unique code, max 50 chars')).toBeInTheDocument();
    }, { timeout: 30000 });
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('24. edit save shows success phase too', async () => {
    renderPage();
    await screen.findByText('T22 Machine', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await waitFor(() => {
      const titles = Array.from(document.body.querySelectorAll('.ant-modal-title'));
      expect(titles.some((t) => t.textContent?.includes('Edit Machine'))).toBe(true);
    }, { timeout: 30000 });
    apiMock.patch.mockResolvedValue({ data: { id: machine.id }, success: true });
    const editForm = Array.from(document.body.querySelectorAll('.ant-modal-content')).find((m) =>
      (m.querySelector('.ant-modal-title') as HTMLElement)?.textContent?.includes('Edit Machine')
    );
    const footer = (editForm as HTMLElement).querySelector('.ant-modal-footer') as HTMLElement;
    fireEvent.click(within(footer).getByRole('button', { name: /Save Changes/ }));
    await waitFor(() => {
      expect(screen.getByText('Successful Save')).toBeInTheDocument();
    }, { timeout: 30000 });
  });
});
