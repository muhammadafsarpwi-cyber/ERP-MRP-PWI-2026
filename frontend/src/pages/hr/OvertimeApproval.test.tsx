import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import OvertimeApproval from './OvertimeApproval';
import * as otService from '../../services/hrOvertimeService';
import type { OvertimesData, OvertimeOptions } from '../../services/hrOvertimeService';

jest.setTimeout(60000);

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {},
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

jest.mock('../../services/hrOvertimeService', () => ({
  __esModule: true,
  HR_OVERTIME_STATUSES: ['PENDING', 'APPROVED', 'REJECTED'],
  fetchOvertimeRequests: jest.fn(),
  fetchOvertimeOptions: jest.fn(),
  fetchOvertimeById: jest.fn(),
  fetchOvertimeHistory: jest.fn(),
  createOvertimeRequest: jest.fn(),
  updateOvertimeRequest: jest.fn(),
  approveOvertimeRequest: jest.fn(),
  rejectOvertimeRequest: jest.fn(),
  deleteOvertimeRequest: jest.fn(),
}));

const svc = otService as jest.Mocked<typeof otService>;

const options: OvertimeOptions = {
  companyId: 'company-1',
  today: '2026-09-14',
  divisions: [{ id: 'div-1', code: 'DIV-A', name: 'Manufacturing Division' }],
  sections: [{ id: 'sec-1', code: 'SEC-1', name: 'Assembly Line A', divisionId: 'div-1' }],
  departments: [{ id: 'dept-1', code: 'D-1', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' }],
  employees: [
    { id: 'emp-1', employeeCode: 'EMP-FT5', firstName: 'Phase5b', lastName: 'Test', departmentId: 'dept-1' },
  ],
  shifts: [
    { id: 'shift-1', code: 'A', name: 'Morning', startTime: '08:00', endTime: '17:00', workingHours: 8 },
  ],
  statuses: ['PENDING', 'APPROVED', 'REJECTED'],
  self: { employeeId: 'emp-1', employeeCode: 'EMP-FT5', name: 'Phase5b Test' },
};

const record = {
  id: 'ot-1',
  refNo: 'OT-ABC12345',
  overtimeDate: '2026-09-14',
  requestedHours: 2.5,
  approvedHours: null,
  reason: 'OVERTIME DUTY',
  remarks: 'Extra production run',
  decisionRemarks: null,
  status: 'PENDING',
  shift: {
    id: 'shift-1', code: 'A', name: 'Morning', startTime: '08:00', endTime: '17:00', workingHours: 8,
  },
  attendance: {
    id: 'att-1',
    checkIn: '2026-09-14T07:00:00.000Z',
    checkOut: '2026-09-14T18:30:00.000Z',
    status: 'PRESENT',
    durationMinutes: 690,
    candidateOvertimeMinutes: 90,
  },
  employee: {
    id: 'emp-1',
    employeeCode: 'EMP-FT5',
    firstName: 'Phase5b',
    lastName: 'Test',
    jobTitle: 'Machine Operator',
    status: 'ACTIVE',
    department: {
      id: 'dept-1',
      name: 'Production',
      division: { id: 'div-1', name: 'Manufacturing Division' },
      section: { id: 'sec-1', name: 'Assembly Line A' },
    },
  },
  audit: { submittedAt: '2026-09-14 09:12', decidedAt: null, submittedBy: 'user-1', decidedBy: null, createdAt: '2026-09-14 09:12', updatedAt: null },
};

const otData: OvertimesData = {
  asOf: '2026-09-14',
  range: { dateFrom: null, dateTo: null },
  companyId: 'company-1',
  reason: null,
  summary: { pending: 1, approved: 0, rejected: 0, today: 1, totalRequestedHours: 2.5, totalApprovedHours: 0, total: 1, notes: { candidateOvertime: 'COMPUTED' } },
  records: [record],
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
  svc.fetchOvertimeOptions.mockResolvedValue(options);
  svc.fetchOvertimeRequests.mockResolvedValue(otData);
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AntApp>
        <OvertimeApproval />
      </AntApp>
    </MemoryRouter>
  );

const waitForRecord = () => screen.findByText('OT-ABC12345', {}, { timeout: 30000 });
const findSlow = (text: string | RegExp, selector?: string) =>
  screen.findByText(text, selector ? { selector } : {}, { timeout: 30000 });

describe('OvertimeApproval page', () => {
  it('loads options and the first page of overtime requests, then renders KPIs and records', async () => {
    renderPage();
    expect(await waitForRecord()).toBeInTheDocument();
    expect(svc.fetchOvertimeOptions).toHaveBeenCalledTimes(1);
    expect(svc.fetchOvertimeRequests).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getByText('Phase5b Test')).toBeInTheDocument();
    expect(screen.getByText('2026-09-14')).toBeInTheDocument();
  });

  it('shows a truthful empty state when no records match', async () => {
    svc.fetchOvertimeRequests.mockResolvedValue({
      ...otData,
      summary: { ...otData.summary, pending: 0, today: 0, total: 0 },
      records: [],
      total: 0,
    });
    renderPage();
    expect(await findSlow('No overtime requests')).toBeInTheDocument();
    expect(screen.queryByText('OT-ABC12345')).not.toBeInTheDocument();
  });

  it('shows all overtime statuses in the status filter dropdown', async () => {
    renderPage();
    await waitForRecord();
    const statusSelect = screen
      .getAllByText('Status')
      .find((el) => el.className.includes('ant-select-selection-placeholder'))!
      .closest('.ant-select')!;
    fireEvent.mouseDown(statusSelect.querySelector('.ant-select-selector')!);
    expect(await findSlow('Pending', '.ant-select-item-option-content')).toBeInTheDocument();
    expect(await findSlow('Approved', '.ant-select-item-option-content')).toBeInTheDocument();
    expect(await findSlow('Rejected', '.ant-select-item-option-content')).toBeInTheDocument();
  });

  it('opens the request modal with the shift selector and hours input', async () => {
    renderPage();
    await waitForRecord();
    fireEvent.click(screen.getByRole('button', { name: /Request Overtime/ }));
    expect(await findSlow('Request Overtime', '.ant-modal-title')).toBeInTheDocument();
    expect(screen.getByText(/Requested Hours/)).toBeInTheDocument();
    expect(screen.getByText(/Overtime Date/)).toBeInTheDocument();
  });

  it('approves a pending request and reloads', async () => {
    svc.approveOvertimeRequest.mockResolvedValue({ success: true });
    renderPage();
    await waitForRecord();
    const checkIcon = screen.getByLabelText('check');
    fireEvent.click(checkIcon.closest('button')!);
    expect(await findSlow('Approve Overtime Request')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      await Promise.resolve();
    });
    expect(svc.approveOvertimeRequest).toHaveBeenCalledWith('ot-1', { approvedHours: 2.5, remarks: null });
    expect(svc.fetchOvertimeRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a pending request with a required reason and reloads', async () => {
    svc.rejectOvertimeRequest.mockResolvedValue({ success: true });
    renderPage();
    await waitForRecord();
    const closeIcon = screen.getByLabelText('close');
    fireEvent.click(closeIcon.closest('button')!);
    expect(await findSlow('Reject Overtime Request')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Required — why is this overtime request being rejected/), {
      target: { value: 'Not justified' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
      await Promise.resolve();
    });
    expect(svc.rejectOvertimeRequest).toHaveBeenCalledWith('ot-1', { remarks: 'Not justified' });
    expect(svc.fetchOvertimeRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('surfaces API errors instead of showing records', async () => {
    svc.fetchOvertimeRequests.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 403, data: { message: 'Overtime view forbidden' } } })
    );
    renderPage();
    expect(await findSlow(/Overtime view forbidden/i)).toBeInTheDocument();
    expect(screen.queryByText('OT-ABC12345')).not.toBeInTheDocument();
  });
});