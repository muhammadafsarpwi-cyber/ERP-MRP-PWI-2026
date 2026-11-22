import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import CustomerPayments from './CustomerPayments';
import {
  buildAllocationsPayload,
  capAllocationsToReceiptAmount,
  computeAllocationSummary,
  computeFifoAllocations,
  computeMaxRowAllocation,
  extractCustomerOrderOptions,
  extractCustomerPoOptions,
  filterCustomersByDivision,
  resolveDefaultDepositAccountId,
  resolveDivisionUuid,
  resolveInvoiceSocAndPo,
  resolvePoForSoc,
} from './customerReceiptUtils';
import { printPaymentReceiptVoucher } from '../../utils/printTemplates';
import apiService from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedApi = apiService as jest.Mocked<typeof apiService>;

describe('customerReceiptUtils & Customer Payment Receipt Voucher', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('allocates receipt amount FIFO across multiple open invoices and leaves overpayment as unallocated advance', () => {
    const res = computeFifoAllocations(
      [
        { id: 'inv-1', invoiceNo: 'SI-2026-00001', balance: 150000 },
        { id: 'inv-2', invoiceNo: 'SI-2026-00002', balance: 250000 },
      ],
      450000,
    );

    expect(res.amount).toBe(450000);
    expect(res.allocationMap).toEqual({
      'inv-1': 150000,
      'inv-2': 250000,
    });
    expect(res.allocatedTotal).toBe(400000);
    expect(res.unallocatedAdvance).toBe(50000);
  });

  it('supports partial settlement across open invoices in chronological order', () => {
    const res = computeFifoAllocations(
      [
        { id: 'inv-1', balance: 120000 },
        { id: 'inv-2', balance: 300000 },
      ],
      200000,
    );

    expect(res.allocationMap).toEqual({
      'inv-1': 120000,
      'inv-2': 80000,
    });
    expect(res.allocatedTotal).toBe(200000);
    expect(res.unallocatedAdvance).toBe(0);
  });

  it('auto-calculates full open balance when receiptAmount is zero', () => {
    const res = computeFifoAllocations(
      [
        { id: 'inv-1', balance: 472000 },
        { id: 'inv-2', balance: 1100000 },
      ],
      0,
    );

    expect(res.amount).toBe(1572000);
    expect(res.allocatedTotal).toBe(1572000);
    expect(res.unallocatedAdvance).toBe(0);
  });

  it('caps existing invoice allocations strictly when receiptAmount drops (e.g. 1,572,000 -> 200,000)', () => {
    const openInvoices = [
      { id: 'inv-1', balance: 472000 },
      { id: 'inv-2', balance: 1100000 },
    ];
    const capped = capAllocationsToReceiptAmount(
      openInvoices,
      { 'inv-1': 472000, 'inv-2': 1100000 },
      200000,
    );

    expect(capped).toEqual({ 'inv-1': 200000 });
    const summary = computeAllocationSummary(200000, capped);
    expect(summary.allocatedTotal).toBe(200000);
    expect(summary.exceedsReceipt).toBe(false);
    expect(summary.unallocatedAdvance).toBe(0);

    expect(capAllocationsToReceiptAmount(openInvoices, { 'inv-1': 200000 }, 0)).toEqual({});
  });

  it('caps per-row max allowable allocation so allocated total never exceeds receipt amount', () => {
    expect(computeMaxRowAllocation(472000, 200000, {}, 'inv-1')).toBe(200000);
    expect(computeMaxRowAllocation(1100000, 200000, { 'inv-1': 150000 }, 'inv-2')).toBe(50000);
    expect(computeMaxRowAllocation(472000, 0, {}, 'inv-1')).toBe(0);
  });

  it('filters customers cleanly by division and auto-syncs Cash/Bank GL deposit accounts', () => {
    const customers = [
      { id: 'c1', name: 'ALI SHAH AUTOS', divisionId: 'div-spoke' },
      { id: 'c2', name: 'SHEET BUYER', divisionId: 'div-sheet' },
    ];
    expect(filterCustomersByDivision(customers, 'div-spoke').map((c) => c.id)).toEqual(['c1']);
    expect(filterCustomersByDivision(customers, undefined).map((c) => c.id)).toEqual(['c1', 'c2']);

    const accounts = [
      { id: 'acc-cash', accountCode: '1000', accountName: 'Cash' },
      { id: 'acc-bank', accountCode: '1010', accountName: 'Bank - HBL Main' },
      { id: 'acc-chq', accountCode: '1020', accountName: 'Cheques in Hand (Uncleared)' },
    ];
    expect(resolveDefaultDepositAccountId('CASH', accounts)).toBe('acc-cash');
    expect(resolveDefaultDepositAccountId('BANK_TRANSFER', accounts)).toBe('acc-bank');
    expect(resolveDefaultDepositAccountId('CHEQUE', accounts)).toBe('acc-bank');
    expect(resolveDefaultDepositAccountId('ONLINE', accounts)).toBe('acc-bank');

    const divisions = [
      { id: 'd1000000-0000-0000-0000-000000000001', divisionCode: 'DIV-001-SPI', name: 'Spoke Division' },
      { id: 'd2000000-0000-0000-0000-000000000002', divisionCode: 'DIV-002-SHT', name: 'Sheet Division' },
    ];
    expect(resolveDivisionUuid('d1000000-0000-0000-0000-000000000001', divisions)).toBe('d1000000-0000-0000-0000-000000000001');
    expect(resolveDivisionUuid('Spoke Division', divisions)).toBe('d1000000-0000-0000-0000-000000000001');
    expect(resolveDivisionUuid('DIV-002-SHT', divisions)).toBe('d2000000-0000-0000-0000-000000000002');
    expect(resolveDivisionUuid('Unknown Division', divisions)).toBeUndefined();
  });

  it('extracts customer-strict SOC & PO dropdown options and auto-syncs PO from SOC or allocated invoice', () => {
    const customerOrders = [
      {
        id: 'so-1',
        orderNumber: 'SOC-2026-5810',
        orderDate: '2026-11-10',
        divisionName: 'Spoke Division',
        customerPo: 'PO-CFP-2026-09',
        totalAmount: 550000,
        status: 'Confirmed',
      },
      {
        id: 'so-2',
        orderNumber: 'SOC-2026-5814',
        orderDate: '2026-11-18',
        divisionName: 'Spoke Division',
        customerPo: 'PO-CFP-2026-12',
        totalAmount: 240000,
        status: 'Processing',
      },
    ];
    const openInvoices = [
      { id: 'inv-5', invoiceNo: 'SI-2026-00005', balance: 550000, socNumber: 'SOC-2026-5810' },
    ];

    const socOpts = extractCustomerOrderOptions(customerOrders, openInvoices);
    expect(socOpts.map((o) => o.orderNumber)).toEqual(['SOC-2026-5810', 'SOC-2026-5814']);

    const poOpts = extractCustomerPoOptions(customerOrders, ['PO-CFP-2026-09'], openInvoices);
    expect(poOpts).toEqual(['PO-CFP-2026-09', 'PO-CFP-2026-12']);

    expect(resolvePoForSoc('SOC-2026-5810', customerOrders, openInvoices)).toBe('PO-CFP-2026-09');
    expect(resolveInvoiceSocAndPo(openInvoices[0], customerOrders)).toEqual({
      socNumber: 'SOC-2026-5810',
      customerPo: 'PO-CFP-2026-09',
    });
  });

  it('flags allocation exceeding receipt amount and formats clean API payload', () => {
    const over = computeAllocationSummary(100000, { 'inv-1': 60000, 'inv-2': 50000 });
    expect(over.exceedsReceipt).toBe(true);
    expect(over.allocatedTotal).toBe(110000);

    const payload = buildAllocationsPayload({ 'inv-1': 60000, 'inv-2': 0, 'inv-3': 39999.994 });
    expect(payload).toEqual([
      { salesInvoiceId: 'inv-1', allocatedAmount: 60000 },
      { salesInvoiceId: 'inv-3', allocatedAmount: 39999.99 },
    ]);
  });

  it('renders Official Payment Receipt Voucher HTML with PWI Karachi address and invoice allocations', () => {
    let writtenHtml = '';
    const originalCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: any) => {
      const el = originalCreate(tagName, options) as any;
      if (tagName.toLowerCase() === 'iframe') {
        const docMock = {
          open: jest.fn(),
          write: jest.fn((html: string) => {
            writtenHtml = html;
          }),
          close: jest.fn(),
          images: [],
        };
        Object.defineProperty(el, 'contentWindow', {
          value: { document: docMock, focus: jest.fn(), print: jest.fn() },
          configurable: true,
        });
      }
      return el;
    });

    printPaymentReceiptVoucher({
      receiptNumber: 'RCV-2026-00001',
      receiptDate: '2026-11-22',
      paymentMode: 'BANK_TRANSFER',
      receiptType: 'INVOICE_PAYMENT',
      amount: 500000,
      allocatedAmount: 472000,
      unallocatedAdvanceAmount: 28000,
      clearanceStatus: 'CLEARED',
      referenceNo: 'IBFT-998877',
      customer: {
        customerCode: 'CUS-ASA-005',
        companyName: 'ALI SHAH AUTOS',
      },
      allocations: [
        {
          invoiceNo: 'SI-2026-00004',
          invoiceDate: '2026-11-22',
          allocatedAmount: 472000,
        },
      ],
    });

    expect(writtenHtml).toContain('PAYMENT RECEIPT VOUCHER');
    expect(writtenHtml).toContain('RCV-2026-00001');
    expect(writtenHtml).toContain('ALI SHAH AUTOS');
    expect(writtenHtml).toContain('SI-2026-00004');
    expect(writtenHtml).toContain('Plot 179, Block E, SITE Superhighway');
    expect(writtenHtml).toContain('Unallocated Advance Balance:');
  });
});

