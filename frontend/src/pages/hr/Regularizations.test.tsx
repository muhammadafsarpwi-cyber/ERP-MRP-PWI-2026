import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import Regularizations from './Regularizations';
import * as regService from '../../services/hrRegularizationService';
import type { RegularizationsData, RegularizationOptions } from '../../services/hrRegularizationService';

jest.setTimeout(40000);

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {},
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

jest.mock('../../services/hrRegularizationService', () => ({
  __esModule: true,
  HR_REGULARIZATION_STATUSES: ['SUBMITTED', 'APPROVED', 'REJECTED'],
  HR_REGULARIZATION_TYPES: ['CHECK_IN', 'CHECK_OUT', 'CHECK_IN_OUT', 'STATUS'],
  HR_REGULARIZATION_REASONS: [
    'MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'WRONG_CHECK_IN', 'WRONG_CHECK_OUT',
    'STATUS_ERROR', 'FORGOT_TO_PUNCH', 'DEVICE_ISSUE', 'OFFICIAL_DUTY', 'OTHER',
  ],
  fetchRegularizations: jest.fn(),
  fetchRegularizationOptions: jest.fn(),
  fetchRegularizationById: jest.fn(),
  createRegularization: jest.fn(),
  updateRegularization: jest.fn(),
  approveRegularization: jest.fn(),
  rejectRegularization: jest.fn(),
  deleteRegularization: jest.fn(),
}));

const svc = regService as jest.Mocked<typeof regService>;

const options: RegularizationOptions = {
  companyId: 'company-1',
  today: '2026-09-14',
  divisions: [{ id: 'div-1', code: 'DIV-A', name: 'Manufacturing Division' }],
  sections: [{ id: 'sec-1', code: 'SEC-1', name: 'Assembly Line A', divisionId: 'div-1' }],
  departments: [{ id: 'dept-1', code: 'D-1', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' }],
  employees: [
    { id: 'emp-1', employeeCode: 'EMP-FT5', firstName: 'Phase5b', lastName: 'Test', departmentId: 'dept-1' },
  ],
  statuses: ['SUBMITTED', 'APPROVED', 'REJECTED'],
  types: ['CHECK_IN', 'CHECK_OUT', 'CHECK_IN_OUT', 'STATUS'],
  self: { employeeId: 'emp-1', employeeCode: 'EMP-FT5', name: 'Phase5b Test' },
};

const record = {
  id: 'rgz-1',
  requestNo: 'RGZ-ABC12345',
  attendanceDate: '2026-08-30',
  correctionType: 'CHECK_IN',
  reason: 'MISSING_CHECK_IN',
  status: 'SUBMITTED',
  currentCheckIn: '2026-08-30T06:20:00.000Z',
  currentCheckOut: '2026-08-30T14:55:00.000Z',
  currentStatus: 'PRESENT',
  requestedCheckIn: '2026-08-30T06:30:00.000Z',
  requestedCheckOut: null,
  requestedStatus: null,
  approvedCheckIn: null,
  approvedCheckOut: null,
  approvedStatus: null,
  remarks: 'Was late due to traffic',
  decisionRemarks: null,
  submittedAt: '2026-08-30 09:12',
  decidedAt: null,
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
  audit: { createdAt: '2026-08-30', updatedAt: null, createdBy: 'user-1', decidedBy: null },
};

const regData: RegularizationsData = {
  asOf: '2026-09-14',
  range: { dateFrom: null, dateTo: null },
  companyId: 'company-1',
  reason: null,
  summary: { submitted: 1, approved: 0, rejected: 0, today: 1, total: 1, notes: { onLeaveToday: 'ATTENDANCE' } },
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
  svc.fetchRegularizationOptions.mockResolvedValue(options);
  svc.fetchRegularizations.mockResolvedValue(regData);
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AntApp>
        <Regularizations />
      </AntApp>
    </MemoryRouter>
  );

const waitForRecord = () => screen.findByText('RGZ-ABC12345', {}, { timeout: 30000 });
const findSlow = (text: string | RegExp, selector?: string) =>
  screen.findByText(text, selector ? { selector } : {}, { timeout: 30000 });

describe('Regularizations page', () => {
  it('loads options and the first page of regularization requests, then renders KPIs and records', async () => {
    renderPage();
    expect(await waitForRecord()).toBeInTheDocument();
    expect(svc.fetchRegularizationOptions).toHaveBeenCalledTimes(1);
    expect(svc.fetchRegularizations).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
    expect(screen.getByText('Phase5b Test')).toBeInTheDocument();
    expect(screen.getByText('2026-08-30')).toBeInTheDocument();
    expect(screen.getByText('Check In')).toBeInTheDocument();
  });

  it('shows a truthful empty state when no records match', async () => {
    svc.fetchRegularizations.mockResolvedValue({
      ...regData,
      summary: { ...regData.summary, submitted: 0, today: 0, total: 0 },
      records: [],
      total: 0,
    });
    renderPage();
    expect(await findSlow('No regularization requests')).toBeInTheDocument();
    expect(screen.queryByText('RGZ-ABC12345')).not.toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('shows all regularization statuses in the status filter dropdown', async () => {
    renderPage();
    await waitForRecord();
    const statusSelect = screen
      .getAllByText('Status')
      .find((el) => el.className.includes('ant-select-selection-placeholder'))!
      .closest('.ant-select')!;
    fireEvent.mouseDown(statusSelect.querySelector('.ant-select-selector')!);
    expect(await findSlow('Submitted', '.ant-select-item-option-content')).toBeInTheDocument();
    expect(await findSlow('Approved', '.ant-select-item-option-content')).toBeInTheDocument();
    expect(await findSlow('Rejected', '.ant-select-item-option-content')).toBeInTheDocument();
  });

  it('opens the submit modal with the self-service employee preselected', async () => {
    renderPage();
    await waitForRecord();
    fireEvent.click(screen.getByRole('button', { name: /Submit Regularization/ }));
    expect(await findSlow('Submit Regularization', '.ant-modal-title')).toBeInTheDocument();
    expect(screen.getByText(/Phase5b Test/)).toBeInTheDocument();
  });

  it('approves a submitted request after confirmation and reloads', async () => {
    svc.approveRegularization.mockResolvedValue({ success: true });
    renderPage();
    await waitForRecord();
    const checkIcon = screen.getByLabelText('check');
    fireEvent.click(checkIcon.closest('button')!);
    expect(await findSlow('Approve Regularization')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      await Promise.resolve();
    });
    expect(svc.approveRegularization).toHaveBeenCalledWith('rgz-1', { remarks: undefined });
    expect(svc.fetchRegularizations.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a submitted request after confirmation and reloads', async () => {
    svc.rejectRegularization.mockResolvedValue({ success: true });
    renderPage();
    await waitForRecord();
    const closeIcon = screen.getByLabelText('close');
    fireEvent.click(closeIcon.closest('button')!);
    expect(await findSlow('Reject Regularization')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
      await Promise.resolve();
    });
    expect(svc.rejectRegularization).toHaveBeenCalledWith('rgz-1', { remarks: undefined });
    expect(svc.fetchRegularizations.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('surfaces API errors instead of showing records', async () => {
    svc.fetchRegularizations.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 403, data: { message: 'Regularization view forbidden' } } })
    );
    renderPage();
    expect(await findSlow(/Regularization view forbidden/i)).toBeInTheDocument();
    expect(screen.queryByText('RGZ-ABC12345')).not.toBeInTheDocument();
  });
});