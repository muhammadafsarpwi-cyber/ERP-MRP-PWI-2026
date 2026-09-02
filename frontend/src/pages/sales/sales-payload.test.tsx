import { buildSalesQuotationPayload } from './SalesQuotationManagement';
import { buildSalesOrderPayload } from './SalesOrderManagement';
import type { ERPLine } from '../../components/shared';

jest.mock('../../services/api');

describe('buildSalesQuotationPayload (TASK #18 contract)', () => {
  it('includes uomId on every line item (was omitted -> 400 uomId not empty)', () => {
    const lines: ERPLine[] = [
      { id: 'l1', itemId: '6c3d4e5f-6a7b-4c9d-8e0f-2a3b4c5d6e7f', itemName: 'Widget', uomId: '4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', quantity: 2, rate: 50, discountPercent: 0, taxPercent: 0, lineTotal: 100 },
    ];
    const payload = buildSalesQuotationPayload({ customerId: 'c-1' }, lines);
    expect(payload.items[0].uomId).toBe('4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');
    expect(payload.items[0].quantity).toBe(2);
    expect(payload.items[0].unitPrice).toBe(50);
  });

  it('does not send companyId in the body (server derives it from the JWT / company isolation)', () => {
    const lines: ERPLine[] = [
      { id: 'l1', itemId: '6c3d4e5f-6a7b-4c9d-8e0f-2a3b4c5d6e7f', uomId: '4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', quantity: 1, rate: 10, discountPercent: 0, taxPercent: 0, lineTotal: 10 },
    ];
    const payload = buildSalesQuotationPayload({ customerId: 'c-1' }, lines);
    expect(payload).not.toHaveProperty('companyId');
  });
});

describe('buildSalesOrderPayload (TASK #18 contract)', () => {
  it('includes uomId on every line item (was omitted -> 400 uomId not empty)', () => {
    const lines: ERPLine[] = [
      { id: 'l1', itemId: '6c3d4e5f-6a7b-4c9d-8e0f-2a3b4c5d6e7f', itemName: 'Widget', uomId: '4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', quantity: 3, rate: 20, discountPercent: 5, taxPercent: 0, lineTotal: 57 },
    ];
    const payload = buildSalesOrderPayload({ customerId: 'c-1', orderDate: '2026-09-01' }, lines);
    expect(payload.items[0].uomId).toBe('4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');
    expect(payload.items[0].discountPercent).toBe(5);
    expect(payload.orderDate).toBe('2026-09-01');
  });

  it('does not send companyId in the body (server derives it from the JWT / company isolation)', () => {
    const lines: ERPLine[] = [
      { id: 'l1', itemId: '6c3d4e5f-6a7b-4c9d-8e0f-2a3b4c5d6e7f', uomId: '4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', quantity: 1, rate: 10, discountPercent: 0, taxPercent: 0, lineTotal: 10 },
    ];
    const payload = buildSalesOrderPayload({ customerId: 'c-1' }, lines);
    expect(payload).not.toHaveProperty('companyId');
  });
});
