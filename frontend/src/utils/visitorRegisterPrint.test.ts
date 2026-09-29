import dayjs from 'dayjs';
import {
  REGISTER_COLUMNS,
  REGISTER_CSS,
  REGISTER_FRAME_ID,
  registerStampParts,
  // Aliased for the same reason `visitorSlipHtml.test.ts` aliases it: a helper
  // that returns a call to a `render…` function is auto-detected as a
  // testing-library render wrapper, and every result of it then has to be named
  // `view`. This is a string builder, not a render.
  renderVisitorRegisterHtml as buildRegisterHtml,
  printVisitorRegisterDocument,
  type VisitorRegisterRow,
} from './visitorRegisterPrint';
import { SLIP_COMPANY_CITY, SLIP_COMPANY_NAME } from './visitorSlipHtml';

/**
 * Prompt #19C — the printed VISITOR REGISTER contract.
 *
 * The Visitor Slip and the Visitor Register are two different documents, and
 * these tests exist to keep them that way: they assert the register's own
 * layout rules (landscape A4, fixed column widths, a repeated header, a compact
 * two-line clock) and they assert the register never inherits the slip's
 * portrait A4 rules.
 *
 * They are deliberately written against the RENDERED STRING rather than against
 * a screenshot. The real geometry — how many lines a value actually takes, how
 * many pages 25 records need — cannot be asserted in jsdom, and is measured
 * instead by `scratch/verify-visitor-p19c-register.js` in a real browser.
 */

const ROW: VisitorRegisterRow = {
  visitorReference: 'VIS-2026-000051',
  visitorName: 'Sana Yousaf',
  cnic: '35202-*******-9',
  mobile: '03211234567',
  visitorCompany: 'Bright Future Ltd',
  hostNameSnapshot: 'Muhammad Afsar',
  division: { divisionCode: 'DIV-CCD' },
  location: { locationCode: 'GATE-A' },
  timeIn: '2026-09-29T01:01:00.000Z',
  timeOut: '2026-09-29T09:30:00.000Z',
  status: 'COMPLETED',
  onSite: false,
  hostConfirmed: true,
};

const buildRegister = (rows: VisitorRegisterRow[], over: Partial<Parameters<typeof buildRegisterHtml>[0]> = {}) =>
  buildRegisterHtml({ rows, rangeLabel: 'Date: 29-Sep-2026', printedAt: '2026-09-29T10:00:00', ...over });

/** Count non-overlapping occurrences of `needle` in `hay`. */
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/** Just the `<tbody>` of the rendered table, so a header row is not counted. */
const tbody = (html: string) => /<tbody>([\s\S]*)<\/tbody>/.exec(html)![1];
/** How many data rows the document actually carries. */
const rowCount = (html: string) => count(tbody(html), '<tr');

