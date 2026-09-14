import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import LiveMap from './LiveMap';
import apiService from '../../services/api';
import type { LiveMapData, LiveMapOptions } from '../../services/hrLiveMapService';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;

const options: LiveMapOptions = {
  companyId: 'company-1',
  divisions: [{ id: 'div-1', name: 'Manufacturing Division' }],
  sections: [{ id: 'sec-1', name: 'Assembly Line A', divisionId: 'div-1' }],
  departments: [{ id: 'dept-1', name: 'Production', divisionId: 'div-1', sectionId: null }],
  shifts: [{ id: 'shift-1', code: 'S-1', name: 'Morning', startTime: '08:00:00', endTime: '16:00:00' }],
  employees: [{ id: 'emp-1', employeeCode: 'EMP-001', firstName: 'Ahmed', lastName: 'Raza' }],
  attendanceStatuses: ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND', 'LATE'],
};

const presentEmployee = {
  employeeId: 'emp-1',
  employeeCode: 'EMP-001',
  employeeName: 'Ahmed Raza',
  jobTitle: null,
  employeeStatus: 'ACTIVE',
  designation: { code: 'D-002', name: 'Production Manager' },
  department: {
    id: 'dept-1',
    name: 'Production',
    division: { id: 'div-1', name: 'Manufacturing Division' },
    section: { id: 'sec-1', name: 'Assembly Line A' },
  },
  shift: { id: 'shift-1', code: 'S-1', name: 'Morning', startTime: '08:00:00', endTime: '16:00:00' },
  shiftSource: 'attendance' as const,
  attendance: { date: '2026-09-14', status: 'PRESENT', checkIn: new Date().toISOString(), checkOut: null, presentNow: true },
  location: { status: 'NO_LOCATION' as const, lastUpdated: null, latitude: null, longitude: null, source: null },
};

const liveMapData: LiveMapData = {
  asOf: new Date().toISOString(),
  companyId: 'company-1',
  reason: null,
  location: {
    provider: null,
    providerConfigured: false,
    note: 'No attendance/device location source is configured in this ERP instance. Employees can appear on the map when a real GPS/attendance location is captured.',
    freshnessMinutes: { LIVE_MAX_MINUTES: 5, RECENT_MAX_MINUTES: 30 },
  },
  summary: {
    location: { live: 0, recent: 0, stale: 0, noLocation: 1 },
    presence: { presentNow: 1, presentToday: 1, absent: 0, onLeave: 0, halfDay: 0, holiday: 0, weekend: 0, noRecord: 0 },
    total: 1,
    notes: { live: 'DERIVED', noLocation: 'NO_GEO_SOURCE', presentNow: 'DERIVED' },
  },
  employees: [presentEmployee],
  total: 1,
  page: 1,
  limit: 10,
};

const noDefaultData: LiveMapData = {
  ...liveMapData,
  companyId: null,
  reason: 'NO_DEFAULT_COMPANY' as LiveMapData['reason'],
  summary: {
    location: { live: 0, recent: 0, stale: 0, noLocation: 0 },
    presence: { presentNow: 0, presentToday: 0, absent: 0, onLeave: 0, halfDay: 0, holiday: 0, weekend: 0, noRecord: 0 },
    total: 0,
    notes: { live: 'DERIVED', noLocation: 'NO_GEO_SOURCE', presentNow: 'DERIVED' },
  },
  employees: [],
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
    if (u === '/hr/live-map') return Promise.resolve({ data: liveMapData });
    if (u === '/hr/live-map/options') return Promise.resolve({ data: options });
    return Promise.resolve({ data: [] });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <LiveMap />
    </MemoryRouter>
  );

describe('Live Map page', () => {
  it('requests the live map with pagination on first load', async () => {
    renderPage();
    await screen.findByText('Ahmed Raza');
    const calls = (apiMock.get as jest.Mock).mock.calls.filter((c: any[]) => String(c[0]) === '/hr/live-map');
    expect(calls.length).toBeGreaterThan(0);
    const params = calls[0][1] as Record<string, string>;
    expect(params.limit).toBe('10');
    expect(params.page).toBe('1');
  });

  it('shows the truthful no-geo-source notice and truthful empty map board', async () => {
    renderPage();
    expect(await screen.findByText(/No live location source configured/i)).toBeInTheDocument();
    expect(await screen.findByText(/No live employee locations available/i)).toBeInTheDocument();
    expect(screen.getAllByText('No Location').length).toBeGreaterThan(0);
  });

  it('renders KPIs and presence derived from real attendance', async () => {
    renderPage();
    expect(await screen.findByText('Live on Map')).toBeInTheDocument();
    expect(screen.getByText('Present Now')).toBeInTheDocument();
    expect(screen.getByText('Present Today')).toBeInTheDocument();
    expect(await screen.findByText(/Present now/)).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('renders the employee row with attendance, shift and NO_LOCATION location tag', async () => {
    renderPage();
    expect(await screen.findByText('Ahmed Raza')).toBeInTheDocument();
    expect(screen.getByText('EMP-001')).toBeInTheDocument();
    expect(screen.getByText(/Morning/)).toBeInTheDocument();
    expect(screen.getByText('Present')).toBeInTheDocument();
    const locTags = screen.getAllByText('No Location');
    expect(locTags.length).toBeGreaterThan(0);
  });

  it('loads the filter dropdowns from /hr/live-map/options', async () => {
    renderPage();
    expect(await screen.findByText('Ahmed Raza')).toBeInTheDocument();
    // Division, Shift, Presence status, Employee filter selects (antd comboboxes).
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('region', { name: /live map filters/i })).toBeInTheDocument();
  });

  it('renders a truthful unprovisioned-company warning instead of empty guesses', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/hr/live-map') return Promise.resolve({ data: noDefaultData });
      if (u === '/hr/live-map/options') return Promise.resolve({ data: options });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText(/Live Map is not available/i)).toBeInTheDocument();
    expect(screen.queryByText('Ahmed Raza')).not.toBeInTheDocument();
  });

  it('surfaces API errors', async () => {
    apiMock.get.mockImplementation((url: any) => {
      if (String(url) === '/hr/live-map') {
        return Promise.reject(Object.assign(new Error('boom'), {
          response: { status: 403, data: { message: 'Forbidden resource' } },
        }));
      }
      if (String(url) === '/hr/live-map/options') return Promise.resolve({ data: options });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    expect(await screen.findByText(/Forbidden resource/i)).toBeInTheDocument();
  });
});