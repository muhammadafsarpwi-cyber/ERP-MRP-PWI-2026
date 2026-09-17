import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import DepartmentManagement from './DepartmentManagement';
import apiService from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

const company = { id: 'comp-1', companyCode: 'C1', legalName: 'Acme Corp' };
const division = { id: 'div-1', divisionCode: 'D1', name: 'Wire Division' };
const sectionA = { id: 'sec-a', sectionCode: 'SA', name: 'Drawing Section' };
const sectionB = { id: 'sec-b', sectionCode: 'SB', name: 'Stranding Section' };

const departmentRecord: any = {
  id: 'dept-1',
  departmentCode: 'WRD',
  name: 'Wire Drawing',
  description: 'Primary wire drawing unit',
  companyId: 'comp-1',
  divisionId: 'div-1',
  sectionId: 'sec-a',
  parentDepartmentId: null,
  status: 'ACTIVE',
  createdAt: '2026-09-01T08:00:00Z',
  updatedAt: '2026-09-10T09:30:00Z',
  createdBy: 'user-1',
  updatedBy: 'user-2',
  createdByName: 'Afsar',
  updatedByName: 'Khalid',
  company,
  division,
  section: sectionA,
  children: [],
};

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

const mockListResponse = (data: any[], total?: number) => ({
  success: true,
  data,
  total: total ?? data.length,
});

const setupApiMocks = (overrides: Partial<Record<string, any>> = {}) => {
  const departments = overrides.departments ?? [departmentRecord];
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/departments') {
      return Promise.resolve(mockListResponse(departments));
    }
    if (url === '/departments/hierarchy') {
      return Promise.resolve({ success: true, data: departments });
    }
    if (url === '/companies') {
      return Promise.resolve({ success: true, data: [company] });
    }
    if (url === '/divisions') {
      return Promise.resolve({ success: true, data: [division] });
    }
    if (url === '/sections') {
      return Promise.resolve({ success: true, data: [sectionA, sectionB] });
    }
    return Promise.resolve({ success: true, data: [] });
  });
};

const renderComponent = () =>
  render(
    <MemoryRouter>
      <App>
        <DepartmentManagement />
      </App>
    </MemoryRouter>
  );

const openEditModal = async () => {
  const editBtns = await screen.findAllByTitle('Edit Department');
  fireEvent.click(editBtns[0]);
  await screen.findByText('Edit Department');
};

describe('DepartmentManagement (ORG-FIX-01)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('renders the department list with audit columns', async () => {
    setupApiMocks();
    renderComponent();

    expect(await screen.findByText('Department Management')).toBeInTheDocument();
    expect(screen.getAllByText('Created By').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Created Date').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Updated By').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Updated Date').length).toBeGreaterThan(0);

    expect(await screen.findByText('Wire Drawing')).toBeInTheDocument();
    expect(screen.getAllByText('Afsar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Khalid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('01-Sep-2026 08:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10-Sep-2026 09:30').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Drawing Section').length).toBeGreaterThan(0);
  });