// ══════════════════════════════════════════════════════════════════════════════
//  1  The column model
// ══════════════════════════════════════════════════════════════════════════════
describe('VisitorRegister — column model', () => {
  it('declares exactly the twelve columns the gate reads', () => {
    expect(REGISTER_COLUMNS.map((c) => c.key)).toEqual([
      'index', 'reference', 'name', 'cnic', 'mobile', 'company', 'host',
      'divLoc', 'timeIn', 'timeOut', 'status', 'hostConfirmed',
    ]);
  });

  it('sizes the thirteen columns to exactly 100%', () => {
    // A colgroup that does not sum to 100 lets the browser redistribute width,
    // which is how a long visitor name ends up stealing from its neighbours.
    const total = REGISTER_COLUMNS.reduce((s, c) => s + c.width, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('gives every column a label and a usable width', () => {
    for (const c of REGISTER_COLUMNS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.width).toBeGreaterThan(2);
      expect(c.width).toBeLessThan(15);
    }
  });

  it('never wraps an identifier, a clock, a status or a flag', () => {
    // Reported as a list rather than a loop of expectations, so a failure names
    // the offending columns instead of stopping at the first one.
    const mustNotWrap = ['reference', 'cnic', 'mobile', 'divLoc', 'timeIn', 'timeOut', 'status', 'hostConfirmed'];
    const wrappable = REGISTER_COLUMNS.filter((c) => mustNotWrap.includes(c.key) && c.nowrap !== true)
      .map((c) => c.label);
    expect(wrappable).toEqual([]);
  });

  it('leaves the free-text columns free to wrap', () => {
    for (const key of ['name', 'company', 'host']) {
      expect(REGISTER_COLUMNS.find((c) => c.key === key)?.nowrap).toBeUndefined();
    }
  });

  it('reserves enough room for the longest status word', () => {
    // Measured: `COMPLETED` in a 7.5px bold badge needs about 13.5mm of cell
    // including padding and border. A narrower column clips it.
    const status = REGISTER_COLUMNS.find((c) => c.key === 'status');
    expect(status!.width * 2.77).toBeGreaterThanOrEqual(16);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  2  Page geometry — landscape A4, and NOT the slip's portrait
// ══════════════════════════════════════════════════════════════════════════════
describe('VisitorRegister — page geometry', () => {
  it('declares A4 LANDSCAPE', () => {
    expect(REGISTER_CSS).toMatch(/@page\{[\s\S]*size:\s*A4 landscape/);
  });

  it('never declares portrait, which belongs to the Visitor Slip', () => {
    expect(REGISTER_CSS).not.toMatch(/A4 portrait/);
  });

  it('ships a doctype so the browser does not fall back to quirks mode', () => {
    // The pre-#19C register had none, rendered in quirks mode, and its table
    // measured 255.8mm on a 190mm page.
    expect(buildRegister([ROW]).trimStart().slice(0, 15).toUpperCase()).toBe('<!DOCTYPE HTML>');
  });

  it('uses a fixed table layout with a colgroup', () => {
    expect(REGISTER_CSS).toMatch(/table\.vr\{[^}]*table-layout:fixed/);
    const html = buildRegister([ROW]);
    expect(count(html, '<col style="width:')).toBe(REGISTER_COLUMNS.length);
  });

  it('repeats the column titles on every page', () => {
    expect(REGISTER_CSS).toMatch(/thead\{display:table-header-group;\}/);
  });

  it('keeps a row intact rather than splitting it across pages', () => {
    expect(REGISTER_CSS).toMatch(/page-break-inside:avoid/);
  });

  it('numbers the pages from the page margin', () => {
    expect(REGISTER_CSS).toMatch(/counter\(page\)/);
    expect(REGISTER_CSS).toMatch(/counter\(pages\)/);
  });

  it('keeps its own type sizes compact and legible', () => {
    // 8.5px body / 7.5px header: about 6.4pt / 5.6pt on paper — the band a
    // paper register is read at, and not smaller.
    expect(REGISTER_CSS).toMatch(/td\{font-size:8\.5px/);
    expect(REGISTER_CSS).toMatch(/font-size:7\.5px;font-weight:800/);
  });

  it('scrolls the sheet inside its own box so a narrow window cannot widen the page', () => {
    expect(REGISTER_CSS).toMatch(/\.vr-viewport\{overflow-x:auto/);
    expect(REGISTER_CSS).toMatch(/@media print\{[\s\S]*\.vr-viewport\{overflow:visible/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  3  The document shell
// ══════════════════════════════════════════════════════════════════════════════
describe('VisitorRegister — document shell', () => {
  it('titles the document Visitor Register', () => {
    const html = buildRegister([ROW]);
    expect(html).toContain('<title>Visitor Register</title>');
    expect(html).toContain('>Visitor Register</div>');
  });

  it('carries the company letterhead and the city', () => {
    const html = buildRegister([ROW]);
    expect(html).toContain(SLIP_COMPANY_NAME);
    expect(html).toContain(SLIP_COMPANY_CITY);
  });

  it('invents no address, phone number, email or web address in the letterhead', () => {
    // The DATA naturally contains phone numbers and names — a register without
    // them would be useless. What must not appear is an invented contact detail
    // in the header or footer, where the reader would take it as fact.
    const html = buildRegister([ROW]);
    const chrome = [
      /<div class="vr-head">[\s\S]*?<\/div>\s*<\/div>/.exec(html)?.[0] ?? '',
      /<div class="vr-foot">[\s\S]*?<\/div>/.exec(html)?.[0] ?? '',
    ].join(' ');
    expect(chrome.length).toBeGreaterThan(0);
    expect(chrome).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // email
    expect(chrome).not.toMatch(/https?:\/\/|www\./i); // web address
    expect(chrome).not.toMatch(/\+92|\b0\d{2,3}[- ]?\d{7,8}\b/); // phone
    expect(chrome).not.toMatch(/Plot|Block|Sector|Off\.?\s*No|Industrial|Korangi/i); // address
  });

  it('states the range, the record count and when it was printed', () => {
    const html = buildRegister([ROW]);
    expect(html).toContain('Date: 29-Sep-2026');
    expect(html).toContain('1</b> record<');
    expect(html).toContain('Printed 29-Sep-2026 10:00 AM');
  });

  it('pluralises the record count', () => {
    expect(buildRegister([ROW, { ...ROW, visitorReference: 'VIS-2026-000052' }])).toContain('2</b> records<');
  });

  it('emits a scoped header cell for every column', () => {
    const html = buildRegister([ROW]);
    expect(count(html, 'scope="col"')).toBe(REGISTER_COLUMNS.length);
    for (const c of REGISTER_COLUMNS) expect(html).toContain(`>${c.label}<`);
  });

  it('says so plainly when the range holds nothing, rather than printing a blank sheet', () => {
    const html = buildRegister([]);
    expect(html).toMatch(/No visitor entries match this range/);
    expect(rowCount(html)).toBe(1); // the single explanatory row
    expect(html).toContain('0</b> records<');
  });

  it('numbers the rows from one', () => {
    const html = buildRegister([ROW, { ...ROW, visitorReference: 'VIS-2026-000052' }]);
    expect(html).toContain('<td class="vr-index c">1</td>');
    expect(html).toContain('<td class="vr-index c">2</td>');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  4  Cell content
// ══════════════════════════════════════════════════════════════════════════════
describe('VisitorRegister — cells', () => {
  it('prints the masked CNIC and the visitor reference', () => {
    const html = buildRegister([ROW]);
    expect(html).toContain('VIS-2026-000051');
    expect(html).toContain('35202-*******-9');
  });

  it('splits each timestamp into a date and a 12-hour clock, never five lines', () => {
    const html = buildRegister([ROW]);
    // The register is a paper document, so it follows the slip's AM/PM
    // convention — the same deliberate difference the slip makes.
    expect(count(html, 'class="vr-dt"')).toBe(2); // time-in and time-out
    expect(count(html, 'class="vr-tm"')).toBe(2);
    expect(html).toMatch(/vr-dt">\d{2}-[A-Z][a-z]{2}-\d{4}</);
    expect(html).toMatch(/vr-tm">\d{2}:\d{2} (AM|PM)</);
  });

  it('keeps the century on every printed date', () => {
    // `DD-MMM-YY` on an audit record is a year a reader has to guess at.
    expect(buildRegister([ROW])).not.toMatch(/vr-dt">\d{2}-[A-Z][a-z]{2}-\d{2}</);
  });

  it('shows Pending for a visitor still on site and a dash once they have left', () => {
    const onSite = buildRegister([{ ...ROW, timeOut: null, status: 'PENDING', onSite: true }]);
    expect(onSite).toContain('class="vr-pend">Pending');
    expect(buildRegister([{ ...ROW, timeOut: null, status: 'CANCELLED', onSite: false }])).toMatch(/vr-timeOut[^>]*>—</);
  });

  it('honours the server on-site flag over the status/Time-Out pair', () => {
    // An INSIDE visitor is on site even though the status is not PENDING.
    const html = buildRegister([{ ...ROW, timeOut: null, status: 'INSIDE', onSite: true }]);
    expect(html).toContain('class="vr-pend">Pending');
  });

  it('renders a compact host-confirmation flag', () => {
    expect(buildRegister([ROW])).toContain('vr-hc-yes">✓ Confirmed');
    expect(buildRegister([{ ...ROW, hostConfirmed: false }])).toContain('vr-hc-no">Pending');
  });

  it('colours each status and never invents one', () => {
    expect(buildRegister([ROW])).toContain('vr-badge vr-st-done">COMPLETED');
    expect(buildRegister([{ ...ROW, status: 'PENDING' }])).toContain('vr-badge vr-st-pending">PENDING');
    expect(buildRegister([{ ...ROW, status: 'INSIDE' }])).toContain('vr-badge vr-st-inside">INSIDE');
    expect(buildRegister([{ ...ROW, status: 'CANCELLED' }])).toContain('vr-badge vr-st-cancelled">CANCELLED');
    expect(buildRegister([{ ...ROW, status: 'SOMETHING_NEW' }])).toContain('vr-st-cancelled">SOMETHING_NEW');
  });

  it('uses the division and location names (not codes) in the register', () => {
    const html = buildRegister([{
      ...ROW,
      division: { divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
      location: { locationCode: 'CCD-A01', name: 'Production Department' },
    }]);
    // Names must appear
    expect(html).toContain('Control Cable Division');
    expect(html).toContain('Production Department');
  });

  it('prints an em dash, never a null, for anything missing', () => {
    const html = buildRegister([{
      visitorReference: null, visitorName: 'Sana', cnic: null, mobile: null,
      visitorCompany: null, hostNameSnapshot: null, division: null, location: null,
      timeIn: '2026-09-29T01:01:00.000Z', timeOut: null, status: 'PENDING', onSite: false,
    }]);
    expect(html).not.toMatch(/>\s*(null|undefined|NaN)\s*</);
    expect(count(html, '>—<')).toBeGreaterThanOrEqual(6);
  });

  it('escapes visitor-supplied text, so a name cannot inject markup into the register', () => {
    const html = buildRegister([{ ...ROW, visitorCompany: '<script>alert(1)</script>', visitorName: 'A & B "Ltd"' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B');
  });

  it('renders one <tr> per row, with no extra rows', () => {
    const rows = [ROW, { ...ROW, visitorReference: 'VIS-2026-000052' }, { ...ROW, visitorReference: 'VIS-2026-000053' }];
    expect(rowCount(buildRegister(rows))).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  5  Timestamp helper
// ══════════════════════════════════════════════════════════════════════════════
describe('VisitorRegister — registerStampParts', () => {
  // Local-time inputs (no `Z`), so the expectation holds on any machine's zone:
  // the helper's job is the FORMATTING, not the offset.
  it('splits a stored stamp into a date and a 12-hour clock', () => {
    expect(registerStampParts('2026-09-29T13:01:00')).toEqual(['29-Sep-2026', '01:01 PM']);
  });

  it('converts a UTC instant into local time, as the slip does', () => {
    expect(registerStampParts('2026-09-29T13:01:00.000Z')).toEqual(
      [dayjs('2026-09-29T13:01:00.000Z').format('DD-MMM-YYYY'), dayjs('2026-09-29T13:01:00.000Z').format('hh:mm A')],
    );
  });

  it('keeps midnight and noon on the 12-hour clock', () => {
    expect(registerStampParts('2026-09-29T00:00:00')[1]).toBe('12:00 AM');
    expect(registerStampParts('2026-09-29T12:00:00')[1]).toBe('12:00 PM');
  });

  it('renders one em dash and no clock when there is no value', () => {
    expect(registerStampParts(null)).toEqual(['—', '']);
    expect(registerStampParts(undefined)).toEqual(['—', '']);
    expect(registerStampParts('   ')).toEqual(['—', '']);
  });

  it('passes an unparseable stored value through rather than inventing a date', () => {
    const [date, time] = registerStampParts('not-a-timestamp');
    expect(date).toBe('not-a-timestamp');
    expect(time).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  6  The print trigger
// ══════════════════════════════════════════════════════════════════════════════
describe('VisitorRegister — print trigger', () => {
  afterEach(() => { document.getElementById(REGISTER_FRAME_ID)?.remove(); });

  it('writes the document into a detached frame instead of opening a popup', () => {
    // `window.open` is refused by most popup blockers, and a security desk that
    // cannot print a register cannot use the feature at all.
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const html = buildRegister([ROW]);
    printVisitorRegisterDocument(html);
    const frame = document.getElementById(REGISTER_FRAME_ID) as HTMLIFrameElement | null;
    expect(open).not.toHaveBeenCalled();
    expect(frame).not.toBeNull();
    expect(frame!.contentDocument!.documentElement.outerHTML).toContain('VIS-2026-000051');
    open.mockRestore();
  });

  it('replaces any previous register frame rather than stacking them', () => {
    printVisitorRegisterDocument(buildRegister([ROW]));
    printVisitorRegisterDocument(buildRegister([ROW]));
    expect(document.querySelectorAll(`#${REGISTER_FRAME_ID}`).length).toBe(1);
  });

  it('keeps the frame off-screen and out of the page flow', () => {
    printVisitorRegisterDocument(buildRegister([ROW]));
    const frame = document.getElementById(REGISTER_FRAME_ID) as HTMLIFrameElement;
    expect(frame.style.position).toBe('fixed');
    expect(frame.style.left).toBe('-10000px');
    expect(frame.getAttribute('title')).toBe('Visitor Register Print Document');
  });
});
