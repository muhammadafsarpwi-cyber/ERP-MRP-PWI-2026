import {
  resolveEffectiveTaxPercent,
  summarizeLinesTaxVerification,
} from './salesTaxVerification';

describe('salesTaxVerification', () => {
  describe('resolveEffectiveTaxPercent', () => {
    it('defaults unspecified lines to 18%', () => {
      expect(resolveEffectiveTaxPercent({ quantity: 10, unitPrice: 500 })).toBe(18);
      expect(resolveEffectiveTaxPercent({}, 18)).toBe(18);
    });

    it('preserves explicit 0% (Tax-Free) rate without reverting to 18%', () => {
      expect(resolveEffectiveTaxPercent({ taxPercent: 0, quantity: 70, unitPrice: 1200 })).toBe(0);
      expect(resolveEffectiveTaxPercent({ gstRate: 0, quantity: 5, unitPrice: 340 })).toBe(0);
      expect(resolveEffectiveTaxPercent({ taxRate: 0 })).toBe(0);
    });

    it('derives 0% vs 18% from persisted delivery line taxAmount accurately', () => {
      // Explicit 0 taxAmount on non-zero rate => 0% Tax-Free
      expect(
        resolveEffectiveTaxPercent({ quantity: 700, unitPrice: 100, taxAmount: 0 }, 18),
      ).toBe(0);
      // Zero unit price and 0 taxAmount => 0%
      expect(
        resolveEffectiveTaxPercent({ quantity: 700, unitPrice: 0, taxAmount: 0 }, 18),
      ).toBe(0);
      // 18% taxAmount on 70,000 => 12,600 => 18%
      expect(
        resolveEffectiveTaxPercent({ quantity: 700, unitPrice: 100, taxAmount: 12600 }, 18),
      ).toBe(18);
    });
  });

  describe('summarizeLinesTaxVerification', () => {
    it('flags zero unit rates and 0% Tax-Free lines clearly and sums totals accurately', () => {
      const summary = summarizeLinesTaxVerification(
        [
          {
            id: 'l1',
            socNumber: 'SOC-2026-05815',
            itemCode: 'SPI-FG-SPK-001',
            itemName: 'Spoke 250x17',
            quantity: 700,
            uomCode: 'GRS',
            cartons: 70,
            packagingUnit: 'CTN',
            unitPrice: 100,
            taxAmount: 12600,
            lineTotal: 82600,
          },
          {
            id: 'l2',
            socNumber: 'SOC-2026-05805',
            itemCode: 'SPI-FG-SPK-002',
            itemName: 'Spoke 248x17',
            quantity: 100,
            uomCode: 'GRS',
            cartons: 10,
            packagingUnit: 'CTN',
            unitPrice: 0,
            taxAmount: 0,
            lineTotal: 0,
          },
        ],
        0,
      );

      expect(summary.subtotal).toBe(70000);
      expect(summary.taxAmount).toBe(12600);
      expect(summary.grandTotal).toBe(82600);
      expect(summary.hasZeroRateLine).toBe(true);
      expect(summary.hasTaxFreeLine).toBe(true);
      expect(summary.lines[0].isTaxFree).toBe(false);
      expect(summary.lines[0].taxPercent).toBe(18);
      expect(summary.lines[1].isZeroRate).toBe(true);
      expect(summary.lines[1].isTaxFree).toBe(true);
    });

    it('recognizes uniform 18% taxed lines with zero warnings', () => {
      const summary = summarizeLinesTaxVerification(
        [
          {
            id: 'l1',
            itemCode: 'SPI-FG-SPK-001',
            itemName: 'Spoke 250x17',
            quantity: 700,
            uomCode: 'GRS',
            unitPrice: 1000,
            taxPercent: 18,
            taxAmount: 126000,
            lineTotal: 826000,
          },
        ],
        0,
      );

      expect(summary.subtotal).toBe(700000);
      expect(summary.taxAmount).toBe(126000);
      expect(summary.grandTotal).toBe(826000);
      expect(summary.hasZeroRateLine).toBe(false);
      expect(summary.hasTaxFreeLine).toBe(false);
      expect(summary.effectiveTaxLabel).toBe('Tax (18%)');
    });

    it('verifies exact 18% tax math on multi-line large SOC totals (13,800,000 + 2,484,000 = 16,284,000)', () => {
      const summary = summarizeLinesTaxVerification(
        [
          {
            id: 'l1',
            itemCode: 'CCD-FGR-001',
            itemName: '5 MM PVC DS Outer Casing',
            quantity: 200000,
            uomCode: 'MTR',
            unitPrice: 54,
            taxPercent: 18,
          },
          {
            id: 'l2',
            itemCode: 'CCD-FGR-011',
            itemName: '7 MM PVC DS Outer Casing',
            quantity: 60000,
            uomCode: 'MTR',
            unitPrice: 50,
            taxPercent: 18,
          },
        ],
        18,
      );

      expect(summary.subtotal).toBe(13800000);
      expect(summary.taxAmount).toBe(2484000);
      expect(summary.grandTotal).toBe(16284000);
      expect(summary.effectiveTaxLabel).toBe('Tax (18%)');
    });
  });
});
