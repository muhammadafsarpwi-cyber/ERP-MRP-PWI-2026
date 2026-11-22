import { BadRequestException } from '@nestjs/common';
import { SalesDeliveryService } from './sales-delivery.service';

describe('SalesDeliveryService — applyTaxRate', () => {
  const DN_ID = '11111111-1111-1111-1111-111111111111';
  const COMP_ID = '22222222-2222-2222-2222-222222222222';
  const USER_ID = '33333333-3333-3333-3333-333333333333';

  function createService(status: string, linesData: Array<{ id: string; quantity: number; unitPrice: number }>) {
    const lineState = linesData.map((l) => ({
      ...l,
      taxAmount: 0,
      lineTotal: l.quantity * l.unitPrice,
    }));

    const deliveryRecord: any = {
      id: DN_ID,
      companyId: COMP_ID,
      deliveryNumber: 'DN-2026-00044',
      status,
      subtotal: lineState.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      taxAmount: 0,
      totalAmount: lineState.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      salesOrder: { divisionId: undefined },
      lines: lineState,
    };

    const repo: any = {
      findOne: jest.fn(async () => ({ ...deliveryRecord, lines: lineState.map((l) => ({ ...l })) })),
      update: jest.fn(async (_id: string, patch: any) => {
        Object.assign(deliveryRecord, patch);
      }),
      manager: { query: jest.fn(async () => []) },
    };

    const lineRepo: any = {
      find: jest.fn(async () => lineState),
      update: jest.fn(async (lineId: string, patch: any) => {
        const target = lineState.find((l) => l.id === lineId);
        if (target) Object.assign(target, patch);
      }),
    };

    const service = new SalesDeliveryService(
      repo,
      lineRepo,
      {} as any,
      {} as any,
      {} as any,
      { find: jest.fn(async () => []) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    jest.spyOn(service, 'findOne').mockImplementation(async () => ({
      ...deliveryRecord,
      lines: lineState.map((l) => ({ ...l })),
    }));

    return { service, repo, lineRepo, deliveryRecord, lineState };
  }

  it('applies 18% GST across all delivery lines and updates header totals on DRAFT deliveries', async () => {
    const { service, lineState, deliveryRecord } = createService('DRAFT', [
      { id: 'line-1', quantity: 700, unitPrice: 100 },
      { id: 'line-2', quantity: 200, unitPrice: 250 },
    ]);

    const result = await service.applyTaxRate(DN_ID, 18, USER_ID, COMP_ID);

    expect(lineState[0].taxAmount).toBe(12600);
    expect(lineState[0].lineTotal).toBe(82600);
    expect(lineState[1].taxAmount).toBe(9000);
    expect(lineState[1].lineTotal).toBe(59000);
    expect(deliveryRecord.subtotal).toBe(120000);
    expect(deliveryRecord.taxAmount).toBe(21600);
    expect(deliveryRecord.totalAmount).toBe(141600);
    expect(result.taxAmount).toBe(21600);
    expect(result.totalAmount).toBe(141600);
  });

  it('supports resetting tax to 0% (Tax-Free) cleanly on CONFIRMED deliveries', async () => {
    const { service, lineState, deliveryRecord } = createService('CONFIRMED', [
      { id: 'line-1', quantity: 100, unitPrice: 500 },
    ]);
    lineState[0].taxAmount = 9000;
    lineState[0].lineTotal = 59000;

    const result = await service.applyTaxRate(DN_ID, 0, USER_ID, COMP_ID);

    expect(lineState[0].taxAmount).toBe(0);
    expect(lineState[0].lineTotal).toBe(50000);
    expect(deliveryRecord.taxAmount).toBe(0);
    expect(deliveryRecord.totalAmount).toBe(50000);
    expect(result.taxAmount).toBe(0);
  });

  it('rejects cancelled deliveries and invalid tax percentages', async () => {
    const { service: cancelledService } = createService('CANCELLED', [
      { id: 'line-1', quantity: 10, unitPrice: 100 },
    ]);
    await expect(cancelledService.applyTaxRate(DN_ID, 18, USER_ID, COMP_ID)).rejects.toThrow(
      BadRequestException,
    );

    const { service: draftService } = createService('DRAFT', [
      { id: 'line-1', quantity: 10, unitPrice: 100 },
    ]);
    await expect(draftService.applyTaxRate(DN_ID, 125, USER_ID, COMP_ID)).rejects.toThrow(
      BadRequestException,
    );
  });
});
