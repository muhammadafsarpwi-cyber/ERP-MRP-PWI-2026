import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import OrderCommandFulfillment from './OrderCommandFulfillment';
import {
  buildTopCustomersForCommand,
  computeOrderCommandKpis,
  findDefaultOrderCommandDivision,
  getOrderCommandDateBadge,
  getOrderCommandDatePresetOptions,
  resolveOrderCommandDateRange,
} from './orderCommandFilters.util';
import apiService from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: () => true,
  }),
}));

const DIV_SPD = 'div-spd';
const DIV_CCD = 'div-ccd';

const buildMockPayload = () => ({
  divisions: [
    { id: DIV_SPD, divisionCode: 'DIV-001-SPI', name: 'Spoke Division' },
    { id: DIV_CCD, divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
  ],
  customers: [
    {
      customerId: 'cust-1',
      customerCode: 'CUS-ASA-005',
      customerName: 'ALI SHAH AUTOS',
      contactPerson: 'Ali Shah',
      email: 'ali@example.com',
      phone: '0300-1234567',
      mobile: null,
      paymentTerms: 'Net 30 Days',
      creditDays: 30,
      openOrderCount: 2,
      completedOrderCount: 1,
      cancelledOrderCount: 0,
      totalOrderedQty: 1620,
      totalDispatchedQty: 800,
      totalPendingQty: 820,
      totalReadyPackedQty: 370,
      oldestReadyAgeDays: 18,
      totalRemainingToPackQty: 450,
      totalOpenValue: 132160,
      totalDispatchedValue: 94400,
      totalOrderValue: 191160,
    },
    {
      customerId: 'cust-2',
      customerCode: 'CUS-CFP-001',
      customerName: 'CROWN FIT PAKISTAN',
      contactPerson: 'Bilal',
      email: 'cfp@example.com',
      phone: '0300-9999999',
      mobile: null,
      paymentTerms: 'Net 15 Days',
      creditDays: 15,
      openOrderCount: 1,
      completedOrderCount: 1,
      cancelledOrderCount: 0,
      totalOrderedQty: 5000,
      totalDispatchedQty: 3000,
      totalPendingQty: 2000,
      totalReadyPackedQty: 0,
      oldestReadyAgeDays: null,
      totalRemainingToPackQty: 2000,
      totalOpenValue: 200000,
      totalDispatchedValue: 300000,
      totalOrderValue: 500000,
    },
    {
      customerId: 'cust-3',
      customerCode: 'CUS-PTL-002',
      customerName: 'Panther Tyres Ltd',
      contactPerson: null,
      email: null,
      phone: null,
      mobile: null,
      paymentTerms: 'Standard',
      creditDays: 0,
      openOrderCount: 0,
      completedOrderCount: 1,
      cancelledOrderCount: 0,
      totalOrderedQty: 1500,
      totalDispatchedQty: 1500,
      totalPendingQty: 0,
      totalReadyPackedQty: 0,
      oldestReadyAgeDays: null,
      totalRemainingToPackQty: 0,
      totalOpenValue: 0,
      totalDispatchedValue: 150000,
      totalOrderValue: 150000,
    },
    {
      customerId: 'cust-4',
      customerCode: 'CUS-AUF-021',
      customerName: 'Auto Fit',
      contactPerson: null,
      email: null,
      phone: null,
      mobile: null,
      paymentTerms: 'Standard',
      creditDays: 0,
      openOrderCount: 0,
      completedOrderCount: 1,
      cancelledOrderCount: 0,
      totalOrderedQty: 700,
      totalDispatchedQty: 700,
      totalPendingQty: 0,
      totalReadyPackedQty: 0,
      oldestReadyAgeDays: null,
      totalRemainingToPackQty: 0,
      totalOpenValue: 0,
      totalDispatchedValue: 70000,
      totalOrderValue: 70000,
    },
    {
      customerId: 'cust-5',
      customerCode: 'CUS-BFA-017',
      customerName: 'Baba Fareed Autos',
      contactPerson: null,
      email: null,
      phone: null,
      mobile: null,
      paymentTerms: 'Standard',
      creditDays: 0,
      openOrderCount: 0,
      completedOrderCount: 1,
      cancelledOrderCount: 0,
      totalOrderedQty: 600,
      totalDispatchedQty: 600,
      totalPendingQty: 0,
      totalReadyPackedQty: 0,
      oldestReadyAgeDays: null,
      totalRemainingToPackQty: 0,
      totalOpenValue: 0,
      totalDispatchedValue: 60000,
      totalOrderValue: 60000,
    },
    {
      customerId: 'cust-6',
      customerCode: 'CUS-SWA-019',
      customerName: 'Swabi Autos',
      contactPerson: null,
      email: null,
      phone: null,
      mobile: null,
      paymentTerms: 'Standard',
      creditDays: 0,
      openOrderCount: 0,
      completedOrderCount: 1,
      cancelledOrderCount: 0,
      totalOrderedQty: 260,
      totalDispatchedQty: 260,
      totalPendingQty: 0,
      totalReadyPackedQty: 0,
      oldestReadyAgeDays: null,
      totalRemainingToPackQty: 0,
      totalOpenValue: 0,
      totalDispatchedValue: 26000,
      totalOrderValue: 26000,
    },
  ],
  orders: [
    {
      id: 'so-1',
      orderNumber: 'SOC-2026-05801',
      customerId: 'cust-1',
      customerCode: 'CUS-ASA-005',
      customerName: 'ALI SHAH AUTOS',
      customerPo: 'PO-901',
      divisionId: DIV_SPD,
      divisionCode: 'DIV-SPD',
      divisionName: 'Spoke Division',
      orderDate: '2026-10-15',
      orderAgeDays: 38,
      deliveryDate: '2026-11-01',
      currency: 'PKR',
      status: 'Confirmed',
      category: 'PENDING' as const,
      paymentTerms: 'Net 30 Days',
      orderedQty: 1000,
      dispatchedQty: 300,
      pendingQty: 700,
      readyPackedQty: 250,
      readySinceDate: '2026-11-10',
      readyAgeDays: 12,
      remainingToPackQty: 450,
      subtotal: 100000,
      taxAmount: 18000,
      totalAmount: 118000,
      uomCode: 'GRS',
      items: [
        {
          id: 'soi-1',
          itemId: 'item-1',
          itemCode: 'SPI-FG-SPK-001',
          itemName: '250X17 Inn / Out Spoke Butted__225X17 Nipple',
          uomCode: 'GRS',
          ordered: 1000,
          dispatched: 300,
          pending: 700,
          readyPacked: 250,
          readySinceDate: '2026-11-10',
          readyAgeDays: 12,
          remainingToPack: 450,
          unitPrice: 100,
          discountPercent: 0,
          taxPercent: 18,
          taxAmount: 18000,
          lineTotal: 118000,
        },
      ],
      linkedDeliveries: [
        {
          deliveryId: 'dn-1',
          deliveryNumber: 'DN-2026-00010',
          gatePassNumber: 'GP-14701',
          deliveryDate: '2026-11-06',
          status: 'CONFIRMED',
          carrier: 'PWI Fleet',
          trackingNumber: null,
          dispatchedQty: 300,
          totalAmount: 35400,
        },
      ],
    },
    {
      id: 'so-ready',
      orderNumber: 'SOC-2026-05820',
      customerId: 'cust-1',
      customerCode: 'CUS-ASA-005',
      customerName: 'ALI SHAH AUTOS',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-SPD',
      divisionName: 'Spoke Division',
      orderDate: '2026-11-02',
      orderAgeDays: 20,
      deliveryDate: '2026-11-17',
      currency: 'PKR',
      status: 'Confirmed',
      category: 'PENDING' as const,
      paymentTerms: 'Net 30 Days',
      orderedQty: 120,
      dispatchedQty: 0,
      pendingQty: 120,
      readyPackedQty: 120,
      readySinceDate: '2026-11-04',
      readyAgeDays: 18,
      remainingToPackQty: 0,
      subtotal: 12000,
      taxAmount: 2160,
      totalAmount: 14160,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [],
    },
    {
      id: 'so-2',
      orderNumber: 'SOC-2026-05899',
      customerId: 'cust-1',
      customerCode: 'CUS-ASA-005',
      customerName: 'ALI SHAH AUTOS',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-SPD',
      divisionName: 'Spoke Division',
      orderDate: '2026-11-12',
      deliveryDate: '2026-11-20',
      currency: 'PKR',
      status: 'Delivered',
      category: 'COMPLETED' as const,
      paymentTerms: 'Net 30 Days',
      orderedQty: 500,
      dispatchedQty: 500,
      pendingQty: 0,
      readyPackedQty: 0,
      readySinceDate: null,
      readyAgeDays: null,
      remainingToPackQty: 0,
      subtotal: 50000,
      taxAmount: 9000,
      totalAmount: 59000,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [
        {
          deliveryId: 'dn-2',
          deliveryNumber: 'DN-2026-00011',
          gatePassNumber: 'GP-14702',
          deliveryDate: '2026-11-18',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 500,
          totalAmount: 59000,
        },
      ],
    },
    {
      id: 'so-cfp',
      orderNumber: 'SOC-2026-05819',
      customerId: 'cust-2',
      customerCode: 'CUS-CFP-001',
      customerName: 'CROWN FIT PAKISTAN',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-SPD',
      divisionName: 'Spoke Division',
      orderDate: '2026-10-21',
      deliveryDate: '2026-11-19',
      currency: 'PKR',
      status: 'Processing',
      category: 'PENDING' as const,
      paymentTerms: 'Net 15 Days',
      orderedQty: 5000,
      dispatchedQty: 3000,
      pendingQty: 2000,
      readyPackedQty: 0,
      readySinceDate: null,
      readyAgeDays: null,
      remainingToPackQty: 2000,
      subtotal: 500000,
      taxAmount: 90000,
      totalAmount: 590000,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [
        {
          deliveryId: 'dn-cfp-oct',
          deliveryNumber: 'DN-2026-00022',
          gatePassNumber: 'GP-14710',
          deliveryDate: '2026-10-27',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 3000,
          totalAmount: 300000,
        },
      ],
    },
    {
      id: 'so-ptl',
      orderNumber: 'SOC-2026-05644',
      customerId: 'cust-3',
      customerCode: 'CUS-PTL-002',
      customerName: 'Panther Tyres Ltd',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-SPD',
      divisionName: 'Spoke Division',
      orderDate: '2026-10-05',
      deliveryDate: '2026-10-25',
      currency: 'PKR',
      status: 'Delivered',
      category: 'COMPLETED' as const,
      paymentTerms: 'Standard',
      orderedQty: 1500,
      dispatchedQty: 1500,
      pendingQty: 0,
      readyPackedQty: 0,
      readySinceDate: null,
      readyAgeDays: null,
      remainingToPackQty: 0,
      subtotal: 150000,
      taxAmount: 27000,
      totalAmount: 177000,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [
        {
          deliveryId: 'dn-ptl',
          deliveryNumber: 'DN-2026-00018',
          gatePassNumber: 'GP-14705',
          deliveryDate: '2026-10-25',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 1500,
          totalAmount: 150000,
        },
      ],
    },
    {
      id: 'so-auf',
      orderNumber: 'SOC-2026-05827',
      customerId: 'cust-4',
      customerCode: 'CUS-AUF-021',
      customerName: 'Auto Fit',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-SPD',
      divisionName: 'Spoke Division',
      orderDate: '2026-11-13',
      deliveryDate: '2026-11-17',
      currency: 'PKR',
      status: 'Delivered',
      category: 'COMPLETED' as const,
      paymentTerms: 'Standard',
      orderedQty: 700,
      dispatchedQty: 700,
      pendingQty: 0,
      readyPackedQty: 0,
      readySinceDate: null,
      readyAgeDays: null,
      remainingToPackQty: 0,
      subtotal: 70000,
      taxAmount: 12600,
      totalAmount: 82600,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [
        {
          deliveryId: 'dn-auf',
          deliveryNumber: 'DN-2026-00037',
          gatePassNumber: 'GP-14737',
          deliveryDate: '2026-11-17',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 700,
          totalAmount: 70000,
        },
      ],
    },
    {
      id: 'so-bfa',
      orderNumber: 'SOC-2026-05822',
      customerId: 'cust-5',
      customerCode: 'CUS-BFA-017',
      customerName: 'Baba Fareed Autos',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-SPD',
      divisionName: 'Spoke Division',
      orderDate: '2026-11-02',
      deliveryDate: '2026-11-10',
      currency: 'PKR',
      status: 'Delivered',
      category: 'COMPLETED' as const,
      paymentTerms: 'Standard',
      orderedQty: 600,
      dispatchedQty: 600,
      pendingQty: 0,
      readyPackedQty: 0,
      readySinceDate: null,
      readyAgeDays: null,
      remainingToPackQty: 0,
      subtotal: 60000,
      taxAmount: 10800,
      totalAmount: 70800,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [
        {
          deliveryId: 'dn-bfa',
          deliveryNumber: 'DN-2026-00031',
          gatePassNumber: 'GP-14731',
          deliveryDate: '2026-11-10',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 600,
          totalAmount: 60000,
        },
      ],
    },
    {
      id: 'so-swa',
      orderNumber: 'SOC-2026-05826',
      customerId: 'cust-6',
      customerCode: 'CUS-SWA-019',
      customerName: 'Swabi Autos',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-SPD',
      divisionName: 'Spoke Division',
      orderDate: '2026-11-13',
      deliveryDate: '2026-11-17',
      currency: 'PKR',
      status: 'Delivered',
      category: 'COMPLETED' as const,
      paymentTerms: 'Standard',
      orderedQty: 260,
      dispatchedQty: 260,
      pendingQty: 0,
      readyPackedQty: 0,
      readySinceDate: null,
      readyAgeDays: null,
      remainingToPackQty: 0,
      subtotal: 26000,
      taxAmount: 4680,
      totalAmount: 30680,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [
        {
          deliveryId: 'dn-swa',
          deliveryNumber: 'DN-2026-00038',
          gatePassNumber: 'GP-14738',
          deliveryDate: '2026-11-17',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 260,
          totalAmount: 26000,
        },
      ],
    },
  ],
  generatedAt: '2026-11-22T08:00:00Z',
});

describe('orderCommandFilters.util (Pakistani Fiscal Year & Reconciled Order Load)', () => {
  it('defines all 8 presets using Pakistani Fiscal Year (Jul 1 - Jun 30) and resolves default Spoke Division', () => {
    const ref = new Date(2026, 10, 22); // 2026-11-22
    const options = getOrderCommandDatePresetOptions(ref);
    expect(options.map((o) => o.value)).toEqual([
      'thisMonth',
      'lastMonth',
      'thisQuarter',
      'lastQuarter',
      'thisYear',
      'lastYear',
      'allOpen',
      'custom',
    ]);
    expect(options.find((o) => o.value === 'thisQuarter')?.subtext).toBe('Q2 FY 2026–27 · Oct – Dec 2026');
    expect(options.find((o) => o.value === 'lastQuarter')?.subtext).toBe('Q1 FY 2026–27 · Jul – Sep 2026');
    expect(options.find((o) => o.value === 'thisYear')?.subtext).toBe('FY 2026–27 · Jul 2026 – Jun 2027');
    expect(options.find((o) => o.value === 'lastYear')?.subtext).toBe('FY 2025–26 · Jul 2025 – Jun 2026');

    expect(resolveOrderCommandDateRange('thisQuarter', undefined, ref)).toEqual({
      dateFrom: '2026-10-01',
      dateTo: '2026-12-31',
    });
    expect(resolveOrderCommandDateRange('lastQuarter', undefined, ref)).toEqual({
      dateFrom: '2026-07-01',
      dateTo: '2026-09-30',
    });
    expect(resolveOrderCommandDateRange('thisYear', undefined, ref)).toEqual({
      dateFrom: '2026-07-01',
      dateTo: '2027-06-30',
    });
    expect(resolveOrderCommandDateRange('lastYear', undefined, ref)).toEqual({
      dateFrom: '2025-07-01',
      dateTo: '2026-06-30',
    });

    const oct = resolveOrderCommandDateRange('lastMonth', undefined, ref);
    expect(oct).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    expect(getOrderCommandDateBadge('lastMonth', oct.dateFrom, oct.dateTo)).toBe(
      'Last Month Sales & Orders (Oct 2026)',
    );
    expect(getOrderCommandDateBadge('thisQuarter', '2026-10-01', '2026-12-31')).toBe(
      'Q2 FY 2026–27 (Oct – Dec 2026)',
    );

    const defDiv = findDefaultOrderCommandDivision(buildMockPayload().divisions);
    expect(defDiv?.id).toBe(DIV_SPD);
  });

  it('reconciles Total Order Load (Opening Pending + New in Period) - Dispatched = Pending Order Balance across periods', () => {
    const q1Order = {
      id: 'so-q1',
      orderNumber: 'SOC-2026-05815',
      customerId: 'cust-1',
      customerCode: 'CUS-ASA-005',
      customerName: 'ALI SHAH AUTOS',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-001-SPI',
      divisionName: 'Spoke Division',
      orderDate: '2026-09-28',
      deliveryDate: '2026-10-31',
      currency: 'PKR',
      status: 'Processing',
      category: 'PENDING' as const,
      paymentTerms: 'Standard',
      orderedQty: 48597.28,
      dispatchedQty: 15000,
      pendingQty: 33597.28,
      readyPackedQty: 1000,
      readySinceDate: '2026-11-10',
      readyAgeDays: 12,
      remainingToPackQty: 32597.28,
      subtotal: 1000000,
      taxAmount: 180000,
      totalAmount: 1180000,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [
        {
          deliveryId: 'dn-oct',
          deliveryNumber: 'DN-2026-00021',
          gatePassNumber: 'GP-14721',
          deliveryDate: '2026-10-26',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 15000,
          totalAmount: 300000,
        },
      ],
    };
    const q2Order = {
      id: 'so-q2',
      orderNumber: 'SOC-2026-05819',
      customerId: 'cust-2',
      customerCode: 'CUS-CFP-001',
      customerName: 'CROWN FIT PAKISTAN',
      customerPo: null,
      divisionId: DIV_SPD,
      divisionCode: 'DIV-001-SPI',
      divisionName: 'Spoke Division',
      orderDate: '2026-10-21',
      deliveryDate: '2026-11-19',
      currency: 'PKR',
      status: 'Delivered',
      category: 'COMPLETED' as const,
      paymentTerms: 'Standard',
      orderedQty: 48007.74,
      dispatchedQty: 36703.6,
      pendingQty: 0,
      readyPackedQty: 0,
      readySinceDate: null,
      readyAgeDays: null,
      remainingToPackQty: 0,
      subtotal: 1000000,
      taxAmount: 180000,
      totalAmount: 1180000,
      uomCode: 'GRS',
      items: [],
      linkedDeliveries: [
        {
          deliveryId: 'dn-q2-1',
          deliveryNumber: 'DN-2026-00022',
          gatePassNumber: 'GP-14722',
          deliveryDate: '2026-10-27',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 20283.48,
          totalAmount: 400000,
        },
        {
          deliveryId: 'dn-q2-2',
          deliveryNumber: 'DN-2026-00041',
          gatePassNumber: 'GP-14741',
          deliveryDate: '2026-11-19',
          status: 'CONFIRMED',
          carrier: null,
          trackingNumber: null,
          dispatchedQty: 16420.12,
          totalAmount: 350000,
        },
      ],
    };

    const q2Kpis = computeOrderCommandKpis([q1Order, q2Order], {
      preset: 'thisQuarter',
      dateFrom: '2026-10-01',
      dateTo: '2026-12-31',
      divisionId: DIV_SPD,
    });

    // Opening Pending (Q1): 48,597.28 + New in Q2: 48,007.74 = 96,605.02 Total Order Load
    // Dispatched in Q2: 15,000 + 20,283.48 + 16,420.12 = 51,703.60
    // Pending Balance = 96,605.02 - 51,703.60 = 44,901.42 (>= 0, Load >= Dispatched!)
    expect(q2Kpis.openingPendingGross).toBe(48597.28);
    expect(q2Kpis.newInPeriodGross).toBe(48007.74);
    expect(q2Kpis.totalOrderLoad).toBe(96605.02);
    expect(q2Kpis.dispatched).toBe(51703.6);
    expect(q2Kpis.pendingOrderBalance).toBe(44901.42);
    expect(q2Kpis.totalOrderLoad - q2Kpis.dispatched).toBeCloseTo(q2Kpis.pendingOrderBalance, 2);
    expect(q2Kpis.readyPacked).toBe(1000);
    expect(q2Kpis.remainingToPack).toBe(43901.42);
    expect(q2Kpis.periodShortTag).toBe('Q2');
  });

  it('ranks Top 5 Customers dynamically by date range & division', () => {
    const payload = buildMockPayload();
    const topAll = buildTopCustomersForCommand(payload.orders as any, {
      preset: 'allOpen',
      limit: 5,
    });
    expect(topAll).toHaveLength(5);
    expect(topAll[0]).toMatchObject({ customerName: 'CROWN FIT PAKISTAN', rank: 1, soldGrs: 3000 });
    expect(topAll[1]).toMatchObject({ customerName: 'Panther Tyres Ltd', rank: 2, soldGrs: 1500 });
    expect(topAll[2]).toMatchObject({ customerName: 'ALI SHAH AUTOS', rank: 3, soldGrs: 800 });

    const topNov = buildTopCustomersForCommand(payload.orders as any, {
      preset: 'thisMonth',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-22',
      limit: 5,
    });
    expect(topNov.map((c) => c.customerName)).toEqual([
      'ALI SHAH AUTOS',
      'Auto Fit',
      'Baba Fareed Autos',
      'Swabi Autos',
    ]);
    expect(topNov[0]).toMatchObject({ customerName: 'ALI SHAH AUTOS', soldGrs: 800, rank: 1 });
    expect(topNov[1]).toMatchObject({ customerName: 'Auto Fit', soldGrs: 700, orderedGrs: 700, rank: 2 });

    const topOct = buildTopCustomersForCommand(payload.orders as any, {
      preset: 'lastMonth',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      limit: 5,
    });
    expect(topOct[0]).toMatchObject({ customerName: 'CROWN FIT PAKISTAN', soldGrs: 3000, rank: 1 });
    expect(topOct[1]).toMatchObject({ customerName: 'Panther Tyres Ltd', soldGrs: 1500, rank: 2 });

    const topCcd = buildTopCustomersForCommand(payload.orders as any, {
      preset: 'allOpen',
      divisionId: DIV_CCD,
      limit: 5,
    });
    expect(topCcd).toEqual([]);
  });
});

describe('OrderCommandFulfillment', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('min-width'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (apiService.get as jest.Mock).mockResolvedValue({
      success: true,
      data: buildMockPayload(),
    });
  });

  it('defaults to Spoke Division + This Month, renders reconciled KPIs, Top 5 Customers strip, 4 left panel groups, and Click-to-Filter Customer 360', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/order-command']}>
        <OrderCommandFulfillment />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('SOC-2026-05801').length).toBeGreaterThan(0);
    });

    // Defaults to DIV-001-SPI Spoke Division chip & This Month preset
    expect(screen.getByText(/DIV-001-SPI Spoke Division/)).toBeInTheDocument();
    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-total-order-load')).toHaveTextContent(/Opening Pending:/i);

    // Top 5 Customers Strip (#1 to #4 active in Nov 2026)
    expect(screen.getByText('Top 5 Customers')).toBeInTheDocument();
    expect(screen.getByTestId('order-command-date-badge')).toHaveTextContent(
      'November 2026 Sales & Orders',
    );
    expect(screen.getByTestId('top-command-customer-card-1')).toHaveTextContent('ALI SHAH AUTOS');
    expect(screen.getByTestId('top-command-customer-card-2')).toHaveTextContent('Auto Fit');

    // Select pending order explicitly so SOC Inspector shows its full item table
    fireEvent.click(screen.getAllByText('SOC-2026-05801')[0]);

    // KPI oldest waiting badge, Order Age, Ready duration, & all 4 left panel group headers
    expect(screen.getByText('Up to 18d waiting')).toBeTruthy();
    expect(screen.getAllByText('Order Age: 38d').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Ready 12d').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Ready to Dispatch Orders')).toBeTruthy();
    expect(screen.getByText('Pending / Awaiting Packing')).toBeTruthy();
    expect(screen.getByText('Completed / Closed Orders')).toBeTruthy();
    expect(screen.getByText('Cancelled Orders')).toBeTruthy();

    // SOC Inspector item split + Gate Pass visibility
    expect(screen.getByText('250X17 Inn / Out Spoke Butted')).toBeTruthy();
    expect(screen.getByText('225X17 Nipple')).toBeTruthy();
    expect(screen.getByText('GP-14701')).toBeTruthy();

    // Collapsible Dashboard-Style Filters drawer toggles open/closed and shows Apply / Reset
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    expect(screen.getByPlaceholderText('Search SOC #, Customer, Item Code...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply Filters/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Close Filters/i }));

    // Interactive Click-to-Filter on Top #1 Customer card (ALI SHAH AUTOS):
    // filters left panel AND opens Customer 360 Portfolio View immediately
    fireEvent.click(screen.getByTestId('top-command-customer-card-1'));
    expect(screen.getByText(/Customer Sales Orders \(3\)/i)).toBeTruthy();
    expect(screen.getByText(/Oldest Ready: 18d waiting/i)).toBeTruthy();
    expect(screen.getByText('Show All Customers')).toBeInTheDocument();

    // Clear all clears Division & Customer filter chips cleanly
    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(screen.queryByText(/DIV-001-SPI Spoke Division/)).not.toBeInTheDocument();
  });
});
