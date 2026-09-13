import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MyAttendance from './MyAttendance';
import apiService from '../../services/api';
import type { MyAttendanceData } from '../../services/hrMyAttendanceService';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;

const attendanceData: MyAttendanceData = {
  asOf: '2026-08-31',
  range: { from: '2026-08-01', to: '2026-08-31' },
  linked: true,
  reason: null,
  employee: {
    id: 'emp-1',
    employeeCode: 'EMP-FT5',
    firstName: 'Phase5b',
    lastName: 'Test',
    email: 'phase5b@example.com',
    jobTitle: 'Operator',
    employmentType: 'FULL_TIME',
    joinDate: '2026-01-01',
    status: 'ACTIVE',
    designation: { id: 'd1', designationCode: 'OPR', designationName: 'Machine Operator' },
    department: null,
  },
  today: null,
  summary: {
    total: 1,
    present: 1,
    late: 0,
    absent: 0,
    onLeave: 0,
    halfDay: 0,
    holiday: 0,
    weekend: 0,
    notes: { late: 'DERIVED' },
  },
  records: [
    {
      id: 'rec-1',
      date: '2026-08-30',
      status: 'PRESENT',
      checkIn: null,
      checkOut: null,
      durationMinutes: null,
      overtimeMinutes: 0,
      remarks: null,
      shift: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 10,
};

const unlinkedData: MyAttendanceData = {
  ...attendanceData,
  linked: false,
  reason: 'ACCOUNT_NOT_LINKED',
  employee: null,
  today: null,
  summary: { ...attendanceData.summary, total: 0, present: 0 },
  records: [],
  total: 0,
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
    if (u === '/hr/my-attendance') return Promise.resolve({ data: attendanceData });
    return Promise.resolve({ data: [] });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <MyAttendance />
    </MemoryRouter>
  );

describe('My Attendance page', () => {
  it('requests the current month by default on first load', async () => {
    renderPage();
    await screen.findByText('Phase5b Test');
    const calls = (apiMock.get as jest.Mock).mock.calls.filter((c: any[]) => String(c[0]) === '/hr/my-attendance');
    expect(calls.length).toBeGreaterThan(0);
    const params = calls[0][1] as Record<string, string>;
    expect(params.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(params.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('renders the linked employee summary, real KPI figures and history record', async () => {
    renderPage();
    expect(await screen.findByText('Phase5b Test')).toBeInTheDocument();
    expect(screen.getByText(/EMP-FT5/)).toBeInTheDocument();
    expect(screen.getByText(/Machine Operator/)).toBeInTheDocument();
    expect(screen.getAllByText('Present').length).toBeGreaterThan(0);
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(await screen.findByText('2026-08-30')).toBeInTheDocument();
    expect(screen.getAllByText('On Leave').length).toBeGreaterThan(0);
  });

  it('shows a truthful not-linked notice instead of empty guesses', async () => {
    apiMock.get.mockImplementation((url: any) => {
      if (String(url) === '/hr/my-attendance') return Promise.resolve({ data: unlinkedData });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText(/not linked to an HR employee record/i)).toBeInTheDocument();
    expect(screen.queryByText('Phase5b Test')).not.toBeInTheDocument();
  });

  it('surfaces API errors', async () => {
    apiMock.get.mockImplementation((url: any) => {
      if (String(url) === '/hr/my-attendance') {
        return Promise.reject(Object.assign(new Error('boom'), {
          response: { status: 403, data: { message: 'Forbidden resource' } },
        }));
      }
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText(/Forbidden resource/i)).toBeInTheDocument();
  });

  it('renders a truthful empty state when the linked account has no records', async () => {
    apiMock.get.mockImplementation((url: any) => {
      if (String(url) === '/hr/my-attendance') {
        return Promise.resolve({
          data: {
            ...attendanceData,
            range: { from: '2026-09-01', to: '2026-09-13' },
            records: [],
            total: 0,
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText('No attendance records in this period')).toBeInTheDocument();
  });
});