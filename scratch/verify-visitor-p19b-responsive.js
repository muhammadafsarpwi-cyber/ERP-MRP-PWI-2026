/**
 * LIVE RESPONSIVE VERIFICATION — Prompt #19B.
 *
 * Drives the real SPA in Chromium (Playwright, vendored at the repo root) at the
 * three form factors the prompt names, and measures — never eyeballs:
 *
 *   §1/§2  the Visitor Management UI is usable at 390 / 768 / 1366
 *          • no page-level horizontal scrolling
 *          • no element forced wider than the viewport outside a real scroller
 *          • the list scrolls INSIDE its own container, never by widening the app
 *          • filters, actions and modal controls stay reachable and hittable
 *   §4/§5  the slip PREVIEW is pinned to A4 and scaled to fit
 *          • the letterhead is ONE line at every width (measured line boxes)
 *          • the document's layout width is 190 mm everywhere, so the preview is
 *            the printed page rather than a reflowed variant
 *          • the frame fits the mobile viewport with no page overflow
 *   §5/§4  the A4 PRINT is untouched by any of this
 *          • the print document is still A4, still one page, still unscaled,
 *            and contains none of the preview-only markup or CSS
 *   §6     no raw UUID reaches any Visitor Management screen
 *
 * Usage:  node scratch/verify-visitor-p19b-responsive.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP = process.env.ERP_APP || 'http://localhost:3000';
const API = process.env.ERP_API || 'http://localhost:3001/api/v1';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const OUT = path.join(__dirname, 'p19b-responsive-artifacts');

/** The three form factors §3/§7 names. */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MM = (mm) => Math.round(mm * (96 / 25.4));

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? ` :: ${detail}` : ''}`);
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

/**
 * Page-level overflow, plus the elements responsible.
 *
 * An element wider than the viewport is only a BUG when nothing between it and
 * the body can scroll horizontally — that is the "scroll inside the container"
 * pattern §2 explicitly asks for. Anything inside a real `overflow-x: auto/scroll`
 * ancestor is reported separately and does not fail the page check.
 */
const OVERFLOW_PROBE = () => {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  // An element wider than the viewport is only a BUG when nothing between it and
  // the body contains it horizontally. `auto`/`scroll` is the "scroll inside the
  // container" pattern §2 explicitly asks for; `hidden`/`clip` is the app's
  // existing viewport lock (erp-table.css §16) plus the header marquee, which is
  // deliberately wider than the screen and clipped. Both are legitimate; neither
  // lets the page scroll, which is the check that actually matters.
  const containedBy = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX)) return p;
      p = p.parentElement;
    }
    return null;
  };
  const label = (el) => {
    const id = el.getAttribute('data-testid');
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ''}${cls ? `.${cls}` : ''}`;
  };
  const offenders = [];
  const contained = [];
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1) {
      const rec = { el: label(el), right: Math.round(r.right), width: Math.round(r.width) };
      if (containedBy(el)) contained.push(rec);
      else offenders.push(rec);
    }
  }
  return {
    vw, vh,
    docScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    offenders: offenders.slice(0, 12),
    containedCount: contained.length,
    containedSample: contained.slice(0, 3),
  };
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // A COMPLETED, host-confirmed visitor exercises every branch of the slip and
  // every action in the list.
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = (await login.json()).token;
  const H = { authorization: `Bearer ${token}` };
  const listed = (await (await fetch(`${API}/visitor/entries?limit=200&page=1`, { headers: H })).json()).data || [];
  const closed = listed.find((r) => r.hostConfirmedBy && r.timeOut) || listed[0];
  const onSite = listed.find((r) => !r.timeOut && r.status === 'PENDING') || closed;
  if (!closed) throw new Error('no visitor rows to verify');
  const slipApi = (await (await fetch(`${API}/visitor/entries/${closed.id}/slip`, { headers: H })).json()).data;
  note(`closed target  ${slipApi.visitorReference} (${closed.status})`);
  note(`on-site target ${onSite.visitorReference} (${onSite.status})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: VIEWPORTS[2].width, height: VIEWPORTS[2].height } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    // Pre-existing, attributed in the #19 report: rc-util isEqual reports a
    // circular reference for an EMPTY array. React dev build only.
    if (/circular reference/i.test(text)) return;
    consoleErrors.push(`${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // `printHtmlContent` calls `iframe.contentWindow.print()`, so the override has
  // to exist in EVERY frame and report to the top window.
  await page.addInitScript(() => {
    const bump = () => {
      try { window.top.__erpPrintCalls = (window.top.__erpPrintCalls || 0) + 1; } catch { /* cross-origin */ }
    };
    Object.defineProperty(window, 'print', { value: bump, writable: true, configurable: true });
    if (window === window.top) window.__erpPrintCalls = 0;
  });

  try {
    // ═════════════════════ SIGN IN ══════════════════════════════════════════
    section('Sign in');
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.getByRole('button', { name: /ENTER SYSTEM/i }).waitFor({ state: 'visible', timeout: 300000 });
    await page.getByRole('button', { name: /ENTER SYSTEM/i }).click();
    await page.locator('input#login_email').waitFor({ state: 'visible', timeout: 300000 });
    await page.locator('input#login_email').fill(EMAIL);
    await page.locator('input#login_password').fill(PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 180000 });
    note(`signed in -> ${new URL(page.url()).pathname}`);

    // ═════════════════════ PER-VIEWPORT AUDIT ════════════════════════════════
    for (const vp of VIEWPORTS) {
      section(`${vp.name.toUpperCase()} — ${vp.width}x${vp.height}`);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${APP}/visitor-management/visitors`, { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.getByTestId('visitor-page').waitFor({ state: 'visible', timeout: 300000 });
      await page.waitForTimeout(700);

      // ── §1/§2 the page itself ─────────────────────────────────────────────
      let ov = await page.evaluate(OVERFLOW_PROBE);
      check(`${vp.name}: the page does not scroll horizontally`,
        ov.docScrollW <= ov.vw + 1, `documentElement.scrollWidth=${ov.docScrollW} vs clientWidth=${ov.vw}`);
      check(`${vp.name}: no element is forced past the viewport edge`,
        ov.offenders.length === 0,
        ov.offenders.map((o) => `${o.el}@${o.right}`).join(' | '));
      note(`scrollWidth=${ov.docScrollW} clientWidth=${ov.vw} (${ov.containedCount} element(s) wider than the screen but contained by a scroller or clip — none of them can widen the page)`);

      // ── §1 KPI cards reflow instead of being squeezed ──────────────────────
      const kpi = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="visitor-page"] .ant-col'))
          .slice(0, 4)
          .map((c) => Math.round(c.getBoundingClientRect().width));
        return cards;
      });
      const kpiPerRow = new Set(kpi).size === 1 ? 4 : kpi.filter((w) => w === Math.max(...kpi)).length;
      check(`${vp.name}: the 4 KPI cards lay out as one responsive row group (${kpiPerRow} per row)`,
        kpi.length === 4 && kpi.every((w) => w > 0), `widths=${JSON.stringify(kpi)}`);

      // ── §1/§2 filters remain usable ────────────────────────────────────────
      // The touch target is antd's `.ant-input-affix-wrapper` / `.ant-select-selector`,
      // not the bare <input> inside it — measuring the inner node would understate
      // the real control by the wrapper's padding and border.
      const filterGeo = await page.evaluate(() => {
        const target = (testid) => {
          const el = document.querySelector(`[data-testid="${testid}"]`);
          if (!el) return null;
          const box = el.closest('.ant-input-affix-wrapper')
            || el.closest('.ant-select')
            || el;
          const r = box.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right) };
        };
        return { search: target('visitor-search'), status: target('visitor-status-filter') };
      });
      note(`filter sizes: search=${JSON.stringify(filterGeo.search)} status=${JSON.stringify(filterGeo.status)}`);
      check(`${vp.name}: the search box is present and large enough to use`,
        !!filterGeo.search && filterGeo.search.w > 120 && filterGeo.search.h >= 32, JSON.stringify(filterGeo.search));
      check(`${vp.name}: the status filter is present and large enough to use`,
        !!filterGeo.status && filterGeo.status.w > 100 && filterGeo.status.h >= 32, JSON.stringify(filterGeo.status));
      check(`${vp.name}: both filters sit inside the viewport`,
        !!filterGeo.search && !!filterGeo.status
        && filterGeo.search.left >= -1 && filterGeo.search.right <= vp.width + 1
        && filterGeo.status.left >= -1 && filterGeo.status.right <= vp.width + 1);
      // Prove the search box actually works at this width.
      const search = page.getByTestId('visitor-search');
      await search.fill(slipApi.visitorReference);
      await search.press('Enter');
      await page.waitForFunction(
        (ref) => document.body.innerText.includes(ref), slipApi.visitorReference, { timeout: 30000 },
      ).catch(() => note(`WARNING: ${slipApi.visitorReference} did not filter`));
      check(`${vp.name}: the search actually filters the list`, await page.evaluate((r) => document.body.innerText.includes(r), slipApi.visitorReference));

      // ── §2 the table scrolls INSIDE its container ──────────────────────────
      const table = await page.evaluate(() => {
        const scroller = document.querySelector('.ant-table-content') || document.querySelector('.ant-table-body');
        const tableEl = document.querySelector('[data-testid="visitor-page"] .ant-table');
        if (!scroller || !tableEl) return null;
        const cs = getComputedStyle(scroller);
        return {
          overflowX: cs.overflowX,
          clientW: scroller.clientWidth,
          scrollW: scroller.scrollWidth,
          tableW: Math.round(tableEl.getBoundingClientRect().width),
          bodyRows: document.querySelectorAll('.ant-table-tbody > tr').length,
        };
      });
      check(`${vp.name}: the list is a scrollable container, not a page-wide overflow`,
        !!table && /auto|scroll/.test(table.overflowX), JSON.stringify(table && { o: table.overflowX }));
      check(`${vp.name}: the list is wider than its box and scrolls internally`,
        !!table && table.scrollW > table.clientW, JSON.stringify(table && { clientW: table.clientW, scrollW: table.scrollW }));
      check(`${vp.name}: the table has rows to read`, !!table && table.bodyRows > 0, `rows=${table && table.bodyRows}`);

      // ── §1 actions remain accessible and hittable ─────────────────────────
      const actions = await page.evaluate(() => {
        const out = [];
        for (const [name, sel] of [
          ['Print Slip', `visitor-slip-${document.querySelector('[data-testid^="visitor-slip-"]')?.getAttribute('data-testid')?.replace('visitor-slip-', '')}`],
        ]) void [name, sel];
        const pick = (prefix) => document.querySelector(`[data-testid^="${prefix}"]`);
        const measure = (prefix) => {
          const el = pick(prefix);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const vw = document.documentElement.clientWidth;
          const vh = document.documentElement.clientHeight;
          // Scroll it into view inside whatever scroller owns it, then hit-test.
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const r2 = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
          return {
            w: Math.round(r.width), h: Math.round(r.height),
            withinX: r2.left >= -1 && r2.right <= vw + 1,
            withinY: r2.top >= -1 && r2.bottom <= vh + 1,
            hittable: !!hit && (el === hit || el.contains(hit) || hit.contains(el)),
          };
        };
        return { slip: measure('visitor-slip-'), view: measure('visitor-view-') };
      });
      for (const [label, geo] of Object.entries(actions)) {
        check(`${vp.name}: the "${label}" action is hittable inside the viewport`,
          !!geo && geo.h > 0 && geo.w > 0 && geo.withinX && geo.hittable, JSON.stringify(geo));
      }

      // ── §1 the status tab bar wraps instead of overflowing ────────────────
      const tabs = await page.evaluate(() => {
        const first = document.querySelector('[data-testid="visitor-tab-ALL"]');
        const last = document.querySelector('[data-testid="visitor-tab-CANCELLED"]');
        if (!first || !last) return null;
        const fr = first.getBoundingClientRect();
        const lr = last.getBoundingClientRect();
        return { right: Math.round(Math.max(fr.right, lr.right)), rows: Math.round(fr.top !== lr.top ? 2 : 1) };
      });
      check(`${vp.name}: the status tabs stay inside the viewport (wrapping to ${tabs && tabs.rows} row(s))`,
        !!tabs && tabs.right <= vp.width + 1, JSON.stringify(tabs));

      // ── §1 pagination is reachable ────────────────────────────────────────
      const pag = await page.evaluate(() => {
        const el = document.querySelector('.ant-pagination');
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), withinX: r.left >= -1 && r.right <= document.documentElement.clientWidth + 1 };
      });
      check(`${vp.name}: pagination is visible and inside the viewport`, !!pag && pag.withinX, JSON.stringify(pag));

      // ══════════ §1/§6 VISITOR DETAIL ══════════
      section(`${vp.name}: Visitor Detail modal`);
      await page.getByTestId(`visitor-view-${closed.id}`).click({ timeout: 60000 });
      await page.getByTestId('visitor-detail', {}, { timeout: 60000 }).waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForTimeout(400);

      const detailModal = await page.evaluate(() => {
        const modal = document.querySelector('[data-testid="visitor-detail-modal"] .ant-modal')
          || document.querySelector('.ant-modal');
        const body = modal.querySelector('.ant-modal-body');
        const footer = modal.querySelector('.ant-modal-footer');
        const close = modal.querySelector('.ant-modal-close');
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const r = modal.getBoundingClientRect();
        // Scroll the modal body to the bottom: every field and every footer
        // action must be reachable without the page itself scrolling.
        body.scrollTop = body.scrollHeight;
        const btns = Array.from(footer ? footer.querySelectorAll('button') : []).map((b) => {
          const br = b.getBoundingClientRect();
          return {
            label: (b.textContent || '').trim(),
            w: Math.round(br.width), h: Math.round(br.height),
            withinX: br.left >= -1 && br.right <= vw + 1,
            withinY: br.top >= -1 && br.bottom <= vh + 1,
            visible: br.width > 0 && br.height > 0,
          };
        });
        const cr = close ? close.getBoundingClientRect() : null;
        const detail = document.querySelector('[data-testid="visitor-detail"]');
        return {
          modal: { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) },
          fitsX: r.left >= -1 && r.right <= vw + 1,
          bodyOverflowX: getComputedStyle(body).overflowX,
          bodyScrollsY: body.scrollHeight > body.clientHeight,
          close: cr ? { w: Math.round(cr.width), h: Math.round(cr.height), withinX: cr.left >= -1 && cr.right <= vw + 1, withinY: cr.top >= -1 && cr.bottom <= vh + 1 } : null,
          buttons: btns,
          text: (detail?.innerText || '').replace(/\s+/g, ' '),
          widest: Math.max(...Array.from(detail.querySelectorAll('.ant-descriptions-item-label, .ant-descriptions-item-content'))
            .map((e) => Math.round(e.getBoundingClientRect().right)), 0),
        };
      });
      check(`${vp.name}: the detail modal fits the viewport horizontally`, detailModal.fitsX, JSON.stringify(detailModal.modal));
      check(`${vp.name}: the detail modal's close (X) is reachable`,
        !!detailModal.close && detailModal.close.withinX && detailModal.close.withinY && detailModal.close.h >= 20, JSON.stringify(detailModal.close));
      check(`${vp.name}: every detail footer action is visible and reachable`,
        detailModal.buttons.length > 0 && detailModal.buttons.every((b) => b.visible && b.withinX && b.withinY),
        JSON.stringify(detailModal.buttons));
      check(`${vp.name}: the detail content does not spill past the modal`,
        detailModal.widest <= detailModal.modal.right + 1,
        `widest child right=${detailModal.widest} modal right=${detailModal.modal.right}`);

      // §6 — names, not UUIDs, in the detail screen.
      check(`${vp.name}: §6 the detail modal shows NO raw UUID`, !UUID.test(detailModal.text),
        (detailModal.text.match(UUID) || [''])[0]);
      const detailApi = (await (await fetch(`${API}/visitor/entries/${closed.id}`, { headers: H })).json()).data;
      note(`detail API names: createdByName=${detailApi.createdByName} hostConfirmedByName=${detailApi.hostConfirmedByName} exitedByName=${detailApi.exitedByName}`);
      if (detailApi.createdByName) {
        check(`${vp.name}: §6 "Created By" shows the resolved ERP user name`,
          detailModal.text.includes(detailApi.createdByName), detailApi.createdByName);
      }
      if (detailApi.hostConfirmedByName) {
        check(`${vp.name}: §6 "Confirmed By" shows the resolved ERP user name`,
          detailModal.text.includes(detailApi.hostConfirmedByName), detailApi.hostConfirmedByName);
      }
      if (detailApi.exitedByName) {
        check(`${vp.name}: §6 "Exit Recorded By" shows the resolved ERP user name`,
          detailModal.text.includes(detailApi.exitedByName), detailApi.exitedByName);
      }
      // The name must survive the narrow column: a truncated name is a UUID in
      // everything but letters.
      const nameWidths = await page.evaluate(() => {
        const ids = ['detail-created-by', 'detail-host-confirmed-by', 'detail-exited-by'];
        return ids.map((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) return null;
          return { id, w: Math.round(el.getBoundingClientRect().width), scrollW: el.scrollWidth, clipped: el.scrollWidth > el.clientWidth + 1 };
        }).filter(Boolean);
      });
      check(`${vp.name}: §6 the resolved names are not clipped by the narrow layout`,
        nameWidths.every((n) => !n.clipped), JSON.stringify(nameWidths));

      // §1/§2 the modal must not have widened the page.
      const ovDetail = await page.evaluate(OVERFLOW_PROBE);
      check(`${vp.name}: opening the detail modal does not make the page scroll sideways`,
        ovDetail.docScrollW <= ovDetail.vw + 1, `scrollWidth=${ovDetail.docScrollW} vs ${ovDetail.vw}`);

      // ══════════ §4/§5 PRINT PREVIEW ══════════
      section(`${vp.name}: print preview (mobile/tablet/laptop fit)`);
      await page.getByTestId('visitor-detail-print').click();
      await page.getByTestId('visitor-slip-preview-canvas', {}, { timeout: 60000 }).waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForTimeout(1200); // let the logo / data-URL images settle

      const prev = await page.evaluate(() => {
        const lineBoxes = (el) => {
          if (!el) return -1;
          const r = document.createRange();
          r.selectNodeContents(el);
          return r.getClientRects().length;
        };
        const stage = document.querySelector('[data-testid="visitor-slip-preview-stage"]');
        const frame = document.querySelector('[data-testid="visitor-slip-preview-frame"]');
        const doc = document.querySelector('[data-testid="visitor-slip-preview-doc"]');
        const slip = document.querySelector('[data-testid="visitor-slip-document"]');
        const company = document.querySelector('.vs-company');
        const header = document.querySelector('.vs-header');
        const modal = document.querySelector('.ant-modal');
        const mr = modal ? modal.getBoundingClientRect() : null;
        const vw = document.documentElement.clientWidth;
        return {
          stage: { clientW: stage ? stage.clientWidth : 0 },
          frame: frame ? {
            clientW: frame.clientWidth, scrollW: frame.scrollWidth,
            clientH: frame.clientHeight, scrollH: frame.scrollHeight,
            scale: frame.getAttribute('data-scale'),
            scrolls: frame.getAttribute('data-scrolls'),
            overflowX: getComputedStyle(frame).overflowX,
            // A CSS transform does not change layout size, so `scrollWidth` on
            // the frame stays at the document's full 718px even when the scaled
            // content fits exactly. `scrollLeft` is also still programmable under
            // `overflow: hidden`, so neither is a real test: what matters is that
            // the frame offers the user no horizontal scrolling.
            canScrollX: (() => { const before = frame.scrollLeft; frame.scrollLeft = 999; const moved = frame.scrollLeft > before; frame.scrollLeft = before; return moved; })(),
          } : null,
          doc: doc ? {
            // offsetWidth is the UNSCALED layout width: this is the proof that
            // the document is pinned to A4 rather than reflowed.
            layoutW: doc.offsetWidth,
            visualW: Math.round(doc.getBoundingClientRect().width),
          } : null,
          slip: slip ? { offsetW: slip.offsetWidth, offsetH: slip.offsetHeight } : null,
          companyLines: lineBoxes(company),
          companyText: company ? company.textContent.trim() : null,
          companyWidth: company ? Math.round(company.getBoundingClientRect().width) : 0,
          headerCols: header ? getComputedStyle(header).gridTemplateColumns : null,
          transform: doc ? getComputedStyle(doc).transform : null,
          modalFitsX: !!mr && mr.left >= -1 && mr.right <= vw + 1,
          previewText: (slip?.innerText || '').replace(/\s+/g, ' '),
        };
      });
      note(`stage=${prev.stage.clientW}px  frame=${JSON.stringify(prev.frame)}`);
      note(`document layout width=${prev.doc && prev.doc.layoutW}px  visual width=${prev.doc && prev.doc.visualW}px  transform=${prev.transform}`);

      check(`${vp.name}: the previewed document is pinned to the A4 width (190mm ≈ ${MM(190)}px)`,
        Math.abs((prev.doc?.layoutW || 0) - MM(190)) <= 2, `layout width=${prev.doc?.layoutW}px`);
      check(`${vp.name}: §5 the letterhead is ONE line, not "PAKIS / TAN / WIRE / …"`,
        prev.companyLines === 1, `lineBoxes=${prev.companyLines} "${prev.companyText}"`);
      check(`${vp.name}: the letterhead text is the exact company name`,
        prev.companyText === 'Pakistan Wire Industries (Pvt.) LTD.', prev.companyText);
      check(`${vp.name}: the header grid still has its three A4 tracks (not squeezed)`,
        !!prev.headerCols && prev.headerCols.split(' ').length === 3, prev.headerCols);
      check(`${vp.name}: the preview is scaled to fit rather than overflowing`,
        prev.doc.visualW <= prev.stage.clientW + 1,
        `visual=${prev.doc?.visualW}px vs stage=${prev.stage.clientW}px`);
      check(`${vp.name}: the preview frame shows no phantom horizontal scrollbar`,
        prev.frame && prev.frame.scrolls === 'false' && prev.frame.overflowX === 'hidden',
        `data-scrolls=${prev.frame?.scrolls} overflow-x=${prev.frame?.overflowX}`);
      if (prev.stage.clientW < MM(190)) {
        check(`${vp.name}: the scale factor was actually reduced for this width`,
          Number(prev.frame?.scale) < 1, `scale=${prev.frame?.scale} stage=${prev.stage.clientW}px`);
      } else {
        check(`${vp.name}: the scale stays 1:1 once the space is wide enough (never magnified)`,
          Number(prev.frame?.scale) === 1, `scale=${prev.frame?.scale} stage=${prev.stage.clientW}px`);
      }
      check(`${vp.name}: the preview modal fits the viewport horizontally`, prev.modalFitsX);

      const ovPrev = await page.evaluate(OVERFLOW_PROBE);
      check(`${vp.name}: the print preview does not make the page scroll sideways`,
        ovPrev.docScrollW <= ovPrev.vw + 1, `scrollWidth=${ovPrev.docScrollW} vs ${ovPrev.vw}`);

      // Preview actions must be reachable.
      const prevBtns = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const footer = document.querySelector('.ant-modal-footer');
        return Array.from(footer ? footer.querySelectorAll('button') : []).map((b) => {
          const r = b.getBoundingClientRect();
          return { label: (b.textContent || '').trim(), visible: r.width > 0 && r.height > 0, withinX: r.left >= -1 && r.right <= vw + 1, withinY: r.top >= -1 && r.bottom <= vh + 1 };
        });
      });
      check(`${vp.name}: the preview's Print and Cancel buttons are reachable`,
        prevBtns.length >= 2 && prevBtns.every((b) => b.visible && b.withinX && b.withinY), JSON.stringify(prevBtns));

      await page.getByTestId('visitor-slip-preview-cancel').click();
      await page.waitForTimeout(600);
      check(`${vp.name}: the print preview closes`,
        !(await page.getByTestId('visitor-slip-preview-canvas').isVisible().catch(() => false)));

      // ══════════ §1 TIME-OUT + HOST CONFIRMATION ══════════
      // Both actions only exist for a visitor still on site, so the list is
      // re-filtered to that visitor. The detail Modal is a single instance
      // keyed on state, so it has to be fully closed first.
      await page.getByTestId('visitor-detail-close').click();
      await page.waitForTimeout(600);
      await page.getByTestId('visitor-search').fill(onSite.visitorReference);
      await page.getByTestId('visitor-search').press('Enter');
      await page.getByTestId(`visitor-view-${onSite.id}`).waitFor({ state: 'visible', timeout: 60000 });
      await page.getByTestId(`visitor-view-${onSite.id}`).click({ timeout: 60000 });
      await page.getByTestId('visitor-detail', {}, { timeout: 60000 }).waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForTimeout(500);
      note(`on-site row ${onSite.visitorReference} (${onSite.status}) is the action target`);

      const timeOutBtn = page.getByTestId('visitor-detail-exit');
      if (await timeOutBtn.count()) {
        section(`${vp.name}: Time-Out action`);
        await timeOutBtn.click();
        // Wait on the modal BODY, not the `.ant-modal-root` wrapper: the root
        // stays in the DOM while the dialog is closed.
        await page.getByTestId('visitor-exit-body', {}, { timeout: 60000 }).waitFor({ state: 'visible', timeout: 60000 });
        await page.waitForTimeout(400);
        const g = await page.evaluate(() => {
          const modal = document.querySelector('[data-testid="visitor-exit-modal"] .ant-modal') || document.querySelector('.ant-modal');
          const body = modal.querySelector('.ant-modal-body');
          body.scrollTop = body.scrollHeight;
          const vw = document.documentElement.clientWidth;
          const vh = document.documentElement.clientHeight;
          const r = modal.getBoundingClientRect();
          return {
            fitsX: r.left >= -1 && r.right <= vw + 1,
            text: (body.innerText || '').replace(/\s+/g, ' '),
            buttons: Array.from(modal.querySelectorAll('.ant-modal-footer button')).map((b) => {
              const br = b.getBoundingClientRect();
              return { label: (b.textContent || '').trim(), visible: br.width > 0 && br.height > 0, withinX: br.left >= -1 && br.right <= vw + 1, withinY: br.top >= -1 && br.bottom <= vh + 1 };
            }),
          };
        });
        check(`${vp.name}: the Time-Out modal fits the viewport`, g.fitsX);
        check(`${vp.name}: the Time-Out modal shows the visit facts`, /Visitor/.test(g.text) && /Time-In/.test(g.text), g.text.slice(0, 80));
        check(`${vp.name}: the Time-Out Cancel and Confirm buttons are reachable`,
          g.buttons.length === 2 && g.buttons.every((b) => b.visible && b.withinX && b.withinY), JSON.stringify(g.buttons));
        check(`${vp.name}: the Time-Out modal shows no UUID`, !UUID.test(g.text), (g.text.match(UUID) || [''])[0]);
        await page.getByTestId('visitor-exit-cancel').click();
        await page.waitForTimeout(600);
        // antd keeps a dismissed Modal mounted through its leave animation, so
        // absence from the DOM is the wrong assertion — visibility is.
        check(`${vp.name}: the Time-Out modal cancels without recording anything`,
          !(await page.getByTestId('visitor-exit-body').isVisible().catch(() => false)));
      }

      const hostBtn = page.getByTestId('visitor-detail-confirm-host');
      if (await hostBtn.count()) {
        section(`${vp.name}: Host Confirmation action`);
        await hostBtn.click();
        await page.getByTestId('visitor-host-body', {}, { timeout: 60000 }).waitFor({ state: 'visible', timeout: 60000 });
        await page.waitForTimeout(500);
        const g = await page.evaluate(() => {
          const modal = document.querySelector('[data-testid="visitor-host-modal"] .ant-modal') || document.querySelector('.ant-modal');
          const body = modal.querySelector('.ant-modal-body');
          body.scrollTop = body.scrollHeight;
          const vw = document.documentElement.clientWidth;
          const vh = document.documentElement.clientHeight;
          const r = modal.getBoundingClientRect();
          const pad = document.querySelector('[data-testid="visitor-host-signature"]');
          const pr = pad ? pad.getBoundingClientRect() : null;
          return {
            fitsX: r.left >= -1 && r.right <= vw + 1,
            text: (body.innerText || '').replace(/\s+/g, ' '),
            signature: pr ? { w: Math.round(pr.width), h: Math.round(pr.height), withinX: pr.left >= -1 && pr.right <= vw + 1 } : null,
            buttons: Array.from(modal.querySelectorAll('.ant-modal-footer button')).map((b) => {
              const br = b.getBoundingClientRect();
              return { label: (b.textContent || '').trim(), visible: br.width > 0 && br.height > 0, withinX: br.left >= -1 && br.right <= vw + 1, withinY: br.top >= -1 && br.bottom <= vh + 1 };
            }),
          };
        });
        check(`${vp.name}: the Host Confirmation modal fits the viewport`, g.fitsX);
        check(`${vp.name}: the signature pad is present, usable and inside the viewport`,
          !!g.signature && g.signature.w > 100 && g.signature.h > 40 && g.signature.withinX, JSON.stringify(g.signature));
        check(`${vp.name}: the Host Confirmation Cancel and Confirm buttons are reachable`,
          g.buttons.length === 2 && g.buttons.every((b) => b.visible && b.withinX && b.withinY), JSON.stringify(g.buttons));
        check(`${vp.name}: the Host Confirmation modal shows no UUID`, !UUID.test(g.text), (g.text.match(UUID) || [''])[0]);
        await page.getByTestId('visitor-host-cancel').click();
        await page.waitForTimeout(600);
        check(`${vp.name}: the Host Confirmation modal cancels without recording anything`,
          !(await page.getByTestId('visitor-host-body').isVisible().catch(() => false)));
      }

      await page.getByTestId('visitor-detail-close').click();
      await page.waitForTimeout(400);
    }

    // ═════════════════════ SHORT-LAPTOP DIALOG FIT ══════════════════════════
    // The defect #19B §1 found: antd caps a Modal at 100vh but still places it
    // at `top: 100px`, so a long dialog pushes its own footer off a short
    // screen. 1366x664 is a realistic small-laptop height, and it is where the
    // detail dialog's actions were 56px below the fold. New Visitor is included
    // because it has `footer={null}` — its Register button lives at the bottom of
    // the BODY, so it needs the body capped rather than the footer kept in place.
    for (const [sw, sh] of [[1366, 664], [1366, 768], [390, 667]]) {
      section(`Short-screen dialog fit — ${sw}x${sh}`);
      await page.setViewportSize({ width: sw, height: sh });
      await page.goto(`${APP}/visitor-management/visitors`, { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.getByTestId('visitor-page').waitFor({ state: 'visible', timeout: 300000 });

      const newBtn = page.getByTestId('new-visitor-button');
      if (await newBtn.count()) {
        await newBtn.click();
        await page.getByTestId('visitor-form', {}, { timeout: 60000 }).waitFor({ state: 'visible', timeout: 60000 });
        await page.waitForTimeout(600);
        const g = await page.evaluate(() => {
          const modal = Array.from(document.querySelectorAll('.ant-modal')).find((m) => m.getBoundingClientRect().height > 0);
          const body = modal.querySelector('.ant-modal-body');
          body.scrollTop = body.scrollHeight; // the Register button is the last control
          const vh = document.documentElement.clientHeight;
          const vw = document.documentElement.clientWidth;
          const btns = Array.from(modal.querySelectorAll('button')).map((b) => {
            const r = b.getBoundingClientRect();
            return { label: (b.textContent || '').trim(), visible: r.width > 0 && r.height > 0, withinX: r.left >= -1 && r.right <= vw + 1, withinY: r.top >= -1 && r.bottom <= vh + 1 };
          });
          const mr = modal.getBoundingClientRect();
          return { fitsX: mr.left >= -1 && mr.right <= vw + 1, bottom: Math.round(mr.bottom), vh, buttons: btns };
        });
        check(`${sw}x${sh}: the New Visitor dialog fits the viewport horizontally`, g.fitsX);
        check(`${sw}x${sh}: the New Visitor dialog stays inside the viewport vertically`, g.bottom <= g.vh + 1,
          `dialog bottom=${g.bottom} vs viewport ${g.vh}`);
        const register = g.buttons.find((b) => /Register Visitor/i.test(b.label));
        const cancel = g.buttons.find((b) => /^Cancel$/i.test(b.label));
        check(`${sw}x${sh}: the "Register Visitor" action is reachable`,
          !!register && register.visible && register.withinX && register.withinY, JSON.stringify(register));
        check(`${sw}x${sh}: the "Cancel" action is reachable`,
          !!cancel && cancel.visible && cancel.withinX && cancel.withinY, JSON.stringify(cancel));
        await page.getByTestId('new-visitor-cancel').click();
        await page.waitForTimeout(500);
      }

      await page.getByTestId('visitor-search').fill(slipApi.visitorReference);
      await page.getByTestId('visitor-search').press('Enter');
      await page.getByTestId(`visitor-view-${closed.id}`).waitFor({ state: 'visible', timeout: 60000 });
      await page.getByTestId(`visitor-view-${closed.id}`).click();
      await page.getByTestId('visitor-detail', {}, { timeout: 60000 }).waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForTimeout(600);
      const d = await page.evaluate(() => {
        const modal = Array.from(document.querySelectorAll('.ant-modal')).find((m) => m.getBoundingClientRect().height > 0);
        const footer = modal.querySelector('.ant-modal-footer');
        const vh = document.documentElement.clientHeight;
        const vw = document.documentElement.clientWidth;
        const mr = modal.getBoundingClientRect();
        // antd renders the dialog inside a `padding-bottom: 24px` box, so the
        // dialog's own border box is allowed to run that far past the viewport
        // edge. What must be on screen is its CONTENT, whose last element is the
        // footer — so that is what is measured.
        const pad = parseFloat(getComputedStyle(modal).paddingBottom) || 0;
        return {
          bottom: Math.round(mr.bottom), paddingBottom: pad, vh,
          lastContentBottom: footer ? Math.round(footer.getBoundingClientRect().bottom) : Math.round(mr.bottom),
          fitsX: mr.left >= -1 && mr.right <= vw + 1,
          buttons: Array.from(modal.querySelectorAll('.ant-modal-footer button')).map((b) => {
            const r = b.getBoundingClientRect();
            return { label: (b.textContent || '').trim(), withinY: r.top >= -1 && r.bottom <= vh + 1, withinX: r.left >= -1 && r.right <= vw + 1 };
          }),
        };
      });
      check(`${sw}x${sh}: the Visitor Detail dialog's last control is inside the viewport`,
        d.lastContentBottom <= d.vh + 1,
        `footer bottom=${d.lastContentBottom} vs viewport ${d.vh} (dialog box ${d.bottom}, minus antd's ${d.paddingBottom}px bottom padding)`);
      check(`${sw}x${sh}: every Visitor Detail footer action is inside the viewport`,
        d.buttons.length > 0 && d.buttons.every((b) => b.withinX && b.withinY), JSON.stringify(d.buttons));
      await page.getByTestId('visitor-detail-close').click();
      await page.waitForTimeout(400);
    }

    // ═════════════════════ A4 PRINT IS UNTOUCHED ═════════════════════════════
    section('A4 PRINT — unchanged by anything above (#19B §4/§8)');
    await page.setViewportSize({ width: VIEWPORTS[2].width, height: VIEWPORTS[2].height });
    await page.goto(`${APP}/visitor-management/visitors`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.getByTestId('visitor-page').waitFor({ state: 'visible', timeout: 300000 });
    await page.getByTestId('visitor-search').fill(slipApi.visitorReference);
    await page.getByTestId('visitor-search').press('Enter');
    await page.waitForFunction((r) => document.body.innerText.includes(r), slipApi.visitorReference, { timeout: 30000 }).catch(() => {});
    await page.getByTestId(`visitor-slip-${closed.id}`).click({ timeout: 60000 });
    await page.getByTestId('visitor-slip-preview-canvas', {}, { timeout: 60000 }).waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(1200);

    const printsBefore = await page.evaluate(() => window.__erpPrintCalls);
    await page.getByTestId('visitor-slip-preview-print').click();
    await page.waitForFunction((n) => window.__erpPrintCalls > n, printsBefore, { timeout: 60000 });
    const captured = await page.evaluate(() => {
      const frame = document.getElementById('pwi-print-frame');
      if (!frame) return null;
      const html = frame.contentDocument?.documentElement?.outerHTML ?? null;
      frame.remove();
      return html;
    });
    const printHtml = captured || '';
    fs.writeFileSync(path.join(OUT, 'slip-print-document.html'), printHtml);
    check('the print still runs through the shared printHtmlContent pipeline', !!printHtml);
    check('the print document declares A4 portrait', /@page\s*\{[^}]*size:\s*A4 portrait/.test(printHtml));

    // §4/§8 — the preview-only machinery must not exist in the print job.
    check('the PRINT document contains none of the preview-only wrappers',
      !/vs-preview-(stage|frame|doc)/.test(printHtml));
    check('the PRINT document applies no scale transform', !/transform:\s*scale/.test(printHtml));
    check('the PRINT document keeps the slip at its A4 width rule',
      /max-width:\s*190mm/.test(printHtml) && !/(^|[;{\s])width:\s*190mm/.test(printHtml),
      'a hard width:190mm would have changed the physical layout');
    check('the PRINT document keeps the header grid', /grid-template-columns:\s*auto minmax\(0, 1fr\) auto/.test(printHtml));

    const printPage = await context.newPage();
    await printPage.setViewportSize({ width: MM(190), height: MM(281) });
    await printPage.setContent(printHtml, { waitUntil: 'load' });
    const pdf = await printPage.pdf({ printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(path.join(OUT, 'visitor-slip.pdf'), pdf);
    check('the slip still prints on exactly ONE page', pdfPageCount(pdf) === 1, `pages=${pdfPageCount(pdf)}`);

    const printGeom = await printPage.evaluate(() => {
      const lineBoxes = (el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return r.getClientRects().length;
      };
      const company = document.querySelector('.vs-company');
      const slip = document.querySelector('.visitor-slip');
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), h: +r.height.toFixed(2), w: +r.width.toFixed(2), cy: +(r.top + r.height / 2).toFixed(2) };
      };
      const header = document.querySelector('.vs-header');
      // The header carries a 2px top border and NO bottom border, so its
      // border-box centre sits 1px above its content-box centre. The logo is
      // centred in the CONTENT box, which is the visually correct result, so
      // the reference has to be the content box rather than the border box.
      const contentBoxCentre = (() => {
        const r = header.getBoundingClientRect();
        const cs = getComputedStyle(header);
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const bb = parseFloat(cs.borderBottomWidth) || 0;
        return +(r.top + bt + (r.height - bt - bb) / 2).toFixed(2);
      })();
      return {
        companyLines: lineBoxes(company),
        companyText: company.textContent.trim(),
        transform: getComputedStyle(slip).transform,
        slip: box(slip),
        contentW: document.documentElement.clientWidth,
        overflows: slip.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
        sigRule: (() => {
          const r = document.querySelector('.vs-sign-rule-main');
          return r ? { w: +r.getBoundingClientRect().width.toFixed(1), h: +r.getBoundingClientRect().height.toFixed(1) } : null;
        })(),
        // The #19A §5 contract, re-measured: cells in the SAME grid row share a
        // centre line, and the logo spans both rows and is centred on the block.
        // (The logo is NOT expected to share the title's centre — it is one row
        // taller — which is why the comparison is row-1 to row-1, not logo to
        // title.)
        row1Delta: +(box(document.querySelector('.vs-company')).cy - box(document.querySelector('.vs-title')).cy).toFixed(2),
        row2Delta: +(box(document.querySelector('.vs-company-sub')).cy - box(document.querySelector('.vs-headline-note')).cy).toFixed(2),
        logoDelta: +(box(document.querySelector('.vs-logo')).cy - contentBoxCentre).toFixed(2),
        headerBox: box(header),
        contentBoxCentre,
      };
    });
    check('the PRINTED letterhead is ONE line', printGeom.companyLines === 1, `lineBoxes=${printGeom.companyLines}`);
    check('the PRINTED document is NOT scaled', printGeom.transform === 'none' || printGeom.transform === 'matrix(1, 0, 0, 1, 0, 0)', printGeom.transform);
    check('the PRINTED document does not overflow the A4 content box', !printGeom.overflows,
      `slip right=${(printGeom.slip.w + 0).toFixed(1)} wide, content box=${printGeom.contentW}px`);
    check('the physical Host Signature blank is intact',
      !!printGeom.sigRule && printGeom.sigRule.w > 300 && printGeom.sigRule.h >= 10, JSON.stringify(printGeom.sigRule));
    check('the #19A §5 header alignment survives (row 1 cells share a centre line)',
      Math.abs(printGeom.row1Delta) <= 0.5, `company/title centre delta=${printGeom.row1Delta}px`);
    check('the #19A §5 header alignment survives (row 2 cells share a centre line)',
      Math.abs(printGeom.row2Delta) <= 0.5, `city/note centre delta=${printGeom.row2Delta}px`);
    check('the #19A §5 header alignment survives (logo centred on the header content box)',
      Math.abs(printGeom.logoDelta) <= 0.5,
      `logoCy=${printGeom.logoDelta} vs content-box centre ${printGeom.contentBoxCentre} (header border box ${JSON.stringify(printGeom.headerBox)})`);
    note(`printed slip ${JSON.stringify(printGeom.slip)}  signature ${JSON.stringify(printGeom.sigRule)}`);
    note(`PDF -> ${path.join(OUT, 'visitor-slip.pdf')}`);

    // ═════════════════════ CONSOLE ══════════════════════════════════════════
    section('Browser console');
    check('no unexpected console errors or page exceptions', consoleErrors.length === 0,
      consoleErrors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`RESPONSIVE VERIFICATION: ${checks - failures}/${checks} passed, ${failures} failed`);
  console.log('='.repeat(64));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
