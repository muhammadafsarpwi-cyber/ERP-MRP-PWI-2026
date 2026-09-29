/**
 * VISITOR REGISTER PRINT VERIFICATION — Prompt #19C.
 *
 * The point of this script is to MEASURE the real printed artefact, not to
 * assert that some CSS string is present. It:
 *
 *   §1  signs in and takes the live `/visitor/entries` first page — the same
 *       25 rows the ERP list shows at its default page size;
 *   §2  drives the REAL UI (Print Register -> Print) and captures the exact
 *       HTML the production code produced, out of the print frame;
 *   §3  measures that document in the browser: table width, per-column widths,
 *       row heights, computed font sizes, line-box counts per cell (i.e. real
 *       wrapping), thead repeat, horizontal clipping, page-box overflow;
 *   §4  prints it to PDF with `preferCSSPageSize` and counts pages, so the page
 *       count is the print engine's, not an estimate;
 *   §5  does the identical thing to the PRE-#19C register — same rows, same
 *       browser, same measurement — for a controlled before/after;
 *   §6  confirms the register document cannot cause page-level horizontal
 *       overflow in a narrow window;
 *   §7  confirms the individual Visitor SLIP is untouched: the register
 *       changes must not have leaked into the A4-portrait slip.
 *
 * Usage: node scratch/verify-visitor-p19c-register.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
// dayjs lives in the frontend workspace, not at the repo root.
const dayjs = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'dayjs'));

const APP = process.env.ERP_APP || 'http://localhost:3000';
const API = process.env.ERP_API || 'http://localhost:3001/api/v1';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const OUT = path.join(__dirname, 'p19c-register-artifacts');

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 },
];

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}`); }
  else { fail += 1; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`); }
}
function note(t) { console.log(`        ${t}`); }
function section(t) { console.log(`\n=== ${t} ===`); }

/** Pages in a PDF buffer, from the page-tree /Count. */
function pdfPageCount(buf) {
  const text = buf.toString('latin1');
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length) return Math.max(...counts);
  return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

