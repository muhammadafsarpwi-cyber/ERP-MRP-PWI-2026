import {
  buildItemMasterIndex,
  buildSafetyBufferDockSummary,
  buildSafetyItemMetrics,
  buildUnifiedItemRollupFromCustomers,
  canonicalizeSocKey,
  convertGrossToExactPcsAndCartons,
  convertUomQuantity,
  formatUomBreakdownDisplay,
  isExplicitRealSocToken,
  matchesDivisionFilter,
  reconcileCustomerSocContracts,
  resolveBufferEntryMetrics,
  resolveDefaultAnalyticsDivision,
  resolveDivisionPrimaryUom,
  resolveExactPcsPerCarton,
  SafetyItemDetail,
  splitItemDisplayName,
  summarizeUomBuckets,
  UomConversionRecord,
} from './safetyStockBufferUtils';

const DIVISIONS = [
  { id: 'd1000000-0000-0000-0000-000000000001', divisionCode: 'DIV-001-SPI', name: 'Spoke Division' },
  { id: 'd1000000-0000-0000-0000-000000000002', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
  { id: 'd1000000-0000-0000-0000-000000000005', divisionCode: 'DIV-005-WRD', name: 'WRD Division' },
];

const UOM_CONVERSIONS: UomConversionRecord[] = [
  {
    fromUom: { code: 'GRS' },
    toUom: { code: 'PCS' },
    conversionFactor: '144.000000',
    status: 'ACTIVE',
  },
  {
    fromUom: { code: 'PCS' },
    toUom: { code: 'GRS' },
    conversionFactor: '0.006944',
    status: 'ACTIVE',
  },
  {
    fromUom: { code: 'M' },
    toUom: { code: 'FT' },
    conversionFactor: '3.280840',
    status: 'ACTIVE',
  },
];

const PROD_ITEMS = [
  {
    id: 'cd9280bf-3cab-41ca-8ddf-0ee618d8b08d',
    itemCode: 'CCD-FGR-011',
    name: '7 MM PVC DS Outer Casing',
    baseUom: { code: 'M' },
    salesUom: { code: 'M' },
    packagingType: 'COIL',
    packagingUnit: 'Coil',
    packagingSize: 250,
    divisionId: 'd1000000-0000-0000-0000-000000000002',
    divisionCode: 'DIV-002-CCD',
    divisionName: 'Control Cable Division',
  },
  {
    id: '181fb5ac-40d6-4957-856f-3806ae3ee9dc',
    itemCode: 'SPI-FG-SPK-006',
    name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple',
    baseUom: { code: 'PCS' },
    salesUom: { code: 'GRS' },
    packagingType: 'BOX',
    packagingUnit: 'Carton',
    packagingSize: 10,
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    divisionCode: 'DIV-001-SPI',
    divisionName: 'Spoke Division',
  },
  {
    id: 'cs-spk-011',
    itemCode: 'SPI-FG-SPK-011',
    name: '300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)',
    baseUom: { code: 'PCS' },
    salesUom: { code: 'GRS' },
    packagingType: 'BOX',
    packagingUnit: 'Carton',
    packagingSize: 10.556,
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    divisionCode: 'DIV-001-SPI',
    divisionName: 'Spoke Division',
  },
  {
    id: 'wrd-roll-001',
    itemCode: 'WRD-FG-001',
    name: 'GALVANIZED INNER CABLE 1.5MM',
    baseUom: { code: 'M' },
    salesUom: { code: 'FT' },
    packagingType: 'ROLL',
    packagingUnit: 'Roll',
    packagingSize: 328.084,
    divisionId: 'd1000000-0000-0000-0000-000000000005',
    divisionCode: 'DIV-005-WRD',
    divisionName: 'WRD Division',
  },
];

describe('safetyStockBufferUtils', () => {
  const itemMasterMap = buildItemMasterIndex(PROD_ITEMS, DIVISIONS);

  test('converts PCS -> GRS using exact inverse 144 instead of repeating decimal truncation', () => {
    expect(convertUomQuantity(144000, 'PCS', 'GRS', UOM_CONVERSIONS)).toBe(1000);
    expect(convertUomQuantity(7600, 'PCS', 'GRS', UOM_CONVERSIONS)).toBeCloseTo(52.7778, 3);
  });

  test('computes CCD-FGR-011 from Item Master (COIL + M) without fabricated GRS or PCS', () => {
    const resolved = resolveBufferEntryMetrics({
      itemCode: 'CCD-FGR-011',
      itemName: '7 MM PVC DS Outer Casing',
      rawQuantity: 84250,
      entryUomCode: 'M',
      legacyCartons: 168.5, // stale note must NOT override live Item Master (250 M/Coil)
      legacyGross: 585.07, // fabricated legacy note must NOT produce GRS
      itemMasterMap,
      uomConversions: UOM_CONVERSIONS,
      divisions: DIVISIONS,
    });

    expect(resolved.hasGrossUom).toBe(false);
    expect(resolved.gross).toBe(0);
    expect(resolved.pcs).toBe(0);
    expect(resolved.baseUomCode).toBe('M');
    expect(resolved.baseQty).toBe(84250);
    expect(resolved.packagingUnitCode).toBe('COIL');
    expect(resolved.packagingQty).toBe(337);
    expect(resolved.divisionCode).toBe('DIV-002-CCD');

    const metrics = buildSafetyItemMetrics(resolved);
    expect(metrics).toEqual([
      { code: 'COIL', value: 337, decimals: 0, role: 'packaging' },
      { code: 'M', value: 84250, decimals: 0, role: 'base' },
    ]);
  });

  test('renders Spoke standard and CS items cleanly with CTN + GRS + PCS', () => {
    const std = resolveBufferEntryMetrics({
      itemCode: 'SPI-FG-SPK-006',
      itemName: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple',
      rawQuantity: 144000,
      entryUomCode: 'PCS',
      itemMasterMap,
      uomConversions: UOM_CONVERSIONS,
      divisions: DIVISIONS,
    });
    expect(std.hasGrossUom).toBe(true);
    expect(std.packagingQty).toBe(100);
    expect(std.gross).toBe(1000);
    expect(std.pcs).toBe(144000);
    expect(buildSafetyItemMetrics(std)).toEqual([
      { code: 'CTN', value: 100, decimals: 0, role: 'packaging' },
      { code: 'GRS', value: 1000, decimals: 0, role: 'sales' },
      { code: 'PCS', value: 144000, decimals: 0, role: 'base' },
    ]);

    const cs = resolveBufferEntryMetrics({
      itemCode: 'SPI-FG-SPK-011',
      itemName: '300X17 S9 (CS)',
      rawQuantity: 7600,
      entryUomCode: 'PCS',
      itemMasterMap,
      uomConversions: UOM_CONVERSIONS,
      divisions: DIVISIONS,
    });
    expect(cs.packagingQty).toBe(5);
    expect(cs.gross).toBeCloseTo(52.7778, 3);
  });

  test('uses uom_conversions for cross-unit sales UOM items (e.g. M -> FT -> ROLL)', () => {
    const wrd = resolveBufferEntryMetrics({
      itemCode: 'WRD-FG-001',
      itemName: 'GALVANIZED INNER CABLE 1.5MM',
      rawQuantity: 1000,
      entryUomCode: 'M',
      itemMasterMap,
      uomConversions: UOM_CONVERSIONS,
      divisions: DIVISIONS,
    });
    expect(wrd.hasGrossUom).toBe(false);
    expect(wrd.salesUomCode).toBe('FT');
    expect(wrd.salesQty).toBeCloseTo(3280.84, 2);
    expect(wrd.packagingUnitCode).toBe('ROLL');
    expect(wrd.packagingQty).toBe(10);
  });

  test('filters safety buffer items by division and recalculates unit-aware KPIs', () => {
    const ccdResolved = resolveBufferEntryMetrics({
      itemCode: 'CCD-FGR-011',
      itemName: '7 MM PVC DS Outer Casing',
      rawQuantity: 84250,
      entryUomCode: 'M',
      itemMasterMap,
      uomConversions: UOM_CONVERSIONS,
      divisions: DIVISIONS,
    });
    const spkResolved = resolveBufferEntryMetrics({
      itemCode: 'SPI-FG-SPK-006',
      itemName: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple',
      rawQuantity: 144000,
      entryUomCode: 'PCS',
      itemMasterMap,
      uomConversions: UOM_CONVERSIONS,
      divisions: DIVISIONS,
    });

    const items: SafetyItemDetail[] = [
      {
        itemCode: 'SPI-FG-SPK-006',
        itemName: 'Spoke Item',
        ...spkResolved,
        metrics: buildSafetyItemMetrics(spkResolved),
      },
      {
        itemCode: 'CCD-FGR-011',
        itemName: 'CCD Item',
        ...ccdResolved,
        metrics: buildSafetyItemMetrics(ccdResolved),
      },
    ];
    const batches = [
      { divisionId: DIVISIONS[0].id, divisionCode: DIVISIONS[0].divisionCode },
      { divisionId: DIVISIONS[0].id, divisionCode: DIVISIONS[0].divisionCode },
      { divisionId: DIVISIONS[1].id, divisionCode: DIVISIONS[1].divisionCode },
    ];

    const allSummary = buildSafetyBufferDockSummary(items, batches, 'ALL');
    expect(allSummary.items).toHaveLength(2);
    expect(allSummary.batchCount).toBe(3);
    expect(allSummary.volumeTotals).toEqual([
      { label: 'Buffer Volume', value: 1000, unitCode: 'GRS', decimals: 0 },
      { label: 'Buffer Volume', value: 84250, unitCode: 'M', decimals: 0 },
    ]);
    expect(allSummary.packageTotals).toEqual([
      { label: 'Cartons', value: 100, unitCode: 'CTN', decimals: 0 },
      { label: 'Coils', value: 337, unitCode: 'COIL', decimals: 0 },
    ]);

    const ccdOnly = buildSafetyBufferDockSummary(items, batches, DIVISIONS[1].id);
    expect(ccdOnly.items).toHaveLength(1);
    expect(ccdOnly.items[0].itemCode).toBe('CCD-FGR-011');
    expect(ccdOnly.batchCount).toBe(1);
    expect(ccdOnly.volumeTotals).toEqual([
      { label: 'Buffer Volume', value: 84250, unitCode: 'M', decimals: 0 },
    ]);
    expect(ccdOnly.packageLabel).toBe('Coils');
    expect(ccdOnly.packageTotals).toEqual([
      { label: 'Coils', value: 337, unitCode: 'COIL', decimals: 0 },
    ]);

    const wrdEmpty = buildSafetyBufferDockSummary(items, batches, DIVISIONS[2].id);
    expect(wrdEmpty.items).toHaveLength(0);
    expect(wrdEmpty.batchCount).toBe(0);
    expect(wrdEmpty.volumeTotals).toEqual([]);
  });

  test('converts (CS) 10.556 GRS/CTN orders & dispatches to exact 1,520 PCS/CTN with zero 1,520.064 drift', () => {
    expect(resolveExactPcsPerCarton(10.556, 'SPI-FG-SPK-011')).toBe(1520);
    expect(resolveExactPcsPerCarton(10, 'SPI-FG-SPK-006')).toBe(1440);

    const ord011 = convertGrossToExactPcsAndCartons(6544.72, 10.556, 'SPI-FG-SPK-011');
    expect(ord011.cartons).toBe(620);
    expect(ord011.pcs).toBe(942400);

    const del011 = convertGrossToExactPcsAndCartons(3114.02, 10.556, 'SPI-FG-SPK-011');
    expect(del011.cartons).toBe(295);
    expect(del011.pcs).toBe(448400);

    const del012 = convertGrossToExactPcsAndCartons(1847.3, 10.556, 'SPI-FG-SPK-012');
    expect(del012.cartons).toBe(175);
    expect(del012.pcs).toBe(266000);

    const reg = convertGrossToExactPcsAndCartons(1000, 10, 'SPI-FG-SPK-006');
    expect(reg.cartons).toBe(100);
    expect(reg.pcs).toBe(144000);
  });

  test('reconciles cross-SOC packed shortfalls (SOC-2026-05645 & SOC-2026-05806) so Ready to Dispatch matches physical FG stock 100%', () => {
    const reconciled = reconcileCustomerSocContracts([
      {
        orderId: 'so-05645',
        socNumber: 'SOC-2026-05645',
        status: 'DELIVERED',
        isOfficialOrder: true,
        items: [
          {
            key: '05645-011',
            itemCode: 'SPI-FG-SPK-011',
            itemName: '300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)',
            orderedPcs: 130 * 1520,
            packedPcs: 35 * 1520, // Only 35 CTN tagged 05645; remaining 95 CTN came from Opening Stock tagged 05806
            dispatchedPcs: 130 * 1520,
            pcsPerCarton: 1520,
            grossPerCarton: 10.556,
            isOrderItem: true,
          },
        ],
      },
      {
        orderId: 'so-05806',
        socNumber: 'SOC-2026-05806',
        status: 'PROCESSING',
        isOfficialOrder: true,
        items: [
          {
            key: '05806-011',
            itemCode: 'SPI-FG-SPK-011',
            itemName: '300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)',
            orderedPcs: 620 * 1520,
            packedPcs: 570 * 1520, // 150 Opening + 420 Hand-Pack FULL_SET (WITHOUT_NIPPLE excluded)
            dispatchedPcs: 295 * 1520,
            pcsPerCarton: 1520,
            grossPerCarton: 10.556,
            isOrderItem: true,
          },
          {
            key: '05806-012',
            itemCode: 'SPI-FG-SPK-012',
            itemName: 'RM Inn / Out Spoke Straight (CS)__RM-250*17 Nipple',
            orderedPcs: 345 * 1520,
            packedPcs: 286 * 1520,
            dispatchedPcs: 175 * 1520,
            pcsPerCarton: 1520,
            grossPerCarton: 10.556,
            isOrderItem: true,
          },
        ],
      },
    ]);

    const soc5806 = reconciled.find((s) => s.socNumber === 'SOC-2026-05806')!;
    const soc5645 = reconciled.find((s) => s.socNumber === 'SOC-2026-05645')!;
    const item011 = soc5806.items.find((i) => i.itemCode === 'SPI-FG-SPK-011')!;
    const item012 = soc5806.items.find((i) => i.itemCode === 'SPI-FG-SPK-012')!;

    expect(soc5645.items[0].packedCartons).toBe(130);
    expect(soc5645.items[0].readyToDispatchPcs).toBe(0);

    // SPI-FG-SPK-011: 475 CTN packed - 295 CTN dispatched = 180 CTN (273,600 PCS / 1,900 GRS)
    expect(item011.packedCartons).toBe(475);
    expect(item011.packedPcs).toBe(722000);
    expect(item011.dispatchedCartons).toBe(295);
    expect(item011.dispatchedPcs).toBe(448400);
    expect(item011.readyToDispatchCartons).toBe(180);
    expect(item011.readyToDispatchPcs).toBe(273600);
    expect(item011.readyToDispatchQty).toBe(1900);
    expect(item011.remainingPendingCartons).toBe(325);
    expect(item011.toPackCartons).toBe(145);

    // SPI-FG-SPK-012: 286 CTN packed - 175 CTN dispatched = 111 CTN (168,720 PCS / 1,171.67 GRS)
    expect(item012.packedCartons).toBe(286);
    expect(item012.packedPcs).toBe(434720);
    expect(item012.dispatchedCartons).toBe(175);
    expect(item012.dispatchedPcs).toBe(266000);
    expect(item012.readyToDispatchCartons).toBe(111);
    expect(item012.readyToDispatchPcs).toBe(168720);
    expect(item012.remainingPendingCartons).toBe(170);
    expect(item012.toPackCartons).toBe(59);

    // Contract total Ready to Dispatch = 291 CTN (442,320 PCS)
    expect(soc5806.totalReadyToDispatchCartons).toBe(291);
    expect(soc5806.totalReadyToDispatchPcs).toBe(442320);
    expect(soc5806.totalPendingCartons).toBe(495);
    expect(soc5806.totalToPackCartons).toBe(204);
  });

  test('splits __ item names cleanly onto primary and secondary lines', () => {
    expect(splitItemDisplayName('300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)')).toEqual({
      primary: '300X17 S9 Inn / Out Spoke Straight (CS)',
      secondary: '125-S9 Nipple (CS)',
    });
    expect(splitItemDisplayName('7 MM PVC DS Outer Casing')).toEqual({
      primary: '7 MM PVC DS Outer Casing',
    });
  });

  test('resolves default analytics division strictly to DIV-001-SPI Spoke Division and dynamic primary UOMs', () => {
    const def = resolveDefaultAnalyticsDivision(DIVISIONS);
    expect(def?.divisionCode).toBe('DIV-001-SPI');
    expect(resolveDivisionPrimaryUom(DIVISIONS[0])).toBe('GRS');
    expect(resolveDivisionPrimaryUom(DIVISIONS[1])).toBe('M');
    expect(resolveDivisionPrimaryUom(DIVISIONS[2])).toBe('KG');
    expect(
      matchesDivisionFilter(
        { divisionCode: 'DIV-002-CCD', divisionName: 'Control Cable Division' },
        DIVISIONS[1].id,
        DIVISIONS,
      ),
    ).toBe(true);
    expect(
      matchesDivisionFilter(
        { divisionCode: 'DIV-002-CCD', divisionName: 'Control Cable Division' },
        DIVISIONS[0].id,
        DIVISIONS,
      ),
    ).toBe(false);
  });

  test('reconciles non-GRS Control Cable (M / COIL) orders without applying x144 PCS math', () => {
    const ccdRec = reconcileCustomerSocContracts([
      {
        orderId: 'so-ccd-1',
        socNumber: 'SOC-CCD-001',
        status: 'CONFIRMED',
        isOfficialOrder: true,
        primaryUom: 'M',
        packagingUnitCode: 'COIL',
        items: [
          {
            key: 'ccd-1',
            itemCode: 'CCD-FGR-011',
            itemName: '7 MM PVC DS Outer Casing',
            orderedPcs: 0,
            packedPcs: 0,
            dispatchedPcs: 0,
            pcsPerCarton: 0,
            grossPerCarton: 250,
            isOrderItem: true,
            primaryUom: 'M',
            packagingUnitCode: 'COIL',
            isGrossUnit: false,
            orderedQtyRaw: 50000,
            packedQtyRaw: 30000,
            dispatchedQtyRaw: 10000,
          },
        ],
      },
    ]);

    expect(ccdRec[0].primaryUom).toBe('M');
    expect(ccdRec[0].packagingUnitCode).toBe('COIL');
    expect(ccdRec[0].totalOrderedQty).toBe(50000);
    expect(ccdRec[0].totalOrderedCartons).toBe(200);
    expect(ccdRec[0].totalPackedQty).toBe(30000);
    expect(ccdRec[0].totalDispatchedQty).toBe(10000);
    expect(ccdRec[0].totalReadyToDispatchQty).toBe(20000);
    expect(ccdRec[0].totalReadyToDispatchCartons).toBe(80);
    expect(ccdRec[0].totalPendingQty).toBe(40000);
    expect(ccdRec[0].totalToPackQty).toBe(20000);
    expect(ccdRec[0].items[0].orderedPcs).toBe(0);
  });

  test('summarizes multi-unit UOM breakdowns cleanly for All Divisions vs single division', () => {
    const single = summarizeUomBuckets([{ unitCode: 'M', qty: 2157000 }]);
    expect(formatUomBreakdownDisplay(single, (v) => v.toLocaleString('en-US'))).toEqual({
      text: '2,157,000',
      suffix: 'M',
    });

    const mixed = summarizeUomBuckets([
      { unitCode: 'GRS', qty: 96605 },
      { unitCode: 'M', qty: 2157000 },
    ]);
    expect(formatUomBreakdownDisplay(mixed, (v) => v.toLocaleString('en-US'))).toEqual({
      text: '96,605 GRS · 2,157,000 M',
      suffix: undefined,
    });
  });

  test('canonicalizes legacy 4-digit and 5-digit SOC keys consistently and detects real SOC tokens', () => {
    expect(canonicalizeSocKey('SOC-2026-5810')).toBe('SOC-2026-5810');
    expect(canonicalizeSocKey('SOC-2026-05810')).toBe('SOC-2026-5810');
    expect(canonicalizeSocKey('soc 2026 05817')).toBe('SOC-2026-5817');
    expect(canonicalizeSocKey('SOC-2026-5817')).toBe('SOC-2026-5817');
    expect(canonicalizeSocKey('SAFETY_STOCK')).toBe('SAFETYSTOCK');
    expect(canonicalizeSocKey('—')).toBe('');

    expect(isExplicitRealSocToken('SOC-2026-05832')).toBe(true);
    expect(isExplicitRealSocToken('SOC-2026-5810')).toBe(true);
    expect(isExplicitRealSocToken('SAFETY_STOCK')).toBe(false);
    expect(isExplicitRealSocToken('SAFETY-STOCK')).toBe(false);
    expect(isExplicitRealSocToken('—')).toBe(false);
  });

  test('preserves CS (10.556) SO/DN quantities and guarantees 100% Customer <-> Item <-> KPI rollup parity across Spoke & CCD', () => {
    const csOrd011 = convertGrossToExactPcsAndCartons(6544.72, 10.556, 'SPI-FG-SPK-011');
    const csDel011 = convertGrossToExactPcsAndCartons(3114.02, 10.556, 'SPI-FG-SPK-011');
    const aliSocs = reconcileCustomerSocContracts([
      {
        orderId: 'so-5806',
        socNumber: 'SOC-2026-05806',
        status: 'PROCESSING',
        isOfficialOrder: true,
        items: [
          {
            key: '5806-011',
            itemCode: 'SPI-FG-SPK-011',
            itemName: '300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)',
            orderedPcs: csOrd011.pcs,
            packedPcs: 874080,
            dispatchedPcs: csDel011.pcs,
            pcsPerCarton: 1520,
            grossPerCarton: 10.556,
            orderedQtyRaw: 6544.72,
            dispatchedQtyRaw: 3114.02,
            isOrderItem: true,
          },
        ],
      },
    ]);

    expect(aliSocs[0].totalOrderedQty).toBe(6544.72);
    expect(aliSocs[0].totalDispatchedQty).toBe(3114.02);
    expect(aliSocs[0].totalPendingQty).toBe(3430.7);
    expect(aliSocs[0].totalReadyToDispatchQty).toBe(2956.11);

    const unifiedItems = buildUnifiedItemRollupFromCustomers({
      regularCustomers: [
        {
          id: 'cust-ali',
          customerCode: 'CUS-ASA',
          name: 'ALI SHAH AUTOS',
          socContracts: aliSocs,
        },
      ],
    });
    expect(unifiedItems).toHaveLength(1);
    expect(unifiedItems[0].totalGross).toBe(aliSocs[0].totalOrderedQty);
    expect(unifiedItems[0].totalDispatchedGross).toBe(aliSocs[0].totalDispatchedQty);
    expect(unifiedItems[0].undispatchedGross).toBe(aliSocs[0].totalPendingQty);
    expect(unifiedItems[0].readyFgrGross).toBe(aliSocs[0].totalReadyToDispatchQty);
    expect(unifiedItems[0].balancePendingGross).toBe(
      Math.round((aliSocs[0].totalPendingQty - aliSocs[0].totalReadyToDispatchQty) * 100) / 100,
    );

    const ccdSocs = reconcileCustomerSocContracts([
      {
        orderId: 'so-ccd-xinda',
        socNumber: 'SOC-2026-05850',
        status: 'CONFIRMED',
        isOfficialOrder: true,
        primaryUom: 'M',
        packagingUnitCode: 'COIL',
        items: [
          {
            key: 'ccd-2',
            itemCode: 'CCD-FGR-002',
            itemName: '6 MM PVC 2P Outer Casing',
            orderedPcs: 0,
            packedPcs: 0,
            dispatchedPcs: 0,
            pcsPerCarton: 0,
            grossPerCarton: 250,
            primaryUom: 'M',
            packagingUnitCode: 'COIL',
            isGrossUnit: false,
            orderedQtyRaw: 816500,
            packedQtyRaw: 0,
            dispatchedQtyRaw: 0,
            isOrderItem: true,
          },
        ],
      },
    ]);
    const ccdItems = buildUnifiedItemRollupFromCustomers({
      regularCustomers: [
        { id: 'cust-xinda', customerCode: 'CUS-XIN', name: 'Xinda', socContracts: ccdSocs },
      ],
      resolveMeta: () => ({ matrixFgrNative: 557500, packagingSize: 250 }),
    });
    expect(ccdItems[0].totalGross).toBe(816500);
    expect(ccdItems[0].totalDispatchedGross).toBe(0);
    expect(ccdItems[0].readyFgrGross).toBe(0);
    expect(ccdItems[0].undispatchedGross).toBe(816500);
    expect(ccdItems[0].warehouseFgrGross).toBe(557500);
  });
});
