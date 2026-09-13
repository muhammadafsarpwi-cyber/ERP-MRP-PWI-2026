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
  id: 'm-t23-1',
  machineId: 'MCH-T23',
  machineCode: 'BRL-001',
  machineNumber: 'M-001',
  name: 'Barrel Machine 01',
  machineType: 'Production Machine',
  division: { id: 'd1', name: 'CCD' },
  section: { id: 's1', name: 'Production' },
  department: { id: 'de1', name: 'Barrel' },
  location: 'Plant-01',
  manufacturer: 'ABC',
  model: 'X-200',
  serialNumber: 'SN-T23',
  status: 'ACTIVE',
  criticality: 'MEDIUM',
  isActive: true,
  capacity: '120',
  powerRating: '15 kW',
  description: 'TASK23 test machine',
  installationDate: '2023-01-15',
  warrantyExpiryDate: '2026-01-15',
  qrPayload: 'QR|T23',
  companyId: 'c1',
  createdAt: '2023-01-15T10:00:00Z',
  updatedAt: '2024-06-01T12:00:00Z',
  createdBy: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  updatedBy: 'ffffffff-1111-2222-3333-444444444444',
};

const divisions = [{ id: 'd1', name: 'CCD', divisionCode: 'DIV-1' }];
const sections = [{ id: 's1', name: 'Production', sectionCode: 'SEC-1', divisionId: 'd1' }];
const departments = [{ id: 'de1', name: 'Barrel', departmentCode: 'DEP-1', divisionId: 'd1', sectionId: 's1' }];

const setupMocks = () => {
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
    if (u === '/production/entries' || u === '/production/machine-targets') return Promise.resolve({ data: [], total: 0 });
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
  await screen.findByText('Barrel Machine 01', undefined, { timeout: 30000 });
  renderToolbar();
  fireEvent.click(screen.getByRole('button', { name: /Add Machine$/ }));
  await waitFor(() => {
    expect(visibleModalTitles().filter((t) => t.includes('Add Machine')).length).toBe(1);
  }, { timeout: 30000 });
};

/** The visible unified Add Machine workspace modal. */
const formModal = (): HTMLElement => {
  const modals = Array.from(document.body.querySelectorAll('.ant-modal-content'));
  const visible = modals.find((m) => {
    const wrap = m.closest('.ant-modal-wrap') as HTMLElement | null;
    return !wrap || wrap.style.display !== 'none';
  });
  return (visible ?? modals[0]) as HTMLElement;
};

/** The read-only Machine Details preview pane inside the unified workspace. */
const previewPane = (): HTMLElement => {
  const pane = formModal().querySelector('.erp-pane-details') as HTMLElement | null;
  expect(pane).not.toBeNull();
  return pane as HTMLElement;
};

/** Select an antd Select option by its Form.Item label within the create form. */
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

const fillRequiredFields = () => {
  fireEvent.change(screen.getByPlaceholderText('e.g. HD-04'), { target: { value: 'SAV-001' } });
  fireEvent.change(screen.getByPlaceholderText('e.g. Header Machine 04'), { target: { value: 'Save Test Machine' } });
};