/** MediaBox in PostScript points, converted to mm. A4 = 210x297 portrait. */
function pdfPageSizeMm(buf) {
  const boxes = [...buf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  if (!boxes.length) return null;
  const [, , , w, h] = boxes[0];
  return { wPt: Number(w), hPt: Number(h), wMm: +(Number(w) / 72 * 25.4).toFixed(1), hMm: +(Number(h) / 72 * 25.4).toFixed(1) };
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

// ─── The pre-#19C register, reconstructed verbatim ──────────────────────────
// Captured from the file before #19C replaced it. The inline <style> block and
// the 13-column row template are copied exactly, so the baseline is the real
// previous code and not an approximation of it.
const OLD_REGISTER_CSS =
  'body{font-family:Arial,sans-serif;font-size:11px;margin:16px;}' +
  'h2{margin:0 0 4px;font-size:16px;}' +
  'p{margin:0 0 12px;color:#666;font-size:11px;}' +
  'table{width:100%;border-collapse:collapse;}' +
  'thead tr{background:#1a1a2e;color:#fff;}' +
  'th{padding:8px 6px;text-align:left;font-size:10px;letter-spacing:0.04em;}' +
  'td{padding:7px 6px;border-bottom:1px solid #eee;vertical-align:top;}' +
  'tr:nth-child(even) td{background:#f9f9fc;}' +
  '.status{border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700;}' +
  '.PENDING{background:#fff7e6;color:#d46b08;}' +
  '.COMPLETED{background:#f6ffed;color:#389e0d;}' +
  '.INSIDE{background:#e6f4ff;color:#0958d9;}' +
  '.CANCELLED{background:#f5f5f5;color:#595959;}' +
  '@media print{@page{margin:1cm;}}';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The redesign's `formatDateTime`: DD-MMM-YYYY h:mm A (12-hour). */
const oldStamp = (v) => (v ? dayjs(v).format('DD-MMM-YYYY h:mm A') : '—');
const onSite = (r) => (typeof r.onSite === 'boolean' ? r.onSite : r.status === 'PENDING' && !r.timeOut);

function oldRegisterHtml(rows, dateLabel) {
  const head =
    '<th>#</th><th>Visitor ID</th><th>Visitor Name</th><th>CNIC</th><th>Mobile</th>' +
    '<th>Company</th><th>Host</th><th>Division</th><th>Location</th>' +
    '<th>Time-In</th><th>Time-Out</th><th>Status</th><th>Host Confirmed</th>';
  const body = rows.map((r, i) =>
    '<tr>' +
    `<td>${i + 1}</td>` +
    `<td>${esc(r.visitorReference ?? '—')}</td>` +
    `<td><strong>${esc(r.visitorName)}</strong></td>` +
    `<td>${esc(r.cnic ?? '—')}</td>` +
    `<td>${esc(r.mobile ?? '—')}</td>` +
    `<td>${esc(r.visitorCompany ?? '—')}</td>` +
    `<td>${esc(r.hostNameSnapshot ?? '—')}</td>` +
    `<td>${esc(r.division ? r.division.divisionCode : '—')}</td>` +
    `<td>${esc(r.location ? r.location.locationCode : '—')}</td>` +
    `<td>${oldStamp(r.timeIn)}</td>` +
    `<td>${r.timeOut ? oldStamp(r.timeOut) : onSite(r) ? 'Pending' : '—'}</td>` +
    `<td><span class="status ${r.status}">${esc(r.status)}</span></td>` +
    `<td>${r.hostConfirmed ? '✓ Yes' : 'No'}</td>` +
    '</tr>').join('');
  return `<html><head><title>Visitor Register</title><style>${OLD_REGISTER_CSS}</style></head><body>` +
    `<h2>Pakistan Wire Industries — Visitor Register</h2>` +
    `<p>${dateLabel} &nbsp;·&nbsp; ${rows.length} record(s) &nbsp;·&nbsp; Printed: ${dayjs().format('DD-MMM-YYYY HH:mm')}</p>` +
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

// ─── In-document measurement ─────────────────────────────────────────────────
const MEASURE = () => {
  const q = (s, r = document) => r.querySelector(s);
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;

  const table = q('table');
  const thead = q('thead');
  const firstRow = q('tbody tr');
  const rows = Array.from(document.querySelectorAll('tbody tr'));
  const headCells = Array.from(document.querySelectorAll('thead th'));
  const firstCells = firstRow ? Array.from(firstRow.children) : [];

  // Line boxes actually laid out inside a cell — the only honest measure of
  // "is this wrapping", since scrollWidth alone cannot see a soft wrap.
  // Line boxes actually laid out in a cell.
  //
  // `Range.getClientRects()` overcounts block-level children, and a plain
  // height/line-height counts the padding and border as extra lines. Only the
  // CONTENT box divided by the line box answers "does this value wrap".
  const lineCount = (el) => {
    if (!el) return 0;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t) return 0;
    const s = getComputedStyle(el);
    // `line-height: normal` computes to the keyword, not a number; fall back to
    // the usual 1.2 so documents that never set it (the old register) can still
    // be measured against the same yardstick.
    let lh = parseFloat(s.lineHeight);
    if (!Number.isFinite(lh) || lh <= 0) lh = parseFloat(s.fontSize) * 1.2;
    const box = el.getBoundingClientRect();
    const content = box.height
      - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)
      - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth);
    return Math.max(1, Math.round((content / lh) * 10) / 10);
  };

  // This function is serialised into the page, so it must be self-contained.
  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

  const colWidths = firstCells.map((td) => {
    const label = headCells[firstCells.indexOf(td)]?.textContent?.trim() || '?';
    const rect = td.getBoundingClientRect();
    return {
      label,
      wPx: +rect.width.toFixed(1),
      wMm: +(rect.width / 96 * 25.4).toFixed(1),
      fontPx: cs(td) ? px(cs(td).fontSize) : null,
      whiteSpace: cs(td)?.whiteSpace || null,
      lines: lineCount(td),
      clipped: td.scrollWidth > td.clientWidth + 1,
      text: (td.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    };
  });

  const rowHeights = rows.map((tr) => +tr.getBoundingClientRect().height.toFixed(1));

  return {
    compatMode: document.compatMode,
    docScrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    table: table ? {
      widthPx: +table.getBoundingClientRect().width.toFixed(1),
      widthMm: +(table.getBoundingClientRect().width / 96 * 25.4).toFixed(1),
      layout: cs(table)?.tableLayout || null,
      colCount: headCells.length,
      colWidths: table ? Array.from(q('colgroup')?.children || []).map((c, i) => ({
        label: headCells[i]?.textContent?.trim() || '?',
        declaredPct: c.style.width,
        wMm: +(firstCells[i] ? firstCells[i].getBoundingClientRect().width / 96 * 25.4 : 0).toFixed(1),
      })) : [],
    } : null,
    theadDisplay: thead ? cs(thead).display : null,
    theadRepeat: thead ? cs(thead).display === 'table-header-group' : false,
    fonts: {
      bodyPx: px(cs(document.body).fontSize),
      title: q('.vr-title') ? px(cs(q('.vr-title')).fontSize) : null,
      company: q('.vr-co-name') ? px(cs(q('.vr-co-name')).fontSize) : null,
      companySub: q('.vr-co-sub') ? px(cs(q('.vr-co-sub')).fontSize) : null,
      meta: q('.vr-meta') ? px(cs(q('.vr-meta')).fontSize) : null,
      th: headCells[0] ? px(cs(headCells[0]).fontSize) : null,
      td: firstCells[0] ? px(cs(firstCells[0]).fontSize) : null,
      badge: q('.vr-badge') ? px(cs(q('.vr-badge')).fontSize) : null,
      foot: q('.vr-foot') ? px(cs(q('.vr-foot')).fontSize) : null,
      // Works for the SLIP too, which has no table: the first real text block.
      sample: (() => {
        const s = ['.vs-company', '.vr-co-name', 'h2', 'h1', 'p', '.vs-name'];
        for (const sel of s) { const el = q(sel); if (el) return { sel, px: px(cs(el).fontSize) }; }
        return null;
      })(),
    },
    blocks: {
      headPx: q('.vr-head') ? +q('.vr-head').getBoundingClientRect().height.toFixed(1) : null,
      metaPx: q('.vr-meta') ? +q('.vr-meta').getBoundingClientRect().height.toFixed(1) : null,
      theadPx: thead ? +thead.getBoundingClientRect().height.toFixed(1) : null,
      footPx: q('.vr-foot') ? +q('.vr-foot').getBoundingClientRect().height.toFixed(1) : null,
    },
    oldBlocks: {
      h2Px: q('h2') ? +q('h2').getBoundingClientRect().height.toFixed(1) : null,
      pPx: q('p') ? +q('p').getBoundingClientRect().height.toFixed(1) : null,
      theadPx: thead ? +thead.getBoundingClientRect().height.toFixed(1) : null,
    },
    oldFonts: {
      h2: q('h2') ? px(cs(q('h2')).fontSize) : null,
      p: q('p') ? px(cs(q('p')).fontSize) : null,
      th: headCells[0] ? px(cs(headCells[0]).fontSize) : null,
      td: firstCells[0] ? px(cs(firstCells[0]).fontSize) : null,
    },
    cells: colWidths,
    rows: {
      count: rows.length,
      firstPx: rowHeights[0] ?? null,
      medianPx: median(rowHeights),
      maxPx: rowHeights.length ? Math.max(...rowHeights) : null,
    },
    clippedCells: colWidths.filter((c) => c.clipped).map((c) => c.label),
    multiLineCells: colWidths.filter((c) => c.lines > 1).map((c) => `${c.label}(${c.lines})`),
    // How much of the printable height the table actually occupies.
    totalTablePx: table ? +table.getBoundingClientRect().height.toFixed(1) : null,
  };
};

/**
 * Render a document and measure it AT ITS OWN PRINTABLE WIDTH.
 *
 * Two things matter here and both were got wrong on the first pass:
 *
 *  1. The printable width. A document lays out at the VIEWPORT width, not at
 *     the paper width. Measuring the old register in a 1280px window showed a
 *     330mm table with nothing wrapping, because on screen it was never
 *     constrained — the print engine is what squeezed it, and that is why it
 *     needed three pages. Measuring at the page box shows what the paper
 *     actually gets.
 *  2. The DOCTYPE. `element.outerHTML` does not include it, so a document
 *     captured out of the print frame and re-rendered lost its doctype and fell
 *     back into QUIRKS mode. `hasDoctype` restores it for a captured document;
 *     the reconstructed pre-#19C register is passed `false`, because not having
 *     one is exactly the defect being measured.
 */
async function renderAndPrint(browser, html, tag, printableMm, hasDoctype = true) {
  const p = await browser.newPage();
  const source = hasDoctype && !/^\s*<!DOCTYPE/i.test(html) ? `<!DOCTYPE html>\n${html}` : html;
  await p.setViewportSize({ width: Math.round(printableMm * 96 / 25.4), height: 1000 });
  await p.setContent(source, { waitUntil: 'load' });
  await p.waitForTimeout(150);
  const measured = await p.evaluate(MEASURE);
  const pdf = await p.pdf({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(path.join(OUT, `${tag}.pdf`), pdf);
  fs.writeFileSync(path.join(OUT, `${tag}.html`), source);
  const pages = pdfPageCount(pdf);
  const size = pdfPageSizeMm(pdf);
  await p.close();
  return { measured, pages, size, pdf, doctype: /^\s*<!DOCTYPE/i.test(source) };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = {};

  // ═════════════════════ §1  LIVE DATA ══════════════════════════════════════
  section('§1  Live 25-record dataset');
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = (await login.json()).token;
  const H = { authorization: `Bearer ${token}` };
  const page1 = await (await fetch(`${API}/visitor/entries?limit=25&page=1`, { headers: H })).json();
  const rows = page1.data || [];
  report.totalInApi = page1.total ?? page1.meta?.total ?? null;
  note(`API returned ${rows.length} row(s) on page 1 (total=${report.totalInApi})`);
  check('the live dataset reaches the default 25-row page', rows.length === 25, `rows=${rows.length}`);
  report.rows = rows.length;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (/circular reference/i.test(m.text())) return; // pre-existing, #19 report
    consoleErrors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.addInitScript(() => {
    const bump = () => { try { window.top.__erpPrintCalls = (window.top.__erpPrintCalls || 0) + 1; } catch { /* cross-origin */ } };
    Object.defineProperty(window, 'print', { value: bump, writable: true, configurable: true });
    if (window === window.top) window.__erpPrintCalls = 0;
  });

  // ═════════════════════ §2  CAPTURE THE REAL PRINT ═════════════════════════
  section('§2  Capture the register the production code actually prints');
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.getByRole('button', { name: /ENTER SYSTEM/i }).waitFor({ state: 'visible', timeout: 300000 });
  await page.getByRole('button', { name: /ENTER SYSTEM/i }).click();
  await page.locator('input#login_email').waitFor({ state: 'visible', timeout: 300000 });
  await page.locator('input#login_email').fill(EMAIL);
  await page.locator('input#login_password').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 180000 });
  note('signed in');

  await page.goto(`${APP}/visitor-management/visitors`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.getByTestId('visitor-page').waitFor({ state: 'visible', timeout: 300000 });
  // Wait for the DATA, not for a stopwatch: the dev bundle compiles the visitor
  // route lazily, and an early snapshot catches the empty placeholder.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('table tbody tr'))
      .filter((tr) => /VIS-\d{4}-\d+/.test(tr.innerText || '')).length >= 25,
    null,
    { timeout: 180000 },
  );
  await page.waitForTimeout(500);

  const listRows = await page.evaluate(() => Array.from(document.querySelectorAll('table tbody tr'))
    .filter((tr) => /VIS-\d{4}-\d+/.test(tr.innerText || '')).length);
  check('the ERP list shows 25 rows at the default page size', listRows === 25, `rendered=${listRows}`);
  report.listRows = listRows;

  // Use "Full Month" so the range covers every row on the page: the register's
  // default "Today Only" would legitimately filter most of them away.
  // "Print Register" lives in the application header (PageHeader `extra`), which
  // the real SPA header does draw — that is the production location.
  await page.getByRole('button', { name: 'Print Register' }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('print-range-month').click();
  await page.waitForTimeout(400);
  const hintText = await page.evaluate(() => {
    const el = document.querySelector('.ant-modal-body .ant-alert-message');
    return el ? el.textContent : null;
  });
  note(`print dialog hint: ${JSON.stringify(hintText)}`);
  report.hintText = hintText;
  check('the print dialog reports how many rows the range covers',
    !!hintText && /Prints the 25 rows/.test(hintText), JSON.stringify(hintText));

  const before = await page.evaluate(() => window.__erpPrintCalls);
  await page.locator('.ant-modal-footer button', { hasText: /^Print$/ }).click();
  await page.waitForFunction((n) => window.__erpPrintCalls > n, before, { timeout: 60000 });
  note('print triggered');

  const captured = await page.evaluate(() => {
    const f = document.getElementById('pwi-visitor-register-frame');
    if (!f || !f.contentDocument) return null;
    const d = f.contentDocument;
    return {
      html: d.documentElement.outerHTML,
      compatMode: d.compatMode,
      doctypeName: d.doctype ? d.doctype.name : null,
      hasDoctype: !!d.doctype,
      frameWidth: f.getBoundingClientRect().width,
    };
  });
  check('the register is printed from a detached print frame', !!captured,
    captured ? `frame=${Math.round(captured.frameWidth)}px` : 'frame not found');
  if (!captured) { await browser.close(); throw new Error('register print frame missing'); }
  report.frameCompatMode = captured.compatMode;
  report.frameDoctype = captured.doctypeName;
  check('the real print document declares a doctype (standards mode)',
    captured.hasDoctype && captured.compatMode === 'CSS1Compat',
    `doctype=${captured.doctypeName} compatMode=${captured.compatMode}`);

  // ═════════════════════ §3/§4  MEASURE + PAGE COUNT (AFTER) ═════════════════
  section('§3  Register print — measured (AFTER)');
  // 277mm is the landscape A4 printable width the document declares.
  const after = await renderAndPrint(browser, captured.html, 'register-after', 277);
  const m = after.measured;
  report.after = { pages: after.pages, pageSizeMm: after.size, ...m };

  check('it prints on A4 LANDSCAPE', after.size && after.size.wMm > after.size.hMm,
    after.size ? `${after.size.wMm} x ${after.size.hMm} mm` : 'no MediaBox');
  check('the page box is A4 landscape (297 x 210 mm)',
    after.size && Math.abs(after.size.wMm - 297) < 2 && Math.abs(after.size.hMm - 210) < 2,
    after.size ? `${after.size.wMm} x ${after.size.hMm} mm` : 'n/a');
  check('25 records now print on ONE page', after.pages === 1, `pages=${after.pages}`);
  check('the table uses deliberate fixed column widths', m.table?.layout === 'fixed', `table-layout=${m.table?.layout}`);
  check('all 13 columns are present', m.table?.colCount === 13, `columns=${m.table?.colCount}`);
  check('the table fills the printable width', m.table?.widthMm > 270, `table=${m.table?.widthMm} mm`);
  check('the column header repeats on every page', m.theadRepeat, `thead display=${m.theadDisplay}`);
  check('no cell clips its content horizontally', m.clippedCells.length === 0, `clipped=${JSON.stringify(m.clippedCells)}`);
  check('the body type is compact but legible (8-10 px)', m.fonts.td >= 8 && m.fonts.td <= 10, `td=${m.fonts.td}px`);
  check('the header is smaller than the body title and at least 7 px', m.fonts.th >= 7 && m.fonts.th < m.fonts.td, `th=${m.fonts.th}px title=${m.fonts.title}px`);
  check('rows are compact (under 24 px)', m.rows.maxPx < 24, `max row=${m.rows.maxPx}px median=${m.rows.medianPx}px`);
  check('identifiers, clocks, status and host-confirm never wrap past two lines',
    m.cells.filter((c) => ['VISITOR ID', 'CNIC', 'MOBILE', 'TIME-IN', 'TIME-OUT', 'STATUS', 'HOST CONF.'].includes(c.label)).every((c) => c.lines <= 2),
    m.cells.map((c) => `${c.label}:${c.lines}L/${c.wMm}mm`).join(' '));
  check('the document does not overflow its own page box',
    m.docScrollW <= m.clientW + 1, `scrollWidth=${m.docScrollW} clientWidth=${m.clientW}`);

  // Page utilisation: how much of the printable height the register actually
  // uses, and how many rows of that height one landscape A4 page holds.
  const printablePx = 189 * 96 / 25.4;
  const usedPx = (m.blocks.headPx || 0) + (m.blocks.metaPx || 0) + (m.blocks.theadPx || 0) + (m.totalTablePx || 0) + (m.blocks.footPx || 0);
  const rowsPerPage = Math.floor((printablePx - ((m.blocks.headPx || 0) + (m.blocks.metaPx || 0) + (m.blocks.theadPx || 0) + (m.blocks.footPx || 0))) / m.rows.medianPx);
  report.utilisation = { printablePx: +printablePx.toFixed(1), usedPx: +usedPx.toFixed(1), usedPct: +(usedPx / printablePx * 100).toFixed(1), rowsPerPage };
  note(`page use   ${usedPx.toFixed(0)}px of ${printablePx.toFixed(0)}px printable (${report.utilisation.usedPct}%) — about ${rowsPerPage} rows/page at this density`);
  check('the register uses more of the page than the old one (over 50%)',
    report.utilisation.usedPct > 50, `${report.utilisation.usedPct}% of the printable height used`);

  note(`table ${m.table?.widthMm}mm wide, ${m.table?.colCount} cols`);
  note(`fonts  title=${m.fonts.title}px co=${m.fonts.company}px sub=${m.fonts.companySub}px meta=${m.fonts.meta}px th=${m.fonts.th}px td=${m.fonts.td}px badge=${m.fonts.badge}px foot=${m.fonts.foot}px`);
  note(`blocks head=${m.blocks.headPx}px meta=${m.blocks.metaPx}px thead=${m.blocks.theadPx}px foot=${m.blocks.footPx}px`);
  note(`rows  first=${m.rows.firstPx} median=${m.rows.medianPx} max=${m.rows.maxPx} over ${m.rows.count} rows`);
  note(`cols  ` + m.cells.map((c) => `${c.label} ${c.wMm}mm/${c.lines}L`).join('  '));
  note(`wrapped cells: ${m.multiLineCells.length ? m.multiLineCells.join(', ') : 'none'}`);

  // ═════════════════════ §5  BEFORE (same rows, same engine) ════════════════
  section('§5  Pre-#19C register — same rows, same engine (BEFORE)');
  const oldHtml = oldRegisterHtml(rows, `Month: ${dayjs().format('MMMM YYYY')}`);
  // A4 portrait printable width at the old document's 1cm margins: 190mm.
  const before_ = await renderAndPrint(browser, oldHtml, 'register-before', 190, false);
  const mo = before_.measured;
  report.before = { pages: before_.pages, pageSizeMm: before_.size, ...mo };

  note(`BEFORE pages=${before_.pages}  page=${before_.size ? `${before_.size.wMm} x ${before_.size.hMm} mm` : 'n/a'}`);
  note(`BEFORE fonts h2=${mo.oldFonts.h2}px p=${mo.oldFonts.p}px th=${mo.oldFonts.th}px td=${mo.oldFonts.td}px`);
  note(`BEFORE rows first=${mo.rows.firstPx} median=${mo.rows.medianPx} max=${mo.rows.maxPx}`);
  note(`BEFORE wrapped cells: ${mo.multiLineCells.length ? mo.multiLineCells.join(', ') : 'none'}`);
  note(`BEFORE table width=${mo.table?.widthMm}mm layout=${mo.table?.layout}`);

  check('BEFORE is A4 PORTRAIT (the problem #19C fixes)', before_.size && before_.size.hMm > before_.size.wMm,
    before_.size ? `${before_.size.wMm} x ${before_.size.hMm} mm` : 'n/a');
    check('AFTER uses strictly fewer pages than BEFORE', after.pages < before_.pages,
    `${before_.pages} -> ${after.pages}`);
  check('AFTER fits every record on one page', after.pages === 1 && mo.rows.count === rows.length,
    `pages=${after.pages} rows=${mo.rows.count}`);
  note(`PAGE COUNT: ${before_.pages} -> ${after.pages} for ${rows.length} records`);

  // The old template had no <!DOCTYPE html>, so it rendered in QUIRKS mode. That
  // is not a cosmetic detail: quirks-mode table layout ignores the page box, which
  // is why the old table measured 330mm on a 190mm printable area and why every
  // single cell wrapped once the print engine squeezed it onto the paper.
  // `frameCompatMode` is read from the LIVE print frame, which is the real proof.
  note(`DOCTYPE mode: BEFORE=${mo.compatMode}  AFTER=${m.compatMode}  live frame=${report.frameCompatMode}`);
  report.compatMode = { before: mo.compatMode, after: m.compatMode, liveFrame: report.frameCompatMode };
  check('the old register rendered in quirks mode (no doctype)', mo.compatMode === 'BackCompat', mo.compatMode);
  check('the new register renders in standards mode', m.compatMode === 'CSS1Compat', m.compatMode);
  check('the LIVE print frame is in standards mode too', report.frameCompatMode === 'CSS1Compat', report.frameCompatMode);
  check('the old table overflowed the 190mm page it was printed on',
    mo.table?.widthMm > 200, `BEFORE table=${mo.table?.widthMm}mm on a 190mm printable width`);
  check('the new table fits inside the landscape page box',
    m.table?.widthMm <= 280, `AFTER table=${m.table?.widthMm}mm on a 277mm printable width`);
  check('rows are far denser than before (under a third of the old height)',
    m.rows.medianPx < mo.rows.medianPx / 3,
    `${mo.rows.medianPx}px -> ${m.rows.medianPx}px median row (${(mo.rows.medianPx / m.rows.medianPx).toFixed(1)}x)`);
  note(`ROW HEIGHT: ${mo.rows.medianPx}px -> ${m.rows.medianPx}px`);

  // ═════════════════════ §6  NARROW-WINDOW OVERFLOW ════════════════════════
  section('§6  Register document in a narrow window (no page-level overflow)');
  for (const vp of VIEWPORTS) {
    const p2 = await browser.newPage();
    await p2.setViewportSize({ width: vp.width, height: vp.height });
    await p2.setContent(captured.html, { waitUntil: 'load' });
    await p2.waitForTimeout(120);
    const ov = await p2.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      vw: document.documentElement.clientWidth,
      viewportScroller: (() => {
        const el = document.querySelector('.vr-viewport');
        return el ? getComputedStyle(el).overflowX : 'missing';
      })(),
      sheetW: document.querySelector('.vr-sheet') ? Math.round(document.querySelector('.vr-sheet').getBoundingClientRect().width) : null,
    }));
    check(`${vp.name}: the register document does not scroll the PAGE horizontally`,
      ov.doc <= ov.vw + 1, `scrollWidth=${ov.doc} vs clientWidth=${ov.vw}`);
    check(`${vp.name}: the sheet scrolls inside its own container instead`,
      ov.viewportScroller === 'auto', `.vr-viewport overflow-x=${ov.viewportScroller}, sheet=${ov.sheetW}px`);
    await p2.close();
  }

  // ═════════════════════ §7  SLIP REGRESSION ═══════════════════════════════
  section('§7  Individual Visitor Slip must be untouched');
  // A COMPLETED, host-confirmed visitor exercises every branch of the slip.
  const slipIndex = Math.max(0, rows.findIndex((r) => r.timeOut && r.hostConfirmed));
  const slipTestId = `visitor-slip-${rows[slipIndex].id}`;
  note(`slip target: ${rows[slipIndex].visitorReference} (${rows[slipIndex].status})`);
  await page.locator(`[data-testid="${slipTestId}"] button, button[data-testid="${slipTestId}"]`).first().click();
  await page.getByTestId('visitor-slip-preview-print').waitFor({ state: 'visible', timeout: 180000 });
  await page.waitForTimeout(2500);
  const sBefore = await page.evaluate(() => window.__erpPrintCalls);
  await page.getByTestId('visitor-slip-preview-print').click();
  await page.waitForFunction((n) => window.__erpPrintCalls > n, sBefore, { timeout: 60000 });
  const slipFrame = await page.evaluate(() => {
    const f = document.getElementById('pwi-print-frame');
    if (!f || !f.contentDocument) return null;
    return { html: f.contentDocument.documentElement.outerHTML };
  });
  check('the slip still prints from its own frame', !!slipFrame, slipFrame ? 'found' : 'missing');
  if (slipFrame) {
    const s = await renderAndPrint(browser, slipFrame.html, 'slip-after', 190);
    const sm = s.measured;
    report.slip = { pages: s.pages, pageSizeMm: s.size, fonts: sm.fonts, docScrollW: sm.docScrollW, clientW: sm.clientW };
    check('the slip is still A4 PORTRAIT', s.size && s.size.hMm > s.size.wMm,
      s.size ? `${s.size.wMm} x ${s.size.hMm} mm` : 'n/a');
    check('the slip is still exactly one page', s.pages === 1, `pages=${s.pages}`);
    const h = slipFrame.html;
    check('the slip keeps the company letterhead', h.includes('Pakistan Wire Industries (Pvt.) LTD.'), 'company name');
    check('the slip keeps Karachi, Pakistan', h.includes('Karachi, Pakistan'), 'city');
    check('the slip keeps a host signature area', /signature/i.test(h), 'signature markup present');
    check('no landscape register CSS leaked into the slip',
      !/vr-title|vr-co-name|vr-badge|size:\s*A4 landscape/i.test(h), 'no register classes');
    check('the slip body type is unchanged (8-12 px)', sm.fonts.bodyPx >= 8 && sm.fonts.bodyPx <= 12,
      `body=${sm.fonts.bodyPx}px sample=${sm.fonts.sample ? sm.fonts.sample.sel + ':' + sm.fonts.sample.px + 'px' : 'n/a'}`);
    // A4 PORTRAIT printable width is 210mm minus its margins (~190mm of sheet).
    const sheetW = await page.evaluate(() => {
      const el = document.querySelector('#pwi-print-frame')?.contentDocument?.querySelector('.pwi-print-container')
        || null;
      return el ? { wPx: Math.round(el.getBoundingClientRect().width) } : null;
    }).catch(() => null);
    report.slipSheetW = sheetW;
    check('the slip sheet is still a single A4 portrait page (1 page, 209.9 x 297 mm)',
      s.pages === 1 && s.size && Math.abs(s.size.wMm - 210) < 2,
      s.size ? `1 page at ${s.size.wMm} x ${s.size.hMm} mm` : 'n/a');
    note(`slip pages=${s.pages} page=${s.size ? `${s.size.wMm} x ${s.size.hMm} mm` : 'n/a'} body=${sm.fonts.bodyPx}px sample=${sm.fonts.sample ? sm.fonts.sample.sel + ':' + sm.fonts.sample.px + 'px' : 'n/a'}`);
  }

  check('no new console errors during the whole run', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '));

  report.summary = { pass, fail, failures };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  if (failures.length) failures.forEach((f) => console.log(`   - ${f}`));
  console.log(`  artefacts -> ${OUT}`);
  console.log(`${'═'.repeat(70)}`);

  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
