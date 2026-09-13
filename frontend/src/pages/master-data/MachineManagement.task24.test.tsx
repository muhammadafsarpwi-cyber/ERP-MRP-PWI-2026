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
  id: 'm-t24-1',
  machineId: 'MCH-T24',
  machineCode: 'T24-CODE',
  machineNumber: 'TN-24',
  name: 'TASK24 Machine',
  machineType: 'Cold Forge',
  division: { id: 'd1', name: 'Division A' },
  section: { id: 's1', name: 'Section A' },
  department: { id: 'de1', name: 'Dept A' },
  location: 'Hall A / Bay 3',
  manufacturer: 'Acme',
  model: 'H-200',
  serialNumber: 'SN-T24',
  status: 'ACTIVE',
  criticality: 'HIGH',
  isActive: true,
  capacity: 120,
  powerRating: '15 kW',
  description: 'TASK24 test machine',
  installationDate: '2024-06-15',
  warrantyExpiryDate: '2027-06-15',
  qrPayload: 'QR|T24',
  companyId: 'c1',
  createdAt: '2023-01-15T10:00:00Z',
  updatedAt: '2024-06-01T12:00:00Z',
};

const divisions = [{ id: 'd1', name: 'Division A', divisionCode: 'DIV-1' }];
const sections = [{ id: 's1', name: 'Section A', sectionCode: 'SEC-1', divisionId: 'd1' }];
const departments = [{ id: 'de1', name: 'Dept A', departmentCode: 'DEP-1', divisionId: 'd1', sectionId: 's1' }];

const jobCard = {
  id: 'jc-t24-1',
  jobCardNo: 'JC-2024-0001',
  complaint: 'Excessive vibration on spindle',
  priority: 'HIGH',
  maintenanceType: 'CORRECTIVE',
  currentStatus: 'IN_PROGRESS',
  requestedAt: '2024-06-01T08:00:00Z',
  startedAt: '2024-06-01T09:00:00Z',
  closedAt: null,
  downtimeMinutes: 45,
  requestedByUser: { fullName: 'Rajesh Kumar', name: 'Rajesh Kumar' },
};

const setupMocks = (overrides?: { jobCards?: any[]; entries?: any[]; targets?: any[] }) => {
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
    if (u === '/production/entries' || u === '/production/machine-targets') {
      const entries = overrides?.entries ?? [];
      const targets = overrides?.targets ?? [];
      if (u === '/production/entries') return Promise.resolve({ data: entries, total: entries.length });
      return Promise.resolve({ data: targets, total: targets.length });
    }
    if (u.includes('/master-data/maintenance/job-cards/machine/')) {
      return Promise.resolve(overrides?.jobCards ?? []);
    }
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

/** Titles of currently-visible modals. */
const visibleModalTitles = (): string[] =>
  Array.from(document.body.querySelectorAll('.ant-modal-content'))
    .filter((c) => {
      const wrap = c.closest('.ant-modal-wrap') as HTMLElement | null;
      return !wrap || wrap.style.display !== 'none';
    })
    .map((c) => (c.querySelector('.ant-modal-title') as HTMLElement | null)?.textContent ?? '');

/** The single visible popup (unified workspace or View modal). */
const workspace = (): HTMLElement => {
  const modals = Array.from(document.body.querySelectorAll('.ant-modal-content'));
  const visible = modals.find((m) => {
    const wrap = m.closest('.ant-modal-wrap') as HTMLElement | null;
    return !wrap || wrap.style.display !== 'none';
  });
  return ((visible ?? modals[0]) as HTMLElement);
};

/** Read-only Machine Details pane inside the unified workspace. */
const detailsPane = (): HTMLElement => {
  const pane = workspace().querySelector('.erp-pane-details') as HTMLElement | null;
  expect(pane).not.toBeNull();
  return pane as HTMLElement;
};

const openCreate = async () => {
  renderPage();
  await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
  renderToolbar();
  fireEvent.click(screen.getByRole('button', { name: /Add Machine$/ }));
  await waitFor(() => {
    expect(visibleModalTitles().filter((t) => t.includes('Add Machine')).length).toBe(1);
  }, { timeout: 30000 });
};

const openEdit = async () => {
  renderPage();
  await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
  fireEvent.click(screen.getByRole('button', { name: `Edit machine — ${machine.machineCode}` }));
  await waitFor(() => {
    expect(visibleModalTitles().filter((t) => t.includes('Edit Machine')).length).toBe(1);
  }, { timeout: 30000 });
};

const openDetail = async () => {
  renderPage();
  await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
  fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));
  await waitFor(() => {
    expect(visibleModalTitles().filter((t) => t.includes('Machine Details')).length).toBe(1);
  }, { timeout: 30000 });
  return workspace();
};