describe('MachineManagement — TASK23 Clean Detail/Form Pattern', () => {
  beforeEach(setupMocks);

  it('1. Add Machine opens ONE unified workspace with a Machine Details pane', async () => {
    await openCreate();
    const titles = visibleModalTitles();
    // Exactly one parent popup (no second independent window).
    expect(titles.length).toBe(1);
    expect(titles[0]?.includes('Add Machine')).toBe(true);
    // The preview lives inside the workspace as a pane.
    expect(previewPane()).not.toBeNull();
    expect(within(previewPane()).getByText('Machine Name')).toBeInTheDocument();
  });

  it('2. exactly one Save button exists in the Add Machine workflow', async () => {
    await openCreate();
    const saveButtons = screen.getAllByRole('button', { name: /^Save$/ });
    expect(saveButtons.length).toBe(1);
    // The button lives in the unified workspace footer.
    expect(within(formModal()).getByRole('button', { name: /^Save$/ })).toBeInTheDocument();
  });

  it('3. the Machine Details pane contains no Save/Submit/Create/Close button', async () => {
    await openCreate();
    const pane = previewPane();
    expect(pane).not.toBeNull();
    expect(within(pane).queryByRole('button', { name: /Save|Submit|Create|Close/ })).toBeNull();
  });

  it('4. form input updates Machine Details immediately (live preview)', async () => {
    await openCreate();
    fireEvent.change(screen.getByPlaceholderText('e.g. Header Machine 04'), { target: { value: 'Barrel Machine 01' } });
    await waitFor(() => {
      expect(within(previewPane()).getByText('Barrel Machine 01')).toBeInTheDocument();
    }, { timeout: 30000 });
    // Also the machine code appears immediately.
    fireEvent.change(screen.getByPlaceholderText('e.g. HD-04'), { target: { value: 'BRL-001' } });
    await waitFor(() => {
      expect(within(previewPane()).getAllByText('BRL-001').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('5. select fields update the preview immediately', async () => {
    await openCreate();
    await selectOption('Division', 'CCD');
    await waitFor(() => {
      expect(within(previewPane()).getAllByText('CCD').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('6. empty values render safely (—, never undefined/null/NaN)', async () => {
    await openCreate();
    const pane = previewPane();
    const text = (pane.textContent ?? '');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    expect(text).not.toContain('NaN');
    await waitFor(() => {
      expect(within(pane).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('7. detail fields use a label/value row layout (no Description table/cards)', async () => {
    await openCreate();
    const pm = previewPane();
    await waitFor(() => {
      expect(pm.querySelectorAll('.erp-detail-row').length).toBeGreaterThanOrEqual(4);
    }, { timeout: 30000 });
    // A row shows the label on the left and the value on the right.
    const row = pm.querySelector('.erp-detail-row') as HTMLElement;
    const cols = row.children;
    expect(cols.length).toBe(2);
  });

  it('8. no repeated field headings in the preview', async () => {
    await openCreate();
    // Type values first, then check each label is rendered once in the preview pane.
    fireEvent.change(screen.getByPlaceholderText('e.g. Header Machine 04'), { target: { value: 'Barrel Machine 01' } });
    await waitFor(() => {
      expect(within(previewPane()).getAllByText('Machine Name').length).toBe(1);
      expect(within(previewPane()).getAllByText('Machine Code').length).toBe(1);
      expect(within(previewPane()).getAllByText('Division').length).toBeLessThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('9. no excessive per-field cards in the preview', async () => {
    await openCreate();
    const pm = previewPane();
    await waitFor(() => {
      expect(pm.querySelectorAll('.erp-detail-row').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    expect(pm.querySelectorAll('.ant-card').length).toBe(0);
  });

  it('10. View modal retains the section navigation', async () => {
    renderPage();
    await screen.findByText('Barrel Machine 01', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));
    await waitFor(() => {
      expect(document.body.querySelector('.ant-modal-content')).not.toBeNull();
    }, { timeout: 30000 });
    const modal = document.body.querySelector('.ant-modal-content') as HTMLElement;
    await waitFor(() => {
      expect(within(modal).getByText('Machine Identity')).toBeInTheDocument();
      expect(within(modal).getByText('Organization + Location')).toBeInTheDocument();
      expect(within(modal).getByText('Technical Information')).toBeInTheDocument();
      expect(within(modal).getByText('Production')).toBeInTheDocument();
      expect(within(modal).getByText('Job Cards')).toBeInTheDocument();
      expect(within(modal).getByText('Dates + Description')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('11. View sections display clean label/value details', async () => {
    renderPage();
    await screen.findByText('Barrel Machine 01', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));
    await waitFor(() => {
      expect(document.body.querySelector('.ant-modal-content')).not.toBeNull();
    }, { timeout: 30000 });
    const modal = document.body.querySelector('.ant-modal-content') as HTMLElement;
    await waitFor(() => {
      expect(modal.querySelectorAll('.erp-detail-row').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('Barrel Machine 01').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    // Section switch shows org values as label/value rows.
    fireEvent.click(within(modal).getByText('Organization + Location'));
    await waitFor(() => {
      expect(within(modal).getAllByText('Plant-01').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    // Technical section shows manufacturer/model/serial.
    fireEvent.click(within(modal).getByText('Technical Information'));
    await waitFor(() => {
      expect(within(modal).getAllByText('SN-T23').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('X-200').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('12. Save Status popup still appears after clicking the single Save', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockReturnValue(new Promise(() => {}));
    await selectOption('Division', 'CCD');
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      const spinners = document.body.querySelectorAll('[data-testid="save-result-spinner"]');
      expect(spinners.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('13. success state works', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockResolvedValue({ data: { id: 'n1', machineId: 'MCH-N1' }, success: true });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Successful Save')).toBeInTheDocument();
      expect(screen.getAllByText(/Save Test Machine/).length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
  });

  it('14. error state works', async () => {
    await openCreate();
    fillRequiredFields();
    apiMock.post.mockRejectedValue({ response: { data: { message: 'Duplicate code' } } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Failed')).toBeInTheDocument();
      expect(screen.getByText('Duplicate code')).toBeInTheDocument();
    }, { timeout: 30000 });
  });

  it('15. existing header actions remain available', async () => {
    renderPage();
    await screen.findByText('Barrel Machine 01', undefined, { timeout: 30000 });
    renderToolbar();
    expect(screen.getByRole('button', { name: /Refresh$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Machine$/ })).toBeInTheDocument();
  });

  it('16. existing Machine Master row actions remain functional', async () => {
    renderPage();
    await screen.findByText('Barrel Machine 01', undefined, { timeout: 30000 });
    expect(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Edit machine — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `QR code — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Print barcode — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Change status — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete machine — ${machine.machineCode}` })).toBeInTheDocument();
    // View still opens the detail modal.
    fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));
    await waitFor(() => {
      expect(document.body.querySelector('.ant-modal-content')).not.toBeNull();
    }, { timeout: 30000 });
  });
});