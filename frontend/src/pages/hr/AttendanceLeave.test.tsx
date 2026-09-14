import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import LeaveManagement from './AttendanceLeave';
import * as leaveService from '../../services/hrLeaveService';
import type { LeaveRequestsData, LeaveRequestOptions } from '../../services/hrLeaveService';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {},
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

jest.mock('../../services/hrLeaveService', () => ({
  __esModule: true,
  HR_LEAVE_STATUSES: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  fetchLeaveRequests: jest.fn(),
  fetchLeaveRequestOptions: jest.fn(),
  fetchLeaveRequestById: jest.fn(),
  createLeaveRequest: jest.fn(),
  updateLeaveRequest: jest.fn(),
  approveLeaveRequest: jest.fn(),
  rejectLeaveRequest: jest.fn(),
  cancelLeaveRequest: jest.fn(),
  deleteLeaveRequest: jest.fn(),
}));

const svc = leaveService as jest.Mocked<typeof leaveService>;

const options: LeaveRequestOptions = {
  companyId: 'company-1',
  today: '2026-09-14',
  divisions: [{ id: 'div-1', code: 'DIV-A', name: 'Manufacturing Division' }],
  sections: [{ id: 'sec-1', code: 'SEC-1', name: 'Assembly Line A', divisionId: 'div-1' }],
  departments: [{ id: 'dept-1', code: 'D-1', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' }],
  employees: [
    { id: 'emp-1', employeeCode: 'EMP-FT5', firstName: 'Phase5b', lastName: 'Test', departmentId: 'dept-1' },
  ],
  leaveTypes: [
    { id: 'lt-1', code: 'L-1', name: 'Casual Leave', daysPerYear: 10, isPaid: true, status: 'ACTIVE' },
  ],
  statuses: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  self: { employeeId: null, employeeCode: null, name: null },
};

const leaveData: LeaveRequestsData = {
  asOf: '2026-09-14',
  range: { dateFrom: null, dateTo: null },
  companyId: 'company-1',
  reason: null,
  summary: { pending: 1, approved: 0, rejected: 0, cancelled: 0, total: 1, onLeaveToday: 0, notes: { onLeaveToday: 'ATTENDANCE' } },
  records: [
    {
      id: 'lr-1',
      status: 'PENDING',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      days: 3,
      reason: 'Family',
      remarks: null,
      employee: {
        id: 'emp-1',
        employeeCode: 'EMP-FT5',
        firstName: 'Phase5b',
        lastName: 'Test',
        status: 'ACTIVE',
        designation: { id: 'des-1', code: 'D-006', name: 'Machine Operator' },
        department: {
          id: 'dept-1',
          name: 'Production',
          division: { id: 'div-1', name: 'Manufacturing Division' },
          section: { id: 'sec-1', name: 'Assembly Line A' },
        },
      },
      leaveType: { id: 'lt-1', code: 'L-1', name: 'Casual Leave', daysPerYear: 10, isPaid: true },
      audit: { createdAt: '2026-08-30', updatedAt: null, approvedAt: null, createdBy: 'user-1', updatedBy: null, approvedBy: null },
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
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
  jest.clearAllMocks();
  svc.fetchLeaveRequestOptions.mockResolvedValue(options);
  svc.fetchLeaveRequests.mockResolvedValue(leaveData);
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AntApp>
        <LeaveManagement />
      </AntApp>
    </MemoryRouter>
  );

describe('Leave Management page', () => {
  it('loads options and the first page of leave requests, then renders KPIs and records', async () => {
    renderPage();
    expect(await screen.findByText('EMP-FT5')).toBeInTheDocument();
    expect(svc.fetchLeaveRequestOptions).toHaveBeenCalledTimes(1);
    expect(svc.fetchLeaveRequests).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getByText('On Leave Today')).toBeInTheDocument();
    expect(screen.getByText('Casual Leave')).toBeInTheDocument();
    expect(screen.getByText('2026-09-01')).toBeInTheDocument();
    expect(screen.getByText('2026-09-03')).toBeInTheDocument();
    expect(screen.getByText('Phase5b Test')).toBeInTheDocument();
  });

  it('shows a truthful empty state when no records match', async () => {
    svc.fetchLeaveRequests.mockResolvedValue({
      ...leaveData,
      summary: { ...leaveData.summary, pending: 0, total: 0 },
      records: [],
      total: 0,
    });
    renderPage();
    expect(await screen.findByText('No leave requests')).toBeInTheDocument();
    expect(screen.queryByText('EMP-FT5')).not.toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('shows all leave statuses in the status filter dropdown', async () => {
    renderPage();
    await screen.findByText('EMP-FT5');
    const statusSelect = screen
      .getAllByText('Status')
      .find((el) => el.className.includes('ant-select-selection-placeholder'))!
      .closest('.ant-select')!;
    fireEvent.mouseDown(statusSelect.querySelector('.ant-select-selector')!);
    expect(await screen.findByRole('option', { name: 'Pending' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Approved' })).toBeInTheDocument();
  });

  it('applies an employee search and re-requests with the search term', async () => {
    renderPage();
    await screen.findByText('EMP-FT5');
    const input = screen.getByPlaceholderText('Search employee');
    fireEvent.change(input, { target: { value: 'phase' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const last = svc.fetchLeaveRequests.mock.calls[svc.fetchLeaveRequests.mock.calls.length - 1]!;
    expect(last[0]!.search).toBe('phase');
  });

  it('approves a pending request after confirmation and reloads', async () => {
    svc.approveLeaveRequest.mockResolvedValue({ success: true });
    renderPage();
    await screen.findByText('EMP-FT5');
    const checkIcon = screen.getByLabelText('check');
    fireEvent.click(checkIcon.closest('button')!);
    expect(await screen.findByText('Approve Leave Request')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      await Promise.resolve();
    });
    expect(svc.approveLeaveRequest).toHaveBeenCalledWith('lr-1', { remarks: undefined });
    expect(svc.fetchLeaveRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('surfaces API errors instead of showing records', async () => {
    svc.fetchLeaveRequests.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 403, data: { message: 'Forbidden resource' } } })
    );
    renderPage();
    expect(await screen.findByText(/Forbidden resource/i)).toBeInTheDocument();
    expect(screen.queryByText('EMP-FT5')).not.toBeInTheDocument();
  });
});
