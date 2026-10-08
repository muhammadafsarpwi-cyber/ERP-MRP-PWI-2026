"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXECUTIVE_TITLE = exports.PDF_SUB_TEXT = exports.PDF_MAIN_TEXT = exports.TONE_COLOR = exports.TONE_GLYPH = exports.ACHIEVEMENT_THRESHOLD = exports.DEPARTMENT_ORDER = void 0;
exports.reportLabelSpan = reportLabelSpan;
exports.compareMachineNo = compareMachineNo;
exports.classifyShift = classifyShift;
exports.departmentRank = departmentRank;
exports.achievementTone = achievementTone;
exports.rejectionPctLabel = rejectionPctLabel;
exports.perUnitWeightValue = perUnitWeightValue;
exports.buildDailyProductionReport = buildDailyProductionReport;
exports.shiftTotalLabel = shiftTotalLabel;
exports.departmentTotalLabel = departmentTotalLabel;
exports.grandTotalLabel = grandTotalLabel;
exports.sectionBlocks = sectionBlocks;
exports.reportCellText = reportCellText;
exports.reportCellSubText = reportCellSubText;
exports.reportTwoLineHtml = reportTwoLineHtml;
exports.reportTotalText = reportTotalText;
exports.pdfLineRow = pdfLineRow;
exports.pdfSummaryRow = pdfSummaryRow;
exports.escapeHtml = escapeHtml;
exports.executiveKpis = executiveKpis;
exports.executiveSummaryHtml = executiveSummaryHtml;
exports.buildPrintHtml = buildPrintHtml;
exports.buildDailyProductionCsv = buildDailyProductionCsv;
const dayjs_1 = __importDefault(require("dayjs"));
const numberFormat_1 = require("../../../utils/numberFormat");
const productionWeight_1 = require("../../../utils/productionWeight");
/** Phase 7 column order — Shift and Machine lead, achievement before the
 *  weight columns, the live breakdown reason replaces the static status, and
 *  Rejection (KG) is expressed as a % of the Actual KG produced.
 *
 *  COMPACT 2-LINE RHYTHM — the width budget guarantees that no cell ever
 *  needs a third line (print CSS keeps every cell at ≤ 2 physical lines):
 *    · Machine 5, Per Unit Weight 5 (the value is the bare number
 *      `0.00967`, no ` KG/PCS` suffix) and Actual KG 6 — those 8 points all
 *      moved into Item / Product 14 → 22, so `125-300*17 Inner Straight`
 *      stays on ONE line above its Item/WIP code;
 *    · Shift 9 holds the shift name (`General Shift`) on line 1 and the
 *      timing (`06:00 - 14:00`) on line 2, neither one wrapping;
 *    · Rejection / Rejection % take 6 each so their header words fit on one
 *      line (Status gives up the 2%, it is clamped to 2 lines anyway).
 *  The columns ALWAYS total 100 (asserted by dailyProductionReport.test.ts). */
const BASE_COLUMNS = [
    { key: 'sr', label: 'Sr. #', align: 'center', width: 4 },
    { key: 'shift', label: 'Shift', align: 'left', width: 9 },
    { key: 'machine', label: 'Machine', align: 'left', width: 5 },
    { key: 'operator', label: 'Operator', align: 'left', width: 7 },
    { key: 'item', label: 'Item / Product', align: 'left', width: 22 },
    { key: 'target', label: 'Target', align: 'right', width: 6 },
    { key: 'actual', label: 'Actual', align: 'right', width: 6 },
    { key: 'achievement', label: 'Achievement %', align: 'right', width: 8 },
    { key: 'perUnitWeight', label: 'Per Unit Weight', align: 'right', width: 5 },
    { key: 'actualKg', label: 'Actual KG', align: 'right', width: 6 },
    { key: 'status', label: 'Breakdown Reason / Status', align: 'left', width: 10 },
    { key: 'rejection', label: 'Rejection', align: 'right', width: 6 },
    { key: 'rejectionPct', label: 'Rejection %', align: 'right', width: 6 },
];
const DATE_COLUMN = { key: 'date', label: 'Date', align: 'center', width: 6 };
/** Columns available only when the export spans several days (item gives up
 *  5% and the operator 1% so the set still totals 100%). */
function buildColumns(showDate) {
    if (!showDate)
        return BASE_COLUMNS.map((c) => ({ ...c }));
    return [
        ...BASE_COLUMNS.map((c) => c.key === 'item' ? { ...c, width: 17 } : c.key === 'operator' ? { ...c, width: 6 } : { ...c }),
        { ...DATE_COLUMN },
    ];
}
/** Number of leading columns merged into the single summary/label cell
 *  (Sr. # + Shift + Machine + Operator). */
function reportLabelSpan(columns) {
    const idx = columns.findIndex((c) => c.key === 'item');
    return idx > 0 ? idx : 1;
}
/* ------------------------------------------------------------------ *
 * Constants + helpers
 * ------------------------------------------------------------------ */
/**
 * Fixed production sequence (Phase 6). Departments not listed here are kept
 * after these five, sorted A→Z by name.
 */
