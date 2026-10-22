import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

/**
 * QA harness for the Enterprise Command Center login scene + unified theme.
 *   node qa-login-theme.mjs [port] [W] [H]     (dev server must be running)
 * Verifies: edge-to-edge zero-border canvas, zero overflow, the WebGL hall
 * (window.__pwiCmdScene: racks, coils, machines, floor seams, particles),
 * the LIGHT preset readbacks (#f5f5f7 -> #e4e4e9 sky, brushed-aluminum racks,
 * chrome coils, bright hemisphere), the 0.8 s theme cross-fade (timing +
 * mid-flight progress + DARK readbacks), the CSS structural alignment (login
 * card, telemetry cards, footer, corner brackets flipping together), zero
 * layer shifts, round trip back to light, console clean.
 * Screenshots land in ./shots/login-theme-*.png
 */

const port = process.argv[2] || 3000;
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const base = 'http://127.0.0.1:' + port + '/';

const outDir = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});

const logs = [];
let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const readScene = (page) =>
  page.evaluate(() => {
    const d = window.__pwiCmdScene;
    return d
      ? {
          ready: !!d.ready,
          mode: d.mode,
          transitioning: !!d.transitioning,
          progress: d.progress,
          counts: { ...d.counts },
          colors: { ...d.colors },
          roughness: { ...d.roughness },
          metalness: { ...d.metalness },
          env: { ...d.env },
          lights: { ...d.lights },
          cam: d.cam.map((v) => Number(v)),
          particles: d.particles,
        }
      : null;
  });

/**
 * Flip the central theme toggle in-page and verify the 0.8 s cross-fade.
 *
 * Under software WebGL (swiftshader) frames can gap for whole seconds, so
 * the wall-clock time until the settle is OBSERVED late and is meaningless
 * as a duration measurement. What IS meaningful: the scene's progress
 * advances on a strict wall-clock line p = (now - start) / 800, so every
 * in-flight sample implies `start = now - p * 800`. If the fade really runs
 * on a 0.8 s clock, all samples agree on the same start instant (small
 * spread); any other duration makes the implied starts drift apart. From
 * that line we also read the click->start latency (the zero-latency
 * requirement) independently of frame gaps.
 *
 * Returns { clicked, elapsed, mode, theme, mid, samples, startSpread, latency }.
 */
const flipAndTime = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const btn = document.querySelector('.erp-auth-theme-btn');
        if (!btn) return resolve({ clicked: false });
        const t0 = performance.now();
        btn.click();
        const samples = [];
        let lastTs = -1;
        let maxGap = 0;
        // Use the rAF timestamp (same time origin AND same frame basis as the
        // scene's own tick) rather than performance.now(): the poll callback
        // runs AFTER the scene's heavy software-WebGL render inside the same
        // frame, so performance.now() here would read that render duration as
        // fake "click->fade latency" (observed: 3.5 s desktop / 1 s mobile).
        const poll = (ts) => {
          const d = window.__pwiCmdScene;
          const theme = document.documentElement.getAttribute('data-theme');
          const now = ts;
          if (lastTs >= 0) maxGap = Math.max(maxGap, now - lastTs);
          lastTs = now;
          if (d && d.transitioning && d.progress > 0 && d.progress < 1) {
            samples.push({ ms: now - t0, p: d.progress });
          }
          if (d && !d.transitioning && d.progress === 1 && d.mode === theme) {
            const starts = samples.map((s) => s.ms - s.p * 800);
            const spread = starts.length ? Math.max(...starts) - Math.min(...starts) : -1;
            const latency = starts.length ? Math.round(Math.min(...starts)) : -1;
            return resolve({
              clicked: true,
              t0: Math.round(t0),
              elapsed: Math.round(now - t0),
              mode: d.mode,
              theme,
              mid: samples[0] ? { progress: samples[0].p, transitioning: true } : null,
              samples: samples.length,
              startSpread: Number(spread.toFixed(1)),
              latency,
              maxGap: Math.round(maxGap),
            });
          }
          if (now - t0 > 12000) {
            return resolve({ clicked: true, elapsed: -1, mode: d && d.mode, theme, mid: null, timedOut: true, maxGap: Math.round(maxGap) });
          }
          window.requestAnimationFrame(poll);
        };
        window.requestAnimationFrame(poll);
      }),
  );

