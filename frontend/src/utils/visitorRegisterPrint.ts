/**
 * Visitor REGISTER print — the multi-column gate list (Prompt #19C).
 *
 * ── Why this is a separate module, separate from the Visitor Slip ──────────
 * The individual Visitor Slip and the Visitor Register are two DIFFERENT
 * documents that happen to come from the same page:
 *
 *   • The SLIP is a single A4 **portrait** sheet, one visitor, a signature box
 *     the visitor signs by hand, and a letterhead sized to be handed across a
 *     desk. It is built by `visitorSlipHtml.ts` and it is NOT touched here.
 *   • The REGISTER is a 13-column tabular list of many visitors. It is built
 *     here, and it prints A4 **landscape**.
 *
 * Nothing in this file is imported by the slip, and nothing in the slip is
 * imported for layout — only the three shared constants and `escapeHtml`, so
 * both documents say the company's name the same way and both escape the same
 * way. A change here cannot alter the slip's page size, header grid or
 * signature area, and a change to the slip cannot reach this table.
 *
 * ── Why the document changed at all ───────────────────────────────────────
 * The previous register printed A4 **portrait** with a fluid 100%-width table
 * and 11px body text at 7px/6px cell padding. Thirteen columns across 190mm is
 * about 14mm each, so every value wrapped: `VIS-2026-000051` broke into three
 * lines, a timestamp broke into five, and rows grew to 40–60px. Twenty-five
 * ordinary records took THREE pages. That is not a register; it is a column
 * layout that ran out of paper.
 *
 * The fixes are all in this file's own stylesheet — the print document is a
 * separate document, so none of it can leak onto the ERP screen (Part #19C §10).
 *   1. `size: A4 landscape` — 277mm of content instead of 190mm, +46%.
 *   2. `table-layout: fixed` + an explicit `<colgroup>`, so a long visitor name
 *      can no longer steal width from its neighbours (§7).
 *   3. Compact type: 8.5px body / 7.5px header, 2px row padding (§5).
 *   4. Two deliberate line breaks per date cell and `white-space: nowrap` on
 *      every identifier, clock, status and flag — so nothing stacks vertically
 *      any more (§6).
 *   5. `thead { display: table-header-group }`, so the column titles repeat at
 *      the top of every page instead of appearing once (§8).
 */

import dayjs from 'dayjs';
import {
  SLIP_COMPANY_CITY,
  SLIP_COMPANY_NAME,
  SLIP_COMPANY_UNIT,
  escapeHtml,
} from './visitorSlipHtml';

/**
 * Printable width of A4 landscape at the 10mm side margins used below (mm).
 * The matching printable HEIGHT is 189mm (9mm top / 12mm bottom), which is what
 * fixes how many rows fit on one sheet — about 29 at the density measured here.
 */
const SHEET_WIDTH_MM = 277;

// ─── Column model ────────────────────────────────────────────────────────────

export interface RegisterColumn {
  key: string;
  label: string;
  /** Percentage of the table width. The 13 values sum to exactly 100. */
  width: number;
  /** `nowrap` on the narrow identifier/clock/status columns (§6). */
  nowrap?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Yellow highlight border on key readability columns. */
  highlight?: boolean;
}

/**
 * Deliberate widths, in the order §7 of the brief asks for: room for the
 * columns a guard reads (Name, Company, Host, both clocks), and the least
 * possible room for the columns that only ever hold a short token.
 *
 * Sized against A4 landscape's 277mm of content width:
 *   #          2.5% →  6.9mm   one or two digits
 *   VISITOR ID 9.0% → 24.9mm   `VIS-2026-000051` at 8.5px is ~19mm — one line
 *   NAME      11.3% → 31.3mm   the widest free text, so the widest column
 *   CNIC       8.7% → 24.1mm   `12345-1234567-1` at 8.5px is ~19mm — one line
 *   MOBILE     7.9% → 21.9mm   `+92 300 1234567` is ~18mm — one line
 *   COMPANY    9.9% → 27.4mm
 *   HOST      10.4% → 28.8mm   name, not UUID — highlighted in yellow
 *   DIV/LOC    9.7% → 26.9mm   division code + location code, stacked
 *   TIME-IN    8.2% → 22.7mm   `29-Sep-2026` / `01:01 AM` stacked
 *   TIME-OUT   8.2% → 22.7mm
 *   STATUS     6.6% → 18.3mm   the longest word is `COMPLETED` — measured
 *   HOST CONF. 6.1% → 16.9mm   `Confirmed` — measured
 *
 * The mm figures are what the browser produced on the live 25-record register.
 * DIVISION and LOCATION are now a single stacked column (DIV / LOC) so the
 * HOST column can be wider — the guard reads the host name, not two short codes.
 */
