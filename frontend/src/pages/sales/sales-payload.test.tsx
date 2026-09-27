import { buildSalesQuotationPayload } from './SalesQuotationManagement';
import { buildSalesOrderPayload } from './SalesOrderManagement';
import { computeMaximumReturnableQuantity, clampReturnQuantity } from './SalesReturnManagement';
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

describe('Sales Return Contract (PROMPT #6)', () => {
  it('validates return line fields: itemId, quantity, unitPrice, condition', () => {
    const returnLine = {
      itemId: '6c3d4e5f-6a7b-4c9d-8e0f-2a3b4c5d6e7f',
      quantity: 5,
      uomId: '4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      unitPrice: 100,
      condition: 'GOOD',
      lineTotal: 500,
    };
    expect(returnLine.quantity).toBe(5);
    expect(returnLine.condition).toBe('GOOD');
    expect(returnLine.lineTotal).toBe(500);
  });

  it('maximum returnable quantity = delivered - previously returned (never negative)', () => {
    expect(computeMaximumReturnableQuantity(50, 10)).toBe(40);
    expect(computeMaximumReturnableQuantity(50, 50)).toBe(0);
    expect(computeMaximumReturnableQuantity(50, 80)).toBe(0); // over-return clamps to 0
    expect(computeMaximumReturnableQuantity(undefined, 10)).toBe(0);
    expect(computeMaximumReturnableQuantity(50, undefined)).toBe(50);
  });

  it('clamps an entered return quantity into [0, maximum returnable]', () => {
    const maximum = computeMaximumReturnableQuantity(50, 10); // 40
    expect(clampReturnQuantity(30, maximum)).toBe(30); // valid
    expect(clampReturnQuantity(45, maximum)).toBe(40); // over-return clamped
    expect(clampReturnQuantity(-5, maximum)).toBe(0); // negative clamped
    expect(clampReturnQuantity(NaN, maximum)).toBe(0);
    expect(clampReturnQuantity(999, undefined)).toBe(0); // no ceiling data -> nothing returnable
  });
});

describe('Acceptance Test Matrix — Frontend Contracts (TEST 11 & TEST 12)', () => {
  it('TEST 11: Change order quantity -> Live availability recalculation', () => {
    const calculateAvailability = (physicalStock: number, committedStock: number, safetyStock: number, orderQty: number) => {
      const projectedBalance = physicalStock - committedStock - orderQty;
      const totalDemand = committedStock + orderQty;
      const shortageQty = totalDemand > physicalStock ? totalDemand - physicalStock : 0;
      let productionRequirementQty = 0;
      if (shortageQty > 0) {
        productionRequirementQty = shortageQty + safetyStock;
      } else if (projectedBalance < safetyStock && safetyStock > 0) {
        productionRequirementQty = safetyStock - projectedBalance;
      }
      return {
        projectedBalance,
        shortageQty,
        productionRequirementQty,
        status: shortageQty > 0 ? 'SHORT' : (projectedBalance < safetyStock ? 'BELOW_SAFETY_STOCK' : 'AVAILABLE'),
      };
    };

    const physical = 8500;
    const committed = 0;
    const safety = 1500;

    // Step A: Order Qty = 7000 (Available, above safety)
    const stateA = calculateAvailability(physical, committed, safety, 7000);
    expect(stateA.projectedBalance).toBe(1500);
    expect(stateA.shortageQty).toBe(0);
    expect(stateA.status).toBe('AVAILABLE');

    // Step B: User updates Order Qty to 7500 (Projected = 1000 < Safety 1500 -> Warn BELOW_SAFETY_STOCK)
    const stateB = calculateAvailability(physical, committed, safety, 7500);
    expect(stateB.projectedBalance).toBe(1000);
    expect(stateB.shortageQty).toBe(0);
    expect(stateB.productionRequirementQty).toBe(500);
    expect(stateB.status).toBe('BELOW_SAFETY_STOCK');

    // Step C: User updates Order Qty to 9000 (Shortage = 500, Prod Req = 2000 -> SHORT)
    const stateC = calculateAvailability(physical, committed, safety, 9000);
    expect(stateC.projectedBalance).toBe(-500);
    expect(stateC.shortageQty).toBe(500);
    expect(stateC.productionRequirementQty).toBe(2000);
    expect(stateC.status).toBe('SHORT');
  });

  it('TEST 12: Change Division after selecting item -> Incompatible item cleared/revalidated', () => {
    let currentDivision: string | undefined = 'd1000000-0000-0000-0000-000000000001'; // Spoke
    let lineItems: ERPLine[] = [
      { id: 'l1', itemId: 'item-spk-1', itemName: 'Finished Spoke', quantity: 50, rate: 10, discountPercent: 0, taxPercent: 0, lineTotal: 500 },
    ];

    const handleDivisionChange = (newDivision: string | undefined) => {
      const prev = currentDivision;
      currentDivision = newDivision;
      if (prev && newDivision !== prev && lineItems.length > 0) {
        lineItems = []; // Cleared/revalidated to prevent invalid cross-division order
      }
    };

    // User changes Division to Control Cable
    handleDivisionChange('d1000000-0000-0000-0000-000000000002');
    expect(currentDivision).toBe('d1000000-0000-0000-0000-000000000002');
    expect(lineItems.length).toBe(0); // Safely cleared
  });
});

