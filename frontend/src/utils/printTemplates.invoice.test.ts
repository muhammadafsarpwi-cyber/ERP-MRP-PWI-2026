import { printInvoiceDocument } from './printTemplates';

describe('printInvoiceDocument', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  const capturePrintedHtml = (run: () => void): string => {
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
    run();
    return writtenHtml;
  };

  it('prints official Karachi PWI Sales Tax Invoice without legacy Lahore/SGST/CGST/GSTIN labels', () => {
    const writtenHtml = capturePrintedHtml(() => {
      printInvoiceDocument({
        invoiceNo: 'SI-2026-00004',
        invoiceDate: '2026-11-22',
        dueDate: '2026-12-07',
        paymentTerms: 'Net 15 Days',
        divisionName: 'Spoke Division',
        deliveryNumber: 'DN-2026-00002',
        gatePassNumber: 'GP-14705',
        socNumber: 'SOC-2026-05813',
        status: 'Pending',
        subtotal: 400000,
        taxAmount: 72000,
        totalAmount: 472000,
        paidAmount: 0,
        balance: 472000,
        customer: {
          customerCode: 'CUS-ASA-005',
          companyName: 'ALI SHAH AUTOS',
          addressLine1: 'Badami Bagh Auto Market',
          city: 'Lahore',
          phone: '0300-1234567',
          taxNumber: '1234567-8',
        },
        items: [
          {
            itemCode: 'SPI-FG-SPK-003',
            product: '250X18 Inn / Out Spoke Butted',
            socNumber: 'SOC-2026-05813',
            quantity: 200,
            uom: 'GRS',
            rate: 1000,
            taxableAmount: 200000,
            gstRate: 18,
            gstAmount: 36000,
            amount: 236000,
          },
        ],
      });
    });

    expect(writtenHtml).toContain('Plot 179, Block E, SITE Superhighway, Karachi, Pakistan');
    expect(writtenHtml).toContain('SALES TAX INVOICE');
    expect(writtenHtml).toContain('SI-2026-00004');
    expect(writtenHtml).toContain('DN-2026-00002');
    expect(writtenHtml).toContain('GP-14705');
    expect(writtenHtml).toContain('SOC-2026-05813');
    expect(writtenHtml).toContain('Spoke Division');
    expect(writtenHtml).toContain('CUS-ASA-005');
    expect(writtenHtml).toContain('SPI-FG-SPK-003');
    expect(writtenHtml).toContain('18%');
    expect(writtenHtml).not.toContain('SGST');
    expect(writtenHtml).not.toContain('CGST');
    expect(writtenHtml).not.toContain('GSTIN');
    expect(writtenHtml).not.toContain('Sample note');
  });
});