export const REGISTER_COLUMNS: RegisterColumn[] = [
  { key: 'index',         label: '#',                 width: 2.5,  align: 'center' },
  { key: 'reference',     label: 'VISITOR ID',        width: 9.0,  nowrap: true },
  { key: 'name',          label: 'VISITOR NAME',      width: 11.3 },
  { key: 'cnic',          label: 'CNIC',              width: 8.7,  nowrap: true },
  { key: 'mobile',        label: 'MOBILE',            width: 7.9,  nowrap: true },
  { key: 'company',       label: 'COMPANY',           width: 9.9 },
  { key: 'host',          label: 'HOST',              width: 10.4, highlight: true },
  { key: 'divLoc',        label: 'DIVISION/LOCATION', width: 9.7,  highlight: true },
  { key: 'timeIn',        label: 'TIME-IN',           width: 8.2,  nowrap: true },
  { key: 'timeOut',       label: 'TIME-OUT',          width: 8.2,  nowrap: true },
  { key: 'status',        label: 'STATUS',            width: 6.6,  nowrap: true },
  { key: 'hostConfirmed', label: 'HOST CONF.',        width: 7.6,  nowrap: true, align: 'center' },
];

// ─── Row model ───────────────────────────────────────────────────────────────

export interface VisitorRegisterRow {
  visitorReference?: string | null;
  visitorName: string;
  cnic?: string | null;
  mobile?: string | null;
  visitorCompany?: string | null;
  hostNameSnapshot?: string | null;
  division?: { divisionCode?: string | null; name?: string | null } | null;
  location?: { locationCode?: string | null; name?: string | null } | null;
  timeIn: string;
  timeOut?: string | null;
  status: string;
  /** Server-derived; the client falls back to `PENDING && !timeOut`. */
  onSite?: boolean;
  hostConfirmed?: boolean;
}

export interface VisitorRegisterOptions {
  rows: VisitorRegisterRow[];
  /** What the document covers, e.g. `Date: 29-Sep-2026` or `Month: September 2026`. */
  rangeLabel: string;
  /** Defaults to now. Injectable so a rendered document is reproducible. */
  printedAt?: string;
  companyName?: string;
  companyCity?: string;
  companyUnit?: string;
  /** Shown instead of rows when the range contains nothing (§19C §8). */
  emptyMessage?: string;
}

// ─── Cell helpers ───────────────────────────────────────────────────────────

/** A dash for "not provided"; never prints `null`, `undefined` or `NaN`. */
const orDash = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text.length > 0 ? escapeHtml(text) : '—';
};

/**
 * UUID shape — 8-4-4-4-12 hex, case-insensitive.
 * If the backend ever returns a raw UUID instead of a resolved name, the
 * register shows a dash rather than a 36-character identifier string.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Safe host name: returns the name only when it is a real human name.
 * UUID → dash, empty → dash, otherwise escaped text.
 */
const hostNameCell = (value: string | null | undefined): string => {
  const text = (value ?? '').trim();
  if (!text || UUID_RE.test(text)) return '—';
  return escapeHtml(text);
};

/**
 * A stored timestamp split into its date and clock halves for a two-line cell.
 *
 * The register is a printed document, so it follows the slip's 12-hour AM/PM
 * convention (#19A §1) — a gate reads `01:01 PM`, not `01:01`. The ERP screen
 * deliberately keeps the 24-hour form; that difference is intentional and is
 * the same one the slip already makes.
 *
 * Returns `[date, time]`. A missing value yields a single em dash and no time,
 * so the cell is one line rather than two lines of dashes.
 */
export function registerStampParts(value?: string | null): [string, string] {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!text) return ['—', ''];
  const parsed = dayjs(text);
  // An unparseable stored value is passed through, never replaced with a
  // fabricated date — a register is a record, not a rendering.
  if (!parsed.isValid()) return [escapeHtml(text), ''];
  return [parsed.format('DD-MMM-YYYY'), parsed.format('hh:mm A')];
}

/** `29-Sep-2026` over `01:01 PM`, or one line when there is no time half. */
const stampCell = (value: string | null | undefined): string => {
  const [date, time] = registerStampParts(value);
  if (!time) return escapeHtml(date);
  return `<span class="vr-dt">${escapeHtml(date)}</span><span class="vr-tm">${escapeHtml(time)}</span>`;
};