exports.DEPARTMENT_ORDER = ['Straightener', 'Swagging', 'Spoke', 'Plating', 'Packing'];
/** Achievement at or above this percentage counts as "on target". */
exports.ACHIEVEMENT_THRESHOLD = 70;
/** `▲` / `▼` shown next to the achievement percentage (print + Excel). */
exports.TONE_GLYPH = { up: '▲', down: '▼' };
exports.TONE_COLOR = {
    up: [22, 163, 74],
    down: [220, 38, 38],
};
/** Natural (numeric-aware) compare: SPK-02 < SPK-10, SW-01 < SW-02. */
function compareMachineNo(a, b) {
    return String(a !== null && a !== void 0 ? a : '').localeCompare(String(b !== null && b !== void 0 ? b : ''), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}
/**
 * Day vs Night classification for the shift master of this system:
 *   · explicit keyword first — "Shift C (Night)", "General Shift (Night)" are
 *     NIGHT; "Shift A (Morning)", "Shift B (Afternoon)", "General Shift (Day)"
 *     are DAY;
 *   · else the shift's start hour (18:00–04:59 = NIGHT, e.g. E2E 12h = 06:00
 *     → DAY);
 *   · else DAY (safe default — Day Shift is always printed first).
 */
function classifyShift(shift) {
    var _a, _b, _c;
    const text = `${(_a = shift === null || shift === void 0 ? void 0 : shift.name) !== null && _a !== void 0 ? _a : ''} ${(_b = shift === null || shift === void 0 ? void 0 : shift.shiftCode) !== null && _b !== void 0 ? _b : ''}`.toUpperCase();
    if (/\b(NIGHT|GRAVEYARD|SWING)\b/.test(text))
        return 'NIGHT';
    if (/\b(DAY|MORNING|AFTERNOON)\b/.test(text))
        return 'DAY';
    const m = /^(\d{1,2}):(\d{2})/.exec(((_c = shift === null || shift === void 0 ? void 0 : shift.startTime) !== null && _c !== void 0 ? _c : '').trim());
    if (m) {
        const hour = Number(m[1]);
        return hour >= 18 || hour < 5 ? 'NIGHT' : 'DAY';
    }
    return 'DAY';
}
/**
 * Rank of a department name in the fixed sequence (lower prints first).
 * Exact name wins; otherwise the LONGEST matching keyword wins so
 * "Spoke Plating" → Plating and "Spoke Packing" → Packing. Unlisted
 * departments get `DEPARTMENT_ORDER.length` and sort A→Z after the sequence.
 */
function departmentRank(name) {
    const lower = String(name !== null && name !== void 0 ? name : '').trim().toLowerCase();
    let best = -1;
    let bestLen = -1;
    let exact = false;
    exports.DEPARTMENT_ORDER.forEach((key, index) => {
        const k = key.toLowerCase();
        if (k === lower) {
            best = index;
            exact = true; // an exact name beats any partial match
            return;
        }
        if (exact)
            return;
        if (lower.includes(k) && k.length > bestLen) {
            best = index;
            bestLen = k.length;
        }
    });
    return best >= 0 ? best : exports.DEPARTMENT_ORDER.length;
}
/** ▲ when the achievement reaches the threshold, ▼ below it (null when the
 *  achievement cannot be computed). */
function achievementTone(value) {
    if (value === null || value === undefined || Number.isNaN(value))
        return null;
    return value >= exports.ACHIEVEMENT_THRESHOLD ? 'up' : 'down';
}
const blank = (v) => (v !== null && v !== void 0 ? v : '').trim();
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
/** `Breakdown 1h - Electrical Issue` — duration first, then the logged
 *  reason. Nothing else ever lands in the status cell (no "No reason logged"
 *  placeholder, no ⚠ marker). */
function breakdownText(downtimeHours, reason) {
    const parts = [];
    if (downtimeHours > 0)
        parts.push(`Breakdown ${(0, numberFormat_1.formatNumber)(downtimeHours, 1)}h`);
    if (reason)
        parts.push(reason);
    return parts.join(' - ');
}
/** Rejection % — `(Rejection KG / Actual KG) × 100`, 2 decimals.
 *  The denominator is EXACTLY the value printed in the Actual KG column
 *  (`actualKgRounded` / `totals.actualKg`), and both operands are hard-cast
 *  to Number first so a decimal string coming back from the driver can never
 *  silently compare as 0. A zero / unknown Actual KG always yields 0 →
 *  `0.00%`. */
function rejectionPercent(rejectionKg, actualKg) {
    const actual = Number((0, numberFormat_1.toNum)(actualKg));
    if (!(actual > 0))
        return 0; // 0, null, '' or NaN denominator → 0.00%
    return round2((Number((0, numberFormat_1.toNum)(rejectionKg)) / actual) * 100);
}
/** `0.15%` — always exactly 2 decimals, so an empty weight reads `0.00%`. */
function rejectionPctLabel(pct) {
    return `${(0, numberFormat_1.toNum)(pct).toFixed(2)}%`;
}
/** Bare per-unit weight (`0.00967`) — `perUnitWeightLabel`'s trailing
 *  ` KG/<UOM>` suffix is dropped: in the narrow weight column it pushes the
 *  cell onto a third line. Empty when the item has no usable weight, so the
 *  caller can fall back to the UOM / `—`. */
function perUnitWeightValue(uom, weightPerPiece, weightPerMeter) {
    const label = (0, productionWeight_1.perUnitWeightLabel)(uom, weightPerPiece, weightPerMeter);
    return label ? label.split(' ')[0] : '';
}
/** `HH:MM` from a `HH:MM:SS` shift timestamp (empty when unknown). */
function hhmm(value) {
    const m = /^(\d{1,2}:\d{2})/.exec(blank(value));
    return m ? m[1] : '';
}
/**
 * Line 2 of the Shift cell — the shift timing from the shift master / the
 * row's own logged times. `06:00 - 14:00` when both ends are known, a bare
 * `HH:MM` when only one is, `-` when no timing exists at all.
 */
function rowShiftTiming(shift) {
    const start = hhmm(shift === null || shift === void 0 ? void 0 : shift.startTime);
    const end = hhmm(shift === null || shift === void 0 ? void 0 : shift.endTime);
    if (start && end)
        return `${start} - ${end}`;
    if (start || end)
        return start || end;
    return '-';
}
function addLine(acc, line) {
    var _a, _b;
    acc.totals.entries += 1;
    acc.totals.target += line.target;
    acc.totals.actual += line.actual;
    acc.totals.actualKg += (_a = line.actualKg) !== null && _a !== void 0 ? _a : 0;
    acc.totals.rejection += line.rejection;
    acc.totals.rejectionKg += (_b = line.rejectionKg) !== null && _b !== void 0 ? _b : 0;
    if (line.machine)
        acc.machines.add(line.machine);
    acc.totals.machines = acc.machines.size;
}
function finishTotals(totals) {
    totals.actualKg = round4(totals.actualKg);
    totals.rejection = round4(totals.rejection);
    totals.rejectionKg = round4(totals.rejectionKg);
    totals.rejectionPct = rejectionPercent(totals.rejectionKg, totals.actualKg);
    totals.achievement = totals.target > 0 ? round2((totals.actual / totals.target) * 100) : null;
    return totals;
}
function emptyTotals(departments) {
    return {
        departments, entries: 0, machines: 0, target: 0, actual: 0,
        actualKg: 0, rejection: 0, rejectionKg: 0, rejectionPct: 0, achievement: null,
    };
}
/* ------------------------------------------------------------------ *
 * Model builder
 * ------------------------------------------------------------------ */
function buildDailyProductionReport(rows, opts = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
    const operatorName = (_a = opts.operatorName) !== null && _a !== void 0 ? _a : ((r) => r.operatorName || '—');
    const statusOf = (_b = opts.status) !== null && _b !== void 0 ? _b : (() => '—');
    const shiftTiming = (_c = opts.shiftTiming) !== null && _c !== void 0 ? _c : ((r) => rowShiftTiming(r.shift));
    /* --- map + group by department ---------------------------------- */
    const groups = new Map();
    for (const row of rows) {
        const departmentName = blank((_d = row.department) === null || _d === void 0 ? void 0 : _d.name) || blank((_e = row.department) === null || _e === void 0 ? void 0 : _e.departmentCode) || 'Unassigned Department';
        const machine = blank((_f = row.machine) === null || _f === void 0 ? void 0 : _f.machineCode) || blank(row.machineNo) || '—';
        const uom = blank((_g = row.uom) === null || _g === void 0 ? void 0 : _g.code);
        const target = (0, numberFormat_1.toNum)(row.targetQuantity);
        const actual = (0, numberFormat_1.toNum)(row.actualQuantity);
        const actualKg = (0, productionWeight_1.calcActualKg)(uom, actual, (_h = row.item) === null || _h === void 0 ? void 0 : _h.weightPerPiece, (_j = row.item) === null || _j === void 0 ? void 0 : _j.weightPerMeter);
        const rejection = (0, numberFormat_1.toNum)(row.scrapQuantity);
        const rejectionKg = (0, productionWeight_1.calcActualKg)(uom, rejection, (_k = row.item) === null || _k === void 0 ? void 0 : _k.weightPerPiece, (_l = row.item) === null || _l === void 0 ? void 0 : _l.weightPerMeter);
        const itemCode = blank((_m = row.item) === null || _m === void 0 ? void 0 : _m.itemCode);
        const itemName = blank((_o = row.item) === null || _o === void 0 ? void 0 : _o.name);
        const actualKgRounded = actualKg == null ? null : round4(actualKg);
        const rejectionKgRounded = rejectionKg == null ? null : round4(rejectionKg);
        const achievement = row.achievementPercentage === null || row.achievementPercentage === undefined || row.achievementPercentage === ''
            ? target > 0 ? round2((actual / target) * 100) : null
            : round2((0, numberFormat_1.toNum)(row.achievementPercentage));
        const line = {
            sr: 0,
            machine,
            operator: blank(operatorName(row)) || '—',
            /* two clean lines: product name, then the Item/WIP code (never
             * bundled as `Name (CODE)`). A code equal to the name is dropped. */
            item: itemName || itemCode || '—',
            itemCode: itemCode && itemCode !== (itemName || itemCode) ? itemCode : '',
            target,
            actual,
            perUnitWeight: perUnitWeightValue(uom, (_p = row.item) === null || _p === void 0 ? void 0 : _p.weightPerPiece, (_q = row.item) === null || _q === void 0 ? void 0 : _q.weightPerMeter) || uom || '—',
            actualKg: actualKgRounded,
            achievement,
            status: blank(statusOf(row)) || '—',
            breakdown: breakdownText((0, numberFormat_1.toNum)(row.downtimeHours), blank(row.downtimeReasonText)),
            shift: blank((_r = row.shift) === null || _r === void 0 ? void 0 : _r.name) || blank((_s = row.shift) === null || _s === void 0 ? void 0 : _s.shiftCode) || '—',
            shiftTime: blank(shiftTiming(row)) || '-',
            shiftKind: classifyShift(row.shift),
            rejection,
            rejectionKg: rejectionKgRounded,
            rejectionPct: rejectionPercent(rejectionKgRounded, actualKgRounded),
            uom,
            date: row.entryDate ? (0, dayjs_1.default)(row.entryDate).format('YYYY-MM-DD') : '',
        };
        const bucket = groups.get(departmentName);
        if (bucket)
            bucket.push(line);
        else
            groups.set(departmentName, [line]);
    }
    /* --- fixed department sequence, then shift (Day → Night), then
     *    machine number ascending inside each shift ------------------ */
    const departmentNames = [...groups.keys()].sort((a, b) => departmentRank(a) - departmentRank(b) || compareMachineNo(a, b));
    let sr = 0;
    const sections = departmentNames.map((name) => {
        var _a;
        const lines = [...((_a = groups.get(name)) !== null && _a !== void 0 ? _a : [])].sort((a, b) => (a.shiftKind === b.shiftKind ? 0 : a.shiftKind === 'DAY' ? -1 : 1) ||
            compareMachineNo(a.machine, b.machine) ||
            compareMachineNo(a.date, b.date) ||
            compareMachineNo(a.shift, b.shift));
        const shiftGroups = [];
        for (const kind of ['DAY', 'NIGHT']) {
            const groupLines = lines.filter((l) => l.shiftKind === kind);
            if (groupLines.length === 0)
                continue;
            const acc = { totals: emptyTotals(1), machines: new Set() };
            for (const line of groupLines) {
                line.sr = ++sr;
                addLine(acc, line);
            }
            shiftGroups.push({
                kind,
                label: kind === 'DAY' ? 'Day Shift' : 'Night Shift',
                lines: groupLines,
                totals: finishTotals(acc.totals),
            });
        }
        const acc = { totals: emptyTotals(1), machines: new Set() };
        for (const line of lines)
            addLine(acc, line);
        return { name, lines, shiftGroups, totals: finishTotals(acc.totals) };
    });
    /* --- grand totals ----------------------------------------------- */
    const grandAcc = { totals: emptyTotals(sections.length), machines: new Set() };
    for (const section of sections) {
        for (const line of section.lines)
            addLine(grandAcc, line);
    }
    const grand = finishTotals(grandAcc.totals);
    /* --- header ------------------------------------------------------ */
    const dates = [...new Set(sections.flatMap((s) => s.lines.map((l) => l.date)).filter(Boolean))].sort(compareMachineNo);
    const shifts = [...new Set(sections.flatMap((s) => s.lines.map((l) => l.shift)).filter((v) => v && v !== '—'))].sort(compareMachineNo);
    const showDate = dates.length > 1;
    return {
        title: 'Daily Production Report',
        divisionName: resolveDivisionName(rows, opts.divisionName),
        divisionLabel: `Division: ${resolveDivisionName(rows, opts.divisionName)}`,
        dateLabel: resolveDateLabel(opts, dates),
        shiftLabel: opts.shiftName ? `Shift: ${opts.shiftName}` : shifts.length === 1 ? `Shift: ${shifts[0]}` : null,
        metaLine: `${grand.entries} entr${grand.entries === 1 ? 'y' : 'ies'} · ${sections.length} department${sections.length === 1 ? '' : 's'}`,
        generatedLabel: `Generated: ${(_t = opts.generatedAt) !== null && _t !== void 0 ? _t : (0, dayjs_1.default)().format('DD MMM YYYY, HH:mm')}`,
        showDate,
        columns: buildColumns(showDate),
        sections,
        grand,
    };
}
function resolveDivisionName(rows, filterName) {
    const filtered = blank(filterName);
    if (filtered)
        return filtered;
    const names = new Set(rows.map((r) => { var _a, _b; return blank((_a = r.division) === null || _a === void 0 ? void 0 : _a.name) || blank((_b = r.division) === null || _b === void 0 ? void 0 : _b.divisionCode); }).filter(Boolean));
    if (names.size === 1)
        return [...names][0];
    return 'All Divisions';
}
function resolveDateLabel(opts, dates) {
    const from = blank(opts.dateFrom);
    const to = blank(opts.dateTo);
    if (from && to)
        return from === to ? `Date: ${from}` : `Date: ${from} to ${to}`;
    if (from)
        return `Date: ${from} onwards`;
    if (to)
        return `Date: up to ${to}`;
    if (dates.length === 1)
        return `Date: ${dates[0]}`;
    return 'Date: All dates';
}
/* ------------------------------------------------------------------ *
 * Summary labels + blocks (identical wording on print / PDF / Excel)
 * ------------------------------------------------------------------ */
function shiftTotalLabel(kind, department) {
    return `${kind === 'DAY' ? 'DAY' : 'NIGHT'} SHIFT TOTAL — ${department}`;
}
function departmentTotalLabel(department) {
    return `DEPARTMENT GRAND TOTAL — ${department}`;
}
function grandTotalLabel(sectionCount) {
    return `GRAND TOTAL — ${sectionCount} department${sectionCount === 1 ? '' : 's'}`;
}
/**
 * Ordered blocks of a department: Day rows + `Day Shift Total`, Night rows +
 * `Night Shift Total`, then the `Department Grand Total`. A shift without
 * entries is omitted (no empty subtotal row).
 */
function sectionBlocks(section) {
    return [
        ...section.shiftGroups.map((group) => ({
            kind: 'shift',
            label: shiftTotalLabel(group.kind, section.name),
            lines: group.lines,
            totals: group.totals,
        })),
        {
            kind: 'department',
            label: departmentTotalLabel(section.name),
            lines: [],
            totals: section.totals,
        },
    ];
}
/* ------------------------------------------------------------------ *
 * Cell renderers (Print + PDF share these; CSV has its own numeric ones)
 * ------------------------------------------------------------------ */
function reportCellText(line, key, mode = 'display') {
    switch (key) {
        case 'sr': return String(line.sr);
        case 'machine': return line.machine;
        case 'operator': return line.operator;
        case 'item': return line.item;
        case 'target': return (0, numberFormat_1.formatNumber)(line.target, 2);
        case 'actual': return (0, numberFormat_1.formatNumber)(line.actual, 2);
        case 'perUnitWeight': return line.perUnitWeight;
        case 'actualKg': return line.actualKg == null ? '—' : (0, numberFormat_1.formatNumber)(line.actualKg, 2);
        case 'achievement': {
            if (line.achievement == null)
                return '—';
            const base = `${line.achievement.toFixed(1)}%`;
            if (mode === 'pdf')
                return base;
            const tone = achievementTone(line.achievement);
            return tone ? `${base} ${exports.TONE_GLYPH[tone]}` : base;
        }
        case 'status': return line.breakdown || line.status;
        case 'shift': return line.shift;
        case 'rejection': return (0, numberFormat_1.formatNumber)(line.rejection, 2);
        case 'rejectionPct': return rejectionPctLabel(line.rejectionPct);
        case 'date': return line.date || '—';
        default: return '';
    }
}
/** Second (light gray, normal weight) line of the two-line Item / Shift cells. */
function reportCellSubText(line, key) {
    if (key === 'item')
        return line.itemCode;
    if (key === 'shift')
        return line.shiftTime;
    return '';
}
/** Two-line print/PDF-HTML cell: bold dark name on line 1, light gray code or
 *  shift timing on line 2 (`display:block` makes each a real line). */
function reportTwoLineHtml(line, key) {
    const main = key === 'item' ? 'rp-item-name' : 'rp-shift-name';
    const sub = key === 'item' ? 'rp-item-code' : 'rp-shift-time';
    const subText = key === 'item' ? line.itemCode : line.shiftTime;
    const second = subText ? `<span class="${sub}">${escapeHtml(subText)}</span>` : '';
    return `<span class="${main}">${escapeHtml(line[key])}</span>${second}`;
}
/** Display value for a shift / department / grand total cell. */
function reportTotalText(totals, key, mode = 'display') {
    switch (key) {
        case 'target': return (0, numberFormat_1.formatNumber)(totals.target, 2);
        case 'actual': return (0, numberFormat_1.formatNumber)(totals.actual, 2);
        case 'actualKg': return (0, numberFormat_1.formatNumber)(totals.actualKg, 2);
        case 'achievement': {
            if (totals.achievement == null)
                return '—';
            const base = `${totals.achievement.toFixed(1)}%`;
            if (mode === 'pdf')
                return base;
            const tone = achievementTone(totals.achievement);
            return tone ? `${base} ${exports.TONE_GLYPH[tone]}` : base;
        }
        case 'rejection': return (0, numberFormat_1.formatNumber)(totals.rejection, 2);
        case 'rejectionPct': return rejectionPctLabel(totals.rejectionPct);
        case 'perUnitWeight': return '—';
        case 'item': return '';
        case 'status': return '';
        case 'shift': return '';
        case 'date': return '';
        case 'sr': return '';
        case 'machine': return '';
        case 'operator': return '';
        default: return '';
    }
}
/** PDF colours for the two-line cells — mirrors the print CSS. */
exports.PDF_MAIN_TEXT = [15, 23, 42]; /* #0f172a */
exports.PDF_SUB_TEXT = [148, 163, 184]; /* #94a3b8 */
/** One PDF data row: plain strings, except the achievement cell which carries
 *  the ▲/▼ colour (the arrow itself is drawn in `didDrawCell` as a vector
 *  triangle — jsPDF cannot embed those glyphs in its WinAnsi fonts) and the
 *  Item / Shift cells which are two lines: autoTable draws line 1 (dark, bold
 *  for the item name) and leaves a non-breaking space on line 2 — that empty
 *  line keeps the row tall enough for `sub`, which `didDrawCell` paints in
 *  light gray with a normal font. */
function pdfLineRow(columns, line) {
    const tone = achievementTone(line.achievement);
    return columns.map((c) => {
        if (c.key === 'item' || c.key === 'shift') {
            const main = reportCellText(line, c.key, 'pdf');
            const sub = reportCellSubText(line, c.key);
            return {
                content: sub ? `${main}\n\u00A0` : main,
                sub,
                subColor: exports.PDF_SUB_TEXT,
                styles: {
                    halign: c.align,
                    textColor: exports.PDF_MAIN_TEXT,
                    ...(c.key === 'item' ? { fontStyle: 'bold' } : {}),
                },
            };
        }
        const text = reportCellText(line, c.key, 'pdf');
        if (c.key !== 'achievement')
            return text;
        const styles = { halign: c.align };
        if (tone) {
            styles.fontStyle = 'bold';
            styles.textColor = exports.TONE_COLOR[tone];
        }
        return { content: text, styles };
    });
}
/** One PDF summary row: label merged over the leading columns (Sr. # /
 *  Shift / Machine / Operator), then Σ Target, Σ Actual, Σ Actual KG, weighted
 *  Achievement %, Σ Rejection and Rejection %. Shift sub-totals use a
 *  lighter fill than the department / grand totals. */
function pdfSummaryRow(model, totals, label, kind) {
    const span = reportLabelSpan(model.columns);
    const tone = achievementTone(totals.achievement);
    const totalStyle = {
        fontStyle: 'bold',
        fillColor: (kind === 'shift' ? [232, 237, 243] : [226, 232, 240]),
        textColor: [15, 23, 42],
    };
    return [
        { content: label, colSpan: span, styles: { ...totalStyle, halign: 'left' } },
        ...model.columns.slice(span).map((c) => {
            const styles = { ...totalStyle, halign: c.align };
            if (c.key === 'achievement' && tone)
                styles.textColor = exports.TONE_COLOR[tone];
            return { content: reportTotalText(totals, c.key, 'pdf'), styles };
        }),
    ];
}
/* ------------------------------------------------------------------ *
 * Print / PDF HTML
 * ------------------------------------------------------------------ */
function escapeHtml(value) {
    return String(value !== null && value !== void 0 ? value : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
const PRINT_CSS = `
  @page { size: A4 landscape; margin: 8mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
         font-size: 11px; color: #0f172a; margin: 0; padding: 12px; background: #fff; }
  .rp-header { border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 10px;
               break-inside: avoid; page-break-inside: avoid; }
  .rp-title { font-size: 17px; font-weight: 700; letter-spacing: .02em; margin: 0; }
  .rp-division { font-size: 13px; font-weight: 700; color: #1d4ed8; margin: 3px 0 0; }
  .rp-meta { font-size: 11px; color: #475569; margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap; }
  .rp-meta span { white-space: nowrap; }
  .rp-dept { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px; }
  .rp-dept-head { display: flex; justify-content: space-between; gap: 12px;
                  background: #0f172a; color: #fff; font-size: 11px; font-weight: 700;
                  letter-spacing: .04em; padding: 4px 8px;
                  break-after: avoid; page-break-after: avoid; }
  table.rp-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
  .rp-table th, .rp-table td { border: 1px solid #94a3b8; padding: 3px 4px; line-height: 1.2;
                               vertical-align: middle; overflow-wrap: anywhere; word-break: break-word;
                               white-space: normal; }
  .rp-table thead { display: table-header-group; }
  .rp-table tfoot { display: table-footer-group; }
  .rp-table tr { break-inside: avoid; page-break-inside: avoid; }
  /* Header: 10px + normal word breaking - a narrow label wraps BETWEEN words
     ("Per Unit" / "Weight") and never through the middle of one. */
  .rp-table th { background: #e2e8f0; color: #1e293b; font-weight: 700; font-size: 10px;
                 word-break: normal; overflow-wrap: break-word; line-height: 1.2; }
  .rp-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rp-subtotal td { background: #e8edf3 !important; font-weight: 700; color: #1e293b; }
  .rp-total td { background: #e2e8f0 !important; font-weight: 700; }
  .a-left { text-align: left; } .a-center { text-align: center; } .a-right { text-align: right; }
  .muted { color: #64748b; } .strong { font-weight: 700; }
  /* Two-line Item / Shift cells: name on line 1, code or timing on line 2. */
  .rp-item-name { display: block; font-weight: 700; color: #0f172a; }
  .rp-item-code { display: block; font-weight: 400; color: #94a3b8; }
  .rp-shift-name { display: block; font-weight: 400; color: #0f172a; }
  .rp-shift-time { display: block; font-weight: 400; color: #94a3b8; }
  /* ---- 2-LINE MAXIMUM -------------------------------------------------
     Each of those four lines is ONE physical line: nowrap + ellipsis, so
     "General Shift" / "06:00 - 14:00" and the product name can never push a
     row onto a 3rd or 4th line. Shift sits at 10px / 9px to fit its 9%. */
  .rp-item-name, .rp-item-code, .rp-shift-name, .rp-shift-time {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rp-item-name { font-size: 11px; line-height: 1.2; }
  .rp-item-code { font-size: 10px; line-height: 1.2; }
  .rp-shift-name { font-size: 10px; line-height: 1.2; }
  .rp-shift-time { font-size: 9px; line-height: 1.2; }
  /* Long free text (operator, breakdown reason) may use AT MOST 2 lines. */
  .rp-clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tone-up { color: #15803d !important; font-weight: 700; }
  .tone-down { color: #b91c1c !important; font-weight: 700; }
  /* ---- EXECUTIVE DEPARTMENT SUMMARY — the standalone LAST page ---------
     The page break lives on .rp-exec, so the KPI cards always start a fresh
     sheet right after the final department's grand total row. The grid is
     responsive: minmax(300px, 1fr) gives 3 cards per A4 landscape row and 2
     on a narrower sheet, never more. */
  .rp-exec { break-before: page; page-break-before: always; padding-top: 2px; }
  .rp-exec-title { text-align: center; font-weight: 700; font-size: 18px;
                   letter-spacing: .06em; color: #0f172a; margin: 0 0 14px;
                   break-after: avoid; page-break-after: avoid; }
  .rp-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                 gap: 12px; }
  .rp-kpi-card { border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 12px;
                 break-inside: avoid; page-break-inside: avoid; }
  .rp-kpi-name { font-weight: 700; font-size: 12px; letter-spacing: .05em; color: #0f172a;
                 padding-bottom: 5px; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; }
  .rp-kpi-row { display: flex; justify-content: space-between; gap: 10px;
                font-size: 11.5px; line-height: 1.55; font-variant-numeric: tabular-nums; }
  .rp-kpi-row span { color: #64748b; }
  .rp-kpi-row b { font-weight: 700; color: #0f172a; }
  /* Row 4 — the highlighted achievement line (green ▲ / red ▼). */
  .rp-kpi-ach { margin-top: 6px; padding-top: 5px; border-top: 1px dashed #cbd5e1;
                font-size: 12.5px; }
  @media print {
    body { margin: 0; padding: 0; }
    .rp-dept { break-inside: avoid; page-break-inside: avoid; }
    .rp-table thead { display: table-header-group; }
  }
`;
function tableHtml(model, withHead, bodyHtml) {
    const colgroup = `<colgroup>${model.columns.map((c) => `<col style="width:${c.width}%">`).join('')}</colgroup>`;
    const head = withHead
        ? `<thead><tr>${model.columns
            .map((c) => `<th class="a-${c.align}" style="width:${c.width}%"><span class="rp-clamp2">${escapeHtml(c.label)}</span></th>`)
            .join('')}</tr></thead>`
        : '';
    return `<table class="rp-table">${colgroup}${head}<tbody>${bodyHtml}</tbody></table>`;
}
function lineRowHtml(model, line) {
    const tone = achievementTone(line.achievement);
    return `<tr>${model.columns
        .map((c) => {
        const cls = [
            `a-${c.align}`,
            c.key === 'actualKg' || c.key === 'actual' || c.key === 'achievement' ? 'strong' : '',
            c.key === 'perUnitWeight' ? 'muted' : '',
            c.key === 'achievement' && tone ? `tone-${tone}` : '',
        ].filter(Boolean).join(' ');
        let text;
        if (c.key === 'item' || c.key === 'shift') {
            text = reportTwoLineHtml(line, c.key);
        }
        else {
            const value = escapeHtml(reportCellText(line, c.key));
            // Long free text (operator name, breakdown reason) is hard-capped at
            // 2 lines, so no data row can ever outgrow the 2-line Item / Shift
            // rhythm. Numeric cells stay plain — they never need a 3rd line.
            text = c.key === 'operator' || c.key === 'status' ? `<span class="rp-clamp2">${value}</span>` : value;
        }
        return `<td class="${cls}">${text}</td>`;
    })
        .join('')}</tr>`;
}
function totalRowHtml(model, totals, label, kind) {
    const span = reportLabelSpan(model.columns);
    const tone = achievementTone(totals.achievement);
    let cells = `<td class="a-left" colspan="${span}">${escapeHtml(label)}</td>`;
    cells += model.columns
        .slice(span)
        .map((c) => {
        const toneCls = c.key === 'achievement' && tone ? ` tone-${tone}` : '';
        return `<td class="a-${c.align}${toneCls}">${escapeHtml(reportTotalText(totals, c.key))}</td>`;
    })
        .join('');
    const rowClass = kind === 'shift' ? 'rp-subtotal' : 'rp-total';
    return `<tr class="${rowClass}">${cells}</tr>`;
}
/* ------------------------------------------------------------------ *
 * EXECUTIVE DEPARTMENT SUMMARY — the standalone LAST page of the report.
 * The data below is shared by the print cards (executiveSummaryHtml) and
 * the jsPDF card grid in EntryList.exportPdf, so both surfaces always show
 * the very same totals as the table above them.
 * ------------------------------------------------------------------ */
/** Heading of that last page — an `<h2>` in print, a centred PDF title. */
exports.EXECUTIVE_TITLE = 'EXECUTIVE DEPARTMENT SUMMARY';
/** One KPI card per department, in report order (one per section). */
function executiveKpis(model) {
    return model.sections.map((section) => {
        const totals = section.totals;
        const achievementValue = totals.achievement;
        return {
            name: section.name.toUpperCase(),
            target: reportTotalText(totals, 'target'),
            actual: reportTotalText(totals, 'actual'),
            achievement: reportTotalText(totals, 'achievement'),
            achievementText: reportTotalText(totals, 'achievement', 'pdf'),
            tone: achievementTone(achievementValue),
            achievementValue,
        };
    });
}
/** The last-page block: centred heading over a responsive grid of cards.
 *  Empty when the report has no department, so nothing is ever printed for
 *  an empty export. */
function executiveSummaryHtml(model) {
    const cards = executiveKpis(model);
    if (cards.length === 0)
        return '';
    const grid = cards
        .map((card) => {
        const toneClass = card.tone ? ` class="tone-${card.tone}"` : '';
        return `      <div class="rp-kpi-card">
        <div class="rp-kpi-name">${escapeHtml(card.name)}</div>
        <div class="rp-kpi-row"><span>Target:</span><b>${escapeHtml(card.target)}</b></div>
        <div class="rp-kpi-row"><span>Actual:</span><b>${escapeHtml(card.actual)}</b></div>
        <div class="rp-kpi-row rp-kpi-ach"><span>Achievement %:</span><b${toneClass}>${escapeHtml(card.achievement)}</b></div>
      </div>`;
    })
        .join('\n');
    return `  <section class="rp-exec">
    <h2 class="rp-exec-title">${exports.EXECUTIVE_TITLE}</h2>
    <div class="rp-kpi-grid">
${grid}
    </div>
  </section>`;
}
/** Full print document — opened in a new window and printed on load. */
function buildPrintHtml(model) {
    const sections = model.sections
        .map((sec) => {
        const body = sectionBlocks(sec)
            .map((block) => block.lines.map((line) => lineRowHtml(model, line)).join('') +
            totalRowHtml(model, block.totals, block.label, block.kind))
            .join('');
        return `  <section class="rp-dept">
    <div class="rp-dept-head">
      <span>DEPARTMENT — ${escapeHtml(sec.name)}</span>
      <span>${sec.totals.machines} machine${sec.totals.machines === 1 ? '' : 's'} · ${sec.totals.entries} entr${sec.totals.entries === 1 ? 'y' : 'ies'}</span>
    </div>
    ${tableHtml(model, true, body)}
  </section>`;
    })
        .join('\n');
    const grand = model.sections.length
        ? `  <section class="rp-dept">
    ${tableHtml(model, false, totalRowHtml(model, model.grand, grandTotalLabel(model.sections.length), 'grand'))}
  </section>`
        : '';
    // The KPI summary ALWAYS comes last — after the grand total row — and its
    // own page break (.rp-exec) puts it on a fresh, standalone final page.
    const execBody = executiveSummaryHtml(model);
    const exec = execBody ? `\n${execBody}` : '';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(model.title)} — ${escapeHtml(model.divisionName)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <header class="rp-header">
    <div class="rp-title">${escapeHtml(model.title)}</div>
    <div class="rp-division">${escapeHtml(model.divisionLabel)}</div>
    <div class="rp-meta">
      <span>${escapeHtml(model.dateLabel)}</span>
      ${model.shiftLabel ? `<span>${escapeHtml(model.shiftLabel)}</span>` : ''}
      <span>${escapeHtml(model.metaLine)}</span>
      <span>${escapeHtml(model.generatedLabel)}</span>
    </div>
  </header>
${sections}
${grand}${exec}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}
/* ------------------------------------------------------------------ *
 * Excel (UTF-8 CSV) — mirrors the print layout column-for-column
 * ------------------------------------------------------------------ */
const csvQuote = (value) => {
    const s = String(value !== null && value !== void 0 ? value : '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Numeric cell left UNQUOTED so Excel keeps it a number (SUM/AVERAGE work). */
const csvNum = (value) => value == null ? '' : String(round4(value));
function csvLineCell(line, key) {
    switch (key) {
        case 'sr': return String(line.sr);
        case 'machine': return csvQuote(line.machine);
        case 'operator': return csvQuote(line.operator);
        case 'item': return csvQuote(line.itemCode ? `${line.item}\n${line.itemCode}` : line.item);
        case 'target': return csvNum(line.target);
        case 'actual': return csvNum(line.actual);
        case 'perUnitWeight': return csvQuote(line.perUnitWeight);
        case 'actualKg': return csvNum(line.actualKg);
        case 'achievement': {
            if (line.achievement == null)
                return '';
            const tone = achievementTone(line.achievement);
            // Arrow synced with print/PDF — Excel shows it as a text cell.
            return `${round2(line.achievement)}${tone ? ` ${exports.TONE_GLYPH[tone]}` : ''}`;
        }
        case 'status': return csvQuote(reportCellText(line, 'status'));
        case 'shift': return csvQuote(`${line.shift}\n${line.shiftTime}`);
        case 'rejection': return csvNum(line.rejection);
        case 'rejectionPct': return rejectionPctLabel(line.rejectionPct);
        case 'date': return csvQuote(line.date);
        default: return '';
    }
}
function csvTotalCell(totals, key) {
    switch (key) {
        case 'target': return csvNum(totals.target);
        case 'actual': return csvNum(totals.actual);
        case 'actualKg': return csvNum(totals.actualKg);
        case 'achievement': {
            if (totals.achievement == null)
                return '';
            const tone = achievementTone(totals.achievement);
            return `${round2(totals.achievement)}${tone ? ` ${exports.TONE_GLYPH[tone]}` : ''}`;
        }
        case 'rejection': return csvNum(totals.rejection);
        case 'rejectionPct': return rejectionPctLabel(totals.rejectionPct);
        default: return '';
    }
}
/** Structured CSV: report header block, department sections, shift grouping
 *  with Day/Night sub-totals, machine order, department grand total and a
 *  report grand total. Opens straight in Excel. */
function buildDailyProductionCsv(model) {
    const out = [];
    const span = reportLabelSpan(model.columns);
    out.push(model.title);
    out.push(model.divisionLabel);
    out.push(model.dateLabel);
    if (model.shiftLabel)
        out.push(model.shiftLabel);
    out.push(`${model.metaLine} · ${model.generatedLabel}`);
    out.push('');
    out.push([...model.columns.map((c) => csvQuote(c.label)), 'UOM'].join(','));
    out.push('');
    const totalRow = (label, totals) => [
        ...model.columns.map((c, i) => i < span ? (i === 0 ? csvQuote(label) : '') : csvTotalCell(totals, c.key)),
        '',
    ].join(',');
    for (const section of model.sections) {
        out.push(csvQuote(`DEPARTMENT — ${section.name}`));
        for (const block of sectionBlocks(section)) {
            for (const line of block.lines) {
                out.push([...model.columns.map((c) => csvLineCell(line, c.key)), csvQuote(line.uom)].join(','));
            }
            out.push(totalRow(block.label, block.totals));
        }
        out.push('');
    }
    out.push(totalRow(grandTotalLabel(model.sections.length), model.grand));
    out.push('');
    // BOM so Excel reads UTF-8 (and the em-dash) correctly.
    return `\uFEFF${out.join('\r\n')}`;
}