it('sends the selected sectionId on edit and strips companyId from the PATCH payload', async () => {
    setupApiMocks();
    renderComponent();

    await openEditModal();
    console.log('TEST2-START');

    const sectionSelect = screen.getByLabelText('Section');
    fireEvent.mouseDown(sectionSelect);
    console.log('TEST2-MOUSEDOWN');
    const opt = await screen.findByText('SB - Stranding Section');
    console.log('TEST2-OPT-FOUND');
    fireEvent.click(opt);
    console.log('TEST2-OPT-CLICKED');

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    console.log('TEST2-OK-CLICKED');
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    console.log('TEST2-CONFIRM-CLICKED');

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledTimes(1);
    });
    const [patchUrl, payload] = apiMock.patch.mock.calls[0] as unknown as [string, any];
    expect(patchUrl).toBe('/departments/dept-1');
    expect(payload.sectionId).toBe('sec-b');
    expect(payload.divisionId).toBe('div-1');
    expect(payload.companyId).toBeUndefined();
    expect(payload.departmentCode).toBe('WRD');
  });

  it('shows the Save Confirmation popup before saving and can be cancelled', async () => {
    setupApiMocks();
    renderComponent();

    await openEditModal();

    fireEvent.click(screen.getByRole('button', { name: /Save$/i }));
    expect(await screen.findByText('Save Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to save these changes?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(apiMock.patch).not.toHaveBeenCalled();
    });
  });

  it('does not show false success when the saved sectionId does not match the selected one', async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/departments') return Promise.resolve(mockListResponse([departmentRecord]));
      if (url === '/departments/hierarchy') return Promise.resolve({ success: true, data: [departmentRecord] });
      if (url === '/companies') return Promise.resolve({ success: true, data: [company] });
      if (url === '/divisions') return Promise.resolve({ success: true, data: [division] });
      if (url === '/sections') return Promise.resolve({ success: true, data: [sectionA, sectionB] });
      return Promise.resolve({ success: true, data: [] });
    });
    apiMock.patch.mockResolvedValue({
      success: true,
      data: { ...departmentRecord, sectionId: 'sec-a', section: sectionA },
    } as any);

    renderComponent();

    await openEditModal();

    const sectionSelect = screen.getByLabelText('Section');
    fireEvent.mouseDown(sectionSelect);
    fireEvent.click(await screen.findByText('SB - Stranding Section'));

    fireEvent.click(screen.getByRole('button', { name: /Save$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Save Verification Failed')).toBeInTheDocument();
    expect(screen.getByText(/did not reflect the selected section/)).toBeInTheDocument();
    expect(screen.queryByText('Department updated successfully')).not.toBeInTheDocument();
  });

  it('shows a validation popup when a Section is selected without a Division', async () => {
    setupApiMocks();
    renderComponent();

    await openEditModal();

    const divisionSelect = screen.getByLabelText('Division');
    fireEvent.mouseDown(divisionSelect);
    fireEvent.click(await screen.findByText('D1 - Wire Division'));
    fireEvent.click(await screen.findByText(/Clear/i));

    const sectionSelect = screen.getByLabelText('Section');
    fireEvent.mouseDown(sectionSelect);
    fireEvent.click(await screen.findByText('SB - Stranding Section'));

    fireEvent.click(screen.getByRole('button', { name: /Save$/i }));
    expect(await screen.findByText(/Cannot assign a Section without selecting a Division/i)).toBeInTheDocument();
    expect(screen.getByText('Validation Failed')).toBeInTheDocument();
  });

  it('calls DELETE after delete confirmation', async () => {
    setupApiMocks();
    apiMock.delete.mockResolvedValue({ success: true, message: 'Department deleted successfully' } as any);

    renderComponent();

    const deleteBtns = await screen.findAllByTitle('Delete Department');
    fireEvent.click(deleteBtns[0]);
    expect(await screen.findByText(/This action cannot be undone/)).toBeInTheDocument();

    const confirmDialog = await screen.findByRole('dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(apiMock.delete).toHaveBeenCalledWith('/departments/dept-1');
    });
  });

  it('calls deactivate endpoint after confirmation', async () => {
    setupApiMocks();
    apiMock.patch.mockResolvedValue({ success: true, message: 'Department deactivated successfully' } as any);

    renderComponent();

    const deactivateBtns = await screen.findAllByTitle('Deactivate Department');
    fireEvent.click(deactivateBtns[0]);
    expect(await screen.findByText(/are you sure you want to deactivate/i)).toBeInTheDocument();

    const confirmDialog = await screen.findByRole('dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith('/departments/dept-1/deactivate');
    });
  });

  it('calls activate endpoint when the department is inactive', async () => {
    const inactive = { ...departmentRecord, status: 'INACTIVE', section: null, sectionId: null };
    setupApiMocks({ departments: [inactive] });
    apiMock.patch.mockResolvedValue({ success: true, message: 'Department activated successfully' } as any);

    renderComponent();

    const activateBtns = await screen.findAllByTitle('Activate Department');
    fireEvent.click(activateBtns[0]);
    expect(await screen.findByText(/are you sure you want to activate/i)).toBeInTheDocument();

    const confirmDialog = await screen.findByRole('dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Activate' }));
    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith('/departments/dept-1/activate');
    });
  });

  it('creates a department with the selected company, division and section', async () => {
    setupApiMocks();
    apiMock.post.mockResolvedValue({ success: true, data: departmentRecord } as any);

    renderComponent();

    fireEvent.click(await screen.findByRole('button', { name: /Add Department/i }));
    expect(await screen.findByText('Create Department')).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText('Department Code'), {
      target: { value: 'STR' },
    });
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Stranding' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledTimes(1);
    });
    const [postUrl, payload] = apiMock.post.mock.calls[0] as unknown as [string, any];
    expect(postUrl).toBe('/departments');
    expect(payload).toMatchObject({
      companyId: 'comp-1',
      divisionId: 'div-1',
      sectionId: 'sec-a',
      departmentCode: 'STR',
      name: 'Stranding',
    });
  });
});

