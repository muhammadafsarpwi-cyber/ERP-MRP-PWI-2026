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
    expect(await screen.findByText('Attendance Today')).toBeInTheDocument();
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
    expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
  });

  it('renders the on-time derivation as its own KPI card', async () => {
    renderPage();
    await screen.findByText('Attendance Today');
    expect(screen.getByText('On Time Today')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('renders the analytics panels and the department distribution', async () => {
    renderPage();
    expect(await screen.findByText(/15 employees across 2 departments/i)).toBeInTheDocument();
    expect(screen.getByText('Attendance Trend')).toBeInTheDocument();
    expect(screen.getByText('On-Time vs. Late')).toBeInTheDocument();
    expect(screen.getByText('Attendance Split')).toBeInTheDocument();
    expect(screen.getByText('Workforce by Department')).toBeInTheDocument();
  });

  it('renders the secondary status cards including Current Shift', async () => {
    renderPage();
    await screen.findByText('Attendance Today');
    expect(screen.getByText('Current Shift')).toBeInTheDocument();
    expect(screen.getByText(/no shift configured/i)).toBeInTheDocument();
    expect(screen.getByText('Leaves Pending')).toBeInTheDocument();
    expect(screen.getByText('Advances Pending')).toBeInTheDocument();
    expect(screen.getByText('Docs Expiring')).toBeInTheDocument();
  });

  it('renders a More info footer on every primary KPI card', async () => {
    renderPage();
    await screen.findByText('Attendance Today');
    expect(screen.getAllByText('More info').length).toBe(11);
  });

  it('explains derived / unsupported metrics instead of fabricating values', async () => {
    renderPage();
    await screen.findByText('Total Employees');
    expect(screen.getByText(/check-in vs each employee/i)).toBeInTheDocument();
    expect(screen.getByText(/no geo-location tracking/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no expiry dates/i).length).toBeGreaterThan(0);
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
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(document.querySelectorAll('.erp-sk-kpi').length).toBeGreaterThan(0);
    resolveDashboard({ success: true, data: dashboardData });
    expect(await screen.findByText('Total Employees')).toBeInTheDocument();
  });

  it('surfaces API errors and requests the 30-day trend window', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/dashboard') {
        return Promise.reject(Object.assign(new Error('boom'), {
          response: { status: 403, data: { message: 'Forbidden resource' } },
        }));
      }
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
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText('No attendance records in this period')).toBeInTheDocument();
    expect(screen.getByText('No attendance data')).toBeInTheDocument();
    expect(screen.getByText('No employee data')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});