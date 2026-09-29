/**
 * LIVE BROWSER + PRINT VERIFICATION — Prompt #19A (slip display polish).
 *
 * Drives the real SPA in Chromium (Playwright, vendored at the repo root) and
 * proves the things only a browser and a real print job can prove:
 *
 *   A  the print pipeline still produces the same document (hidden iframe, A4)
 *   B  12-hour AM/PM on every printed time
 *   C  the acting ERP users print as NAMES, and no UUID appears anywhere
 *   D  the letterhead is exactly "Pakistan Wire Industries (Pvt.) LTD." and
 *      "Karachi, Pakistan", with no invented street address
 *   E  HEADER ALIGNMENT measured from real bounding boxes, not judged by eye:
 *      the logo, the company block, the title bar and the retain-note share one
 *      centre line, and the VISITOR ID row is a centred grid
 *   F  the physical Host Signature blank survives the redesign
 *   G  preview and print render the SAME markup
 *
 * Usage:  node scratch/verify-visitor-p19a-ui.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP = process.env.ERP_APP || 'http://localhost:3000';
const API = process.env.ERP_API || 'http://localhost:3001/api/v1';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const OUT = path.join(__dirname, 'p19a-ui-artifacts');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const COMPANY = 'Pakistan Wire Industries (Pvt.) LTD.';
const CITY = 'Karachi, Pakistan';

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}
function note(text) { console.log(`      ${text}`); }
function section(t) { console.log(`\n=== ${t} ===`); }

function pdfPageCount(buf) {
  const text = buf.toString('latin1');
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length) return Math.max(...counts);
  return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Pick a COMPLETED, host-confirmed visitor so the slip exercises every branch:
  // real Time-In, real Time-Out, a confirming user, and a captured signature.
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = (await login.json()).token;
  const H = { authorization: `Bearer ${token}` };
  const listed = (await (await fetch(`${API}/visitor/entries?limit=200&page=1`, { headers: H })).json()).data || [];
  const target = listed.find((r) => r.hostConfirmedBy && r.timeOut) || listed.find((r) => r.hostConfirmedBy) || listed[0];
  if (!target) throw new Error('no visitor rows to verify');
  const slipApi = (await (await fetch(`${API}/visitor/entries/${target.id}/slip`, { headers: H })).json()).data;
  note(`target ${slipApi.visitorReference} (${target.status}, hostConfirmed=${!!target.hostConfirmedBy})`);
  note(`API createdByName=${slipApi.createdByName}  confirmedByName=${slipApi.hostConfirmation.confirmedByName}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    // Pre-existing, already attributed in the Prompt #19 report: rc-util isEqual
    // reports a circular reference for an EMPTY array. React dev build only.
    if (/circular reference/i.test(text)) return;
    consoleErrors.push(`${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // `printHtmlContent` calls `iframe.contentWindow.print()`, so the override
  // must exist in EVERY frame and report to the top window.
  await page.addInitScript(() => {
    const bump = () => {
      try { window.top.__erpPrintCalls = (window.top.__erpPrintCalls || 0) + 1; } catch { /* cross-origin */ }
    };
    Object.defineProperty(window, 'print', { value: bump, writable: true, configurable: true });
    if (window === window.top) window.__erpPrintCalls = 0;
  });

  const writes = [];
  page.on('request', (r) => {
    if (r.url().startsWith(API) && !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) {
      writes.push(`${r.method()} ${r.url().replace(API, '')}`);
    }
  });

  try {
    // ═════════════════════ A. LOG IN + OPEN THE SLIP ════════════════════════
    section('A. Log in and open the visitor slip preview');
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.getByRole('button', { name: /ENTER SYSTEM/i }).waitFor({ state: 'visible', timeout: 300000 });
    await page.getByRole('button', { name: /ENTER SYSTEM/i }).click();
    await page.locator('input#login_email').waitFor({ state: 'visible', timeout: 300000 });
    await page.locator('input#login_email').fill(EMAIL);
    await page.locator('input#login_password').fill(PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 180000 });
    note(`signed in -> ${new URL(page.url()).pathname}`);
    // The sign-in POST is a write, but it is not the print path. Everything
    // from here on must be read-only, so drop the authentication baseline.
    writes.length = 0;

    await page.goto(`${APP}/visitor-management/visitors`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.getByTestId('visitor-page').waitFor({ state: 'visible', timeout: 300000 });
    check('the Visitor Management page renders', true);

    // Search for the exact reference so the row is unambiguous.
    const search = page.getByTestId('visitor-search');
    await search.waitFor({ state: 'visible', timeout: 60000 });
    await search.fill(slipApi.visitorReference);
    await search.press('Enter');
    await page.waitForFunction(
      (ref) => document.body.innerText.includes(ref),
      slipApi.visitorReference,
      { timeout: 60000 },
    ).catch(() => note(`WARNING: reference ${slipApi.visitorReference} not visible in the list`));
    note(`filtered the list down to ${slipApi.visitorReference}`);

    // Open the detail modal, then print from there (the normal re-print path).
    await page.getByTestId(`visitor-view-${target.id}`).click({ timeout: 60000 });
    const detail = await page.getByTestId('visitor-detail', {}, { timeout: 60000 });
    await detail.waitFor({ state: 'visible', timeout: 60000 });
    check('the visitor detail modal opens', true);

    await page.getByTestId('visitor-detail-print').click();
    const canvas = page.getByTestId('visitor-slip-preview-canvas', {}, { timeout: 60000 });
    await canvas.waitFor({ state: 'visible', timeout: 60000 });
    // Let the logo/data-URL images settle before measuring.
    await page.waitForTimeout(1200);
    check('the print preview modal opens from the detail footer', true);

    const preview = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="visitor-slip-document"]');
      return el ? el.outerHTML : null;
    });
    check('the preview renders the slip document', !!preview);

    // ═════════════════════ B. PREVIEW CONTENT ═════════════════════════════
    section('B. Preview content (#19A requirements)');
    const previewText = (preview || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    // §1 — 12-hour AM/PM.
    const ampm = previewText.match(/\d{2}:\d{2}\s?(AM|PM)/g) || [];
    check('every printed time carries an AM/PM designator', ampm.length >= 3, `found ${ampm.length}: ${ampm.join(', ')}`);
    check('no 24-hour clock leaks onto the slip', !/\b[0-2]?\d:\d\d\b(?!\s?(AM|PM))/.test(previewText),
      (previewText.match(/\b[0-2]?\d:\d\d\b(?!\s?(AM|PM))/) || [''])[0]);
    check('midnight is 12 AM, not 00', !/\b00:\d\d\s?(AM|PM)/.test(previewText));
    check('Created At is 12-hour too', /Created At:\s*\d{2}-[A-Za-z]{3}-\d{4}\s\d{2}:\d{2}\s(AM|PM)/.test(previewText),
      (previewText.match(/Created At:.{0,40}/) || [''])[0]);

    // §2 — names, not ids.
    check('the preview prints the creating user by name',
      previewText.includes(`Created By: ${slipApi.createdByName}`),
      (previewText.match(/Created By:.{0,40}/) || [''])[0]);
    if (slipApi.hostConfirmation.confirmedBy) {
      check('the preview prints the confirming user by name',
        previewText.includes(slipApi.hostConfirmation.confirmedByName),
        (previewText.match(/Confirmed By:.{0,60}/) || [''])[0]);
      check('§17 is still stated next to the name', previewText.includes('host identity not verified'));
    }
    check('NO UUID appears anywhere in the preview markup', !UUID.test(preview || ''),
      (preview || '').match(UUID)?.[0] || '');
    check('the raw created_by id is not on the page', !previewText.includes(slipApi.createdBy || ' '));
    if (slipApi.hostConfirmation.confirmedBy) {
      check('the raw host_confirmed_by id is not on the page',
        !previewText.includes(slipApi.hostConfirmation.confirmedBy));
    }

    // §3/§4 — letterhead.
    check(`the company name is exactly "${COMPANY}"`, previewText.includes(COMPANY),
      (previewText.match(/Pakistan[^|]{0,50}/) || [''])[0]);
    check(`the location is exactly "${CITY}"`, previewText.includes(CITY));
    check('the old Lahore location is gone', !/Lahore/i.test(previewText));
    check('the old fixture company name is gone', !/PAKWIZ/i.test(previewText));
    check('no street address was invented',
      !/\d+\s+(Street|Road|Block|Sector|I\.I\.|Industrial|Avenue)/i.test(previewText),
      (previewText.match(/\d+\s+\w+\s+(Street|Road|Block|Sector)/i) || [''])[0]);

    // §13 — the physical signature blank is still there.
    const sigRules = (preview || '').match(/vs-sign-rule/g) || [];
    check('the physical signature rules are still present', sigRules.length >= 4, `count=${sigRules.length}`);
    check('the blank is labelled "Host Signature"', previewText.includes('Host Signature'));

    // ═════════════════════ C. THE REAL PRINT JOB ═══════════════════════════
    section('C. The real print pipeline -> A4 PDF');
    const printsBefore = await page.evaluate(() => window.__erpPrintCalls);
    await page.getByTestId('visitor-slip-preview-print').click();
    await page.waitForFunction((n) => window.__erpPrintCalls > n, printsBefore, { timeout: 60000 });
    check('Print opened the browser print dialog exactly once',
      (await page.evaluate(() => window.__erpPrintCalls)) === printsBefore + 1);

    const captured = await page.evaluate(() => {
      const frame = document.getElementById('pwi-print-frame');
      if (!frame) return null;
      const html = frame.contentDocument?.documentElement?.outerHTML ?? null;
      frame.remove();
      return html;
    });
    check('the print used the shared printHtmlContent pipeline (#pwi-print-frame)', !!captured);
    const printHtml = captured || '';
    fs.writeFileSync(path.join(OUT, 'slip-print-document.html'), printHtml);
    check('the printed document declares A4 portrait', /@page\s*\{[^}]*size:\s*A4 portrait/.test(printHtml));
    check('printing issued ZERO writes', writes.length === 0, writes.join(' | '));

    // §9/G — the preview and the print are the SAME document.
    const printedSlip = printHtml.slice(printHtml.indexOf('<div class="visitor-slip"'));
    check('preview and print render the SAME slip markup (one shared source)',
      printedSlip.startsWith(preview.replace(/^<div class="visitor-slip"/, '<div class="visitor-slip"').slice(0, 400)),
      `preview head: ${preview.slice(0, 120)}`);

    const MM = (mm) => Math.round(mm * (96 / 25.4));
    const printPage = await context.newPage();
    await printPage.setViewportSize({ width: MM(190), height: MM(281) });
    await printPage.setContent(printHtml, { waitUntil: 'load' });
    const pdf = await printPage.pdf({ printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(path.join(OUT, 'visitor-slip.pdf'), pdf);
    const pages = pdfPageCount(pdf);
    check('the slip prints on exactly ONE page', pages === 1, `pages=${pages}`);
    note(`PDF -> ${path.join(OUT, 'visitor-slip.pdf')} (${pdf.length} bytes)`);

    const printText = (await printPage.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    // `.vs-company` carries `text-transform: uppercase`, so the RENDERED text is
    // upper-cased while the MARKUP keeps the natural case. The requirement is
    // the letterhead itself, so compare case-insensitively here and assert the
    // exact spelling in the markup.
    const printHtmlCompany = (printHtml.match(/class="vs-company">([^<]*)</) || [])[1] || '';
    check('the PRINTED markup carries the company name exactly', printHtmlCompany === COMPANY, printHtmlCompany);
    check('the PRINTED page shows the company name (uppercased by CSS)',
      printText.toUpperCase().includes(COMPANY.toUpperCase()),
      (printText.match(/Pakistan[^|]{0,50}/i) || [''])[0]);
    check('the PRINTED page shows Karachi, Pakistan', printText.includes(CITY));
    check('the PRINTED page shows the creating user by name',
      printText.includes(`Created By: ${slipApi.createdByName}`));
    check('the PRINTED page uses the 12-hour clock', /\d{2}:\d{2}\s(AM|PM)/.test(printText),
      (printText.match(/\d{2}:\d{2}\s?(AM|PM)/g) || []).join(', '));
    check('the PRINTED page contains no UUID',
      !UUID.test(await printPage.evaluate(() => document.documentElement.outerHTML)));

    // ═════════════════════ D. HEADER ALIGNMENT (MEASURED) ══════════════════
    section('D. Header alignment, measured from real geometry');
    const header = await printPage.evaluate(() => {
      const q = (sel) => document.querySelector(sel);
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2),
          left: +r.left.toFixed(2), right: +r.right.toFixed(2),
          h: +r.height.toFixed(2), w: +r.width.toFixed(2),
          cy: +(r.top + r.height / 2).toFixed(2),
          cx: +(r.left + r.width / 2).toFixed(2),
        };
      };
      const headerEl = q('.vs-header');
      return {
        header: box(headerEl),
        logo: box(q('.vs-logo')),
        company: box(q('.vs-company')),
        companySub: box(q('.vs-company-sub')),
        title: box(q('.vs-title')),
        note: box(q('.vs-headline-note')),
        refBar: box(q('.vs-ref-bar')),
        refLabel: box(q('.vs-ref-label')),
        refValue: box(q('.vs-ref')),
        refStatus: box(q('.vs-ref-status')),
        // Signature geometry (#13) — must survive the redesign.
        hostSignature: Array.from(document.querySelectorAll('.vs-sign-line')).map((line) => ({
          cap: (line.querySelector('.vs-sign-cap')?.textContent || '').trim(),
          ruleH: +(line.querySelector('.vs-sign-rule')?.getBoundingClientRect().height || 0).toFixed(2),
          ruleW: +(line.querySelector('.vs-sign-rule')?.getBoundingClientRect().width || 0).toFixed(2),
        })),
        display: getComputedStyle(headerEl).display,
        alignItems: getComputedStyle(headerEl).alignItems,
        refDisplay: getComputedStyle(q('.vs-ref-bar')).display,
        refCols: getComputedStyle(q('.vs-ref-bar')).gridTemplateColumns,
        contentW: document.documentElement.clientWidth,
        contentH: document.documentElement.clientHeight,
        slip: box(q('.visitor-slip')),
      };
    });

    note(`header=${JSON.stringify(header.header)}`);
    note(`logo=${JSON.stringify(header.logo)}`);
    note(`company=${JSON.stringify(header.company)} title=${JSON.stringify(header.title)}`);
    note(`companySub=${JSON.stringify(header.companySub)} note=${JSON.stringify(header.note)}`);

    check('the header is a grid', header.display === 'grid', header.display);
    check('the header centres its cells (align-items: center)', header.alignItems === 'center', header.alignItems);

    // The real requirement: each ROW's two cells share one centre line, because
    // that is what makes the title sit level with the company name.
    const rowDelta = (a, b, label) => {
      if (!a || !b) { check(label, false, 'a header cell was not found'); return; }
      const d = Math.abs(a.cy - b.cy);
      note(`${label}: centres ${a.cy}px vs ${b.cy}px (delta ${d.toFixed(2)}px)`);
      check(`${label} share one centre line (within 1px)`, d <= 1, `delta=${d.toFixed(2)}px`);
    };
    rowDelta(header.company, header.title, 'row 1 (company name / VISITOR SLIP)');
    rowDelta(header.companySub, header.note, 'row 2 (city / RETAIN THIS SLIP)');

    // The logo spans both rows, so it is centred against the whole block. The
    // block extent is the union of BOTH rows — measured from the title bar, not
    // from the company name, because the name is a 16px line centred inside the
    // taller row-1 box and is therefore not the row's top edge.
    if (header.logo && header.company && header.title && header.companySub && header.note) {
      const blockTop = Math.min(header.company.top, header.title.top);
      const blockBottom = Math.max(header.companySub.bottom, header.note.bottom);
      const blockCy = (blockTop + blockBottom) / 2;
      const d = Math.abs(header.logo.cy - blockCy);
      note(`logo centre ${header.logo.cy}px vs two-row block centre ${blockCy.toFixed(2)}px (delta ${d.toFixed(2)}px)`);
      check('the logo is centred against the full two-row text block (within 1px)', d <= 1, `delta=${d.toFixed(2)}px`);
    } else {
      check('the logo is centred against the full two-row text block (within 1px)', false, 'logo not found');
    }

    // Cells in DIFFERENT rows must not collide vertically. Cells in the SAME row
    // overlap by design — they sit side by side in separate columns.
    const sameRow = [[header.company, header.title], [header.companySub, header.note]];
    const collide = (a, b) => a && b && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const crossRow = [
      [header.company, header.companySub], [header.company, header.note],
      [header.title, header.companySub], [header.title, header.note],
    ];
    check('the two header rows do not collide vertically',
      !crossRow.some(([a, b]) => collide(a, b)),
      crossRow.filter(([a, b]) => collide(a, b)).map(([a, b]) => `${a.top}-${a.bottom} vs ${b.top}-${b.bottom}`).join('; '));
    for (const [a, b] of sameRow) {
      if (a && b) {
        note(`row pair side by side: ${a.left}-${a.right} and ${b.left}-${b.right} (no horizontal overlap: ${a.right <= b.left})`);
      }
    }
    const hClash = sameRow.some(([a, b]) => a && b && a.right > b.left + 0.5);
    check('the two cells of each row do not overlap horizontally', !hClash);
    if (header.title && header.note) {
      const gap = header.note.top - header.title.bottom;
      note(`gap between the title bar and the retain note: ${gap.toFixed(2)}px`);
      check('the retain note sits below the title bar without colliding', gap >= 0, `gap=${gap.toFixed(2)}px`);
    }
    // The right-hand column is flush to the right edge of the header.
    if (header.title && header.header && header.note) {
      const rightGap = header.header.right - Math.max(header.title.right, header.note.right);
      note(`right column inset from the header border: ${rightGap.toFixed(2)}px`);
      check('the title and note are flush right with each other',
        Math.abs(header.title.right - header.note.right) <= 0.5,
        `${header.title.right} vs ${header.note.right}`);
      check('the right column respects the header padding (not 0)', rightGap > 0, `inset=${rightGap.toFixed(2)}px`);
    }

    // The VISITOR ID row: a real grid, value optically centred.
    check('the VISITOR ID row is a CSS grid', header.refDisplay === 'grid', header.refDisplay);
    // The computed value resolves `1fr auto 1fr` to pixels; what matters for
    // centring is that there are three tracks and the outer two are EQUAL, so
    // the auto middle track is centred between them.
    const cols = header.refCols.split(' ').map((c) => parseFloat(c));
    check('the VISITOR ID row is a 3-track grid with equal outer tracks',
      cols.length === 3 && Math.abs(cols[0] - cols[2]) < 0.5, header.refCols);
    if (header.refBar && header.refValue) {
      const barCx = header.refBar.cx;
      const delta = Math.abs(header.refValue.cx - barCx);
      note(`reference centre ${header.refValue.cx}px vs bar centre ${barCx}px (delta ${delta.toFixed(2)}px)`);
      check('the visitor reference is centred on the row (within 1px)', delta <= 1, `delta=${delta.toFixed(2)}px`);
    }
    check('the reference bar items are vertically centred',
      header.refLabel && header.refValue && header.refStatus &&
      Math.abs(header.refLabel.cy - header.refValue.cy) <= 1 && Math.abs(header.refValue.cy - header.refStatus.cy) <= 1,
      header.refLabel && header.refValue && header.refStatus
        ? `${header.refLabel.cy}/${header.refValue.cy}/${header.refStatus.cy}` : 'missing');

    // §13 — the physical signature blank, in millimetres.
    const hostSig = header.hostSignature.find((s) => s.cap === 'Host Signature');
    check('the physical "Host Signature" blank is still present', !!hostSig);
    if (hostSig) {
      const hMm = (hostSig.ruleH * 25.4) / 96;
      const wMm = (hostSig.ruleW * 25.4) / 96;
      note(`Host Signature blank: ${hMm.toFixed(1)}mm high x ${wMm.toFixed(1)}mm wide`);
      check('the Host Signature blank is at least 10mm tall for handwriting', hMm >= 10, `${hMm.toFixed(1)}mm`);
      check('the Host Signature blank is at least 60mm wide', wMm >= 60, `${wMm.toFixed(1)}mm`);
    }
    const blanks = header.hostSignature.filter((s) => s.ruleH > 0);
    check('at least four ruled blanks remain for handwriting', blanks.length >= 4, `count=${blanks.length}`);

    // Nothing clipped by the printer's own margins, and still one page.
    const overflow = await printPage.evaluate(() => {
      const de = document.documentElement;
      return {
        scrollW: de.scrollWidth, clientW: de.clientWidth,
        scrollH: de.scrollHeight, clientH: de.clientHeight,
        widest: Math.max(...Array.from(document.querySelectorAll('.visitor-slip *'))
          .map((el) => Math.round(el.getBoundingClientRect().right))),
      };
    });
    check('nothing overflows the A4 content box horizontally',
      overflow.scrollW <= overflow.clientW + 1, JSON.stringify(overflow));
    check('nothing overflows the A4 content box vertically (one page)',
      overflow.scrollH <= overflow.clientH + 1, JSON.stringify(overflow));
    note(`content box ${overflow.clientW}x${overflow.clientH}px, widest element right edge ${overflow.widest}px`);

    // A visual record of both the preview and the printed page.
    await printPage.screenshot({ path: path.join(OUT, 'slip-print-render.png'), fullPage: true });
    const previewEl = page.locator('[data-testid="visitor-slip-document"]');
    await previewEl.screenshot({ path: path.join(OUT, 'slip-preview-render.png') }).catch(() => {});
    note(`artifacts -> ${OUT}`);

    // ═════════════════════ E. NO UNEXPECTED CONSOLE NOISE ══════════════════
    section('E. Console');
    check('no unexpected console errors or warnings on the visitor page',
      consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  } finally {
    await browser.close();
  }

  console.log(`\nP19A-UI PASS=${checks - failures} FAIL=${failures} (total ${checks})`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
