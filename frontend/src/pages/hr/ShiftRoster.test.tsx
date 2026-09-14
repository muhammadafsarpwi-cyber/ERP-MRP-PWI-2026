import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import ShiftRoster from './ShiftRoster';
import apiService from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;

const rosterOptions = {
  companyId: 'company-1',
  today: '2026-09-14',
  divisions: [{ id: 'div-1', code: 'DIV-A', name: 'Manufacturing Division' }],
  sections: [{ id: 'sec-1', code: 'SEC-1', name: 'Assembly Line A', divisionId: 'div-1' }],
  departments: [
    { id: 'dept-1', code: 'D-1', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' },
    { id: 'dept-2', code: 'D-2', name: 'Packing', divisionId: 'div-1', sectionId: 'sec-1' },
  ],
  shifts: [
    { id: 'shift-1', code: 'S-1', name: 'S-1 Morning', startTime: '08:00', endTime: '16:00', workingHours: 8 },
    { id: 'shift-2', code: 'S-2', name: 'S-2 Evening', startTime: '16:00', endTime: '00:00', workingHours: 8 },
  ],
  employees: [
    {
      id: 'emp-1',
      employeeCode: 'EMP-FT5',
      firstName: 'Phase5b',
      lastName: 'Test',
      departmentId: 'dept-1',
    },
    {
      id: 'emp-2',
      employeeCode: 'EMP-FT6',
      firstName: 'Unassigned',
      lastName: 'Worker',
      departmentId: 'dept-2',
    },
  ],
  assignmentStatuses: ['ASSIGNED', 'TENTATIVE'],
};

const rosterRecord = {
  id: 'rec-1',
  rosterDate: '2026-09-14',
  assignmentStatus: 'ASSIGNED',
  remarks: null,
  employee: {
    id: 'emp-1',
    employeeCode: 'EMP-FT5',
    firstName: 'Phase5b',
    lastName: 'Test',
    jobTitle: 'Operator',
    status: 'ACTIVE',
    designation: { id: 'des-1', code: 'D-006', name: 'Machine Operator' },
    department: {
      id: 'dept-1',
      name: 'Production',
      division: { id: 'div-1', name: 'Manufacturing Division' },
      section: { id: 'sec-1', name: 'Assembly Line A' },
    },
  },
  shift: { id: 'shift-1', code: 'S-1', name: 'S-1 Morning', startTime: '08:00', endTime: '16:00' },
  attendance: null,
  audit: null,
};

const rosterData = {
  asOf: '2026-09-14T00:00:00.000Z',
  rosterDate: '2026-09-14',
  companyId: 'company-1',
  reason: null,
  summary: {
    totalEmployees: 2,
    assigned: 1,
    unassigned: 1,
    activeShifts: 2,
    assignedEmployeeCount: 1,
    notes: { unassigned: 'DERIVED' },
  },
  shiftBreakdown: [
    { id: 'shift-1', code: 'S-1', name: 'S-1 Morning', assigned: 1 },
    { id: 'shift-2', code: 'S-2', name: 'S-2 Evening', assigned: 0 },
  ],
  records: [rosterRecord],
  total: 1,
  page: 1,
  limit: 10,
};

const unassignedData = {
  ...rosterData,
  records: [
    {
      id: null,
      rosterDate: null,
      assignmentStatus: null,
      remarks: null,
      employee: {
        id: 'emp-2',
        employeeCode: 'EMP-FT6',
        firstName: 'Unassigned',
        lastName: 'Worker',
        jobTitle: null,
        status: 'ACTIVE',
        designation: null,
        department: {
          id: 'dept-2',
          name: 'Packing',
          division: { id: 'div-1', name: 'Manufacturing Division' },
          section: { id: 'sec-1', name: 'Assembly Line A' },
        },
      },
      shift: null,
      attendance: null,
    },
  ],
  total: 1,
};

beforeAll(() => {
  window.matchMedia = ((query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
});

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();
  apiMock.get.mockImplementation((url: any) => {
    const u = String(url);
    if (u === '/hr/shift-roster/options') return Promise.resolve({ data: rosterOptions });
    if (u === '/hr/shift-roster') return Promise.resolve({ data: rosterData });
    if (u === '/hr/shift-roster/rec-1') return Promise.resolve({ data: rosterRecord });
    return Promise.resolve({ data: [] });
  });
});

const renderPage = () =>
  render(
    <AntApp>
      <MemoryRouter>
        <ShiftRoster />
      </MemoryRouter>
    </AntApp>
  );

const rosterCalls = () =>
  (apiMock.get as jest.Mock).mock.calls.filter((c: any[]) => String(c[0]) === '/hr/shift-roster');

const openSelect = async (ariaLabel: string, optionLabel: string) => {
  const boxes = screen.queryAllByLabelText(ariaLabel);
  expect(boxes.length).toBeGreaterThan(0);
  await act(async () => {
    fireEvent.mouseDown(boxes[boxes.length - 1]);
    await Promise.resolve();
  });
  const option = await screen.findByText(optionLabel);
  await act(async () => {
    fireEvent.click(option);
    await Promise.resolve();
  });
};

describe('Shift Roster page', () => {
  it('requests today by default on first load and fetches filter options', async () => {
    renderPage();
    expect(await screen.findByText('EMP-FT5')).toBeInTheDocument();
    expect(rosterCalls().length).toBeGreaterThan(0);
    const params = rosterCalls()[0][1] as Record<string, string>;
    expect(params.rosterDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.limit).toBe('10');
    expect((apiMock.get as jest.Mock).mock.calls.some((c: any[]) => String(c[0]) === '/hr/shift-roster/options')).toBe(true);
  });

  it('renders the title, KPIs, status bar, org columns and assigned tag', async () => {
    renderPage();
    expect(await screen.findByText('Shift Roster')).toBeInTheDocument();
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('Assigned Today')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Active Shifts')).toBeInTheDocument();
    expect(screen.getAllByText('S-1 Morning').length).toBeGreaterThan(0);
    expect(screen.getByText('Manufacturing Division')).toBeInTheDocument();
    expect(screen.getByText('Assembly Line A')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByText('UNASSIGNED')).toBeInTheDocument();
    expect(screen.getByText('2026-09-14').closest('td')).toBeInTheDocument();
  });

  it('applies an employee search and re-requests the roster', async () => {
    renderPage();
    await screen.findByText('EMP-FT5');
    const input = screen.getByPlaceholderText('Employee search');
    fireEvent.change(input, { target: { value: 'phase' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const last = rosterCalls()[rosterCalls().length - 1][1] as Record<string, string>;
    expect(last.search).toBe('phase');
  });

  it('switches to the unassigned view and requests assignment=unassigned', async () => {
    apiMock.get.mockImplementation((url: any, params: any) => {
      const u = String(url);
      if (u === '/hr/shift-roster/options') return Promise.resolve({ data: rosterOptions });
      if (u === '/hr/shift-roster') {
        if ((params ?? {}).assignment === 'unassigned') return Promise.resolve({ data: unassignedData });
        return Promise.resolve({ data: rosterData });
      }
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await screen.findByText('EMP-FT5');
    await act(async () => {
      fireEvent.click(screen.getByText('UNASSIGNED'));
      await Promise.resolve();
    });
    expect(await screen.findByText('EMP-FT6')).toBeInTheDocument();
    const last = rosterCalls()[rosterCalls().length - 1][1] as Record<string, string>;
    expect(last.assignment).toBe('unassigned');
  });

  it('shows a truthful empty state when no records match', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/shift-roster/options') return Promise.resolve({ data: rosterOptions });
      if (u === '/hr/shift-roster') {
        return Promise.resolve({
          data: { ...rosterData, records: [], total: 0, summary: { ...rosterData.summary, assigned: 0, unassigned: 2 } },
        });
      }
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText('No shift assignments recorded for this date')).toBeInTheDocument();
  });

  it('surfaces API errors', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/shift-roster/options') return Promise.resolve({ data: rosterOptions });
      if (u === '/hr/shift-roster') {
        return Promise.reject(Object.assign(new Error('boom'), {
          response: { status: 403, data: { message: 'Forbidden resource' } },
        }));
      }
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText(/Forbidden resource/i)).toBeInTheDocument();
  });

  it('notices when the account has no default company instead of guessing empty data', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/shift-roster/options') return Promise.resolve({ data: { ...rosterOptions, companyId: null } });
      if (u === '/hr/shift-roster') {
        return Promise.resolve({
          data: {
            ...rosterData,
            companyId: null,
            reason: 'NO_DEFAULT_COMPANY',
            summary: { ...rosterData.summary, totalEmployees: 0, assigned: 0, unassigned: 0 },
            records: [],
            total: 0,
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText(/no default company/i)).toBeInTheDocument();
    expect(screen.queryByText('Phase5b Test')).not.toBeInTheDocument();
  });

  it('opens the Assign Shift modal and requires employee, shift and date', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Assign Shift'));
    expect(await screen.findByText('Select employee')).toBeInTheDocument();
    expect(screen.getByText('Select shift (from Shift Master)')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Create Assignment'));
      await Promise.resolve();
    });
    expect(await screen.findByText('Select an employee from the Employee Master')).toBeInTheDocument();
    expect(screen.getByText('Select a shift from the Shift Master')).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('creates an assignment through the modal and shows the success confirmation', async () => {
    apiMock.post.mockResolvedValue({ success: true, data: { id: 'rec-new' } });
    renderPage();
    await screen.findByText('EMP-FT5');

    fireEvent.click(screen.getByText('Assign Shift'));
    await openSelect('Assignment employee', 'EMP-FT6 — Unassigned Worker');
    await openSelect('Assignment shift', 'S-2 — S-2 Evening (16:00–00:00)');

    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText('Create Assignment'));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/hr/shift-roster',
        expect.objectContaining({
          employeeId: 'emp-2',
          shiftId: 'shift-2',
          rosterDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          assignmentStatus: 'ASSIGNED',
        }),
      );
    });

    expect(await screen.findByText('Shift Assigned Successfully')).toBeInTheDocument();
    expect(screen.getByText('Unassigned Worker')).toBeInTheDocument();
  });

  it('edits an assignment by patching the roster record', async () => {
    apiMock.patch.mockResolvedValue({ success: true, data: { id: 'rec-1' } });
    renderPage();
    await screen.findByText('EMP-FT5');

    const editBtn = screen.getByLabelText('Edit assignment');
    fireEvent.click(editBtn);
    expect(await screen.findByText('Editing this assignment')).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith('/hr/shift-roster/rec-1', expect.anything());
    });
    expect(await screen.findByText('Assignment Updated Successfully')).toBeInTheDocument();
  });
});