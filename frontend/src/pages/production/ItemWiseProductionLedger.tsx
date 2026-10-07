import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Col, DatePicker, Empty, Row, Select, Space, Spin, Table, Tag, Tooltip,
  Typography, message,
} from 'antd';
import {
  DownloadOutlined, FileExcelOutlined, LeftOutlined, PrinterOutlined, ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

/**
 * Item-Wise Production Ledger — an ISOLATED, read-only view.
 *
 * Design contract (Zero-Disturbance Policy):
 *  - No existing table, service, controller or view is read-modified.
 *  - Data comes exclusively from two GET endpoints that already enforce
 *    `manufacturing.production.entries.report` + OrgScope/DivisionScope:
 *      GET /production/inventory-report  (day window AND month window)
 *      GET /master-data/items            (per-piece weight lookup)
 *  - Every metric is derived in this file; no shared store is written to.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A. EXPLICIT ROW MAP — never inferred from the item graph.
 *    Rows carrying a blank itemCode are skipped cleanly (§6 SW bypass), and
 *    no logic indexes the array positionally, so removing a stage cannot
 *    produce an undefined-index error. Chains are real spoke products from
 *    the Item Master; every declared chain renders exactly 9 rows.
 *
 * B. SEQUENTIAL CHAIN DEPENDENCY.
 *    Opening + Production come from the stock ledger. Issuance does NOT —
 *    every stage is depleted by its SUCCESSOR's Production. The successor is
 *    resolved from the stages actually present, so a chain without SW simply
 *    routes ST → SP with no special-casing:
 *
 *      RM      Issuance = Σ(successor Production × successor weight)  (KG)
 *      ST      Issuance = successor Production                        (PCS)
 *      SW      Issuance = SP Inner + SP Outer Production
 *      SP Inner/Outer = matching PL branch Production
 *      PL Inner/Outer = FG Packed ÷ 2   (two rows share the one bundle)
 *      FG / DP = recorded outward movements (terminal for now)
 *
 *    A missing driver falls back to the ledger's recorded OUT — never to 0,
 *    which would falsely show a fully-stocked stage.
 *
 * C. CLOSING IS DERIVED FROM THE RESOLVED ISSUANCE:
 *        Closing = (Opening + Production) − Issuance
 *    so a forced issuance always depletes the row and its Total Weight.
 *
 * D. ROLLING BALANCE: `dateFrom = dateTo = endDate` ⇒
 *        Opening = everything BEFORE that day, Production = that day only,
 *    therefore Closing(endDate) ≡ Opening(endDate + 1).
 *    The month baseline (range[0]) only moves when the calendar is used —
 *    Previous/Next Day shift the End Date alone.
 *
 * E. DISPLAY RULES (§1):
 *      · PCS / GRS columns ⇒ whole integers, never a decimal point.
 *      · KG / weight columns ⇒ up to 2 decimals, trailing zeros trimmed
 *        (`607.00` → `607`, `442.92` → `442.92`).
 *      · `0` renders as `0`, empty as `—`.
 *
 * F. PRINT / EXPORT CONTRACT.
 *      · Each chain container is an atomic page unit:
 *        `break-inside: avoid` + `page-break-inside: avoid`, so a chain is
 *        never sliced. When it cannot fit the space left on the current
 *        page it is pushed whole to the top of the next one.
 *      · §1 exclusion filter: every chain title carries a checkbox. An
 *        excluded chain keeps only its struck-through title on screen and is
 *        dropped from `visibleGrids` — hence from the summary, the PDF, the
 *        workbook and the print sheet alike (plus a belt-and-braces
 *        `display:none` rule so it can never reach the printer).
 *      · A corporate letterhead (company / subtitle / metadata grid) leads
 *        the sheet; the raw card title, the app Sider/Header and every
 *        interactive control are hidden under `@media print`.
 *      · Table chrome prints as a financial grid: dark header band with
 *        white text and `1px solid #ddd` hairlines throughout.
 * ─────────────────────────────────────────────────────────────────────────
 */

type SplitSide = 'INNER' | 'OUTER';

interface ChainRowDef {
  order: number;
  stage: string;
  stageLabel: string;
  /** Blank / absent ⇒ row is bypassed entirely (see §6). */
  itemCode: string;
  splitSide?: SplitSide;
  /** Shown when the item has no ledger rows yet (e.g. seeded DP stage). */
  itemLabel?: string;
}

interface ChainDef {
  key: string;
  label: string;
  /** Item whose Production on the As-On date is the "Total Packed Pieces". */
  fgItemCode: string;
  rows: ChainRowDef[];
}

/* ── Registry helpers ─────────────────────────────────────────────────── */

const dpRow = (order: number, fgCode: string, label: string): ChainRowDef => ({
  order,
  stage: 'DP',
  stageLabel: 'DP / Dispatch',
  itemCode: `${fgCode}-DISP`,
  itemLabel: label,
});

/**
 * EXPLICIT 9-ROW SEQUENCES — real spoke products from the Item Master.
 *
 * Butted chains (SW present, one ST / one SW):
 *   RM · ST · SW · SP Inner · SP Outer · PL Inner · PL Outer · FG · DP
 *
 * Straight chains (§6 — no swaging stage, ST splits instead):
 *   RM · ST Inner · ST Outer · SP Inner · SP Outer · PL Inner · PL Outer · FG · DP
 *
 * To build a chain that skips swaging, delete (or blank the itemCode of)
 * the SW row — the successor resolver re-routes ST → SP automatically.
 */
export const CHAIN_REGISTRY: ChainDef[] = [
  {
    key: 'cd-250x17-butted',
    label: 'CD-250X17 Butted Spoke — SPI-FG-SPK-002',
    fgItemCode: 'SPI-FG-SPK-002',
    rows: [
      { order: 1, stage: 'RM', stageLabel: 'RM Stage', itemCode: 'RM-WIRE-009' },
      { order: 2, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-001' },
      { order: 3, stage: 'SW', stageLabel: 'SW Stage', itemCode: 'WIP-SW-001' },
      { order: 4, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-001', splitSide: 'INNER' },
      { order: 5, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-002', splitSide: 'OUTER' },
      { order: 6, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-001', splitSide: 'INNER' },
      { order: 7, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-002', splitSide: 'OUTER' },
      { order: 8, stage: 'FG', stageLabel: 'FG / Packing', itemCode: 'SPI-FG-SPK-002' },
      dpRow(9, 'SPI-FG-SPK-002', '250X17 Dispatch Outward Stage'),
    ],
  },
  {
    key: 'cd-250x18-butted',
    label: 'CD-250X18 Butted Spoke — SPI-FG-SPK-003',
    fgItemCode: 'SPI-FG-SPK-003',
    rows: [
      { order: 1, stage: 'RM', stageLabel: 'RM Stage', itemCode: 'RM-WIRE-009' },
      { order: 2, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-014' },
      { order: 3, stage: 'SW', stageLabel: 'SW Stage', itemCode: 'WIP-SW-002' },
      { order: 4, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-003', splitSide: 'INNER' },
      { order: 5, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-004', splitSide: 'OUTER' },
      { order: 6, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-003', splitSide: 'INNER' },
      { order: 7, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-004', splitSide: 'OUTER' },
      { order: 8, stage: 'FG', stageLabel: 'FG / Packing', itemCode: 'SPI-FG-SPK-003' },
      dpRow(9, 'SPI-FG-SPK-003', '250X18 Dispatch Outward Stage'),
    ],
  },
  {
    key: 'spk-005-250x17-straight',
    label: '250X17 Straight Spoke — SPI-FG-SPK-005',
    fgItemCode: 'SPI-FG-SPK-005',
    rows: [
      { order: 1, stage: 'RM', stageLabel: 'RM Stage', itemCode: 'RM-WIRE-010' },
      { order: 2, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-010', splitSide: 'INNER' },
      { order: 3, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-011', splitSide: 'OUTER' },
      { order: 4, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-005', splitSide: 'INNER' },
      { order: 5, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-006', splitSide: 'OUTER' },
      { order: 6, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-005', splitSide: 'INNER' },
      { order: 7, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-006', splitSide: 'OUTER' },
      { order: 8, stage: 'FG', stageLabel: 'FG / Packing', itemCode: 'SPI-FG-SPK-005' },
      dpRow(9, 'SPI-FG-SPK-005', '250X17 Straight Dispatch Outward Stage'),
    ],
  },
  {
    key: 'spk-007-125-300x17-straight',
    label: '125-300X17 Straight Spoke — SPI-FG-SPK-007',
    fgItemCode: 'SPI-FG-SPK-007',
    rows: [
      { order: 1, stage: 'RM', stageLabel: 'RM Stage', itemCode: 'RM-WIRE-012' },
      { order: 2, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-003', splitSide: 'INNER' },
      { order: 3, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-004', splitSide: 'OUTER' },
      { order: 4, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-013', splitSide: 'INNER' },
      { order: 5, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-014', splitSide: 'OUTER' },
      { order: 6, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-013', splitSide: 'INNER' },
      { order: 7, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-014', splitSide: 'OUTER' },
      { order: 8, stage: 'FG', stageLabel: 'FG / Packing', itemCode: 'SPI-FG-SPK-007' },
      dpRow(9, 'SPI-FG-SPK-007', '125-300X17 Dispatch Outward Stage'),
    ],
  },
  {
    key: 'spk-008-125-300x18-straight',
    label: '125-300X18 Straight Spoke — SPI-FG-SPK-008',
    fgItemCode: 'SPI-FG-SPK-008',
    rows: [
      { order: 1, stage: 'RM', stageLabel: 'RM Stage', itemCode: 'RM-WIRE-012' },
      { order: 2, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-006', splitSide: 'INNER' },
      { order: 3, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-007', splitSide: 'OUTER' },
      { order: 4, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-015', splitSide: 'INNER' },
      { order: 5, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-016', splitSide: 'OUTER' },
      { order: 6, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-015', splitSide: 'INNER' },
      { order: 7, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-016', splitSide: 'OUTER' },
      { order: 8, stage: 'FG', stageLabel: 'FG / Packing', itemCode: 'SPI-FG-SPK-008' },
      dpRow(9, 'SPI-FG-SPK-008', '125-300X18 Dispatch Outward Stage'),
    ],
  },
  {
    key: 'spk-011-225x17-straight',
    label: '225X17 Straight Spoke — SPI-FG-SPK-011',
    fgItemCode: 'SPI-FG-SPK-011',
    rows: [
      { order: 1, stage: 'RM', stageLabel: 'RM Stage', itemCode: 'RM-WIRE-013' },
      { order: 2, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-015', splitSide: 'INNER' },
      { order: 3, stage: 'ST', stageLabel: 'ST Stage', itemCode: 'WIP-ST-016', splitSide: 'OUTER' },
      { order: 4, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-017', splitSide: 'INNER' },
      { order: 5, stage: 'SP', stageLabel: 'SP Stage', itemCode: 'WIP-SP-018', splitSide: 'OUTER' },
      { order: 6, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-017', splitSide: 'INNER' },
      { order: 7, stage: 'PL', stageLabel: 'PL Stage', itemCode: 'WIP-SPL-018', splitSide: 'OUTER' },
      { order: 8, stage: 'FG', stageLabel: 'FG / Packing', itemCode: 'SPI-FG-SPK-011' },
      dpRow(9, 'SPI-FG-SPK-011', '225X17 Dispatch Outward Stage'),
    ],
  },
];

/** Stages with no successor — their Issuance is the recorded outward count. */
const TERMINAL_STAGES = new Set(['FG', 'DP']);

interface ReportFlowRef {
  itemId: string;
  itemCode: string;
  itemName: string;
  inScope: boolean;
}

/** Subset of the `ProductionInventoryReportRow` payload we consume. */
interface ReportRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomCode: string | null;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  scrapOut: number;
  closingBalance: number;
  onHand: number;
  flow?: {
    source: ReportFlowRef | null;
    consumers: ReportFlowRef[];
    flowStatus: 'SOURCE' | 'CHAIN';
  };
}

/** Pass 1 — cells that depend on nothing else in the grid. */
interface StagePass {
  def: ChainRowDef;
  src?: ReportRow;
  opBalance: number;
  production: number;
  /** 1 for RM (already KG), weight_per_piece for PCS/GRS, null if unknown. */
  multiplier: number | null;
  found: boolean;
}

interface IssuanceResolution {
  value: number;
  rule: string;
  driven: boolean;
}

interface LedgerMetrics {
  key: string;
  order: number;
  stage: string;
  stageLabel: string;
  itemCode: string;
  itemName: string;
  splitSide?: SplitSide;
  uomCode: string | null;
  opBalance: number;
  production: number;
  subTotal: number;
  issuance: number;
  issuanceRule: string;
  issuanceDriven: boolean;
  closingPieces: number;
  perPieceWeight: number | null;
  totalWeight: number | null;
  scrapToday: number;
  scrapMonth: number;
  found: boolean;
}

interface ChainSummary {
  found: number;
  total: number;
  missingCodes: string[];
  balanced: boolean;
  undriven: string[];
  totalPacked: number;
}

interface ChainGrid {
  def: ChainDef;
  rows: LedgerMetrics[];
  summary: ChainSummary;
}

/* ── §1 SMART FORMATTING ──────────────────────────────────────────────── */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/** Strips trailing zeros from the FRACTION only — `100` stays `100`. */
const trimZeros = (s: string): string => {
  if (s.indexOf('.') < 0) return s;
  const trimmed = s.replace(/0+$/, '');
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
};

/** PCS / GRS are counted units — they can never be a half or a fraction. */
const isCountUnit = (uom: string | null | undefined): boolean => {
  const u = (uom ?? '').trim().toUpperCase();
  return u === 'PCS' || u === 'GRS';
};

/**
 * Quantity columns.
 *  · PCS / GRS ⇒ clean integers (`62779.00` → `62779`).
 *  · KG / other ⇒ up to 2 decimals, no pointless `.00` (`607.00` → `607`).
 */
export const fmtQty = (v: number | null | undefined, uom: string | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (isCountUnit(uom)) return String(Math.round(v));
  if (v === 0) return '0';
  return trimZeros(v.toFixed(2));
};

/** Weight columns — whole number when the fraction is zero, else ≤ 2 decimals. */
export const fmtKg = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (v === 0) return '0';
  return trimZeros(v.toFixed(2));
};

/**
 * §1 — PER PIECE WEIGHT is the one column that keeps 4 decimals, ALWAYS:
 * `0.00967` must read `0.0097`, never collapse to `0.01`. Piece counts stay
 * whole integers; this is the sole exception to the smart-decimal rule.
 * Shared by the grid, the print render and the PDF body rows.
 */
export const fmtPpw = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(4);

const STAGE_COLOR: Record<string, string> = {
  RM: 'default',
  ST: 'blue',
  SW: 'geekblue',
  SP: 'purple',
  PL: 'gold',
  FG: 'green',
  DP: 'volcano',
};

/** Rows 2-8: PCS/GRS multiply by weight; KG and unknown units pass through. */
const resolveWeight = (
  uomCode: string | null,
  weightPerPiece: number | undefined,
): number | null => {
  if (!isCountUnit(uomCode)) return 1;
  return weightPerPiece ?? null;
};

/**
 * §3 — the semantic colour pathways (Production / Closing / Rejection) live
 * in CSS, not here, so they can key off `[data-theme='dark']` and off the
 * print reset from a single place: `.iwl-cell-prod`, `.iwl-cell-close` and
 * `.iwl-cell-scrap`.
 */

/* ── Ledger construction (pure — one grid per registered chain) ───────── */

export const buildChainGrid = (
  def: ChainDef,
  reportRows: ReportRow[],
  monthScrap: Record<string, number>,
  weightMap: Record<string, number | null>,
): ChainGrid => {
  const declaredRows = def.rows.filter(
    (r) => typeof r.itemCode === 'string' && r.itemCode.trim() !== '',
  );

  const emptySummary: ChainSummary = {
    found: 0,
    total: 0,
    missingCodes: [],
    balanced: true,
    undriven: [],
    totalPacked: 0,
  };
  if (declaredRows.length === 0) return { def, rows: [], summary: emptySummary };

  const rowByCode = new Map<string, ReportRow>();
  reportRows.forEach((r) => rowByCode.set(r.itemCode, r));

  // Unique stage order, as actually declared — the basis for successors.
  const stageOrder: string[] = [];
  declaredRows.forEach((r) => {
    if (!stageOrder.includes(r.stage)) stageOrder.push(r.stage);
  });
  const successorOf = (stage: string): string | undefined => {
    const i = stageOrder.indexOf(stage);
    return i >= 0 && i + 1 < stageOrder.length ? stageOrder[i + 1] : undefined;
  };

  // ── PASS 1 — independent cells: Opening + Production from the ledger. ──
  const pass1: StagePass[] = declaredRows.map((rowDef) => {
    const src = rowByCode.get(rowDef.itemCode);
    const multiplier =
      rowDef.stage === 'RM'
        ? 1
        : resolveWeight(src?.uomCode ?? null, weightMap[rowDef.itemCode] ?? undefined);
    return {
      def: rowDef,
      src,
      opBalance: round4(num(src?.openingBalance)),
      production: round4(num(src?.totalIn)),
      multiplier,
      found: Boolean(src),
    };
  });

  const byStage = (stage: string) => pass1.filter((p) => p.def.stage === stage);

  /**
   * ── PASS 2 — Issuance = the SUCCESSOR stage's Production. ──
   * Resolved from the stages present, so a chain with no SW depletes ST
   * straight from SP without any index gymnastics.
   */
  const resolveIssuance = (p: StagePass): IssuanceResolution => {
    const stage = p.def.stage;
    const ledger = (rule: string): IssuanceResolution => ({
      value: round4(num(p.src?.totalOut)),
      rule,
      driven: false,
    });

    if (TERMINAL_STAGES.has(stage)) {
      return ledger('Recorded issues (OUT) — terminal stage');
    }

    const nextStage = successorOf(stage);
    if (!nextStage) return ledger('Recorded issues (OUT) — no successor stage');

    const consumers = byStage(nextStage);
    if (consumers.length === 0) return ledger(`Recorded issues (OUT) — no ${nextStage} rows`);

    // Same branch (Inner→Inner, Outer→Outer) when both sides declare one.
    const matched =
      p.def.splitSide !== undefined
        ? consumers.filter((c) => c.def.splitSide === p.def.splitSide)
        : consumers.filter((c) => c.def.splitSide === undefined);

    // RM converts its successor's pieces into KG using that successor's weight.
    const needsKg = stage === 'RM';
    const convert = (c: StagePass): number | null => {
      if (!needsKg) return c.production;
      if (c.multiplier === null) return null;
      return round4(c.production * c.multiplier);
    };

    if (matched.length > 0) {
      if (!matched.every((c) => c.found)) {
        return ledger(`Recorded issues (OUT) — ${nextStage} driver unavailable`);
      }
      const parts = matched.map(convert);
      if (parts.some((v) => v === null)) {
        return ledger('Recorded issues (OUT) — successor weight missing');
      }
      const value = round4(parts.reduce<number>((s, v) => s + (v ?? 0), 0));
      const label = matched.map((c) => c.def.itemCode).join(' + ');
      return {
        value,
        rule: needsKg ? `${label} Production × weight (KG)` : `= ${label} Production`,
        driven: true,
      };
    }

    // No shared side ⇒ my stage rows share the successor pool equally.
    // (PL Inner + PL Outer each take half of the single FG bundle.)
    if (!consumers.every((c) => c.found)) {
      return ledger(`Recorded issues (OUT) — ${nextStage} driver unavailable`);
    }
    const parts = consumers.map(convert);
    if (parts.some((v) => v === null)) {
      return ledger('Recorded issues (OUT) — successor weight missing');
    }
    const pool = round4(parts.reduce<number>((s, v) => s + (v ?? 0), 0));
    const shareCount = byStage(stage).length || 1;
    return {
      value: round4(pool / shareCount),
      rule: `${nextStage} Production ${shareCount > 1 ? `÷ ${shareCount}` : ''} (shared)`,
      driven: true,
    };
  };

  // ── PASS 3 — Closing derives from the RESOLVED issuance, so a forced
  //             value always depletes the row and its Total Weight. ──
  const rows: LedgerMetrics[] = pass1.map((p) => {
    const iss = resolveIssuance(p);
    const subTotal = round4(p.opBalance + p.production);
    const closingPieces = round4(subTotal - iss.value);
    const totalWeight = p.multiplier === null ? null : round4(closingPieces * p.multiplier);

    return {
      key: `${p.def.stage}-${p.def.itemCode}${p.def.splitSide ?? ''}`,
      order: p.def.order,
      stage: p.def.stage,
      stageLabel: p.def.stageLabel,
      itemCode: p.def.itemCode,
      itemName: p.src?.itemName ?? p.def.itemLabel ?? '—',
      splitSide: p.def.splitSide,
      uomCode: p.src?.uomCode ?? null,
      opBalance: p.opBalance,
      production: p.production,
      subTotal,
      issuance: iss.value,
      issuanceRule: iss.rule,
      issuanceDriven: iss.driven,
      closingPieces,
      perPieceWeight: p.multiplier,
      totalWeight,
      scrapToday: round4(num(p.src?.scrapOut)),
      scrapMonth: monthScrap[p.def.itemCode] ?? 0,
      found: p.found,
    };
  });

  const found = rows.filter((r) => r.found).length;
  const missingCodes = Array.from(new Set(rows.filter((r) => !r.found).map((r) => r.itemCode)));
  const fg = rows.find((r) => r.stage === 'FG');
  const summary: ChainSummary = {
    found,
    total: rows.length,
    missingCodes,
    // Reconciliation: every row must satisfy Closing = (Op + Production) − Issuance.
    balanced: rows.every((r) => Math.abs(r.closingPieces - (r.subTotal - r.issuance)) < 0.005),
    undriven: rows
      .filter((r) => !r.issuanceDriven && !TERMINAL_STAGES.has(r.stage))
      .map((r) => r.stage),
    totalPacked: fg?.production ?? 0,
  };

  return { def, rows, summary };
};

/* ── §4 EXPORT HELPERS ────────────────────────────────────────────────── */

/**
 * Single source of truth for the corporate letterhead — the on-screen
 * banner, the Excel workbook and the PDF all read from here.
 */
export const LETTERHEAD = {
  company: 'PWI — Pakistan Wire & Industry',
  subtitle: 'ERP / MRP Command Center — Manufacturing Division',
  reportTitle: 'Item-Wise Production Ledger Flow',
  division: 'Production & Spoke Department',
} as const;

/** jsPDF page geometry (A4 landscape, in points). */
const PDF_PAGE_W = 841.89;
const PDF_PAGE_H = 595.28;
const PDF_MARGIN_X = 28;
const PDF_RULE_TOP = 90; // bottom of the full letterhead on page 1
const PDF_RULE_BOTTOM = 44; // bottom of the running header on later pages

/**
 * §2 — the Item Code / Item Name pair is a SINGLE column on screen and in
 * both exports. This index table is the one source of truth for column
 * styling across the grid, the PDF and the workbook.
 */
export const COL = {
  stage: 0,
  item: 1,
  op: 2,
  production: 3,
  subTotal: 4,
  issuance: 5,
  closing: 6,
  perPieceWeight: 7,
  totalWeight: 8,
  uom: 9,
  scrapToday: 10,
  scrapMonth: 11,
} as const;

const EXPORT_HEADERS = [
  'Stage', 'Item (Code / Name)', 'Op Balance', 'Production', 'Sub-Total', 'Issuance',
  'Closing Pieces', 'Per Piece Weight', 'Total Weight', 'UoM', 'Today Scrap', 'Total Month Scrap',
];

const stageLabel = (r: LedgerMetrics): string =>
  `${r.stage}${r.splitSide ? ` (${r.splitSide === 'INNER' ? 'Inner' : 'Outer'})` : ''} — ${r.stageLabel}`;

/** §2 — one cell, code over name, so nothing can overlap in the sheet. */
const stackItem = (r: LedgerMetrics): string => `${r.itemCode}\n${r.itemName}`;

/** Values exactly as the screen shows them (PDF / CSV-style fidelity). */
const exportDisplayRow = (r: LedgerMetrics): (string | number | null)[] => [
  stageLabel(r),
  stackItem(r),
  fmtQty(r.opBalance, r.uomCode),
  fmtQty(r.production, r.uomCode),
  fmtQty(r.subTotal, r.uomCode),
  fmtQty(r.issuance, r.uomCode),
  fmtQty(r.closingPieces, r.uomCode),
  fmtPpw(r.perPieceWeight),
  fmtKg(r.totalWeight),
  r.uomCode ?? '—',
  fmtQty(r.scrapToday, r.uomCode),
  fmtQty(r.scrapMonth, r.uomCode),
];

/** Numeric cells for Excel — integers for PCS/GRS, 2 dp for weights. */
const exportNumericRow = (r: LedgerMetrics): (string | number | null)[] => [
  stageLabel(r),
  stackItem(r),
  exportCell(r.opBalance, r.uomCode),
  exportCell(r.production, r.uomCode),
  exportCell(r.subTotal, r.uomCode),
  exportCell(r.issuance, r.uomCode),
  exportCell(r.closingPieces, r.uomCode),
  // §1 — raw precision: Excel shows the stored value, not a 2-dp rounding.
  r.perPieceWeight ?? null,
  exportCell(r.totalWeight, null),
  r.uomCode ?? '—',
  exportCell(r.scrapToday, r.uomCode),
  exportCell(r.scrapMonth, r.uomCode),
];

function exportCell(v: number | null, uom: string | null): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  if (isCountUnit(uom)) return Math.round(v);
  return Math.round(v * 100) / 100;
}

const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/* ── Minimal XLSX writer (stored-entry ZIP — no external dependency) ──── */

const utf8Bytes = (str: string): Uint8Array => {
  const out: number[] = [];
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = str.charCodeAt(i + 1);
      i += 1;
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (data: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** STORED (method 0) ZIP — valid for any Office Open XML package. */
export const buildZip = (entries: ZipEntry[]): Uint8Array => {
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = utf8Bytes(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 file names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, entry.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    centralParts.push(cd);

    offset += local.length + entry.data.length;
  });

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const out = new Uint8Array(offset + centralSize + eocd.length);
  let cursor = 0;
  [...localParts, ...centralParts, eocd].forEach((part) => {
    out.set(part, cursor);
    cursor += part.length;
  });
  return out;
};

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnName = (index: number): string => {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

type SheetCell = string | number | null | undefined;

/** §5 — autofit a column to its longest LINE so nothing is clipped. */
const excelColWidth = (matrix: SheetCell[][], col: number): number => {
  let max = 0;
  matrix.forEach((cells) => {
    const v = cells[col];
    if (v === null || v === undefined) return;
    String(v)
      .split('\n')
      .forEach((line) => {
        if (line.length > max) max = line.length;
      });
  });
  return Math.min(Math.max(max + 3, 10), 45);
};

export const buildXlsx = (matrix: SheetCell[][], sheetName: string): Uint8Array => {
  const columnCount = matrix.reduce((n, cells) => Math.max(n, cells.length), 0);
  const cols = `<cols>${Array.from({ length: columnCount }, (_, i) => {
    const w = excelColWidth(matrix, i);
    return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
  }).join('')}</cols>`;

  const sheetRows = matrix
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const xml = cells
        .map((cell, colIndex) => {
          if (cell === null || cell === undefined || cell === '') return '';
          const ref = `${columnName(colIndex)}${rowNumber}`;
          if (typeof cell === 'number' && Number.isFinite(cell)) {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          const text = String(cell);
          // §2 — the stacked Item cell (and anything else multiline) wraps.
          const styleRef = text.includes('\n') ? ' s="1"' : '';
          return `<c r="${ref}"${styleRef} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
            text,
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNumber}">${xml}</row>`;
    })
    .join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(
    sheetName.slice(0, 31),
  )}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  // xf 0 = default · xf 1 = wrap + top-aligned (the stacked Item cell).
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const part = (name: string, xml: string): ZipEntry => ({ name, data: utf8Bytes(xml) });
  return buildZip([
    { name: '[Content_Types].xml', data: utf8Bytes(contentTypes) },
    { name: '_rels/.rels', data: utf8Bytes(rootRels) },
    part('xl/workbook.xml', workbook),
    part('xl/_rels/workbook.xml.rels', workbookRels),
    part('xl/styles.xml', styles),
    part('xl/worksheets/sheet1.xml', sheet),
  ]);
};

/* ── Component ────────────────────────────────────────────────────────── */

const ItemWiseProductionLedger: React.FC = () => {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [monthScrap, setMonthScrap] = useState<Record<string, number>>({});
  const [weightMap, setWeightMap] = useState<Record<string, number | null>>({});
  const [chainKey, setChainKey] = useState<string>(CHAIN_REGISTRY[0]?.key ?? '');
  const [showAll, setShowAll] = useState(false);
  /**
   * §1 — chain keys the operator has ticked off. Absent ⇒ included, so the
   * default state is "every chain checked" with no seeding required.
   */
  const [excludedChains, setExcludedChains] = useState<Record<string, boolean>>({});
  const [tick, setTick] = useState(0);

  /** The End Date IS "today" for the ledger — it drives every cutoff. */
  const endDate = range[1].format('YYYY-MM-DD');
  /**
   * §3 — the month baseline only moves when the calendar is used.
   * Previous / Next Day shift the End Date alone; the guard keeps the
   * window well-formed if the End Date is stepped before the baseline.
   */
  const monthFrom = range[0].isAfter(range[1])
    ? range[1].startOf('month').format('YYYY-MM-DD')
    : range[0].format('YYYY-MM-DD');

  const chainDef = useMemo(
    () => CHAIN_REGISTRY.find((c) => c.key === chainKey) ?? CHAIN_REGISTRY[0] ?? null,
    [chainKey],
  );

  /** §3 — ±1 day on the End Date; the month baseline stays put. */
  const shiftEndDay = useCallback((delta: number) => {
    setRange(([start, end]) => [start, end.add(delta, 'day')]);
  }, []);

  /**
   * Weights are loaded once for EVERY registered chain so switching the
   * dropdown re-renders instantly with no follow-up round-trip.
   */
  const loadWeights = useCallback(async () => {
    const wanted = Array.from(
      new Set(CHAIN_REGISTRY.flatMap((c) => c.rows.map((r) => r.itemCode.trim())).filter(Boolean)),
    );
    if (wanted.length === 0) return;
    const found: Record<string, number | null> = {};
    const toWeight = (raw: unknown): number | null =>
      raw === null || raw === undefined || raw === '' ? null : num(raw);

    // 1) one bulk page for the whole Item Master…
    try {
      const res: any = await apiService.get('/master-data/items', { limit: 5000 });
      const list: any[] = Array.isArray(res?.data) ? res.data : [];
      const byCode = new Map<string, any>(list.map((i) => [i?.itemCode, i]));
      wanted.forEach((code) => {
        const hit = byCode.get(code);
        if (hit) found[code] = toWeight(hit.weightPerPiece);
      });
    } catch {
      /* fall through — the per-code lookup below covers every miss */
    }

    // 2) …then a targeted search for anything the bulk page did not return.
    const missing = wanted.filter((code) => !(code in found));
    await Promise.all(
      missing.map(async (code) => {
        try {
          const res: any = await apiService.get('/master-data/items', { search: code, limit: 10 });
          const list: any[] = Array.isArray(res?.data) ? res.data : [];
          const hit = list.find((i) => i?.itemCode === code);
          found[code] = toWeight(hit?.weightPerPiece);
        } catch {
          found[code] = null;
        }
      }),
    );
    setWeightMap((prev) => ({ ...prev, ...found }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Day window  ⇒ Opening = everything before it, Production = that day
      //               only ⇒ Closing(D) ≡ Opening(D+1).
      // Month window⇒ cumulative scrap from the month baseline up to endDate.
      const dayReq = apiService.get<{ data: { items?: ReportRow[] } }>(
        '/production/inventory-report',
        { dateFrom: endDate, dateTo: endDate },
      );
      const monthReq =
        monthFrom === endDate
          ? Promise.resolve(null)
          : apiService.get<{ data: { items?: ReportRow[] } }>(
              '/production/inventory-report',
              { dateFrom: monthFrom, dateTo: endDate },
            );

      const [dayRes, monthRes] = await Promise.all([dayReq, monthReq]);
      const dayItems = dayRes?.data?.items ?? [];
      const monthItems = monthRes?.data?.items ?? dayItems;

      setRows(dayItems);
      setMonthScrap(
        Object.fromEntries(monthItems.map((r) => [r.itemCode, round4(num(r.scrapOut))])),
      );
    } catch (e: any) {
      setRows([]);
      setMonthScrap({});
      setError(e?.response?.data?.message || 'Failed to load the Item-Wise Production Ledger');
    } finally {
      setLoading(false);
    }
  }, [endDate, monthFrom]);

  useEffect(() => {
    void loadWeights();
  }, [loadWeights]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  /* §5 — one grid for the selected chain, or every registered chain. */
  const grids = useMemo<ChainGrid[]>(() => {
    const defs = showAll ? CHAIN_REGISTRY : chainDef ? [chainDef] : [];
    return defs.map((d) => buildChainGrid(d, rows, monthScrap, weightMap));
  }, [showAll, chainDef, rows, monthScrap, weightMap]);

  /** §1 — what the summary, PDF, Excel and printer are allowed to see. */
  const visibleGrids = useMemo<ChainGrid[]>(
    () => (showAll ? grids.filter((g) => !excludedChains[g.def.key]) : grids),
    [showAll, grids, excludedChains],
  );

  const excludedCount = useMemo(
    () => grids.filter((g) => excludedChains[g.def.key]).length,
    [grids, excludedChains],
  );

  /** §1 — tick / untick a chain. Untick ⇒ grid collapses off every output. */
  const setChainExcluded = useCallback((key: string, excluded: boolean) => {
    setExcludedChains((prev) => {
      if (!excluded) {
        if (!prev[key]) return prev;
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }
      return prev[key] ? prev : { ...prev, [key]: true };
    });
  }, []);

  const restoreAllChains = useCallback(() => setExcludedChains({}), []);

  const summary = useMemo(() => {
    const missingCodes = new Set<string>();
    const undriven = new Set<string>();
    let found = 0;
    let total = 0;
    let totalPacked = 0;
    let balanced = true;
    visibleGrids.forEach((g) => {
      found += g.summary.found;
      total += g.summary.total;
      totalPacked += g.summary.totalPacked;
      balanced = balanced && g.summary.balanced;
      g.summary.missingCodes.forEach((c) => missingCodes.add(c));
      g.summary.undriven.forEach((s) => undriven.add(s));
    });
    return {
      found,
      total,
      totalPacked,
      balanced,
      missingCodes: Array.from(missingCodes),
      undriven: Array.from(undriven),
    };
  }, [visibleGrids]);

  const columns = useMemo(
    () => [
      {
        title: 'Stage',
        dataIndex: 'stageLabel',
        key: 'stageLabel',
        width: 124,
        fixed: 'left' as const,
        render: (_: unknown, row: LedgerMetrics) => (
          <Space size={4} wrap>
            <Tag color={STAGE_COLOR[row.stage] ?? 'default'}>{row.stage}</Tag>
            <Text type="secondary">{row.stageLabel.replace(' Stage', '')}</Text>
            {row.splitSide ? (
              <Tag color={row.splitSide === 'INNER' ? 'cyan' : 'magenta'}>
                {row.splitSide === 'INNER' ? 'Inner' : 'Outer'}
              </Tag>
            ) : null}
          </Space>
        ),
      },
      {
        // §2 — Item Code sits ON TOP of Item Name inside one cell.
        title: 'Item (Code / Name)',
        key: 'item',
        width: 306,
        onCell: () => ({
          className: 'iwl-cell-item',
          style: { whiteSpace: 'normal' as const, wordBreak: 'break-word' as const },
        }),
        render: (_: unknown, row: LedgerMetrics) => (
          <div className="iwl-item-stack">
            {row.found ? (
              <span className="iwl-item-code">{row.itemCode}</span>
            ) : (
              <Tooltip title="Item not present in the current scope / period">
                <span className="iwl-item-code iwl-item-code--missing">{row.itemCode}</span>
              </Tooltip>
            )}
            <span className="iwl-item-name">{row.itemName}</span>
          </div>
        ),
      },
      {
        title: 'Op Balance',
        dataIndex: 'opBalance',
        key: 'opBalance',
        align: 'right' as const,
        width: 136,
        onCell: () => ({ className: 'iwl-cell-num' }),
        render: (v: number, row: LedgerMetrics) => (
          <Tooltip title="Net closing of every day BEFORE the End Date">
            <span>{fmtQty(v, row.uomCode)}</span>
          </Tooltip>
        ),
      },
      {
        title: 'Production',
        dataIndex: 'production',
        key: 'production',
        align: 'right' as const,
        width: 144,
        onHeaderCell: () => ({ className: 'iwl-cell-num' }),
        onCell: () => ({ className: 'iwl-cell-prod iwl-cell-num' }),
        render: (v: number, row: LedgerMetrics) => (
          <Tooltip
            title={
              row.stage === 'FG'
                ? 'Total Packed Pieces — the consolidated FG / Packing bundle'
                : 'Additions (IN) recorded on the End Date only'
            }
          >
            <span>{fmtQty(v, row.uomCode)}</span>
          </Tooltip>
        ),
      },
      {
        title: 'Sub-Total',
        dataIndex: 'subTotal',
        key: 'subTotal',
        align: 'right' as const,
        width: 136,
        onCell: () => ({ className: 'iwl-cell-num' }),
        render: (v: number, row: LedgerMetrics) => (
          <Text strong>{fmtQty(v, row.uomCode)}</Text>
        ),
      },
      {
        title: 'Issuance',
        dataIndex: 'issuance',
        key: 'issuance',
        align: 'right' as const,
        width: 154,
        onCell: () => ({ className: 'iwl-cell-num' }),
        render: (v: number, row: LedgerMetrics) =>
          row.issuanceDriven ? (
            <Tooltip title={`Driven by the next stage: ${row.issuanceRule}`}>
              <Text type="warning">{fmtQty(v, row.uomCode)}</Text>
            </Tooltip>
          ) : (
            <Tooltip title={row.issuanceRule}>
              <span>{fmtQty(v, row.uomCode)}</span>
            </Tooltip>
          ),
      },
      {
        title: 'Closing Pieces',
        dataIndex: 'closingPieces',
        key: 'closingPieces',
        align: 'right' as const,
        width: 154,
        onHeaderCell: () => ({ className: 'iwl-cell-num' }),
        onCell: () => ({ className: 'iwl-cell-close iwl-cell-num' }),
        render: (v: number, row: LedgerMetrics) => (
          <Tooltip title="(Op Balance + Production) − Issuance">
            <span>{fmtQty(v, row.uomCode)}</span>
          </Tooltip>
        ),
      },
      {
        // Stacked two-line header to reclaim horizontal space.
        title: (
          <div style={{ textAlign: 'right', lineHeight: 1.1 }}>
            <div>Per Piece</div>
            <div>Weight</div>
          </div>
        ),
        dataIndex: 'perPieceWeight',
        key: 'perPieceWeight',
        align: 'right' as const,
        width: 116,
        onCell: () => ({ className: 'iwl-cell-num' }),
        render: (v: number | null, row: LedgerMetrics) => {
          const uom = (row.uomCode ?? '').toUpperCase();
          const tip =
            row.stage === 'RM'
              ? 'RM base unit is already KG — multiplier is 1'
              : isCountUnit(uom)
                ? 'items.weight_per_piece (KG)'
                : `UoM '${uom || '—'}' is not a piece unit — multiplier is 1`;
          return (
            <Tooltip title={tip}>
              <span>{fmtPpw(v)}</span>
            </Tooltip>
          );
        },
      },
      {
        title: 'Total Weight',
        dataIndex: 'totalWeight',
        key: 'totalWeight',
        align: 'right' as const,
        width: 140,
        onCell: () => ({ className: 'iwl-cell-num' }),
        render: (v: number | null, row: LedgerMetrics) => (
          <Tooltip
            title={
              row.stage === 'RM'
                ? 'RM: Total Weight = Closing Balance (already KG)'
                : 'Total Weight = Closing Pieces × Per Piece Weight'
            }
          >
            <Text strong>{fmtKg(v)}</Text>
          </Tooltip>
        ),
      },
      {
        title: 'UoM',
        dataIndex: 'uomCode',
        key: 'uomCode',
        align: 'center' as const,
        width: 52,
        render: (v: string | null) => v ?? '—',
      },
      {
        // §5 — two scrap trackers under one grouped header.
        title: 'Scrap',
        key: 'scrapGroup',
        children: [
          {
            title: 'Today Scrap',
            dataIndex: 'scrapToday',
            key: 'scrapToday',
            align: 'right' as const,
            width: 84,
            // §3 — the whole column is forced crimson, zeros included.
            onCell: () => ({ className: 'iwl-cell-scrap iwl-cell-num' }),
            render: (v: number, row: LedgerMetrics) => (
              <Tooltip title={`Rejections recorded on ${endDate}`}>
                <span>{fmtQty(v, row.uomCode)}</span>
              </Tooltip>
            ),
          },
          {
            title: 'Total Month Scrap',
            dataIndex: 'scrapMonth',
            key: 'scrapMonth',
            align: 'right' as const,
            width: 96,
            onCell: () => ({ className: 'iwl-cell-scrap iwl-cell-num' }),
            render: (v: number, row: LedgerMetrics) => (
              <Tooltip title={`Cumulative from ${monthFrom} to ${endDate}`}>
                <span>{fmtQty(v, row.uomCode)}</span>
              </Tooltip>
            ),
          },
        ],
      },
    ],
    [endDate, monthFrom],
  );

  const chainOptions = CHAIN_REGISTRY.map((c) => ({ value: c.key, label: c.label }));

  /* ── §4 export actions ─────────────────────────────────────────────── */

  const stamp = () => `${endDate}-${dayjs().format('HHmmss')}`;

  const handleExcel = () => {
    if (visibleGrids.length === 0) {
      message.warning('No item chain is included in the export');
      return;
    }
    try {
      const matrix: SheetCell[][] = [
        [LETTERHEAD.company],
        [LETTERHEAD.subtitle],
        [],
        ['Report Title', LETTERHEAD.reportTitle],
        ['Selected Division', LETTERHEAD.division],
        ['Production Date', endDate],
        ['Month Window', `${monthFrom} to ${endDate}`],
        ['Generated', dayjs().format('YYYY-MM-DD HH:mm')],
        ['Chains Included', String(visibleGrids.length)],
        [],
      ];
      // §1 — excluded chains never reach the workbook.
      visibleGrids.forEach((g) => {
        matrix.push([]);
        matrix.push([g.def.label]);
        matrix.push(EXPORT_HEADERS);
        g.rows.forEach((r) => matrix.push(exportNumericRow(r)));
      });
      // Copy into a fresh ArrayBuffer-backed view so it satisfies BlobPart.
      const bytes = new Uint8Array(buildXlsx(matrix, 'Item-Wise Ledger'));
      saveBlob(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `item-wise-production-ledger-${stamp()}.xlsx`,
      );
      message.success('Excel workbook exported');
    } catch {
      message.error('Excel export failed');
    }
  };

  /* ── §3 corporate letterhead for the PDF sheet ─────────────────────── */

  const drawPdfLetterhead = (doc: jsPDF): void => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(LETTERHEAD.company, PDF_MARGIN_X, 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(91, 100, 114);
    doc.text(LETTERHEAD.subtitle, PDF_MARGIN_X, 48);

    const colW = (PDF_PAGE_W - PDF_MARGIN_X * 2) / 3;
    const meta: [string, string][] = [
      ['Report Title', LETTERHEAD.reportTitle],
      ['Selected Division', LETTERHEAD.division],
      ['Production Date', endDate],
    ];
    meta.forEach(([label, value], i) => {
      const x = PDF_MARGIN_X + colW * i;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(68, 68, 68);
      doc.text(label.toUpperCase(), x, 64);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(value, x, 77);
    });

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1.2);
    doc.line(PDF_MARGIN_X, PDF_RULE_TOP, PDF_PAGE_W - PDF_MARGIN_X, PDF_RULE_TOP);
  };

  /** Compact continuation banner for pages after the first. */
  const drawPdfRunningHeader = (doc: jsPDF): void => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(LETTERHEAD.company, PDF_MARGIN_X, 24);
    doc.text(`Production Date: ${endDate}`, PDF_PAGE_W - PDF_MARGIN_X, 24, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`${LETTERHEAD.reportTitle}  ·  ${LETTERHEAD.division}`, PDF_MARGIN_X, 35);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.6);
    doc.line(PDF_MARGIN_X, PDF_RULE_BOTTOM, PDF_PAGE_W - PDF_MARGIN_X, PDF_RULE_BOTTOM);
  };

  /** Page footer — division stamp left, page number right. */
  const drawPdfFooter = (doc: jsPDF, pageNumber: number): void => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(150, 160, 175);
    doc.text(LETTERHEAD.division, PDF_MARGIN_X, PDF_PAGE_H - 16);
    doc.text(`Page ${pageNumber}`, PDF_PAGE_W - PDF_MARGIN_X, PDF_PAGE_H - 16, { align: 'right' });
  };

  const handlePdf = () => {
    if (visibleGrids.length === 0) {
      message.warning('No item chain is included in the export');
      return;
    }
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      drawPdfLetterhead(doc);

      /** Minimum room one chain needs — used to decide "new page". */
      const CHAIN_SLOT = 140;
      const pageBottom = PDF_PAGE_H - 34;
      let placed = 0;
      let cursor = 0;

      // §1 — only the chains the operator left ticked are rendered.
      visibleGrids.forEach((g) => {
        let startY: number;
        if (placed === 0) {
          startY = PDF_RULE_TOP + 12;
        } else if (cursor + CHAIN_SLOT > pageBottom) {
          // §2 — no room for a WHOLE chain ⇒ push it to the next page.
          doc.addPage();
          startY = PDF_RULE_BOTTOM + 6;
        } else {
          startY = cursor + 16;
        }

        autoTable(doc, {
          head: [EXPORT_HEADERS],
          body: g.rows.map((r) => exportDisplayRow(r)),
          startY,
          // §2 — autotable's own guard: a chain table is never split.
          pageBreak: 'avoid',
          margin: {
            top: PDF_RULE_BOTTOM + 6,
            right: PDF_MARGIN_X,
            bottom: 34,
            left: PDF_MARGIN_X,
          },
          theme: 'grid',
          styles: {
            fontSize: 8,
            cellPadding: 3,
            overflow: 'linebreak',
            // §3 — ultra-thin slate hairlines, matching the print grid exactly.
            lineWidth: 0.2,
            lineColor: [226, 232, 240],
            // §2/§4 — clean white sheet with black figures, never the app theme.
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
          },
          headStyles: {
            // §2 — commanding slate band, white ultra-bold type, statement rule.
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            lineColor: [15, 23, 42],
            lineWidth: { top: 0.2, bottom: 2, left: 0.2, right: 0.2 },
          },
          tableLineWidth: 0.4,
          tableLineColor: [226, 232, 240],
          columnStyles: {
            // §3 — Stage / UoM compressed, the space handed to Item + balances.
            [COL.stage]: { cellWidth: 78 },
            [COL.item]: { cellWidth: 204 },
            [COL.uom]: { cellWidth: 30 },
          },
          // §3 — the same colour pathways the screen uses.
          didParseCell: (data) => {
            if (data.section === 'head') return;
            const idx = data.column.index;
            if (idx === COL.production) {
              data.cell.styles.fillColor = [231, 248, 241];
              data.cell.styles.textColor = [4, 120, 87];
              data.cell.styles.fontStyle = 'bold';
            } else if (idx === COL.closing) {
              data.cell.styles.fillColor = [255, 246, 229];
              data.cell.styles.textColor = [180, 83, 9];
              data.cell.styles.fontStyle = 'bold';
            } else if (idx === COL.scrapToday || idx === COL.scrapMonth) {
              data.cell.styles.textColor = [255, 77, 79];
            }
          },
          didDrawPage: () => {
            const pageNumber = doc.getCurrentPageInfo().pageNumber;
            if (pageNumber > 1) drawPdfRunningHeader(doc);
            drawPdfFooter(doc, pageNumber);
          },
        });

        // Fall back to the page bottom so a chain can never be stacked on
        // top of the previous one if `finalY` is unavailable.
        const finalY = (doc as any).lastAutoTable?.finalY;
        cursor = typeof finalY === 'number' ? finalY : PDF_PAGE_H;
        placed += 1;
      });

      doc.save(`item-wise-production-ledger-${stamp()}.pdf`);
      message.success('PDF downloaded');
    } catch {
      message.error('PDF export failed');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="iwl-page" style={{ padding: 24 }}>
      <style>{`
        /* ── §3 corporate letterhead (screen) ─────────────────────────── */
        .iwl-letterhead {
          border: 1px solid #d9d9d9;
          border-left: 5px solid #1677ff;
          border-radius: 6px;
          background: #fbfcfe;
          padding: 14px 18px;
          margin-bottom: 16px;
        }
        .iwl-lh-company { font-size: 22px; font-weight: 800; line-height: 1.15; letter-spacing: -0.2px; color: #0f172a; }
        .iwl-lh-subtitle { font-size: 13px; font-weight: 500; color: #5b6472; margin-top: 3px; }
        .iwl-lh-rule { height: 1px; background: #dfe4ea; margin: 11px 0 9px; }
        .iwl-lh-meta { display: flex; flex-wrap: wrap; gap: 6px 40px; }
        .iwl-lh-item { min-width: 220px; }
        .iwl-lh-label {
          display: block; font-size: 10px; font-weight: 600; letter-spacing: 0.7px;
          text-transform: uppercase; color: #8a94a6;
        }
        .iwl-lh-value { display: block; font-size: 14px; font-weight: 700; color: #1f2937; margin-top: 1px; }

        /* ── §4 chain identifier: centred bold sub-header ──────────────── */
        .iwl-grid-head {
          position: relative; display: flex; align-items: center;
          justify-content: center; gap: 8px; margin-bottom: 8px;
        }
        .iwl-chain-check { position: absolute; left: 0; top: 50%; transform: translateY(-50%); }
        .iwl-grid-title { text-align: center; font-weight: 800 !important; letter-spacing: 0.2px; }
        .iwl-grid--off .iwl-grid-title { text-decoration: line-through; color: #b0b7c3; }
        .iwl-grid--off .iwl-grid-table { display: none; }
        .iwl-remarks { margin-top: 20px; }

        /* ── §2 stacked Item cell: CODE over NAME, never overlapping ──── */
        .iwl-item-stack { display: flex; flex-direction: column; gap: 1px; line-height: 1.3; }
        .iwl-item-code {
          font-weight: 700; font-size: 13px; color: #1677ff; letter-spacing: -0.1px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .iwl-item-code--missing { color: #faad14; }
        .iwl-item-name { font-size: 12px; color: #8a94a6; }

        /* ── §2 commanding slate header: dark band, white ultra-bold type ─ */
        .iwl-grid .ant-table-thead > tr > th {
          background: #1e293b !important;
          color: #ffffff !important;
          font-weight: 800 !important;
          font-size: 12.5px !important;
          letter-spacing: 0.2px;
          padding: 9px 10px !important;
        }

        /* ── §3 12–13px reading baseline; the balances lead the grid ───── */
        .iwl-grid .ant-table-tbody > tr > td { font-size: 12.5px; }
        .iwl-grid .ant-table-tbody > tr > td.iwl-cell-item,
        .iwl-grid .ant-table-tbody > tr > td.iwl-cell-num { font-size: 13px; font-weight: 600; }

        /* ── §3 colour pathways — a light pair and a dark pair ────────── */
        .iwl-cell-prod {
          background: rgba(16, 185, 129, 0.16) !important;
          color: #047857 !important; font-weight: 800 !important;
        }
        .iwl-cell-close {
          background: rgba(245, 158, 11, 0.20) !important;
          color: #b45309 !important; font-weight: 700 !important;
        }
        .iwl-cell-scrap { color: #ff4d4f !important; font-weight: 700 !important; }

        [data-theme='dark'] .iwl-letterhead { background: #141b26; border-color: #2a3444; border-left-color: #1677ff; }
        [data-theme='dark'] .iwl-lh-company { color: #f1f5f9; }
        [data-theme='dark'] .iwl-lh-subtitle { color: #94a3b8; }
        [data-theme='dark'] .iwl-lh-rule { background: #2a3444; }
        [data-theme='dark'] .iwl-lh-label { color: #7c8ba1; }
        [data-theme='dark'] .iwl-lh-value { color: #e2e8f0; }
        [data-theme='dark'] .iwl-item-code { color: #69b1ff; }
        [data-theme='dark'] .iwl-item-code--missing { color: #ffc53d; }
        [data-theme='dark'] .iwl-item-name { color: #9aa6b8; }
        [data-theme='dark'] .iwl-grid--off .iwl-grid-title { color: #55606f; }
        [data-theme='dark'] .iwl-cell-prod { background: rgba(16, 185, 129, 0.20) !important; color: #34d399 !important; }
        [data-theme='dark'] .iwl-cell-close { background: rgba(245, 158, 11, 0.18) !important; color: #fbbf24 !important; }

        @page { size: A4 landscape; margin: 8mm 9mm; }

        @media print {
          /* ══ §2 ABSOLUTE WHITE PAGE ══════════════════════════════════════
             The active Dark Theme must never reach the paper. Every surface
             in the sheet is flattened to pure #ffffff with black text FIRST;
             the soft header tint, the letterhead rule and the semantic
             accents are re-applied afterwards at higher specificity. Note the
             deliberate absence of a blanket print-color-adjust: exact — that
             rule made the browser rasterise a background for EVERY node in
             the document and is what froze the print dialog and burned ink. */
          html, body,
          .iwl-page,
          .ant-layout, .ant-layout-content,
          .ant-card, .ant-card-head, .ant-card-body,
          .ant-table, .ant-table-container, .ant-table-content,
          .ant-table-tbody > tr > td,
          .ant-alert, .ant-alert-info, .ant-alert-warning, .ant-alert-error,
          .ant-tag, .ant-spin-blur {
            background-color: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            border-color: #e2e8f0 !important;
          }

          /* Kill animation/transition/compositing — the other freeze source. */
          *, *::before, *::after {
            animation: none !important;
            transition: none !important;
            box-shadow: none !important;
            text-shadow: none !important;
            will-change: auto !important;
          }

          /* App chrome and every interactive control */
          .ant-layout-sider,
          .ant-layout-header,
          .erp-workspace-tabstrip-container { display: none !important; }
          .ant-layout { min-height: auto !important; }
          .ant-layout-content { padding: 0 !important; }
          .iwl-page { padding: 0 !important; }
          .iwl-card > .ant-card-head { display: none !important; }
          .iwl-card > .ant-card-body { padding: 0 !important; }
          .iwl-no-print, .iwl-toolbar { display: none !important; }

          /* Letterhead replaces the raw title line — colours mirror jsPDF
             exactly so the printed sheet and the PDF are one document. */
          .iwl-letterhead {
            border: 0 !important;
            border-bottom: 1.6px solid #0f172a !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            padding: 0 0 7px !important;
            margin: 0 0 10px !important;
          }
          .iwl-lh-company { font-size: 19pt !important; color: #0f172a !important; }
          .iwl-lh-subtitle { font-size: 9pt !important; color: #5b6472 !important; margin-top: 2px !important; }
          .iwl-lh-rule { display: none !important; }
          .iwl-lh-meta { gap: 4px 34px !important; margin-top: 7px !important; }
          .iwl-lh-item { min-width: 0 !important; }
          .iwl-lh-label { font-size: 6.5pt !important; color: #444444 !important; }
          .iwl-lh-value { font-size: 9.5pt !important; color: #0f172a !important; }

          /* A chain is an atomic page unit; never split it */
          .iwl-grid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            min-height: 200px;
            margin-bottom: 10px !important;
          }
          .iwl-grid--off { display: none !important; }
          /* §4 — the chain identifier sits dead-centre as a bold sub-header */
          .iwl-grid-head {
            position: static !important;
            justify-content: center !important;
            margin-bottom: 5px !important;
          }
          .iwl-grid-title {
            text-align: center !important;
            font-size: 12pt !important;
            font-weight: 800 !important;
            letter-spacing: 0.3px !important;
            color: #0f172a !important;
          }
          .iwl-grid-sub, .iwl-grid-off-note { font-size: 8pt !important; color: #444444 !important; }
          .iwl-item-code { font-size: 12px !important; color: #000000 !important; }
          .iwl-item-name { font-size: 11px !important; color: #444444 !important; }

          /* Premium pre-formatted financial grid */
          .iwl-grid .ant-table-wrapper,
          .iwl-grid .ant-table,
          .iwl-grid .ant-table-container,
          .iwl-grid .ant-table-content {
            overflow: visible !important;
            border: 0 !important;
            box-shadow: none !important;
          }
          .iwl-grid .ant-table-content::before,
          .iwl-grid .ant-table-content::after { display: none !important; }
          .iwl-grid table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: auto !important;
            border-collapse: collapse !important;
            border: 1px solid #e2e8f0 !important;
            background: #ffffff !important;
            font-size: 11px !important;
            font-variant-numeric: tabular-nums;
          }
          .iwl-grid col { width: auto !important; }
          .iwl-grid thead { display: table-header-group; }
          /* §2 — COMMANDING SLATE HEADER: dark tone, pure white ultra-bold
             type, generous padding. Explicitly painted on the light fill so it
             survives with "Background graphics" switched off. */
          .iwl-grid .ant-table-thead,
          .iwl-grid .ant-table-thead > tr {
            background-color: #1e293b !important;
            background-image: none !important;
          }
          .iwl-grid .ant-table-thead > tr > th {
            background-color: #1e293b !important;
            background-image: none !important;
            color: #ffffff !important;
            border: 1px solid #334155 !important;
            border-bottom: 2px solid #0f172a !important;
            font-weight: 800 !important;
            font-size: 10.5px !important;
            letter-spacing: 0.3px;
            padding: 7px 8px !important;
            white-space: normal !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .iwl-grid .ant-table-thead > tr > th::before { display: none !important; }
          /* §3 — ultra-thin hairlines, collapsed so no double-weight seams */
          .iwl-grid .ant-table-tbody > tr > td {
            border: 1px solid #e2e8f0 !important;
            padding: 4px 6px !important;
            font-size: 11px !important;
            white-space: normal !important;
            word-break: break-word;
          }
          /* §3 — numerics right-align as one column and never wrap mid-figure */
          .iwl-grid .ant-table-tbody > tr > td.iwl-cell-num {
            font-size: 12px !important;
            text-align: right !important;
            white-space: nowrap !important;
            word-break: normal !important;
            overflow-wrap: normal !important;
            font-variant-numeric: tabular-nums;
          }
          .iwl-grid .ant-table-thead > tr > th.iwl-cell-num { text-align: right !important; }
          /* §3 — stacked Item cell: code over name, flush left, never clipped */
          .iwl-grid .ant-table-tbody > tr > td.iwl-cell-item {
            font-size: 12px !important;
            text-align: left !important;
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: break-word;
          }
          .iwl-grid .iwl-item-code {
            white-space: nowrap !important;
            word-break: normal !important;
            overflow-wrap: normal !important;
          }
          .iwl-grid .iwl-item-name {
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: anywhere;
          }
          .iwl-grid .ant-table-tbody > tr:hover > td:not([class*='iwl-cell-']) {
            background-color: #ffffff !important;
          }
          /* Fixed cells carry an opaque theme background of their own — clear it,
             otherwise the Stage column prints as a dark slab under Dark Theme. */
          .iwl-grid .ant-table-tbody > tr,
          .iwl-grid .ant-table-tbody > tr > td:not([class*='iwl-cell-']),
          .iwl-grid .ant-table-cell-fix-left,
          .iwl-grid .ant-table-cell-fix-right {
            background-color: #ffffff !important;
          }
          .iwl-grid .ant-table-cell-fix-left,
          .iwl-grid .ant-table-cell-fix-right { position: static !important; box-shadow: none !important; }
          .iwl-grid .ant-table-cell-fix-left::after,
          .iwl-grid .ant-table-cell-fix-right::after { display: none !important; }
          .iwl-grid tr, .iwl-grid td, .iwl-grid th { break-inside: avoid; page-break-inside: avoid; }

          /* §3 accents, re-applied ABOVE the white reset */
          .iwl-grid .ant-table-tbody > tr > td.iwl-cell-prod,
          .iwl-grid .ant-table-tbody > tr > td.iwl-cell-close {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .iwl-grid .ant-table-tbody > tr > td.iwl-cell-prod {
            background: #e7f8f1 !important;
            color: #047857 !important;
            font-weight: 800 !important;
          }
          .iwl-grid .ant-table-tbody > tr > td.iwl-cell-close {
            background: #fff6e5 !important;
            color: #b45309 !important;
            font-weight: 700 !important;
          }
          .iwl-grid .ant-table-tbody > tr > td.iwl-cell-scrap {
            color: #ff4d4f !important;
            font-weight: 700 !important;
          }

          /* §1 remarks sit under the grid, kept together */
          .iwl-remarks { margin-top: 8px !important; break-inside: avoid; page-break-inside: avoid; }
          .iwl-remarks .ant-alert { margin-bottom: 6px !important; font-size: 7.5pt !important; }

          .iwl-note, .iwl-note .ant-typography { font-size: 7.5pt !important; color: #444444 !important; }
        }
      `}</style>
      {/* §3 — the raw title line is gone; the letterhead below is the heading */}
      <Card
        className="iwl-card"
        bordered={false}
        title={null}
        extra={
          <Space wrap className="iwl-no-print">
            <RangePicker
              value={range}
              allowClear={false}
              format="YYYY-MM-DD"
              onChange={(v) => {
                if (v && v[0] && v[1]) setRange([v[0], v[1]]);
              }}
            />
            <Button icon={<LeftOutlined />} onClick={() => shiftEndDay(-1)}>
              Previous Day
            </Button>
            <Button onClick={() => shiftEndDay(1)}>
              Next Day <RightOutlined />
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => setTick((t) => t + 1)} loading={loading}>
              Refresh
            </Button>
          </Space>
        }
      >
        {/* ── §3 corporate letterhead ───────────────────────────────────── */}
        <div className="iwl-letterhead">
          <div className="iwl-lh-company">{LETTERHEAD.company}</div>
          <div className="iwl-lh-subtitle">{LETTERHEAD.subtitle}</div>
          <div className="iwl-lh-rule" />
          <div className="iwl-lh-meta">
            <div className="iwl-lh-item">
              <span className="iwl-lh-label">Report Title</span>
              <span className="iwl-lh-value">{LETTERHEAD.reportTitle}</span>
            </div>
            <div className="iwl-lh-item">
              <span className="iwl-lh-label">Selected Division</span>
              <span className="iwl-lh-value">{LETTERHEAD.division}</span>
            </div>
            <div className="iwl-lh-item">
              <span className="iwl-lh-label">Production Date</span>
              <span className="iwl-lh-value">{endDate}</span>
            </div>
          </div>
        </div>

        {/* §1 print — the whole metric strip is screen-only. On paper the
            letterhead + its 3-column metadata grid is the sole masthead. */}
        <Row gutter={[16, 16]} className="iwl-no-print" style={{ marginBottom: 16 }}>
          {/* §4 — chain picker + toggles are interactive; never print them */}
          <Col xs={24} lg={9} className="iwl-no-print">
            <Text type="secondary">Select Production Item Chain</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <Select
                style={{ width: '100%' }}
                showSearch
                placeholder="Select Production Item Chain"
                value={chainKey}
                onChange={(v) => setChainKey(v)}
                optionFilterProp="label"
                disabled={showAll}
                options={chainOptions}
              />
              <Checkbox
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="iwl-no-print"
              >
                Show All Item Chains on One Page
              </Checkbox>
              {showAll && excludedCount > 0 ? (
                <div className="iwl-no-print" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {excludedCount} chain{excludedCount > 1 ? 's' : ''} excluded from the sheet and every
                    export.
                  </Text>
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={restoreAllChains}>
                    Restore all
                  </Button>
                </div>
              ) : null}
            </div>
          </Col>
          <Col xs={24} lg={5}>
            <Card size="small">
              <Text type="secondary">{showAll ? 'Stages Shown' : 'Stages in Chain'}</Text>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {summary.found}
                <Text type="secondary" style={{ fontSize: 14 }}>
                  {' '}
                  / {summary.total}
                </Text>
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={5}>
            <Card size="small">
              <Text type="secondary">As-On (End Date)</Text>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{endDate}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                baseline {monthFrom}
              </Text>
            </Card>
          </Col>
          <Col xs={24} lg={5}>
            <Card size="small">
              <Tooltip
                title={
                  showAll
                    ? 'Sum of the FG / Packing bundle across every shown chain'
                    : 'FG / Packing bundle on the As-On date — split ÷ 2 into PL Inner and PL Outer Issuance'
                }
              >
                <Text type="secondary">Total Packed Pieces</Text>
              </Tooltip>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{fmtQty(summary.totalPacked, 'PCS')}</div>
            </Card>
          </Col>
          <Col xs={24} lg={4}>
            <Card size="small">
              <Text type="secondary">Reconciliation</Text>
              <div style={{ marginTop: 4 }}>
                <Tag color={summary.balanced ? 'success' : 'error'}>
                  {summary.balanced ? 'Balanced ✓' : 'MISMATCH'}
                </Tag>
              </div>
            </Card>
          </Col>
        </Row>

        {/* §4 — export & print row, top right of the ledger sheet */}
        <div
          className="iwl-toolbar"
          style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}
        >
          <Tooltip title="Download exactly what is on screen as an Excel workbook">
            <Button type="primary" icon={<FileExcelOutlined />} onClick={handleExcel}>
              Export to Excel (.xlsx)
            </Button>
          </Tooltip>
          <Tooltip title="Landscape PDF, one page per item chain">
            <Button icon={<DownloadOutlined />} onClick={handlePdf}>
              Download PDF
            </Button>
          </Tooltip>
          <Tooltip title="Open the browser print dialog (Landscape)">
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>
              Print Ledger
            </Button>
          </Tooltip>
        </div>

        <Spin spinning={loading}>
          {grids.length === 0 && !loading ? (
            <Empty description="No production item chain configured" />
          ) : (
            grids.map((g) => {
              // §1 — an unticked chain keeps only its struck-through title.
              // Gated on `showAll` so a stale key can never blank the single view.
              const excluded = showAll && Boolean(excludedChains[g.def.key]);
              return (
                <div
                  key={g.def.key}
                  className={`iwl-grid${excluded ? ' iwl-grid--off' : ''}`}
                  style={{ marginBottom: showAll ? 24 : 0 }}
                >
                  <div className="iwl-grid-head">
                    {showAll ? (
                      <Checkbox
                        className="iwl-chain-check iwl-no-print"
                        checked={!excluded}
                        onChange={(e) => setChainExcluded(g.def.key, !e.target.checked)}
                        aria-label={`Include ${g.def.label} in the sheet, PDF, Excel and print output`}
                      />
                    ) : null}
                    <Title level={5} className="iwl-grid-title" style={{ marginBottom: 0 }}>
                      {g.def.label}
                      <Text
                        type="secondary"
                        className="iwl-grid-sub"
                        style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}
                      >
                        {g.summary.found}/{g.summary.total} stages
                      </Text>
                    </Title>
                  </div>
                  {excluded ? (
                    <Text type="secondary" className="iwl-grid-off-note" style={{ fontSize: 12 }}>
                      Excluded from the view, the PDF, the workbook and the printout.
                    </Text>
                  ) : (
                    <div className="iwl-grid-table">
                      <Table
                        columns={columns}
                        dataSource={g.rows}
                        rowKey="key"
                        pagination={false}
                        scroll={{ x: 1642 }}
                        size="small"
                        bordered
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Spin>

        {/* ── §1 — remarks & warnings live BELOW the grid so the letterhead
                and the tables own the prime top space of the sheet ─────── */}
        <div className="iwl-remarks">
          <Alert
            type="info"
            showIcon
            className="iwl-no-print"
            style={{ marginBottom: 12 }}
            message="Sequential chain rules"
            description={
              <>
                Computed <strong>as-on {endDate}</strong>. <em>Opening</em> covers every prior day,{' '}
                <em>Production</em> this day only — so advancing the End Date rolls <em>Closing</em> into the
                next day&rsquo;s <em>Opening</em>. <strong>Issuance is driven by the next stage:</strong> RM ←
                ST Production × weight (KG) · ST ← SW · SW ← SP Inner + SP Outer · SP ← matching PL branch ·
                PL Inner/Outer ← FG Packed ({fmtQty(summary.totalPacked, 'PCS')}) ÷ 2.{' '}
                <strong>Closing = (Op + Production) − Issuance</strong>. Piece units (PCS / GRS) render as
                whole integers; KG and weight columns use up to 2 decimals. Scrap is tracked twice: today only
                vs. cumulative from {monthFrom}.
              </>
            }
          />

          {error ? (
            <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />
          ) : null}

          {!loading && !error && summary.missingCodes.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Some chain items were not returned"
              description={
                <>Not present in the current company / division scope: {summary.missingCodes.join(', ')}</>
              }
              style={{ marginBottom: 12 }}
            />
          ) : null}

          {!loading && summary.undriven.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Chain rule could not be applied to some stages"
              description={
                <>
                  Driver unavailable for: {Array.from(new Set(summary.undriven)).join(', ')}. Those cells fall
                  back to recorded ledger issues (OUT) instead of the driven value.
                </>
              }
              style={{ marginBottom: 12 }}
            />
          ) : null}
        </div>

        <div className="iwl-note" style={{ marginTop: 16 }}>
          <Text type="secondary">
            Read-only view. Opening and Production come from the stock ledger; Issuance is derived from the
            next stage so the pipeline depletes top-to-bottom. Sub-Total = Op Balance + Production; Closing =
            Sub-Total − Issuance. PCS / GRS columns show whole integers; KG and weight columns show at most
            2 decimals.
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default ItemWiseProductionLedger;
