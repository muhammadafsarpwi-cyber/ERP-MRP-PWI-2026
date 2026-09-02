import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ProductionOrders, { buildCreateOrderPayload } from './ProductionOrders';
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

describe('buildCreateOrderPayload (CreateProductionOrderDto contract)', () => {
  it('maps the create form fields to backend DTO field names', () => {
    const payload = buildCreateOrderPayload({
      productId: 'prod-1',
      routingId: 'rt-1',
      bomId: undefined,
      plannedQuantity: 100,
      uomId: 'uom-kg',
      priority: 'HIGH',
      plannedStartDate: '2026-09-01',
      plannedEndDate: '2026-09-05',
      dueDate: '2026-09-05',
    });

    expect(payload.productId).toBe('prod-1');
    expect(payload.routingId).toBe('rt-1');
    expect(payload.plannedQuantity).toBe(100);
    expect(payload.uomId).toBe('uom-kg');
    expect(payload.priority).toBe('HIGH');
    // Frontend date inputs map to backend plannedStartDate/plannedEndDate/dueDate,
    // NOT the old nonexistent keys (orderDate / expectedCompletionDate).
    expect(payload.plannedStartDate).toBe('2026-09-01');
    expect(payload.plannedEndDate).toBe('2026-09-05');
    expect(payload.dueDate).toBe('2026-09-05');
    expect(payload).not.toHaveProperty('orderDate');
    expect(payload).not.toHaveProperty('expectedCompletionDate');
    // companyId is derived server-side from the org scope, never sent in the body.
    expect(payload).not.toHaveProperty('companyId');
    // Backend create DTO has no lines array (material requirements come from BOM).
    expect(payload).not.toHaveProperty('lines');
    // Optional BOM is omitted when not chosen; priority defaults to NORMAL otherwise.
    expect(payload).not.toHaveProperty('bomId');
  });

  it('omits empty optional dates and defaults priority to NORMAL', () => {
    const payload = buildCreateOrderPayload({
      productId: 'prod-1',
      routingId: 'rt-1',
      plannedQuantity: 10,
      uomId: 'uom-kg',
    });
    expect(payload.priority).toBe('NORMAL');
    expect(payload).not.toHaveProperty('plannedStartDate');
    expect(payload).not.toHaveProperty('plannedEndDate');
    expect(payload).not.toHaveProperty('dueDate');
  });
});

describe('ProductionOrders', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u.startsWith('/production/orders')) return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve({ data: [] });
    });
  });

  it('renders the production orders list with the create action', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ProductionOrders />
      </MemoryRouter>
    );

    expect(await screen.findByText('Create Order')).toBeInTheDocument();
    await user.click(screen.getByText('Create Order'));
    // The form collects the required routing and UOM fields (previously missing).
    expect(await screen.findByLabelText('Routing')).toBeInTheDocument();
    expect(screen.getByLabelText('UOM')).toBeInTheDocument();
    expect(screen.getByLabelText('Product')).toBeInTheDocument();
  });
});