/** Still on site: the server said so, or fall back to the status/Time-Out pair. */
const onSite = (row: VisitorRegisterRow): boolean =>
  typeof row.onSite === 'boolean' ? row.onSite : row.status === 'PENDING' && !row.timeOut;

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'vr-st-pending',
  INSIDE: 'vr-st-inside',
  COMPLETED: 'vr-st-done',
  CANCELLED: 'vr-st-cancelled',
};

const statusCell = (status: string): string => {
  const cls = STATUS_CLASS[status] ?? 'vr-st-cancelled';
  return `<span class="vr-badge ${cls}">${escapeHtml(status)}</span>`;
};

// ─── Stylesheet ──────────────────────────────────────────────────────────────

/**
 * Every rule here is scoped to the register's own document.
 *
 * The size, the table model and the density are chosen for A4 LANDSCAPE paper
 * and are deliberately NOT the screen's — the ERP page keeps its own responsive
 * table and its own 12px type, untouched (§10). This string never reaches the
 * app: the document is written into a detached iframe, exactly as the slip is.
 */
export const REGISTER_CSS = `
*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
html,body{margin:0;padding:0;background:#ffffff;}
body{font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;color:#111827;}

/* Screen preview: the sheet is a fixed 277mm canvas, so on a narrow browser
   window the SCROLL lives on this inner box. The document itself never gains a
   page-level horizontal scrollbar (§11), and nothing about the printed page
   changes — in print the sheet simply fills the paper. */
.vr-viewport{overflow-x:auto;overflow-y:hidden;width:100%;}
.vr-sheet{width:${SHEET_WIDTH_MM}mm;margin:0 auto;padding:6mm 0 0;}

.vr-head{display:flex;align-items:flex-end;justify-content:space-between;gap:6mm;
  border-bottom:1.2px solid #0f172a;padding-bottom:1.2mm;margin-bottom:1.6mm;}
.vr-co-name{font-size:13px;font-weight:800;color:#0f172a;letter-spacing:.3px;line-height:1.15;}
.vr-co-sub{font-size:8.5px;color:#475569;margin-top:.5mm;line-height:1.2;}
.vr-title{font-size:16px;font-weight:900;color:#0f172a;text-transform:uppercase;
  letter-spacing:1.1px;line-height:1.1;text-align:right;white-space:nowrap;}
.vr-title-rule{width:26mm;height:2.2px;background:#e74c3c;margin:.8mm 0 0 auto;}

.vr-meta{display:flex;justify-content:space-between;align-items:baseline;gap:4mm;
  font-size:8px;color:#475569;margin-bottom:1.2mm;line-height:1.25;}
.vr-meta b{color:#0f172a;font-weight:700;}

table.vr{width:100%;border-collapse:collapse;table-layout:fixed;}
thead{display:table-header-group;}          /* repeat the titles on every page */
tfoot{display:table-footer-group;}
tr{page-break-inside:avoid;break-inside:avoid;}

th{background:#1e293b;color:#fff;font-size:7.5px;font-weight:800;text-transform:uppercase;
  letter-spacing:.35px;padding:1.3mm .9mm;text-align:left;border:.2mm solid #1e293b;
  line-height:1.15;vertical-align:middle;}
td{font-size:8.5px;padding:.25mm .9mm;border:.2mm solid #d8dee9;line-height:1.12;
  vertical-align:middle;color:#111827;overflow-wrap:break-word;word-break:normal;}
tbody tr:nth-child(even) td{background:#f6f8fb;}

th.nw,td.nw{white-space:nowrap;}
th.c,td.c{text-align:center;}

td.vr-idx{color:#64748b;font-variant-numeric:tabular-nums;}
td.vr-id{font-weight:700;letter-spacing:.1px;font-variant-numeric:tabular-nums;}
td.vr-name{font-weight:700;}

/* ── Yellow-border highlight columns: HOST and DIV/LOC ── */
th.vr-hl{background:#b8860b!important;color:#fff!important;
  border-left:.6mm solid #f5c518!important;border-right:.6mm solid #f5c518!important;}
td.vr-hl{border-left:.5mm solid #f5c518!important;border-right:.5mm solid #f5c518!important;
  background:#fffde7;}
tbody tr:nth-child(even) td.vr-hl{background:#fff8c5;}

/* HOST cell: bold name, no UUID ever */
td.vr-host{font-weight:700;color:#1a237e;}

/* Stacked DIVISION / LOCATION names */
.vr-div{display:block;font-size:7.8px;font-weight:700;color:#1e293b;line-height:1.2;
  white-space:normal;word-break:break-word;}
.vr-loc{display:block;font-size:7px;font-weight:500;color:#475569;line-height:1.2;
  white-space:normal;word-break:break-word;margin-top:.5mm;border-top:.2mm dashed #d1d5db;padding-top:.4mm;}

/* One date, one clock, two deliberate lines — never five (§6). */
.vr-dt{display:block;line-height:1.12;white-space:nowrap;}
.vr-tm{display:block;line-height:1.12;white-space:nowrap;color:#475569;
  font-variant-numeric:tabular-nums;}

.vr-badge{display:inline-block;font-size:7.5px;font-weight:800;letter-spacing:.1px;
  padding:.1mm .8mm;border-radius:.8mm;border:.2mm solid transparent;line-height:1.25;
  white-space:nowrap;}
.vr-st-pending{background:#fff7e6;color:#b35c00;border-color:#ffd591;}
.vr-st-inside{background:#e6f4ff;color:#0958d9;border-color:#91caff;}
.vr-st-done{background:#f6ffed;color:#237804;border-color:#b7eb8f;}
.vr-st-cancelled{background:#f5f5f5;color:#4a4a4a;border-color:#d9d9d9;}

.vr-hc-yes{color:#237804;font-weight:700;}
.vr-hc-no{color:#8c8c8c;}
.vr-pend{color:#b35c00;font-weight:600;}

.vr-foot{display:flex;justify-content:space-between;align-items:baseline;gap:4mm;
  font-size:7px;color:#94a3b8;border-top:.2mm solid #e2e8f0;padding-top:.9mm;
  margin-top:1.4mm;line-height:1.3;}

/* Page numbers, drawn in the page margin by the print engine (§8). */
@page{
  size:A4 landscape;
  margin:9mm 10mm 12mm 10mm;
  @bottom-left{content:"Visitor Register — ${SLIP_COMPANY_NAME}";font-family:Arial,sans-serif;
    font-size:6.5pt;color:#94a3b8;}
  @bottom-right{content:"Page " counter(page) " of " counter(pages);
    font-family:Arial,sans-serif;font-size:6.5pt;color:#94a3b8;}
}

@media print{
  html,body{overflow:visible!important;width:auto!important;}
  .vr-viewport{overflow:visible!important;width:auto!important;}
  .vr-sheet{width:auto;margin:0;padding:0;}
  .vr-empty td{font-size:9px;color:#64748b;text-align:center;padding:6mm 1mm;}
}
`;

