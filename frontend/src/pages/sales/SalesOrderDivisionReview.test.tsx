/**
 * SalesOrderDivisionReview — minimal contract tests.
 *
 * READ-ONLY page: asserts classification badges, summary counts and that no
 * save/mutation control is enabled. Never touches the database.
 *
 * Note: CRA jest config uses `resetMocks: true`, so the API mock implementation
 * must be (re)installed inside `beforeEach` — a `jest.mock` factory
 * implementation alone is wiped before each test.
 */
import React from 'react';
import { App as AntdApp } from 'antd';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import SalesOrderDivisionReview from './SalesOrderDivisionReview';
import apiService from '../../services/api';

jest.setTimeout(30000);

jest.mock('../../services/api');
jest.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true }),
}));

jest.mock('../../components/shared', () => {
  const actual = jest.requireActual('../../components/shared');
  return { ...actual, PageHeader: () => null };
});

const D_CCD = 'd1000000-0000-0000-0000-000000000002';
const D_SPD = 'd1000000-0000-0000-0000-000000000001';

const conflictOrder = {
  id: 'so-conflict',
  orderNumber: 'SO-2026-00001',
  status: 'Confirmed',
  divisionId: null,
  customer: { companyName: 'Engineering Solutions Ltd' },
  items: [
    { id: 'l1', lineNumber: 1, item: { itemCode: 'SLD-0001', name: 'Industrial Widget', divisionId: null }, quantity: 50 },
    { id: 'l2', lineNumber: 2, item: { itemCode: 'SLD-0002', name: 'Premium Component Kit', divisionId: null }, quantity: 10 },
    {
      id: 'l3',
      lineNumber: 3,
      item: {
        itemCode: 'CCD-FGR-001',
        name: '5 MM PVC 2P OUTER CASING',
        divisionId: D_CCD,
        division: { divisionCode: 'DIV-CCD' },
      },
      quantity: 10000,
    },
  ],
};

const zeroLineOrder = {
  id: 'so-unresolved',
  orderNumber: 'SO-2026-00004',
  status: 'Draft',
  divisionId: null,
  items: [],
};

const divisions = [
  { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
  { id: D_SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division' },
];

const renderComponent = () =>
  render(
    <MemoryRouter>
      <AntdApp>
        <SalesOrderDivisionReview />
      </AntdApp>
    </MemoryRouter>,
  );

describe('SalesOrderDivisionReview (read-only)', () => {
  beforeAll(() => {
    window.matchMedia = (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  });

  /**
   * Installed from inside the test body on purpose: CRA's `resetMocks: true`
   * can clear a `beforeEach`-installed implementation, which silently made
   * `apiService.get` return `undefined` (page then rendered an empty table).
   */
  const seedApi = () => {
    (apiService.get as jest.Mock).mockReset();
    (apiService.get as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('/sales/orders')) {
        return Promise.resolve({ data: [conflictOrder, zeroLineOrder], total: 2 });
      }
      if (String(url).includes('/divisions')) {
        return Promise.resolve({ data: divisions });
      }
      return Promise.resolve({ data: [] });
    });
  };

  it('renders summary, conflict badge and the no-mutation notice', async () => {
    seedApi();
    renderComponent();

    // The order number is rendered in more than one place (table cell and the
    // evidence area), so assert presence rather than uniqueness.
    await waitFor(
      () => expect(screen.getAllByText('SO-2026-00001').length).toBeGreaterThan(0),
      { timeout: 15000 },
    );

    // Conflict classification for the mixed-division order.
    expect(screen.getAllByText('CONFLICT').length).toBeGreaterThan(0);
    // Unresolved zero-line order present.
    expect(screen.getAllByText('SO-2026-00004').length).toBeGreaterThan(0);
    // Item evidence shown.
    expect(screen.getAllByText('CCD-FGR-001').length).toBeGreaterThan(0);
    // Explicit no-mutation statement.
    expect(
      screen.getByText(/NO DATABASE CHANGE WILL BE MADE UNTIL FINAL BUSINESS APPROVAL/i),
    ).toBeInTheDocument();
    // Backfill action exists but is disabled (the button element, not its label).
    expect(
      screen.getByRole('button', { name: /Approve & backfill/i }),
    ).toBeDisabled();
  });

  it('performs GET-only calls and never issues a mutation', async () => {
    seedApi();

    const getMock = apiService.get as jest.Mock;
    const postMock = apiService.post as jest.Mock;
    const putMock = apiService.put as jest.Mock;
    const patchMock = apiService.patch as jest.Mock;
    const delMock = apiService.delete as jest.Mock;
    postMock.mockReset();
    putMock.mockReset();
    patchMock.mockReset();
    delMock.mockReset();

    renderComponent();

    await waitFor(
      () => expect(screen.getAllByText('SO-2026-00001').length).toBeGreaterThan(0),
      { timeout: 15000 },
    );

    // Only the two standard read endpoints are used — no approve/backfill
    // endpoint is ever called from this page.
    const called = getMock.mock.calls.map((c) => String(c[0])).sort();
    expect(called).toEqual(['/divisions', '/sales/orders']);

    expect(postMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
    expect(delMock).not.toHaveBeenCalled();
  });
});
