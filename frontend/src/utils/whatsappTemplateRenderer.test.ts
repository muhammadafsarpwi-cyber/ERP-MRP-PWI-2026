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

  it('registers all 33 ERP WhatsApp templates with unique keys, [CODES], and supported placeholders', () => {
    expect(WHATSAPP_TEMPLATE_REGISTRY.length).toBe(33);
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
});
