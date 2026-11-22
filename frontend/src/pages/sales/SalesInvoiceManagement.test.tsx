import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import SalesInvoiceManagement from './SalesInvoiceManagement';
import apiService from '../../services/api';
import { printInvoiceDocument } from '../../utils/printTemplates';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../utils/printTemplates', () => ({
  __esModule: true,
  printInvoiceDocument: jest.fn(),
  printPaymentReceiptVoucher: jest.fn(),
  printTableList: jest.fn(),
}));

const mockedApi = apiService as jest.Mocked<typeof apiService>;
const mockedPrintInvoice = printInvoiceDocument as jest.Mock;

const SAMPLE_INVOICE_ZERO_TAX = {
  id: 'inv-6',
  invoiceNo: 'SI-2026-00006',
  documentType: 'Tax Invoice',
  salesDeliveryId: 'dn-6',
  deliveryNumber: 'DN-2026-00006',
  gatePassNumber: 'GP-14709',
  customerId: 'cust-1',
  customer: {
    id: 'cust-1',
    customerCode: 'CUS-ASA-005',
    companyName: 'ALI SHAH AUTOS',
    phone: '03001234567',
  },
  invoiceDate: '2026-11-22',
  dueDate: '2026-11-22',
  paymentTerms: 'Cash / Immediate',
  subtotal: 400000,
  taxAmount: 0,
  totalAmount: 400000,
  paidAmount: 0,
  balance: 400000,
  status: 'Pending',
  items: [],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <AntdApp>
        <SalesInvoiceManagement />
      </AntdApp>
    </MemoryRouter>,
  );

describe('SalesInvoiceManagement mandatory pre-action confirmation', () => {
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
    window.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockImplementation(async (url: string) => {
      if (url === '/customers' || url === '/sales/customers') {
        return {
          data: [
            {
              id: 'cust-1',
              customerCode: 'CUS-ASA-005',
              companyName: 'ALI SHAH AUTOS',
              name: 'ALI SHAH AUTOS',
            },
          ],
        } as any;
      }
      if (url === '/sales/invoices') {
        return {
          data: [SAMPLE_INVOICE_ZERO_TAX],
          total: 1,
          statusCounts: { all: 1, pending: 1, partial: 0, paid: 0, cancelled: 0 },
        } as any;
      }
      if (url === '/sales/invoices/inv-6') {
        return { data: SAMPLE_INVOICE_ZERO_TAX } as any;
      }
      if (url === '/sales/receipts/bank-accounts') {
        return { data: [] } as any;
      }
      return { data: [] } as any;
    });
    mockedApi.patch.mockResolvedValue({ data: {} } as any);
    mockedApi.delete.mockResolvedValue({ data: {} } as any);
    jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires explicit confirmation before every action icon executes and shows zero-tax warning on Approve / Post', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('SI-2026-00006')).toBeInTheDocument();
    });

    const actionButtons = Array.from(container.querySelectorAll('.inv-actions-group .inv-action-btn'));
    expect(actionButtons.length).toBe(9);

    const expectedCases = [
      { idx: 0, expectedTitle: 'Confirm View & Inspect Invoice' },
      { idx: 1, expectedTitle: 'Confirm Print Tax Invoice' },
      { idx: 2, expectedTitle: 'Confirm Approve & Post Invoice', expectZeroTaxWarning: true },
      { idx: 3, expectedTitle: 'Confirm Record Payment' },
      { idx: 4, expectedTitle: 'Confirm Send Email' },
      { idx: 5, expectedTitle: 'Confirm Send WhatsApp' },
      { idx: 6, expectedTitle: 'Confirm Edit Invoice' },
      { idx: 7, expectedTitle: 'Confirm Cancel Invoice' },
      { idx: 8, expectedTitle: 'Confirm Delete Invoice' },
    ];

    for (const tc of expectedCases) {
      fireEvent.click(actionButtons[tc.idx]);

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(tc.expectedTitle)).toBeInTheDocument();
      expect(within(dialog).getByText('SI-2026-00006')).toBeInTheDocument();
      expect(within(dialog).getByText(/DN-2026-00006/)).toBeInTheDocument();
      expect(within(dialog).getByText(/GP-14709/)).toBeInTheDocument();
      expect(within(dialog).getByText('CUS-ASA-005')).toBeInTheDocument();
      expect(within(dialog).getByText('ALI SHAH AUTOS')).toBeInTheDocument();
      expect(within(dialog).getByText('Cancel')).toBeInTheDocument();
      expect(within(dialog).getByText('Confirm & Proceed')).toBeInTheDocument();

      if (tc.expectZeroTaxWarning) {
        expect(
          within(dialog).getByText(
            'Tax is currently Rs 0 (0%). Are you sure you want to post this invoice without 18% Tax?',
          ),
        ).toBeInTheDocument();
      } else {
        expect(
          within(dialog).queryByText(
            'Tax is currently Rs 0 (0%). Are you sure you want to post this invoice without 18% Tax?',
          ),
        ).not.toBeInTheDocument();
      }

      // Clicking Cancel closes cleanly with zero mutations or external side effects
      fireEvent.click(within(dialog).getByText('Cancel'));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    }

    expect(mockedApi.patch).not.toHaveBeenCalled();
    expect(mockedApi.delete).not.toHaveBeenCalled();
    expect(mockedPrintInvoice).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();

    // Now confirm Approve / Post -> executes PATCH /sales/invoices/inv-6/post
    fireEvent.click(actionButtons[2]);
    const postDialog = await screen.findByRole('dialog');
    fireEvent.click(within(postDialog).getByText('Confirm & Proceed'));

    await waitFor(() => {
      expect(mockedApi.patch).toHaveBeenCalledWith('/sales/invoices/inv-6/post', {});
    });
  }, 20000);
});