const fillRequiredFields = () => {
  fireEvent.change(screen.getByPlaceholderText('e.g. HD-04'), { target: { value: 'SAV-T24' } });
  fireEvent.change(screen.getByPlaceholderText('e.g. Header Machine 04'), { target: { value: 'Save Test T24' } });
};

const selectOption = async (itemLabel: string, optionText: string) => {
  const formItems = Array.from(document.body.querySelectorAll('.ant-form-item'));
  const item = formItems.find((el) =>
    (el.querySelector('.ant-form-item-label') as HTMLElement | null)?.textContent?.includes(itemLabel)
  ) as HTMLElement;
  expect(item).not.toBeUndefined();
  const sel = item.querySelector('.ant-select') as HTMLElement;
  fireEvent.mouseDown(sel.querySelector('.ant-select-selector') as HTMLElement);
  await waitFor(() => {
    expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0);
  }, { timeout: 30000 });
  const option = Array.from(document.querySelectorAll('.ant-select-item-option')).find((o) =>
    o.textContent?.includes(optionText)
  );
  expect(option).not.toBeUndefined();
  fireEvent.click(option as HTMLElement);
};

/* ===================================================================
   TASK24 — VIEW (checkpoints 1–9)
   =================================================================== */
describe('TASK24 — View: single professional popup with compact nav', () => {
  beforeEach(() => setupMocks());

  it('1. View opens as ONE centered draggable/resizable popup titled Machine Details', async () => {
    const modal = await openDetail();
    // Draggable/resizable modal with an inner scrollable body.
    expect(modal.closest('.erp-draggable-modal')).not.toBeNull();
    expect(document.body.querySelectorAll('.erp-draggable-modal').length).toBe(1);
    // Exactly one header close button + a Close footer button.
    expect(modal.querySelectorAll('.ant-modal-close').length).toBe(1);
    const footer = modal.querySelector('.ant-modal-footer') as HTMLElement;
    expect(within(footer).getByRole('button', { name: /Close/ })).toBeInTheDocument();
  });

  it('2. compact Segmented nav lists all six sections', async () => {
    const modal = await openDetail();
    await waitFor(() => {
      expect(modal.querySelector('.erp-modal-nav')).not.toBeNull();
      expect(within(modal).getByText('Machine Identity')).toBeInTheDocument();
      expect(within(modal).getByText('Organization + Location')).toBeInTheDocument();
      expect(within(modal).getByText('Technical Information')).toBeInTheDocument();
      expect(within(modal).getByText('Production')).toBeInTheDocument();
      expect(within(modal).getByText('Job Cards')).toBeInTheDocument();
      expect(within(modal).getByText('Dates + Description')).toBeInTheDocument();
      expect(modal.querySelectorAll('.ant-segmented-item').length).toBe(6);
    }, { timeout: 30000 });
  });

  it('3. identity section default shows clean label/value rows with status + criticality badges', async () => {
    const modal = await openDetail();
    await waitFor(() => {
      expect(modal.querySelectorAll('.erp-detail-row').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('TASK24 Machine').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('Active').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('High').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('4. Production section shows targets/history and fetches real endpoints', async () => {
    const entry = { id: 'e1', entryDate: '2024-06-01', shift: { name: 'Shift B' }, item: { itemCode: 'ITM-9' }, targetQuantity: 100, actualQuantity: 95, achievementPercentage: 95 };
    const target = { id: 't1', shift: { name: 'Shift B' }, item: { itemCode: 'ITM-9' }, targetQuantity: 100, standardHours: 8 };
    setupMocks({ entries: [entry], targets: [target] });
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Production'));
    await waitFor(() => {
      expect(within(modal).getByText('Machine Targets')).toBeInTheDocument();
      expect(within(modal).getAllByText('Shift B').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    expect(apiMock.get.mock.calls.some(([u]) => String(u).includes('/production/entries'))).toBe(true);
    expect(apiMock.get.mock.calls.some(([u]) => String(u).includes('/production/machine-targets'))).toBe(true);
  });

  it('5. Job Cards section fetches the real per-machine endpoint and shows the empty state', async () => {
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Job Cards'));
    await waitFor(() => {
      expect(within(modal).getByText('Job Card History')).toBeInTheDocument();
      expect(within(modal).getByText('No job card history available for this machine.')).toBeInTheDocument();
    }, { timeout: 30000 });
    // The endpoint is the real maintenance per-machine job cards endpoint.
    expect(apiMock.get.mock.calls.some(([u]) =>
      String(u) === `/master-data/maintenance/job-cards/machine/${machine.id}`,
    )).toBe(true);
  });

  it('6. Job Cards section renders real rows (no, status, priority, type, requested by)', async () => {
    setupMocks({ jobCards: [jobCard] });
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Job Cards'));
    await waitFor(() => {
      expect(within(modal).getByText('JC-2024-0001')).toBeInTheDocument();
      expect(within(modal).getByText('In progress')).toBeInTheDocument();
      expect(within(modal).getByText('High')).toBeInTheDocument();
      expect(within(modal).getByText('Corrective')).toBeInTheDocument();
      expect(within(modal).getByText('Rajesh Kumar')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('7. switches to Dates + Description', async () => {
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Dates + Description'));
    await waitFor(() => {
      expect(within(modal).getByText('TASK24 test machine')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('8. reopening View resets the active section to Machine Identity', async () => {
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Technical Information'));
    await waitFor(() => {
      expect(within(modal).getByText('SN-T24')).toBeInTheDocument();
    }, { timeout: 30000 });
    // Close then reopen (the original page + row button are still mounted).
    fireEvent.click(modal.querySelector('.ant-modal-close') as HTMLElement);
    await waitFor(() => {
      expect(visibleModalTitles().length).toBe(0);
    }, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));
    await waitFor(() => {
      expect(visibleModalTitles().filter((t) => t.includes('Machine Details')).length).toBe(1);
    }, { timeout: 30000 });
    const reopened = workspace();
    await waitFor(() => {
      // Identity selected again (serial not rendered, name shown).
      expect(within(reopened).getAllByText('TASK24 Machine').length).toBeGreaterThanOrEqual(1);
      expect(within(reopened).queryByText('SN-T24')).toBeNull();
    }, { timeout: 30000 });
  });

  it('9. View modal body is internally scrollable (overflow auto) and not overflowing', async () => {
    const modal = await openDetail();
    const body = modal.querySelector('.ant-modal-body') as HTMLElement;
    expect(body).not.toBeNull();
    // Inline body style keeps the View body as the self-scroll region (JSDOM
    // cannot resolve stylesheet-level overflow, so assert the applied inline style).
    expect(body.style.overflow).toBe('auto');
    // The popup itself is height-constrained (fixed 640px inner), so the body
    // scrolls internally instead of overflowing the page viewport.
    const inner = (modal.closest('.erp-draggable-modal') as HTMLElement).querySelector(
      '.erp-draggable-modal-inner',
    ) as HTMLElement;
    expect(inner.style.height).toBe('640px');
    expect(inner.style.maxHeight).toBe('640px');
  });
});

/* ===================================================================
   TASK24 — ADD (checkpoints 10–21)
   =================================================================== */
describe('TASK24 — Add: ONE unified workspace (form + live details)', () => {
  beforeEach(() => setupMocks());

  it('10. Add Machine opens ONE parent popup with exactly one header close and one Save', async () => {
    await openCreate();
    expect(document.body.querySelectorAll('.erp-draggable-modal').length).toBe(1);
    expect(workspace().querySelectorAll('.ant-modal-close').length).toBe(1);
    expect(screen.getAllByRole('button', { name: /^Save$/ }).length).toBe(1);
  });

  it('11. the popup hosts two panes: form + read-only details', async () => {
    await openCreate();
    const w = workspace();
    expect(w.querySelector('.erp-pane-form')).not.toBeNull();
    expect(w.querySelector('.erp-pane-details')).not.toBeNull();
    // Pane titles.
    expect(within(w).getByText('Add Machine Form')).toBeInTheDocument();
    expect(within(w).getByText('Machine Details')).toBeInTheDocument();
  });

  it('12. the details pane is read-only (no inputs, no buttons)', async () => {
    await openCreate();
    const pane = detailsPane();
    expect(pane.querySelectorAll('input, textarea, select, .ant-select, button').length).toBe(0);
    expect(within(pane).queryByRole('button')).toBeNull();
  });

  it('13. form input live-mirrors into the details pane (code + name)', async () => {
    await openCreate();
    fireEvent.change(screen.getByPlaceholderText('e.g. HD-04'), { target: { value: 'LIVE-T24' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Header Machine 04'), { target: { value: 'Live Name' } });
    await waitFor(() => {
      expect(within(detailsPane()).getAllByText('LIVE-T24').length).toBeGreaterThanOrEqual(1);
      expect(within(detailsPane()).getAllByText('Live Name').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('14. select fields live-mirror into the details pane', async () => {
    await openCreate();
    await selectOption('Division', 'Division A');
    await waitFor(() => {
      expect(within(detailsPane()).getAllByText('Division A').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('15. add preview shows "—" for machineId and never undefined/null/NaN', async () => {
    await openCreate();
    const pane = detailsPane();
    await waitFor(() => {
      expect(within(pane).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    expect(pane.textContent ?? '').not.toContain('undefined');
    expect(pane.textContent ?? '').not.toContain('null');
    expect(pane.textContent ?? '').not.toContain('NaN');
  });

  it('16. no repeated field headings within the details pane', async () => {
    await openCreate();
    const pane = detailsPane();
    await waitFor(() => {
      expect(pane.querySelectorAll('.erp-detail-row').length).toBeGreaterThanOrEqual(4);
    }, { timeout: 30000 });
    expect(within(pane).getAllByText('Machine Name').length).toBe(1);
    expect(within(pane).getAllByText('Machine Code').length).toBe(1);
  });

  it('17. header X closes the whole workspace (no independent windows)', async () => {
    await openCreate();
    fireEvent.click(workspace().querySelector('.ant-modal-close') as HTMLElement);
    await waitFor(() => {
      expect(visibleModalTitles().length).toBe(0);
    }, { timeout: 30000 });
    // Reopen clean (toolbar instance from openCreate is still mounted).
    fireEvent.click(screen.getByRole('button', { name: /Add Machine$/ }));
    await waitFor(() => {
      expect(visibleModalTitles().filter((t) => t.includes('Add Machine')).length).toBe(1);
    }, { timeout: 30000 });
  });

  it('18. single Save → Successful Save → OK closes workspace and refreshes list', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockResolvedValue({ data: { id: 'n1', machineId: 'MCH-N1' }, success: true });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Successful Save')).toBeInTheDocument();
    }, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: /OK/ }));
    await waitFor(() => {
      expect(screen.queryByText('Successful Save')).toBeNull();
      expect(visibleModalTitles().length).toBe(0);
    }, { timeout: 30000 });
    expect(apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines').length).toBeGreaterThanOrEqual(2);
  });

  it('19. save error shows message with Retry', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockRejectedValue({ response: { data: { message: 'Duplicate machine code' } } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Failed')).toBeInTheDocument();
      expect(screen.getByText('Duplicate machine code')).toBeInTheDocument();
    }, { timeout: 30000 });
    expect(screen.getByTestId('save-result-error')).not.toBeNull();
    expect(within(screen.getByTestId('save-result-error')).getByRole('button', { name: /Retry$/ })).toBeInTheDocument();
  });

  it('20. validation blocks an empty submit', async () => {
    await openCreate();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Unique code, max 50 chars')).toBeInTheDocument();
    }, { timeout: 30000 });
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('21. the unified workspace is ONE moveable/resizable unit (single resize handle)', async () => {
    await openCreate();
    expect(document.body.querySelectorAll('.erp-draggable-modal').length).toBe(1);
    expect(document.body.querySelectorAll('.erp-draggable-modal-resize-handle').length).toBe(1);
    // Panes do not move/resize independently.
    expect(document.querySelectorAll('.erp-pane-form .erp-draggable-modal-resize-handle').length).toBe(0);
    expect(document.querySelectorAll('.erp-pane-details .erp-draggable-modal-resize-handle').length).toBe(0);
  });
});

/* ===================================================================
   TASK24 — EDIT (checkpoints 22–30)
   =================================================================== */
describe('TASK24 — Edit: unified workspace with pre-filled live details', () => {
  beforeEach(() => setupMocks());

  it('22. Edit opens ONE unified workspace titled Edit Machine', async () => {
    await openEdit();
    expect(document.body.querySelectorAll('.erp-draggable-modal').length).toBe(1);
    expect(workspace().querySelector('.erp-pane-form')).not.toBeNull();
    expect(workspace().querySelector('.erp-pane-details')).not.toBeNull();
  });

  it('23. pane titles are "Edit Machine Form" and "Machine Details"', async () => {
    await openEdit();
    const w = workspace();
    expect(within(w).getByText('Edit Machine Form')).toBeInTheDocument();
    expect(within(w).getByText('Machine Details')).toBeInTheDocument();
  });

  it('24. form is pre-filled and the details pane shows existing values', async () => {
    await openEdit();
    expect(screen.getByPlaceholderText('e.g. HD-04')).toHaveValue('T24-CODE');
    expect(screen.getByPlaceholderText('e.g. Header Machine 04')).toHaveValue('TASK24 Machine');
    await waitFor(() => {
      expect(within(detailsPane()).getAllByText('T24-CODE').length).toBeGreaterThanOrEqual(1);
      expect(within(detailsPane()).getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('25. edit keeps the real machineId (not "—") in the details pane', async () => {
    await openEdit();
    await waitFor(() => {
      expect(within(detailsPane()).getAllByText('MCH-T24').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('26. editing a field live-updates the details pane', async () => {
    await openEdit();
    fireEvent.change(screen.getByPlaceholderText('e.g. Header Machine 04'), { target: { value: 'Renamed Machine' } });
    await waitFor(() => {
      expect(within(detailsPane()).getAllByText('Renamed Machine').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('27. edit footer has exactly one Save action plus Cancel', async () => {
    await openEdit();
    const w = workspace();
    const footer = w.querySelector('.ant-modal-footer') as HTMLElement;
    expect(within(footer).getByRole('button', { name: /Save/ })).toBeInTheDocument();
    expect(within(footer).getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Save/ }).length).toBe(1);
  });

  it('28. editing keeps status + criticality rendered', async () => {
    await openEdit();
    await waitFor(() => {
      expect(within(detailsPane()).getAllByText('Active').length).toBeGreaterThanOrEqual(1);
      expect(within(detailsPane()).getAllByText('High').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('29. edit save → Successful Save → OK closes and refreshes', async () => {
    await openEdit();
    apiMock.patch.mockResolvedValue({ data: { id: machine.id }, success: true });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => {
      expect(screen.getByText('Successful Save')).toBeInTheDocument();
    }, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: /OK/ }));
    await waitFor(() => {
      expect(visibleModalTitles().length).toBe(0);
    }, { timeout: 30000 });
    expect(apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines').length).toBeGreaterThanOrEqual(2);
  });

  it('30. edit workspace is a single draggable modal unit', async () => {
    await openEdit();
    expect(document.body.querySelectorAll('.erp-draggable-modal').length).toBe(1);
    expect(document.body.querySelectorAll('.erp-draggable-modal-resize-handle').length).toBe(1);
  });
});

/* ===================================================================
   TASK24 — REGRESSIONS (checkpoints 31–38)
   =================================================================== */
describe('TASK24 — Machine Master regressions stay green', () => {
  beforeEach(() => setupMocks());

  it('31. row actions (View/Edit/QR/Print/Status/Delete) remain', async () => {
    renderPage();
    await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
    expect(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Edit machine — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `QR code — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Print barcode — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Change status — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete machine — ${machine.machineCode}` })).toBeInTheDocument();
  });

  it('32. View closes before Edit opens; the unified Edit workspace appears', async () => {
    const modal = await openDetail();
    // View footer Edit button (scoped to the View modal footer).
    const viewFooter = modal.querySelector('.ant-modal-footer') as HTMLElement;
    fireEvent.click(within(viewFooter).getByRole('button', { name: /Edit/ }));
    await waitFor(() => {
      expect(visibleModalTitles().filter((t) => t.includes('Edit Machine')).length).toBe(1);
    }, { timeout: 30000 });
    expect(workspace().querySelector('.erp-pane-form')).not.toBeNull();
    expect(workspace().querySelector('.erp-pane-details')).not.toBeNull();
  });

  it('33. header actions (Refresh/Export/Import/PDF/Print/Clear/Add Machine) remain', async () => {
    renderPage();
    await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
    renderToolbar();
    expect(screen.getByRole('button', { name: /Refresh$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Machine$/ })).toBeInTheDocument();
  });

  it('34. CSV Import modal still opens with template download', async () => {
    renderPage();
    await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    const importModal = await waitFor(() => {
      const target = Array.from(document.body.querySelectorAll('.ant-modal-content')).find((n) =>
        n.textContent?.includes('Import Machines')
      );
      expect(target).not.toBeUndefined();
      return target as HTMLElement;
    }, { timeout: 30000 });
    expect(within(importModal).getByRole('button', { name: /Download Template/ })).toBeInTheDocument();
  });

  it('35. Machine Targets regression — Production tab still renders real rows', async () => {
    const entry = { id: 'e1', entryDate: '2024-06-01', shift: { name: 'Shift C' }, item: { itemCode: 'ITM-7' }, targetQuantity: 100, actualQuantity: 95, achievementPercentage: 95 };
    const target = { id: 't1', shift: { name: 'Shift C' }, item: { itemCode: 'ITM-7' }, targetQuantity: 100, standardHours: 8 };
    setupMocks({ entries: [entry], targets: [target] });
    const modal = await openDetail();
    fireEvent.click(within(modal).getByText('Production'));
    await waitFor(() => {
      expect(within(modal).getAllByText('Shift C').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('ITM-7').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('36. Clear resets the search field', async () => {
    renderPage();
    await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
    const searchInput = screen.getByPlaceholderText('Search by code, name, serial…');
    fireEvent.change(searchInput, { target: { value: 'ZEBRA' } });
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by code, name, serial…')).toHaveValue('');
    }, { timeout: 30000 });
  });

  it('37. Refresh reloads the machine list', async () => {
    renderPage();
    await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
    await waitFor(() => {
      expect(apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    const before = apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines').length;
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => {
      const after = apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines').length;
      expect(after).toBeGreaterThan(before);
    }, { timeout: 30000 });
  });

  it('38. Job Cards use the real endpoint URL (no fake/front-only data)', async () => {
    renderPage();
    await screen.findByText('TASK24 Machine', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));
    await waitFor(() => {
      expect(visibleModalTitles().filter((t) => t.includes('Machine Details')).length).toBe(1);
    }, { timeout: 30000 });
    const modal = workspace();
    fireEvent.click(within(modal).getByText('Job Cards'));
    await waitFor(() => {
      expect(apiMock.get.mock.calls.some(([u]) =>
        String(u) === `/master-data/maintenance/job-cards/machine/${machine.id}`,
      )).toBe(true);
    }, { timeout: 30000 });
  });
});