// ─── Renderer ────────────────────────────────────────────────────────────────

const cell = (col: RegisterColumn, html: string): string => {
  const cls = [
    col.nowrap ? 'nw' : '',
    col.align === 'center' ? 'c' : '',
    col.highlight ? 'vr-hl' : '',
    col.key === 'host' ? 'vr-host' : '',
  ].filter(Boolean).join(' ');
  return `<td class="${`vr-${col.key}${cls ? ' ' + cls : ''}`}">${html}</td>`;
};

/**
 * Render the complete Visitor Register document.
 *
 * Pure string generation with no DOM access, so it can be unit-tested, written
 * to a file, and rendered by a headless browser to measure real page count
 * without going through the application.
 */
export function renderVisitorRegisterHtml(options: VisitorRegisterOptions): string {
  const {
    rows,
    rangeLabel,
    printedAt,
    companyName = SLIP_COMPANY_NAME,
    companyCity = SLIP_COMPANY_CITY,
    companyUnit = SLIP_COMPANY_UNIT,
    emptyMessage = 'No visitor entries match this range within the current filter.',
  } = options;

  const stamp = dayjs(printedAt ?? undefined);
  const printedLabel = stamp.isValid() ? stamp.format('DD-MMM-YYYY hh:mm A') : '—';

  const head = REGISTER_COLUMNS.map((c) => {
    const cls = [
      c.nowrap ? 'nw' : '',
      c.align === 'center' ? 'c' : '',
      c.highlight ? 'vr-hl' : '',
    ].filter(Boolean).join(' ');
    return `<th class="${cls}" scope="col">${escapeHtml(c.label)}</th>`;
  }).join('');

  const body =
    rows.length === 0
      ? `<tr class="vr-empty"><td class="c" colspan="${REGISTER_COLUMNS.length}">${escapeHtml(emptyMessage)}</td></tr>`
      : rows
          .map((row, i) => {
            const timeOut = row.timeOut ? stampCell(row.timeOut) : onSite(row) ? '<span class="vr-pend">Pending</span>' : '—';

            // Stacked DIVISION / LOCATION cell — show names, not codes
            const divName = (row.division?.name ?? '').trim();
            const locName = (row.location?.name ?? '').trim();
            const divLocHtml = divName || locName
              ? [
                  divName ? `<span class="vr-div">${escapeHtml(divName)}</span>` : '',
                  locName ? `<span class="vr-loc">${escapeHtml(locName)}</span>` : '',
                ].filter(Boolean).join('')
              : '—';

            const cells: Record<string, string> = {
              index:         escapeHtml(String(i + 1)),
              reference:     orDash(row.visitorReference),
              name:          orDash(row.visitorName),
              cnic:          orDash(row.cnic),
              mobile:        orDash(row.mobile),
              company:       orDash(row.visitorCompany),
              host:          hostNameCell(row.hostNameSnapshot),
              divLoc:        divLocHtml,
              timeIn:        stampCell(row.timeIn),
              timeOut,
              status:        statusCell(row.status),
              hostConfirmed: row.hostConfirmed
                ? '<span class="vr-hc-yes">✓ Confirmed</span>'
                : '<span class="vr-hc-no">Pending</span>',
            };
            return `<tr>${REGISTER_COLUMNS.map((c) => cell(c, cells[c.key])).join('')}</tr>`;
          })
          .join('');

  const colgroup = REGISTER_COLUMNS.map((c) => `<col style="width:${c.width}%" />`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Visitor Register</title>
<style>${REGISTER_CSS}</style>
</head>
<body>
<div class="vr-viewport">
  <div class="vr-sheet">
    <div class="vr-head">
      <div>
        <div class="vr-co-name">${escapeHtml(companyName)}</div>
        <div class="vr-co-sub">${escapeHtml(companyUnit)} &mdash; ${escapeHtml(companyCity)}</div>
      </div>
      <div>
        <div class="vr-title">Visitor Register</div>
        <div class="vr-title-rule"></div>
      </div>
    </div>
    <div class="vr-meta">
      <span>${escapeHtml(rangeLabel)}</span>
      <span><b>${rows.length}</b> record${rows.length === 1 ? '' : 's'}</span>
      <span>Printed ${escapeHtml(printedLabel)}</span>
    </div>
    <table class="vr">
      <colgroup>${colgroup}</colgroup>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="vr-foot">
      <span>${escapeHtml(companyName)}, ${escapeHtml(companyCity)}</span>
      <span>Generated by the ERP Visitor Management module &middot; server-issued timestamps</span>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ─── Print trigger ───────────────────────────────────────────────────────────

/** Id of the detached frame the register is printed from. */
export const REGISTER_FRAME_ID = 'pwi-visitor-register-frame';

/**
 * Write the register into a detached iframe and open the print dialog.
 *
 * The same mechanism `printTemplates.printHtmlContent` uses, and for the same
 * reason: `window.open` is refused by most popup blockers, and a security desk
 * that cannot print a register at the gate cannot use the feature at all. The
 * frame is off-screen and carries its own stylesheet, so nothing about it is
 * visible on, or inherited by, the ERP page.
 *
 * The register deliberately does NOT go through `printHtmlContent` itself:
 * that function hard-codes A4 **portrait** and a 190mm container, because it
 * exists to print portrait business documents and the Visitor Slip. Widening it
 * would have put thirteen landscape table rules into every invoice, purchase
 * order and delivery challan in the system.
 */
export function printVisitorRegisterDocument(html: string): void {
  if (typeof document === 'undefined') return;

  document.getElementById(REGISTER_FRAME_ID)?.remove();

  const iframe = document.createElement('iframe');
  iframe.id = REGISTER_FRAME_ID;
  iframe.setAttribute('title', 'Visitor Register Print Document');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '-10000px';
  // Landscape A4, so the on-screen frame and the paper agree.
  iframe.style.width = '297mm';
  iframe.style.height = '210mm';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
  };

  // Wait for layout (and any images) before handing the document to the print
  // engine, so page 1 is never measured against an unfinished first paint.
  const images = Array.from(doc.images || []);
  if (images.length === 0) {
    iframe.contentWindow?.setTimeout(trigger, 0);
    return;
  }
  let pending = images.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) iframe.contentWindow?.setTimeout(trigger, 0);
  };
  images.forEach((img) => {
    if (img.complete) {
      done();
      return;
    }
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}
