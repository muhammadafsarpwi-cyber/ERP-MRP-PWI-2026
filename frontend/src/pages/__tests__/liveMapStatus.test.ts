import { attPresentNow, hasLiveMarkers, ATTENDANCE_STATUS_LABELS, LOCATION_FRESHNESS_MINUTES } from '../../services/hrLiveMapService';
import type { LiveMapEmployee, LiveMapSummary } from '../../services/hrLiveMapService';

const baseEmployee: LiveMapEmployee = {
  employeeId: 'emp-1',
  employeeCode: 'EMP-001',
  employeeName: 'Ahmed Raza',
  jobTitle: null,
  employeeStatus: 'ACTIVE',
  designation: null,
  department: null,
  shift: null,
  shiftSource: null,
  attendance: null,
  location: { status: 'NO_LOCATION', lastUpdated: null, latitude: null, longitude: null, source: null },
};

const summaryFixture: LiveMapSummary = {
  location: { live: 0, recent: 0, stale: 0, noLocation: 1 },
  presence: { presentNow: 0, presentToday: 0, absent: 0, onLeave: 0, halfDay: 0, holiday: 0, weekend: 0, noRecord: 1 },
  total: 1,
  notes: { live: 'DERIVED', noLocation: 'NO_GEO_SOURCE', presentNow: 'DERIVED' },
};

describe('attPresentNow', () => {
  it('returns false when there is no attendance record', () => {
    expect(attPresentNow(baseEmployee)).toBe(false);
  });

  it('returns true when the backend marks presentNow as true', () => {
    const att: LiveMapEmployee = {
      ...baseEmployee,
      attendance: { date: '2026-09-14', status: 'PRESENT', checkIn: '2026-09-14T08:00:00Z', checkOut: null, presentNow: true },
    };
    expect(attPresentNow(att)).toBe(true);
  });

  it('returns false when presentNow is explicitly false', () => {
    const att: LiveMapEmployee = {
      ...baseEmployee,
      attendance: { date: '2026-09-14', status: 'PRESENT', checkIn: '2026-09-14T08:00:00Z', checkOut: '2026-09-14T16:00:00Z', presentNow: false },
    };
    expect(attPresentNow(att)).toBe(false);
  });
});

describe('hasLiveMarkers', () => {
  it('returns false when there are no live or recent location counts', () => {
    expect(hasLiveMarkers(summaryFixture)).toBe(false);
  });

  it('returns true when there is at least one live location', () => {
    expect(hasLiveMarkers({ ...summaryFixture, location: { live: 1, recent: 0, stale: 0, noLocation: 0 } })).toBe(true);
  });

  it('returns true when there is at least one recent location', () => {
    expect(hasLiveMarkers({ ...summaryFixture, location: { live: 0, recent: 1, stale: 0, noLocation: 0 } })).toBe(true);
  });

  it('returns false when summary is undefined', () => {
    expect(hasLiveMarkers(undefined)).toBe(false);
  });
});

describe('ATTENDANCE_STATUS_LABELS', () => {
  it('maps the expected present/absent statuses to human labels', () => {
    expect(ATTENDANCE_STATUS_LABELS.PRESENT).toBe('Present');
    expect(ATTENDANCE_STATUS_LABELS.ABSENT).toBe('Absent');
    expect(ATTENDANCE_STATUS_LABELS.LEAVE).toBe('On Leave');
    expect(ATTENDANCE_STATUS_LABELS.HALF_DAY).toBe('Half Day');
    expect(ATTENDANCE_STATUS_LABELS.HOLIDAY).toBe('Holiday');
    expect(ATTENDANCE_STATUS_LABELS.WEEKEND).toBe('Weekend');
  });
});

describe('LOCATION_FRESHNESS_MINUTES', () => {
  it('defines the 5-minute live and 30-minute recent thresholds', () => {
    expect(LOCATION_FRESHNESS_MINUTES.LIVE_MAX_MINUTES).toBe(5);
    expect(LOCATION_FRESHNESS_MINUTES.RECENT_MAX_MINUTES).toBe(30);
  });
});