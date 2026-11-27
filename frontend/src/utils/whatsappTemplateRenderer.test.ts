import {
  WHATSAPP_SETTINGS_STORAGE_KEY,
  WHATSAPP_TEMPLATE_REGISTRY,
  invalidateWhatsAppSettingsCache,
  readWhatsAppSettings,
  renderWhatsAppTemplate,
  resolveWhatsAppTemplate,
  saveWhatsAppSettings,
} from './whatsappTemplateRenderer';
import { buildReceiptWhatsAppMessage, ShareReceiptInfo } from './receiptShare';
import { buildStoreIssueWhatsAppMessage } from './storeIssueWhatsApp';

const EMOJI_REGEX =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{2795}\u{2796}\u{2713}\u{2705}\u{274C}]/u;

describe('whatsappTemplateRenderer — centralized 0ms template engine', () => {
  beforeEach(() => {
    window.localStorage.removeItem(WHATSAPP_SETTINGS_STORAGE_KEY);
    invalidateWhatsAppSettingsCache();
  });

  afterEach(() => {
    window.localStorage.removeItem(WHATSAPP_SETTINGS_STORAGE_KEY);
    invalidateWhatsAppSettingsCache();
  });

  it('registers all 34 ERP WhatsApp templates with unique keys, [CODES], and supported placeholders', () => {
    expect(WHATSAPP_TEMPLATE_REGISTRY.length).toBe(34);
    const keys = new Set(WHATSAPP_TEMPLATE_REGISTRY.map((t) => t.key));
    const codes = new Set(WHATSAPP_TEMPLATE_REGISTRY.map((t) => t.code));
    expect(keys.size).toBe(WHATSAPP_TEMPLATE_REGISTRY.length);
    expect(codes.size).toBe(WHATSAPP_TEMPLATE_REGISTRY.length);

    for (const def of WHATSAPP_TEMPLATE_REGISTRY) {
      expect(def.code).toMatch(/^\[[A-Z0-9-]+\]$/);
      expect(def.title.trim().length).toBeGreaterThan(3);
      expect(def.defaultTemplate.trim().length).toBeGreaterThan(10);
      expect(def.placeholders.length).toBeGreaterThan(0);
      // Resolves cleanly by both key and [CODE]
      expect(resolveWhatsAppTemplate(def.key)).toBe(def.defaultTemplate.trim());
      expect(resolveWhatsAppTemplate(def.code)).toBe(def.defaultTemplate.trim());
    }
  });

  it('caches parsed settings in memory (0 JSON.parse on repeat reads) and invalidates immediately on Save', () => {
    const parseSpy = jest.spyOn(JSON, 'parse');
    try {
      saveWhatsAppSettings({
        countryCode: '92',
        templates: {
          rmReceipt: 'SAVED V1: {receipt_code}',
        },
      });

      // Repeat reads use the 0ms in-memory cache with zero JSON.parse calls
      parseSpy.mockClear();
      expect(readWhatsAppSettings().templates?.rmReceipt).toBe('SAVED V1: {receipt_code}');
      expect(readWhatsAppSettings().templates?.rmReceipt).toBe('SAVED V1: {receipt_code}');
      expect(renderWhatsAppTemplate('[RM-GP]', { receipt_code: 'RMR-00253' })).toBe(
        'SAVED V1: RMR-00253',
      );
      expect(parseSpy).toHaveBeenCalledTimes(0);

      // Saving updated Settings updates output immediately without reload
      saveWhatsAppSettings({
        countryCode: '92',
        templates: {
          rmReceipt: 'SAVED V2: {receipt_code} | GP {gate_pass_no}',
        },
      });
      expect(
        renderWhatsAppTemplate('[RM-GP]', { receipt_code: 'RMR-00253', gate_pass_no: '3575' }),
      ).toBe('SAVED V2: RMR-00253 | GP 3575');
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('controls 100% of [RM-GP] output for RMR-00253 with zero hardcoded emojis when removed in Settings', () => {
    const rmr00253: ShareReceiptInfo = {
      receiptCode: 'RMR-00253',
      gatePassNo: '3575',
      poCode: 'PO-2026-0192',
      sourceNo: 'DC-8841',
      heatNumber: 'HN-77B',
      receiptDate: '2026-11-25',
      divisionName: 'Spoke Division',
      sectionName: 'Wire Drawing Section',
      warehouseName: 'SPI Raw Material Store',
      lines: [
        {
          itemCode: 'RM-WIRE-012',
          itemName: 'Steel Wire Coil 3.45mm SR',
          uomCode: 'KG',
          gatePassQuantity: 2200,
          receivedQuantity: 2185,
          difference: 15, // Shortage
        },
        {
          itemCode: 'RM-ZINC-001',
          itemName: 'SHG Zinc Ingot 99.995%',
          uomCode: 'KG',
          gatePassQuantity: 1000,
          receivedQuantity: 1010,
          difference: -10, // Excess
        },
      ],
      gatePassTotal: 3200,
      receivedTotal: 3195,
      differenceTotal: 5,
    };

    // 1. Default template output has zero forced emojis
    const defaultMsg = buildReceiptWhatsAppMessage(rmr00253);
    expect(defaultMsg).toContain('RMR-00253');
    expect(defaultMsg).toContain('3575');
    expect(defaultMsg).toContain('PO-2026-0192');
    expect(defaultMsg).toContain('Steel Wire Coil 3.45mm SR (RM-WIRE-012)');
    expect(defaultMsg).toContain('Shortage (-15.00 KG)');
    expect(defaultMsg).toContain('Excess (+10.00 KG)');
    expect(EMOJI_REGEX.test(defaultMsg)).toBe(false);

    // 2. Editing [RM-GP] and [RM-GP-LINE] in Settings immediately reorders & customizes RMR-00253
    saveWhatsAppSettings({
      countryCode: '92',
      templates: {
        rmReceipt:
          'PWI GATE PASS RECEIPT\nRef: {receipt_code} (GP #{gate_pass_no})\nStore: {warehouse} - {division}\nLines:\n{items}\nTotal Received: {total_rcv_qty} KG | Variance: {net_variance}',
        rmReceiptItemLine:
          '{index}) {item_code} - {item_name}: Received {rcv_qty} against GP {gp_qty} [{status}]',
      },
    });

    const customMsg = buildReceiptWhatsAppMessage(rmr00253);
    expect(customMsg).toBe(
      [
        'PWI GATE PASS RECEIPT',
        'Ref: RMR-00253 (GP #3575)',
        'Store: SPI Raw Material Store - Spoke Division',
        'Lines:',
        '1) RM-WIRE-012 - Steel Wire Coil 3.45mm SR: Received 2,185.00 KG against GP 2,200.00 KG [Shortage (-15.00 KG)]',
        '',
        '2) RM-ZINC-001 - SHG Zinc Ingot 99.995%: Received 1,010.00 KG against GP 1,000.00 KG [Excess (+10.00 KG)]',
        'Total Received: 3,195.00 KG | Variance: -5.00 KG (Shortage)',
      ].join('\n'),
    );
    expect(EMOJI_REGEX.test(customMsg)).toBe(false);
  });

  it('controls [SIN-ISSUE] Store Issue Note sharing cleanly from Settings with all required placeholders', () => {
    const def = WHATSAPP_TEMPLATE_REGISTRY.find((t) => t.code === '[SIN-ISSUE]');
    expect(def).toBeDefined();
    expect(def?.key).toBe('storeIssueNote');
    expect(def?.placeholders).toEqual(
      expect.arrayContaining([
        '{sin_number}',
        '{date}',
        '{division}',
        '{section}',
        '{machine}',
        '{receiver}',
        '{issued_by}',
        '{items}',
        '{last_issued_summary}',
        '{remaining_stock}',
        '{remarks}',
      ]),
    );

    const sampleInput = {
      sinNumber: 'SIN-20261016-65057',
      date: '2026-10-16',
      divisionName: 'Spoke Division',
      sectionName: 'Spoke Section',
      machineName: 'SPK-01 — Spoke Machine SPK-01',
      operatorName: 'H.M.Sajeel',
      shiftInchargeName: 'Muhammad Junaid',
      issuedByName: 'Store Keeper',
      purpose: 'Die Replacement',
      lines: [
        {
          itemCode: 'SP-216021',
          itemName: 'SPOKE THREADING ROLLING DIE (10G 3.2) 40G',
          quantity: 1,
          uomCode: 'SET',
          lastIssuedSummary: 'Last Issued: 16-Oct-2026 (SIN-20261016-65057 · 1 SET) · Production Since Last Issue: 6,286.92 GRS (905,317 PCS) · Total Issues: 1',
          remainingStock: 4,
          remainingStockUom: 'SET',
        },
      ],
    };

    const defaultSinMsg = buildStoreIssueWhatsAppMessage(sampleInput);
    expect(defaultSinMsg).toContain('SIN-20261016-65057');
    expect(defaultSinMsg).toContain('SP-216021');
    expect(defaultSinMsg).toContain(
      'Last Issued: 16-Oct-2026 (SIN-20261016-65057 · 1 SET)\nProduction Since Last Issue: 6,286.92 GRS (905,317 PCS)\nTotal Issues on Machine: 1',
    );
    expect(defaultSinMsg).toContain('4 SET');
    expect(EMOJI_REGEX.test(defaultSinMsg)).toBe(false);

    saveWhatsAppSettings({
      countryCode: '92',
      templates: {
        storeIssueNote: 'CUSTOM SIN {sin_number} | {date} | {division}/{section} | {machine} | {receiver} | {issued_by}\n{items}\n{last_issued_summary}\nStock: {remaining_stock}\nNote: {remarks}',
      },
    });
    const customSinMsg = buildStoreIssueWhatsAppMessage(sampleInput);
    expect(customSinMsg).toContain('CUSTOM SIN SIN-20261016-65057 | 16-Oct-2026 | Spoke Division/Spoke Section');
    expect(customSinMsg).toContain('Stock: SP-216021 — SPOKE THREADING ROLLING DIE (10G 3.2) 40G: 4 SET');
    expect(customSinMsg).toContain('Note: Die Replacement');
  });
});
