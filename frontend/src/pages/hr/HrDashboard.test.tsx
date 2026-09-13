import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import HrDashboard from './HrDashboard';
import apiService from '../../services/api';
import type { HrDashboardData } from '../../services/hrDashboardService';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;

const dashboardData: HrDashboardData = {
  asOf: '2026-09-13',
  periodStart: '2026-08-15',
  periodEnd: '2026-09-13',
  kpi: {
    totalEmployees: 25,
    activeEmployees: 22,
    presentToday: 18,
    lateToday: 2,
    absentToday: 3,
    onLeaveToday: 1,
    pendingApprovals: 4,
    outOfZone: 0,
    documentsExpiring: 0,
  },
  notes: {
    lateToday: 'DERIVED',
    outOfZone: 'UNSUPPORTED',
    documentsExpiring: 'UNSUPPORTED',
  },
  attendanceTrend: [
    { date: '2026-09-12', present: 18, late: 2, absent: 3, onLeave: 1 },
    { date: '2026-09-13', present: 17, late: 1, absent: 4, onLeave: 0 },
  ],
  employeesByDepartment: [
    { departmentId: 'd1', name: 'Wire Drawing', count: 12 },
    { departmentId: null, name: 'Unassigned', count: 3 },
  ],
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
  apiMock.get.mockImplementation((url: any) => {
    const u = String(url);
    if (u === '/hr/dashboard') return Promise.resolve({ success: true, data: dashboardData });
    if (u === '/dashboard/divisions') return Promise.resolve({ data: [{ id: 'dv1', name: 'Division A', divisionCode: 'D1' }] });
    if (u === '/dashboard/sections') return Promise.resolve({ data: [] });
    if (u === '/dashboard/departments') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <HrDashboard />
    </MemoryRouter>
  );

describe('HR Dashboard page', () => {
  it('renders real KPI figures from the backend payload', async () => {
    renderPage();
    expect(await screen.findByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
  });

  it('renders the attendance trend and department distribution sections', async () => {
    renderPage();
    expect(await screen.findByText(/15 employees across 2 departments/i)).toBeInTheDocument();
    expect(screen.getByText('Attendance Trend')).toBeInTheDocument();
    expect(screen.getByText('Employees by Department')).toBeInTheDocument();
  });

  it('explains derived / unsupported metrics instead of fabricating values', async () => {
    renderPage();
    await screen.findByText('Total Employees');
    expect(screen.getByText(/derived from check-in vs shift/i)).toBeInTheDocument();
    expect(screen.getByText(/no geo-location tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/no expiry dates/i)).toBeInTheDocument();
  });

  it('shows the loading skeleton before the payload resolves', async () => {
    let resolveDashboard: (value: unknown) => void = () => {};
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/dashboard') {
        return new Promise((res) => {
          resolveDashboard = res;
        });
      }
      if (u === '/dashboard/divisions') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(document.querySelectorAll('.erp-sk-kpi').length).toBeGreaterThan(0);
    resolveDashboard({ success: true, data: dashboardData });
    expect(await screen.findByText('Total Employees')).toBeInTheDocument();
  });

  it('surfaces API errors and requests the trend window days', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/dashboard') {
        return Promise.reject(Object.assign(new Error('boom'), {
          response: { status: 403, data: { message: 'Forbidden resource' } },
        }));
      }
      if (u === '/dashboard/divisions') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText(/Forbidden resource/i)).toBeInTheDocument();
    const calls = (apiMock.get as jest.Mock).mock.calls.filter((c: any[]) => String(c[0]) === '/hr/dashboard');
    expect(calls.length).toBeGreaterThan(0);
    expect((calls[0][1] as Record<string, string>).days).toBe('30');
  });

  it('renders truthful empty states when there is no data yet (no fake values)', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/dashboard') {
        return Promise.resolve({
          success: true,
          data: {
            ...dashboardData,
            attendanceTrend: [],
            employeesByDepartment: [],
            kpi: {
              totalEmployees: 0,
              activeEmployees: 0,
              presentToday: 0,
              lateToday: 0,
              absentToday: 0,
              onLeaveToday: 0,
              pendingApprovals: 0,
              outOfZone: 0,
              documentsExpiring: 0,
            },
          },
        });
      }
      if (u === '/dashboard/divisions') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText('No attendance records in this period')).toBeInTheDocument();
    expect(screen.getByText('No employee data')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});