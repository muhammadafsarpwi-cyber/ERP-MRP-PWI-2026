import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AttendanceRegister from './AttendanceRegister';
import apiService from '../../services/api';
import type { AttendanceRegisterData } from '../../services/hrAttendanceRegisterService';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;

const registerOptions = {
  companyId: 'company-1',
  divisions: [{ id: 'div-1', code: 'DIV-A', name: 'Manufacturing Division' }],
  sections: [{ id: 'sec-1', code: 'SEC-1', name: 'Assembly Line A', divisionId: 'div-1' }],
  departments: [{ id: 'dept-1', code: 'D-1', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' }],
  shifts: [{ id: 'shift-1', code: 'S-1', name: 'Morning' }],
  statuses: ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND', 'LATE'],
};

const registerData: AttendanceRegisterData = {
  asOf: '2026-08-31',
  range: { from: '2026-08-01', to: '2026-08-31' },
  companyId: 'company-1',
  reason: null,
  summary: {
    total: 1,
    present: 1,
    late: 1,
    absent: 0,
    onLeave: 0,
    halfDay: 0,
    holiday: 0,
    weekend: 0,
    employeesCovered: 1,
    notes: { late: 'DERIVED' },
  },
  records: [
    {
      id: 'rec-1',
      date: '2026-08-30',
      status: 'PRESENT',
      employee: {
        id: 'emp-ft5',
        employeeCode: 'EMP-FT5',
        firstName: 'Phase5b',
        lastName: 'Test',
        email: 'phase5b@example.com',
        jobTitle: 'Operator',
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        designation: { id: 'des-1', code: 'D-006', name: 'Machine Operator' },
        department: {
          id: 'dept-1',
          name: 'Production',
          division: { id: 'div-1', name: 'Manufacturing Division' },
          section: { id: 'sec-1', name: 'Assembly Line A' },
        },
      },
      checkIn: null,
      checkOut: null,
      durationMinutes: null,
      lateMinutes: 7,
      late: true,
      overtimeMinutes: 0,
      remarks: null,
      shift: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 10,
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
    if (u === '/hr/attendance-register/options') return Promise.resolve({ data: registerOptions });
    if (u === '/hr/attendance-register') return Promise.resolve({ data: registerData });
    return Promise.resolve({ data: [] });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AttendanceRegister />
    </MemoryRouter>
  );

describe('Attendance Register page', () => {
  it('requests the current month by default on first load and fetches filter options', async () => {
    renderPage();
    expect(await screen.findByText('EMP-FT5')).toBeInTheDocument();
    const calls = (apiMock.get as jest.Mock).mock.calls.filter((c: any[]) => String(c[0]) === '/hr/attendance-register');
    expect(calls.length).toBeGreaterThan(0);
    const params = calls[0][1] as Record<string, string>;
    expect(params.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(params.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((apiMock.get as jest.Mock).mock.calls.some((c: any[]) => String(c[0]) === '/hr/attendance-register/options')).toBe(true);
  });

  it('renders the register title, org-cascaded employee detail and derived late flag', async () => {
    renderPage();
    expect(await screen.findByText('Attendance Register')).toBeInTheDocument();
    expect(screen.getByText('Phase5b Test')).toBeInTheDocument();
    expect(screen.getByText('Manufacturing Division / Assembly Line A / Production')).toBeInTheDocument();
    expect(screen.getByText('2026-08-30')).toBeInTheDocument();
    expect(screen.getByText('7m late')).toBeInTheDocument();
    expect(screen.getAllByText('Present').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Employees').length).toBeGreaterThan(0);
  });

  it('applies an employee search and re-requests the register', async () => {
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
    const calls = (apiMock.get as jest.Mock).mock.calls.filter((c: any[]) => String(c[0]) === '/hr/attendance-register');
    const last = calls[calls.length - 1][1] as Record<string, string>;
    expect(last.search).toBe('phase');
  });

  it('shows a truthful empty state when no records match', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/attendance-register/options') return Promise.resolve({ data: registerOptions });
      if (u === '/hr/attendance-register') {
        return Promise.resolve({
          data: {
            ...registerData,
            range: { from: '2026-09-01', to: '2026-09-30' },
            summary: { ...registerData.summary, total: 0, present: 0, late: 0, employeesCovered: 0 },
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

  it('surfaces API errors', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/attendance-register/options') return Promise.resolve({ data: registerOptions });
      if (u === '/hr/attendance-register') {
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
      if (u === '/hr/attendance-register/options') return Promise.resolve({ data: { ...registerOptions, companyId: null } });
      if (u === '/hr/attendance-register') {
        return Promise.resolve({
          data: {
            ...registerData,
            companyId: null,
            reason: 'NO_DEFAULT_COMPANY',
            summary: { ...registerData.summary, total: 0, present: 0, late: 0, employeesCovered: 0 },
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
});