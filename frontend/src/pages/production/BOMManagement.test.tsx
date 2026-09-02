import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import BOMManagement from './BOMManagement';
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

describe('BOMManagement lookups', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/bom') return Promise.resolve({ data: [], total: 0 });
      if (u.startsWith('/master-data/items')) return Promise.resolve({ data: [] });
      if (u.startsWith('/master-data/uom')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('loads BOMs and hits the real lookup endpoints (not /items, /uoms)', async () => {
    render(
      <MemoryRouter>
        <BOMManagement />
      </MemoryRouter>
    );

    // Allow the async lookups to resolve.
    await new Promise((r) => setTimeout(r, 50));

    const calls = getCalls();
    expect(calls).toContain('/bom');
    // Broken lookups must never be called.
    expect(calls).not.toContain('/items');
    expect(calls).not.toContain('/uoms');
    // Real endpoints are used.
    expect(calls.some((u) => u.startsWith('/master-data/items'))).toBe(true);
    expect(calls.some((u) => u.startsWith('/master-data/uom'))).toBe(true);
  });
});
