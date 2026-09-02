import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import RoutingManagement from './RoutingManagement';
import apiService from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

function getCalls(): string[] {
  return (apiMock.get as jest.Mock).mock.calls.map((c: any[]) => String(c[0]));
}

describe('RoutingManagement lookups', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/production/routings') return Promise.resolve({ data: [], total: 0 });
      if (u === '/bom') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('loads routings and hits the real lookup endpoints (not /items, /uoms, /admin/*)', async () => {
    render(
      <MemoryRouter>
        <RoutingManagement />
      </MemoryRouter>
    );

    await new Promise((r) => setTimeout(r, 50));

    const calls = getCalls();
    expect(calls).toContain('/production/routings');
    // Broken lookups must never be called.
    expect(calls).not.toContain('/items');
    expect(calls).not.toContain('/uoms');
    expect(calls).not.toContain('/admin/divisions');
    expect(calls).not.toContain('/admin/sections');
    expect(calls).not.toContain('/admin/departments');
    // Real endpoints are used.
    expect(calls.some((u) => u.startsWith('/master-data/items'))).toBe(true);
    expect(calls.some((u) => u.startsWith('/master-data/uom'))).toBe(true);
    expect(calls).toContain('/divisions');
    expect(calls).toContain('/sections');
    expect(calls).toContain('/departments');
  });
});