describe('CustomerPayments Voucher Centered Draggable Modal & Pre-Post Confirmation', () => {
  beforeAll(() => {
    window.matchMedia =
      window.matchMedia ||
      ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      } as any));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockImplementation(async (url: string) => {
      if (url === '/customer/customers') {
        return {
          data: [
            { id: 'cust-1', customerCode: 'CUS-ASA-005', name: 'ALI SHAH AUTOS', divisionId: 'div-1' },
            { id: 'cust-2', customerCode: 'CUS-SH-001', name: 'SHEET HOUSE', divisionId: 'div-2' },
          ],
        } as any;
      }
      if (url === '/divisions') {
        return {
          data: [
            { id: 'div-1', name: 'Spoke Division' },
            { id: 'div-2', name: 'Sheet Division' },
          ],
        } as any;
      }
      if (url === '/sales/receipts/bank-accounts') {
        return {
          data: [
            { id: 'acc-cash', accountCode: '1000', accountName: 'Cash' },
            { id: 'acc-bank', accountCode: '1010', accountName: 'Bank - HBL' },
          ],
        } as any;
      }
      if (url === '/sales/receipts') {
        return {
          data: [],
          total: 0,
          kpis: { totalReceipts: 0, totalCollected: 0, totalAllocated: 0, unallocatedAdvances: 0, pendingClearance: 0 },
        } as any;
      }
      if (url === '/sales/receipts/customer/cust-1/open-invoices') {
        return {
          data: {
            customer: {
              id: 'cust-1',
              customerCode: 'CUS-ASA-005',
              companyName: 'ALI SHAH AUTOS',
              divisionId: 'div-1',
              paymentTerms: 'Cash / Immediate',
            },
            openInvoices: [
              { id: 'inv-1', invoiceNo: 'SI-2026-00004', invoiceDate: '2026-11-22', dueDate: '2026-11-22', socNumber: 'SOC-2026-5810', customerPo: 'PO-CFP-2026-09', totalAmount: 472000, balance: 472000, daysOverdue: 0 },
              { id: 'inv-2', invoiceNo: 'SI-2026-00006', invoiceDate: '2026-11-22', dueDate: '2026-11-22', socNumber: 'SOC-2026-5814', customerPo: 'PO-CFP-2026-12', totalAmount: 1100000, balance: 1100000, daysOverdue: 0 },
            ],
            customerOrders: [
              { id: 'so-1', orderNumber: 'SOC-2026-5810', orderDate: '2026-11-10', divisionName: 'Spoke Division', customerPo: 'PO-CFP-2026-09', totalAmount: 472000, status: 'Confirmed' },
              { id: 'so-2', orderNumber: 'SOC-2026-5814', orderDate: '2026-11-18', divisionName: 'Spoke Division', customerPo: 'PO-CFP-2026-12', totalAmount: 1100000, status: 'Processing' },
            ],
            customerPos: ['PO-CFP-2026-09', 'PO-CFP-2026-12'],
            availableAdvances: [],
            summary: { netReceivableBalance: 1572000, unadjustedAdvanceBalance: 0, aging: { totalOpenBalance: 1572000 } },
          },
        } as any;
      }
      return { data: [] } as any;
    });
    mockedApi.post.mockResolvedValue({
      data: {
        id: 'rcpt-1',
        customerId: 'cust-1',
        receiptNumber: 'RCV-2026-00001',
        receiptDate: '2026-11-22',
        customerCode: 'CUS-CFP-001',
        customerName: 'CROWN FIT PAKISTAN',
        divisionName: 'Spoke Division',
        paymentMode: 'BANK_TRANSFER',
        clearanceStatus: 'CLEARED',
        bankAccountName: 'Bank - HBL',
        journalNumber: 'JV-AUTO-000015',
        amount: 1572000,
        unallocatedAdvanceAmount: 0,
        allocations: [
          {
            id: 'alloc-1',
            invoiceNo: 'SI-2026-00005',
            allocationDate: '2026-11-22',
            allocationType: 'DIRECT',
            allocatedAmount: 1572000,
            status: 'POSTED',
          },
        ],
      },
    } as any);
  });

  it('opens Executive Draggable Modal with step pills, 3-column tinted cards, customer-filtered SOC/PO auto-fill, capped allocation math, and Pre-Post Confirmation Card', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/receipts?customerId=cust-1&action=record']}>
        <AntdApp>
          <CustomerPayments />
        </AntdApp>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('ACCOUNTS RECEIVABLE · VOUCHER ENTRY')).toBeInTheDocument();
    expect(within(dialog).getByText('Drag to Move')).toBeInTheDocument();
    expect(within(dialog).getByText('Record Customer Payment / Advance Voucher')).toBeInTheDocument();

    // Header interactive step tracker pills
    expect(within(dialog).getByText('1 Customer & Area')).toBeInTheDocument();
    expect(within(dialog).getByText('2 Payment & Mode')).toBeInTheDocument();
    expect(within(dialog).getByText('3 Invoice Allocation')).toBeInTheDocument();

    // 3-column side-by-side tinted cards
    expect(dialog.querySelector('.pwi-voucher-cards-grid')).toBeInTheDocument();
    expect(within(dialog).getByText('Customer & Division')).toBeInTheDocument();
    expect(within(dialog).getByText('Date & Payment Mode')).toBeInTheDocument();
    expect(within(dialog).getByText('Amount & Order Reference')).toBeInTheDocument();

    // Window controls (Minimize, Maximize, Close) from DraggableResizableModal
    expect(dialog.querySelectorAll('.erp-modal-action-btn').length).toBeGreaterThanOrEqual(3);

    // Single-line uniform labels & field ordering (Division before Customer before Receipt Date)
    const divisionLabel = within(dialog).getByText('Division');
    const customerLabel = within(dialog).getByText('Customer');
    const dateLabel = within(dialog).getByText('Receipt Date');
    expect(divisionLabel.compareDocumentPosition(customerLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(customerLabel.compareDocumentPosition(dateLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(dialog).getByText('Receipt Type')).toBeInTheDocument();
    expect(within(dialog).getByText('Payment Mode')).toBeInTheDocument();
    expect(within(dialog).getByText('Deposit Account (GL)')).toBeInTheDocument();
    expect(within(dialog).getByText('Receipt Amount (PKR)')).toBeInTheDocument();

    // Open invoices loaded; Settle All Open Invoices sets Receipt Amount = 1,572,000 and auto-fills SOC # & Customer PO #
    await waitFor(() => {
      expect(within(dialog).getByText('SI-2026-00004')).toBeInTheDocument();
      expect(within(dialog).getByText('SI-2026-00006')).toBeInTheDocument();
    });

    fireEvent.click(within(dialog).getByText('Settle All Open Invoices'));
    await waitFor(() => {
      expect(within(dialog).getAllByText(/1,572,000/).length).toBeGreaterThanOrEqual(2);
    });

    // Click POST RECEIPT VOUCHER -> must open Pre-Post Confirmation Card before calling POST /sales/receipts
    fireEvent.click(within(dialog).getByText(/POST RECEIPT VOUCHER/i));

    await waitFor(() => {
      expect(screen.getByText('Confirm & Post Receipt Voucher')).toBeInTheDocument();
    });
    expect(mockedApi.post).not.toHaveBeenCalled();

    // Confirm & Post Voucher triggers POST /sales/receipts with auto-filled SOC # & PO #
    fireEvent.click(screen.getByText('Confirm & Post Voucher'));
    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/sales/receipts',
        expect.objectContaining({
          customerId: 'cust-1',
          amount: 1572000,
          socNumber: 'SOC-2026-5810',
          poReference: 'PO-CFP-2026-09',
        }),
      );
    });

    // Receipt Voucher Detail Modal opens with stacked Customer Code pill & non-wrapping codes
    await waitFor(() => {
      expect(screen.getByText('JV-AUTO-000015')).toBeInTheDocument();
      expect(screen.getByText('CUS-CFP-001')).toBeInTheDocument();
      expect(screen.getByText('CROWN FIT PAKISTAN')).toBeInTheDocument();
      expect(screen.getByText('SI-2026-00005')).toBeInTheDocument();
    });
    expect(screen.getByText('CUS-CFP-001').style.whiteSpace).toBe('nowrap');
    expect(screen.getByText('JV-AUTO-000015').style.whiteSpace).toBe('nowrap');
    expect(screen.getByText('SI-2026-00005').style.whiteSpace).toBe('nowrap');
    expect(screen.getByText('Open Customer Ledger')).toBeInTheDocument();
  }, 20000);
});