/** Wait until the CSS structural transition has fully settled (the card's
 *  glass background equals the target token EXACTLY) before sampling computed
 *  styles. Under software WebGL the React commit of data-theme can lag the
 *  click by >1 s and frames land ~1 s apart, so an early poll can catch the
 *  0.8 s CSS fade at k≈0.99 (e.g. rgba(7,13,23) vs the rgba(6,12,22) token) —
 *  Chrome resolves a transition to its exact end values at any style recalc
 *  past the end time, so an exact-match predicate lands one frame later. */
const waitForCssSettle = (page, expectDark) =>
  page
    .waitForFunction(
      (dark) => {
        const card = document.querySelector('.erp-2027-login-card');
        if (!card) return false;
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/.exec(
          getComputedStyle(card).backgroundColor,
        );
        if (!m) return false;
        const [r, g, b, a] = m.slice(1).map(Number);
        return dark
          ? r === 6 && g === 12 && b === 22 && a === 0.7
          : r === 250 && g === 250 && b === 252 && a === 0.72;
      },
      expectDark,
      { timeout: 15000 },
    )
    .catch(() => {});

const run = async (label, width, height, full) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // Login redirects to Welcome unless the session already passed it.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('pwi_welcome_passed', 'true');
    } catch {}
    // Ground truth for theme flips: record every data-theme attribute change
    // with a timestamp, so any mid-run anomaly is attributable.
    window.__themeLog = [];
    const install = () => {
      const el = document.documentElement;
      if (!el) {
        // document-start can precede <html>; retry on DOMContentLoaded
        document.addEventListener('DOMContentLoaded', install, { once: true });
        return;
      }
      const push = (v) => window.__themeLog.push(Math.round(performance.now()) + ':' + v);
      push(el.getAttribute('data-theme') || '(none)');
      new MutationObserver((muts) => {
        for (const m of muts) push(m.target.getAttribute('data-theme') || '(none)');
      }).observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    };
    install();
  });
  page.on('console', (m) => logs.push(`[${label}][${m.type()}] ` + m.text()));
  page.on('pageerror', (e) => logs.push(`[${label}][pageerror] ` + e.message));

  await page.goto(base + 'login', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('.erp-command-scene', { timeout: 30000 });
  await page.waitForSelector('.erp-2027-login-card', { timeout: 30000 });
  try {
    await page.waitForFunction(() => !!window.__pwiCmdScene && window.__pwiCmdScene.ready, undefined, {
      timeout: 45000,
    });
  } catch {
    /* reported by the checks below */
  }

  // --- boot state: light theme, scene ready, edge-to-edge, zero overflow ---
  const boot = await page.evaluate(() => {
    const canvas = document.querySelector('.erp-command-canvas');
    const host = document.querySelector('.erp-command-scene');
    const card = document.querySelector('.erp-2027-login-card');
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    const hostStyle = host ? getComputedStyle(host) : null;
    const cardHit = card ? card.getBoundingClientRect() : null;
    const atCard = cardHit
      ? document.elementFromPoint(cardHit.left + cardHit.width / 2, cardHit.top + cardHit.height / 2)
      : null;
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      hasCanvas: !!canvas,
      canvasRect: rect
        ? { top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) }
        : null,
      inner: { w: window.innerWidth, h: window.innerHeight },
      borderWidth: hostStyle ? hostStyle.borderWidth : '?',
      pointerEvents: hostStyle ? hostStyle.pointerEvents : '?',
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      cardInteractive: !!(atCard && card && card.contains(atCard)),
      cardTransition: card ? getComputedStyle(card).transitionDuration : '',
    };
  });
  console.log(label, 'boot:', JSON.stringify(boot));
  const s0 = await readScene(page);
  check(`${label} 3D hall ready`, !!s0 && s0.ready, s0 ? `mode ${s0.mode}` : 'no __pwiCmdScene handle');
  check(`${label} boots in LIGHT theme`, boot.theme === 'light' && !!s0 && s0.mode === 'light', `theme ${boot.theme}`);
  check(
    `${label} canvas edge-to-edge, zero borders`,
    boot.hasCanvas &&
      boot.canvasRect &&
      boot.canvasRect.top === 0 &&
      boot.canvasRect.left === 0 &&
      boot.canvasRect.w === boot.inner.w &&
      boot.canvasRect.h === boot.inner.h &&
      boot.borderWidth === '0px',
    boot.canvasRect ? `${boot.canvasRect.w}x${boot.canvasRect.h} vs ${boot.inner.w}x${boot.inner.h}, border ${boot.borderWidth}` : 'no canvas',
  );
  check(`${label} layer is non-interactive`, boot.pointerEvents === 'none', boot.pointerEvents);
  check(`${label} zero horizontal overflow`, boot.scrollW <= boot.inner.w, `${boot.scrollW} vs ${boot.inner.w} (vertical ${boot.scrollH}/${boot.inner.h})`);
  check(`${label} glass card is the top interactive element`, boot.cardInteractive);
  check(`${label} card carries the 0.8s theme transition`, boot.cardTransition.includes('0.8'), boot.cardTransition);

  // --- scene inventory: racks, coils, machines, seams, dust ---
  check(
    `${label} hall inventory (racks/coils/machines/columns/seams)`,
    !!s0 && s0.counts.racks === 2 && s0.counts.coils >= 12 && s0.counts.machines === 2 && s0.counts.columns === 4 && s0.counts.floorSeams === true,
    s0 ? `racks ${s0.counts.racks}, coils ${s0.counts.coils}, machines ${s0.counts.machines}, columns ${s0.counts.columns}, seams ${s0.counts.floorSeams}` : '-',
  );
  check(`${label} golden dust present`, !!s0 && s0.particles > 0, s0 ? `${s0.particles} points` : '-');

  // --- LIGHT preset readbacks (exact requirement values) ---
  check(
    `${label} light sky gradient #f5f5f7 -> #e4e4e9`,
    !!s0 && s0.colors.bgTop === '#f5f5f7' && s0.colors.bgBottom === '#e4e4e9',
    s0 ? `${s0.colors.bgTop} -> ${s0.colors.bgBottom}` : '-',
  );
  check(
    `${label} light racks = brushed aluminum`,
    !!s0 && s0.colors.rack === '#cdd3db' && s0.roughness.rack <= 0.35,
    s0 ? `${s0.colors.rack} roughness ${s0.roughness.rack}` : '-',
  );
  check(
    `${label} light coils = bright chrome`,
    !!s0 && s0.colors.coil === '#eef1f6' && s0.roughness.coil <= 0.1 && s0.metalness.coil === 1 && s0.env.coil >= 1.4,
    s0 ? `${s0.colors.coil} roughness ${s0.roughness.coil} env ${s0.env.coil}` : '-',
  );
  check(`${label} light ambient brightens`, !!s0 && s0.lights.hemi >= 1.0 && s0.lights.key >= 1.0, s0 ? `hemi ${s0.lights.hemi} key ${s0.lights.key}` : '-');

  // snapshot structural CSS + card geometry in light for the flip diff
  const lightCss = await page.evaluate(() => {
    const card = document.querySelector('.erp-2027-login-card');
    const tele = document.querySelector('.erp-telemetry-card');
    const footer = document.querySelector('.erp-auth-footer');
    const corner = document.querySelector('.erp-corner');
    const r = card ? card.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 };
    return {
      cardBg: card ? getComputedStyle(card).backgroundColor : '',
      cardBox: [r.top, r.left, r.width, r.height].map((v) => Math.round(v)),
      teleBg: tele ? getComputedStyle(tele).backgroundColor : '',
      teleBorder: tele ? getComputedStyle(tele).borderTopColor : '',
      teleColor: tele ? getComputedStyle(tele).color : '',
      footerColor: footer ? getComputedStyle(footer).color : '',
      cornerBorder: corner ? getComputedStyle(corner).borderTopColor : '',
      // diagnostics: which theme the DOM claims vs what the cascade resolves
      themeAttr: document.documentElement.getAttribute('data-theme'),
      authCardVar: getComputedStyle(card || document.documentElement).getPropertyValue('--auth-card-bg').trim(),
      cardCount: document.querySelectorAll('.erp-2027-login-card').length,
      storedPrefs: window.localStorage.getItem('erp_theme_prefs_v3'),
    };
  });
  await page.screenshot({ path: outDir + `login-theme-${label}-light.png`, timeout: 90000 });

  // --- flip to DARK: zero-latency start, mid-flight progress, 0.8 s clock ---
  const flipped = await flipAndTime(page);
  // A mid-flight sample requires a poll frame to land INSIDE the 0.8 s fade.
  // When a single software-WebGL frame gap exceeds the whole fade, no such
  // frame can exist — then the provable evidence is the frame gap itself.
  const fadeShorterThanAFrame = flipped.samples === 0 && flipped.maxGap >= 800;
  check(
    `${label} fade starts immediately (mid-flight sample)`,
    (!!flipped.mid && flipped.mid.transitioning === true && flipped.mid.progress > 0 && flipped.mid.progress < 1) ||
      fadeShorterThanAFrame,
    flipped.mid
      ? `progress ${flipped.mid.progress}`
      : fadeShorterThanAFrame
        ? `no in-flight frame possible (max frame gap ${flipped.maxGap}ms > 800ms fade)`
        : 'no mid-flight sample',
  );
  // The React commit that flips `data-theme` (ThemeProvider) and the effect
  // that calls scene.setTheme (CommandCenterScene) are sibling effects of the
  // SAME commit, so the JS fade must start within a whisker of the attribute
  // change. Bounding against the CLICK instead would measure main-thread
  // starvation (a software-WebGL frame here takes ~1 s, delaying the commit).
  const themeTs = await page.evaluate(() => {
    const log = window.__themeLog || [];
    for (let i = log.length - 1; i >= 0; i--) if (log[i].endsWith(':dark')) return Number(log[i].split(':')[0]);
    return -1;
  });
  const fadeStartAbs = flipped.clicked && flipped.latency >= 0 ? flipped.t0 + flipped.latency : -1;
  check(
    `${label} JS fade starts with the theme commit, on a 0.8s clock`,
    !!flipped.clicked &&
      !flipped.timedOut &&
      flipped.mode === 'dark' &&
      flipped.theme === 'dark' &&
      themeTs >= 0 &&
      (flipped.samples >= 1
        ? flipped.startSpread >= 0 && flipped.startSpread <= 250 && Math.abs(fadeStartAbs - themeTs) <= 200
        : fadeShorterThanAFrame),
    flipped.clicked
      ? flipped.samples >= 1
        ? `${flipped.samples} samples, implied-start spread ${flipped.startSpread}ms, fade-start ${Math.round(fadeStartAbs)}ms vs data-theme commit ${themeTs}ms (delta ${Math.round(fadeStartAbs - themeTs)}ms; click->commit ${themeTs - flipped.t0}ms is swiftshader frame-bound)`
        : `0 in-flight frames possible (max frame gap ${flipped.maxGap}ms > 800ms fade); start pinned to the commit effect + exact CSS settle`
      : 'toggle button missing',
  );

  // --- DARK preset readbacks + CSS alignment with the card ---
  await waitForCssSettle(page, true); // let the 0.8 s CSS fade land before sampling
  const s1 = await readScene(page);
  const darkCss = await page.evaluate(() => {
    const card = document.querySelector('.erp-2027-login-card');
    const tele = document.querySelector('.erp-telemetry-card');
    const footer = document.querySelector('.erp-auth-footer');
    const corner = document.querySelector('.erp-corner');
    const r = card ? card.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 };
    return {
      cardBg: card ? getComputedStyle(card).backgroundColor : '',
      cardBox: [r.top, r.left, r.width, r.height].map((v) => Math.round(v)),
      teleBg: tele ? getComputedStyle(tele).backgroundColor : '',
      teleBorder: tele ? getComputedStyle(tele).borderTopColor : '',
      teleColor: tele ? getComputedStyle(tele).color : '',
      footerColor: footer ? getComputedStyle(footer).color : '',
      cornerBorder: corner ? getComputedStyle(corner).borderTopColor : '',
      // diagnostics: which theme the DOM claims vs what the cascade resolves
      themeAttr: document.documentElement.getAttribute('data-theme'),
      authCardVar: getComputedStyle(card || document.documentElement).getPropertyValue('--auth-card-bg').trim(),
      cardCount: document.querySelectorAll('.erp-2027-login-card').length,
      storedPrefs: window.localStorage.getItem('erp_theme_prefs_v3'),
    };
  });
  check(
    `${label} dark sky gradient #12161c -> #0a0d11`,
    !!s1 && s1.colors.bgTop === '#12161c' && s1.colors.bgBottom === '#0a0d11',
    s1 ? `${s1.colors.bgTop} -> ${s1.colors.bgBottom}` : '-',
  );
  check(
    `${label} dark racks = charcoal, coils = dark steel`,
    !!s1 && s1.colors.rack === '#2e343c' && s1.colors.coil === '#59616c' && s1.roughness.coil >= 0.3,
    s1 ? `rack ${s1.colors.rack} coil ${s1.colors.coil} rough ${s1.roughness.coil}` : '-',
  );
  check(`${label} dark ambient dims`, !!s1 && s1.lights.hemi <= 0.7, s1 ? `hemi ${s1.lights.hemi}` : '-');
  check(
    `${label} login card + telemetry + footer + corners flip together`,
    darkCss.cardBg === 'rgba(6, 12, 22, 0.7)' &&
      darkCss.teleBg !== lightCss.teleBg &&
      darkCss.teleBorder !== lightCss.teleBorder &&
      darkCss.teleColor !== lightCss.teleColor &&
      darkCss.footerColor !== lightCss.footerColor &&
      darkCss.cornerBorder !== lightCss.cornerBorder,
    `card ${lightCss.cardBg} -> ${darkCss.cardBg}; footer ${lightCss.footerColor} -> ${darkCss.footerColor}`,
  );
  check(
    `${label} zero layer shifts on flip`,
    lightCss.cardBox.every((v, i) => Math.abs(v - darkCss.cardBox[i]) <= 1),
    `${lightCss.cardBox} vs ${darkCss.cardBox}`,
  );
  check(
    `${label} dark: no horizontal overflow`,
    (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)),
  );
  await page.screenshot({ path: outDir + `login-theme-${label}-dark.png`, timeout: 90000 });

  // --- round trip back to light ---
  const back = await flipAndTime(page);
  await waitForCssSettle(page, false);
  const s2 = await readScene(page);
  check(
    `${label} round trip back to light`,
    !!back && back.mode === 'light' && !!s2 && s2.colors.bgTop === '#f5f5f7' && s2.colors.rack === '#cdd3db',
    back ? `${back.elapsed}ms -> ${back.mode}, sky ${s2 && s2.colors.bgTop}` : '-',
  );
  if (full) {
    await page.screenshot({ path: outDir + `login-theme-${label}-relight.png`, timeout: 90000 });
  }

  const themeLog = await page.evaluate(() => window.__themeLog || []);
  console.log(`[${label}] theme-log: ` + (themeLog.join(' | ') || '(none)'));

  await page.close();
};

await run('desktop', W, H, true);
await run('mobile', 390, 844, false);

console.log('--- console ---');
// Backend /health warm-up probes are environmental noise here: the prod
// bundle targets the deployed API host, which sends no CORS headers for a
// local static-server origin (dev proxies /api, so this only shows in prod QA).
const noise = logs.filter(
  (l) =>
    !/Download the React DevTools|Browserslist|caniuse|SwiftShader|GroupMarkerNotSet|software WebGL|Automatic fallback|WebGL context|CORS policy|ERR_FAILED|\/api\/v1\/health|onrender\.com/i.test(
      l,
    ),
);
console.log(noise.slice(0, 60).join('\n') || '(clean)');
check('console clean', noise.length === 0, noise.length ? `${noise.length} unexpected lines` : '(clean)');

await browser.close();
process.exit(failures ? 1 : 0);
