import { printGatePassDocument, printDeliveryNoteDocument } from './printTemplates';

describe('Outward Gate Pass & Delivery Challan print templates', () => {
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

  it('renders Karachi factory address, deduplicated SOC lists, orange item code badge, automatic Packets (x40), and 3-column gate security signatures', () => {
    const html = capturePrintedHtml(() =>
      printGatePassDocument({
        passType: 'OUTWARD',
        gatePassNo: 'GP-14746',
        referenceNo: 'DN-2026-00044',
        socNumber: 'SOC-2026-05815, SOC-2026-05805, SOC-2026-05815, SOC-2026-05805',
        dispatchSequences: [
          { socNumber: 'SOC-2026-05815', dispatchOrdinal: 4, dispatchLabel: '4th Dispatch', totalSocDispatches: 4, isFinalDispatch: false },
          { socNumber: 'SOC-2026-05805', dispatchOrdinal: 2, dispatchLabel: '2nd Dispatch', totalSocDispatches: 2, isFinalDispatch: true },
        ],
        divisionName: 'Spoke Division',
        partyName: 'ALI SHAH AUTOS',
        items: [
          {
            itemCode: 'SPI-FG-SPK-006',
            itemName: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple',
            socNumber: 'SOC-2026-05815',
            orderQuantity: 6130,
            quantity: 700,
            balanceQuantity: 1430,
            dispatchOrdinal: 4,
            totalSocDispatches: 4,
            isFinalDispatch: false,
            uom: 'GRS',
            packageQuantity: 70,
            packagingUnit: 'Carton',
          },
          {
            itemCode: 'SPI-FG-SPK-004',
            itemName: '250*17 Inn / Out Spoke Straight__RM-250*17 Nipple',
            socNumber: 'SOC-2026-05805',
            orderQuantity: 500,
            quantity: 200,
            balanceQuantity: 0,
            dispatchOrdinal: 2,
            totalSocDispatches: 2,
            isFinalDispatch: true,
            uom: 'GRS',
            packageQuantity: 20,
            packagingUnit: 'CTN',
          },
        ],
      }),
    );

    // 1. Karachi real factory address + active division
    expect(html).toContain('Plot 179, Block E, SITE Superhighway, Karachi, Pakistan');
    expect(html).toContain('Security, Weighbridge &amp; Gate Control | Division: Spoke Division');
    expect(html).not.toContain('Lahore, Pakistan');

    // 2. Deduplicated SOC list in both top Identification and bottom Progress bar (appears twice total: top info + bottom bar)
    const socMatches = html.match(/SOC-2026-05815, SOC-2026-05805/g) || [];
    expect(socMatches).toHaveLength(2);
    expect(html).not.toContain('SOC-2026-05815, SOC-2026-05805, SOC-2026-05815');
    expect(html).not.toContain('1st Dispatch (First Time)');

    // 2b. Accurate per-SOC dispatch sequence pills in header & bottom progress card
    expect(html).toContain('SOC-2026-05815: 4th Dispatch');
    expect(html).toContain('SOC-2026-05805: 2nd Dispatch');

    // 3. SOC # column holds the SOC pill + non-wrapping Order Qty / This Gate Pass / Remaining Balance stack;
    // MATERIAL / PRODUCT DESCRIPTION holds only the Orange Item Code + bold Item Name;
    // Inspection / Security Remarks column displays per-row Dispatch ordinal & Partial / Final status
    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(html, 'text/html');
    const firstRowCells = parsedDoc.querySelectorAll('tbody tr:first-child td');
    const secondRowCells = parsedDoc.querySelectorAll('tbody tr:nth-child(2) td');
    expect(firstRowCells.length).toBeGreaterThanOrEqual(6);
    const socCellHtml = firstRowCells[1].innerHTML;
    const descCellHtml = firstRowCells[2].innerHTML;
    const remarksCell1 = firstRowCells[5].innerHTML || '';
    const remarksCell2 = secondRowCells[5].innerHTML || '';

    expect(socCellHtml).toContain('SOC-2026-05815');
    expect(socCellHtml).toContain('white-space: nowrap;">Order Qty:');
    expect(socCellHtml).toContain('white-space: nowrap;">This Gate Pass:');
    expect(socCellHtml).toContain('white-space: nowrap;">Remaining Balance:');
    expect(firstRowCells[1].textContent).toContain('Order Qty: 6,130 GRS');
    expect(firstRowCells[1].textContent).toContain('This Gate Pass: 700 GRS');
    expect(firstRowCells[1].textContent).toContain('Remaining Balance: 1,430 GRS');

    expect(descCellHtml).toContain('color: #EA580C');
    expect(descCellHtml).toContain('background: #FFF7ED');
    expect(descCellHtml).toContain('border: 1px solid #FED7AA');
    expect(descCellHtml).toContain('white-space: nowrap; display: inline-block');
    expect(descCellHtml).toContain('>SPI-FG-SPK-006</span>');
    expect(descCellHtml).toContain('300X17 S9 Inn / Out Spoke Straight</div>');
    expect(descCellHtml).toContain('>125-S9 Nipple</div>');
    expect(descCellHtml).not.toContain('__');
    expect(descCellHtml).not.toContain('Order Qty:');
    expect(descCellHtml).not.toContain('This Gate Pass:');
    expect(descCellHtml).not.toContain('Remaining Balance:');
    expect(html).toContain('>SPI-FG-SPK-004</span>');

    expect(remarksCell1).toContain('flex-direction: column');
    expect(remarksCell1).toContain('gap: 3px');
    expect(remarksCell1).toContain('>4th Dispatch</span>');
    expect(remarksCell1).toContain('>GP #4</span>');
    expect(remarksCell1).toContain('>Partial Dispatch</span>');
    expect(remarksCell1).not.toContain('·');
    expect(remarksCell2).toContain('>2nd Dispatch</span>');
    expect(remarksCell2).toContain('>GP #2</span>');
    expect(html).toContain('table-layout: fixed; width: 100%;');
    expect(html).toContain('<col style="width: 33%;" />');
    expect(html).toContain('<col style="width: 13%;" />');
    expect(html).toContain('<col style="width: 15%;" />');
    expect(html).toContain('font-size: 12.5px; color: #0f172a; padding: 8px 4px; box-sizing: border-box;');
    expect(remarksCell2).toContain('>Final Dispatch</span>');

    // 4. Packaging header & automatic Packets = Cartons x 40 per row and in Grand Total
    expect(html).toContain('PACKAGING (CARTONS / PACKETS)');
    expect(html).toContain('70 Carton');
    expect(html).toContain('2,800 Packets');
    expect(html).toContain('20 Carton');
    expect(html).toContain('800 Packets');
    expect(html).toContain('900 GRS');
    expect(html).toContain('90 Carton');
    expect(html).toContain('3,600 Packets');

    // 5. 3-column signature footer
    expect(html).toContain('Prepared By (Dispatch)');
    expect(html).toContain('Store / Warehouse Incharge');
    expect(html).toContain('Gate Security Officer');
    expect(html).not.toContain('Authorized Admin Approval');
  });

  it('applies Karachi address, deduplicated Originating SO #, orange item badges, and Packets math to Delivery Challan', () => {
    const html = capturePrintedHtml(() =>
      printDeliveryNoteDocument({
        deliveryNumber: 'DN-2026-00044',
        gatePassNumber: 'GP-14746',
        salesOrderNumber: 'SOC-2026-05815, SOC-2026-05805',
        divisionName: 'Spoke Division',
        customer: { companyName: 'ALI SHAH AUTOS' },
        lines: [
          {
            itemCode: 'SPI-FG-SPK-006',
            itemName: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple [SOC: SOC-2026-05815]',
            quantity: 700,
            uomCode: 'GRS',
            packagingUnit: 'Carton',
            packageQuantity: 70,
          },
          {
            itemCode: 'SPI-FG-SPK-004',
            itemName: '250*17 Inn / Out Spoke Straight__RM-250*17 Nipple [SOC: SOC-2026-05805]',
            quantity: 200,
            uomCode: 'GRS',
            packagingUnit: 'Carton',
            packageQuantity: 20,
          },
        ],
      }),
    );

    expect(html).toContain('Plot 179, Block E, SITE Superhighway, Karachi, Pakistan');
    expect(html).toContain('Dispatch &amp; Logistics Department | Division: Spoke Division');
    expect(html).toContain('SOC-2026-05815, SOC-2026-05805');
    expect(html).toContain('PACKAGING (CARTONS / PACKETS)');
    expect(html).toContain('900 GRS');
    expect(html).toContain('90 Carton');
    expect(html).toContain('3,600 Packets');
    expect(html).toContain('Prepared By (Dispatch)');
    expect(html).toContain('Store / Warehouse Incharge');
    expect(html).toContain('Gate Security Officer');
  });
});
