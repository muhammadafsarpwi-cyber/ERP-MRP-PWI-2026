import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

/**
 * Generates the sixteen welcome-page background images (2560x1440, JPEG q90) as
 * crisp bespoke industrial renders — no photos, no collages, no darkening.
 *   node gen-welcome-images.mjs
 * Output: frontend/public/images/welcome/welcome-01..16.jpg
 *
 * Slot map — 16 assets across PWI's 4 core divisions; file number == slideshow
 * slot == 3D panel index (see frontend/src/config/welcomeImages.ts):
 *   1. WIRE ROD DRAWING DIVISION (01-04)
 *      01 rod yard · 02 wire drawing machines · 03 drawing dies & lubricants
 *      04 annealing & galvanizing furnace line
 *   2. SPOKE DIVISION / bike spokes (05-08)
 *      05 spoke cutting & head-heading machines · 06 thread rolling & nipple
 *      alignment · 07 zinc & chrome plating baths · 08 finished spokes macro
 *   3. OUTER CASING DIVISION (09-12)
 *      09 PVC casing extrusion line · 10 finished black conduit rows
 *      11 multi-size casing inventory by diameter · 12 printing & length cutting
 *   4. INNER WIRE / BRAIDED METER WIRE DIVISION (13-16)
 *      13 wire stranding machines · 14 braided core cross-section macro
 *      15 inner wire meter-cutting & tinning · 16 finished wire bundles
 */

const OUT = 'D:/ERP-MRP-PWI-2026/frontend/public/images/welcome/';
const W = 2560;
const H = 1440;
const FONT = "'Segoe UI', 'Trebuchet MS', Arial, sans-serif";

/* ---------------------------------------------------------------- helpers */
const range = (n) => Array.from({ length: n }, (_, i) => i);
const rr = (x, y, w, h, r, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const circle = (cx, cy, r, fill, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w, extra = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
const text = (x, y, s, size, fill, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" ${extra}>${s}</text>`;
const star = (cx, cy, s, o = 0.9) =>
  `<g opacity="${o}" filter="url(#blur3)"><path d="M ${cx} ${cy - s} Q ${cx + 1} ${cy - 1} ${cx + s} ${cy} Q ${cx + 1} ${cy + 1} ${cx} ${cy + s} Q ${cx - 1} ${cy + 1} ${cx - s} ${cy} Q ${cx - 1} ${cy - 1} ${cx} ${cy - s} Z" fill="#ffffff"/></g><circle cx="${cx}" cy="${cy}" r="${s * 0.16}" fill="#ffffff"/>`;

/** PWI gear mark (ring + teeth + PWI core). */
const gearMark = (cx, cy, r, teeth, stroke, coreFill, coreText) => {
  const t = range(teeth)
    .map((i) => {
      const a = (i / teeth) * Math.PI * 2;
      const x = cx + Math.cos(a) * r - r * 0.055;
      const y = cy + Math.sin(a) * r - r * 0.09;
      return `<rect x="${x}" y="${y}" width="${r * 0.11}" height="${r * 0.18}" fill="${stroke}" transform="rotate(${(a * 180) / Math.PI + 90} ${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r})"/>`;
    })
    .join('');
  return `${t}${circle(cx, cy, r * 0.92, 'none', `stroke="${stroke}" stroke-width="${r * 0.07}"`)}${circle(cx, cy, r * 0.62, coreFill)}${text(cx, cy + r * 0.21, coreText, r * 0.52, stroke, 'text-anchor="middle" font-weight="800"')}`;
};

const bokeh = (seed, n, w = W, h = 900) => {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return range(n)
    .map(() => {
      const cx = rnd() * w;
      const cy = rnd() * h;
      const r = 18 + rnd() * 70;
      const warm = rnd() > 0.6;
      return circle(cx.toFixed(0), cy.toFixed(0), r.toFixed(0), warm ? '#f0b429' : '#ffffff', `opacity="${(0.08 + rnd() * 0.16).toFixed(2)}" filter="url(#blur24)"`);
    })
    .join('');
};

const hallDefs = `
<defs>
  <linearGradient id="skyH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7bed2"/><stop offset="1" stop-color="#e9eef3"/></linearGradient>
  <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c8794"/><stop offset="1" stop-color="#57626d"/></linearGradient>
  <linearGradient id="wallL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa0af"/><stop offset="1" stop-color="#6a7684"/></linearGradient>
  <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c6672"/><stop offset="1" stop-color="#474f59"/></linearGradient>
  <linearGradient id="steelH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93a0ad"/><stop offset=".18" stop-color="#5f6b78"/><stop offset=".5" stop-color="#49545f"/><stop offset=".82" stop-color="#5d6975"/><stop offset="1" stop-color="#39434e"/></linearGradient>
  <linearGradient id="steelP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8592a0"/><stop offset=".5" stop-color="#5d6874"/><stop offset="1" stop-color="#434d58"/></linearGradient>
  <linearGradient id="machineG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8792a0"/><stop offset=".1" stop-color="#525e6b"/><stop offset=".45" stop-color="#39434f"/><stop offset=".8" stop-color="#46525f"/><stop offset="1" stop-color="#2b3440"/></linearGradient>
  <linearGradient id="chromeV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c6771"/><stop offset=".12" stop-color="#eef3f8"/><stop offset=".3" stop-color="#9aa6b2"/><stop offset=".5" stop-color="#f8fafc"/><stop offset=".68" stop-color="#8b97a3"/><stop offset=".88" stop-color="#e3eaf1"/><stop offset="1" stop-color="#57626c"/></linearGradient>
  <linearGradient id="goldV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6a12"/><stop offset=".2" stop-color="#f0c75e"/><stop offset=".45" stop-color="#d4af37"/><stop offset=".7" stop-color="#b8860b"/><stop offset="1" stop-color="#7c5a09"/></linearGradient>
  <radialGradient id="lampG" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffd98a" stop-opacity="0.85"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
  <radialGradient id="drumFace" cx="0.42" cy="0.38" r="0.75"><stop offset="0" stop-color="#aeb9c4"/><stop offset=".6" stop-color="#6d7883"/><stop offset="1" stop-color="#454f59"/></radialGradient>
  <filter id="blur2.5"><feGaussianBlur stdDeviation="2.5"/></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="blur5"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="blur9"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="blur10"><feGaussianBlur stdDeviation="10"/></filter>
  <filter id="blur24"><feGaussianBlur stdDeviation="24"/></filter>
  <filter id="blur48"><feGaussianBlur stdDeviation="48"/></filter>
  <filter id="glowSm"><feGaussianBlur stdDeviation="6"/></filter>
</defs>`;

const vignette = rect(0, 0, W, H, 'url(#vigG)', '') + '';
const vigDef = `<radialGradient id="vigG" cx="0.5" cy="0.46" r="0.78"><stop offset="0.55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#141c26" stop-opacity="0.22"/></radialGradient>`;

const page = (defs, body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}body{width:${W}px;height:${H}px;overflow:hidden}</style></head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${vigDef}${defs}</defs>${body}${vignette}</svg></body></html>`;

/* ---------------------------------------------------------------- scene 1
   Modern factory exterior / gate with PWI branding (bright daytime) */
const scene1 = () => {
  const claddingFront = range(24)
    .map((i) => {
      const x = 240 + i * 58;
      return line(x, 546, x, 1010, '#ffffff', 2, 'opacity="0.06"');
    })
    .join('');
  const seams = range(5)
    .map((i) => line(240, 640 + i * 86, 1620, 640 + i * 86, '#0e141c', 2, 'opacity="0.10"'))
    .join('');
  const sideClad = range(16)
    .map((i) => {
      const x = 1620 + i * 59;
      const top = 500 - (x - 1620) * (100 / 940);
      const bot = 1010 + (x - 1620) * (40 / 940);
      return line(x, top, x, bot, '#ffffff', 2, 'opacity="0.05"');
    })
    .join('');
  const windows = range(8)
    .map((i) => {
      const x = 300 + i * 162;
      return `${rr(x, 566, 96, 66, 4, '#28313d')}${line(x + 8, 626, x + 88, 572, '#cfe0ea', 7, 'opacity="0.30"')}`;
    })
    .join('');
  const slats = (x0, x1) =>
    range(Math.floor((x1 - x0) / 46))
      .map((i) => line(x0 + 14 + i * 46, 908, x0 + 14 + i * 46, 1180, '#5b6673', 10, 'opacity="0.9"'))
      .join('');
  const hedges = range(7)
    .map((i) => rr(2230 + i * 84, 1000, 74, 44, 18, i % 2 ? '#4a7a55' : '#3e6b4a'))
    .join('');

  return page(
    hallDefs +
      `<linearGradient id="wallF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d9aa8"/><stop offset=".5" stop-color="#69747f"/><stop offset="1" stop-color="#525c67"/></linearGradient>
       <linearGradient id="pave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4dae0"/><stop offset="1" stop-color="#b4bdc6"/></linearGradient>`,
    `
    ${rect(0, 0, W, 900, 'url(#skyH)')}
    ${circle(2150, 200, 480, '#fff6df', 'opacity="0.55" filter="url(#blur48)"')}
    ${['12%,180,340,70', '38%,140,260,54', '66%,220,420,80', '86%,150,300,60', '54%,300,220,44']
      .map((c) => {
        const [x, y, w, h] = c.split(',');
        return `<ellipse cx="${(parseFloat(x) / 100) * W}" cy="${y}" rx="${w}" ry="${h}" fill="#ffffff" opacity="0.5" filter="url(#blur48)"/>`;
      })
      .join('')}
    ${rect(0, 780, W, 120, '#c4d2de', 'opacity="0.55" filter="url(#blur24)"')}
    <g stroke="#6b7684" stroke-width="4" fill="none" opacity="0.6"><path d="M 480 210 q 24 -18 48 0"/><path d="M 540 250 q 20 -15 40 0"/><path d="M 900 180 q 22 -17 44 0"/></g>

    <!-- main building: front + receding side -->
    ${rect(240, 500, 1380, 510, 'url(#wallF)')}
    ${rect(240, 486, 1380, 60, '#a7b4c1')}
    ${rect(240, 540, 1380, 8, '#313b47', 'opacity="0.5"')}
    ${claddingFront}${seams}${windows}
    <polygon points="1620,500 2560,400 2560,1050 1620,1010" fill="#414b56"/>
    ${rect(1620, 486, 940, 46, '#8b98a6', 'transform="skewY(-6)" transform-origin="1620 486"')}
    ${sideClad}
    ${gearMark(2180, 640, 150, 22, '#dfe6ee', '#414b56', 'PWI').replace(
      '<circle cx="2180" cy="640" r="93" fill="#414b56"/>',
      '<circle cx="2180" cy="640" r="93" fill="none"/>',
    )}

    <!-- signage -->
    ${rr(330, 700, 1010, 152, 10, '#1d2a3a')}
    ${rr(330, 700, 1010, 152, 10, 'none', 'stroke="#d4af37" stroke-width="3"')}
    ${gearMark(432, 776, 52, 14, '#f2f5f8', '#1d2a3a', 'P')}
    ${text(512, 768, 'PAKISTAN WIRE INDUSTRIES (PVT.) LTD', 44, '#f2f5f8', 'font-weight="800" letter-spacing="2"')}
    ${text(514, 820, 'PWI &#8212; WIRE &#183; SPOKES &#183; CONTROL CABLES', 28, '#d4af37', 'letter-spacing="6" font-weight="600"')}

    <!-- boundary wall + gate + guard cabin -->
    ${rect(0, 1010, W, 430, 'url(#pave)')}
    ${rect(0, 1004, 1620, 30, '#26303b', 'opacity="0.30" filter="url(#blur10)"')}
    ${rect(1620, 1040, 940, 26, '#26303b', 'opacity="0.26" filter="url(#blur10)"')}
    ${rect(1240, 902, 1320, 150, '#dfe4ea')}
    ${rect(1240, 894, 1320, 16, '#b7c0c9')}
    ${rect(1240, 1040, 1320, 12, '#9aa5b0', 'opacity="0.7"')}
    ${rr(1330, 890, 620, 162, 4, '#333d49')}
    ${rect(1344, 904, 250, 134, '#3d4855')}
    ${rect(1686, 904, 250, 134, '#3d4855')}
    ${slats(1344, 1594)}${slats(1686, 1936)}
    ${rr(1980, 880, 200, 172, 6, '#dde3ea')}
    ${rect(1994, 906, 172, 92, '#bcd4e2', 'opacity="0.9"')}
    ${line(2080, 906, 2080, 998, '#8fa6b4', 4)}
    ${rr(1966, 866, 228, 20, 4, '#2e3947')}
    ${text(2080, 856, 'PWI', 26, '#a97b12', 'text-anchor="middle" font-weight="800" letter-spacing="3"')}
    <!-- flagpole, clear of the signage -->
    ${rect(1420, 420, 10, 632, '#c7cfd8')}
    ${rect(1430, 436, 156, 100, '#0b5d2e')}
    ${circle(1486, 486, 30, '#ffffff')}
    ${circle(1500, 480, 26, '#0b5d2e')}
    <path d="M 1532 462 l 7 16 17 2 -13 12 4 17 -15 -9 -15 9 4 -17 -13 -12 17 -2 Z" fill="#ffffff"/>
    ${hedges}
    <!-- driveway + light poles -->
    <polygon points="1420,1052 1900,1052 2180,1440 1120,1440" fill="#e4e9ee" opacity="0.5"/>
    ${[180, 2420]
      .map(
        (x) =>
          `${rect(x, 700, 12, 352, '#9aa5b0')}${rr(x - 60, 690, 132, 22, 8, '#79848f')}${circle(x + 6, 716, 46, 'url(#lampG)', 'opacity="0.8"')}`,
      )
      .join('')}
    ${rect(0, 1052, W, 10, '#8d99a5', 'opacity="0.55"')}`,
  );
};

/* ---------------------------------------------------------------- scene 2
   Wire drawing hall: drums drawing bright wire from thick rod */
const scene2 = () => {
  const trusses = range(9)
    .map((i) => {
      const x = 120 + i * 300;
      return `${line(x, 40, x, 214, '#4d5866', 14)}<path d="M ${x} 214 L ${x + 150} 60 L ${x + 300} 214" fill="none" stroke="#57636f" stroke-width="10"/>`;
    })
    .join('');
  const skylights = range(5)
    .map((i) => {
      const x = 180 + i * 520;
      return `${rr(x, 46, 300, 96, 8, '#dceaf4')}${rr(x - 20, 30, 340, 120, 12, '#eef7fd', 'opacity="0.5" filter="url(#blur24)"')}<polygon points="${x + 60},150 ${x + 300},150 ${x + 470},960 ${x + 130},960" fill="#ffffff" opacity="0.06" filter="url(#blur24)"/>`;
    })
    .join('');
  const lamps = range(5)
    .map((i) => {
      const x = 340 + i * 480;
      return `${line(x, 214, x, 286, '#3f4a56', 6)}<polygon points="${x - 34},286 ${x + 34},286 ${x + 20},326 ${x - 20},326" fill="#46515e"/>${circle(x, 340, 84, 'url(#lampG)')}`;
    })
    .join('');
  const machine = (x, y, w, h, dR, label) => {
    const dy = y + h * 0.44;
    const packCx = x + dR * 0.55 + 106;
    return `
      ${rr(x, y, w, h, 18, 'url(#machineG)')}
      ${rr(x, y - 26, w, 34, 10, '#a3b0bd')}
      ${rr(x, y + 16, w, 10, 5, 'url(#goldV)')}
      ${rr(x - 20, y + h - 24, w + 40, 44, 8, '#2b3440')}
      <ellipse cx="${x + dR * 0.55}" cy="${dy}" rx="${dR * 0.42}" ry="${dR}" fill="url(#drumFace)"/>
      <rect x="${x + dR * 0.55}" y="${dy - dR}" width="${w - dR * 1.2}" height="${dR * 2}" fill="url(#steelP)"/>
      ${rr(x + dR * 0.6, dy - dR + 12, w - dR * 1.3, 14, 7, '#ffffff', 'opacity="0.22"')}
      <ellipse cx="${packCx}" cy="${dy}" rx="112" ry="${dR * 0.9}" fill="#20262e" opacity="0.88"/>
      ${range(7)
        .map((i) => `<ellipse cx="${x + dR * 0.55 + 34 + i * 24}" cy="${dy}" rx="8" ry="${dR * 0.84}" fill="none" stroke="#dfe6ee" stroke-width="3.4" opacity="0.9"/>`)
        .join('')}
      <ellipse cx="${x + dR * 0.55}" cy="${dy}" rx="${dR * 0.42}" ry="${dR}" fill="none" stroke="#eef3f8" stroke-width="5"/>
      <ellipse cx="${packCx - 34}" cy="${dy - dR * 0.44}" rx="5" ry="${dR * 0.34}" fill="#ffffff" opacity="0.9" filter="url(#glowSm)"/>
      ${rr(x + w - 150, y + 40, 120, 150, 10, '#3c4650')}
      ${range(7)
        .map((i) => line(x + w - 142, y + 52 + i * 19, x + w - 40, y + 52 + i * 19, '#525d69', 6))
        .join('')}
      ${rr(x + 40, y + h - 120, 150, 84, 8, '#252d37')}
      ${circle(x + 62, y + h - 96, 9, '#2ecc71')}${circle(x + 90, y + h - 96, 9, '#f0b429')}${circle(x + 118, y + h - 96, 9, '#e74c3c')}
      ${text(x + w - 40, y + h - 34, label, 26, '#dfe6ee', 'text-anchor="end" opacity="0.7" font-weight="700" letter-spacing="4"')}`;
  };
  const wire = (x1, y1, x2, y2, sag) =>
    `<path d="M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + sag} ${x2} ${y2}" fill="none" stroke="#f2f6fa" stroke-width="5" filter="url(#glowSm)" opacity="0.9"/><path d="M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + sag} ${x2} ${y2}" fill="none" stroke="#ffffff" stroke-width="2"/>`;

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 960, 'url(#wallG)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trusses}${skylights}${lamps}
    ${line(0, 470, W, 470, '#46515e', 10, 'opacity="0.7"')}
    ${line(0, 500, W, 500, '#46515e', 6, 'opacity="0.5"')}
    ${rect(0, 918, W, 18, '#d9a520', 'opacity="0.75"')}
    ${rect(0, 960, W, 480, 'url(#floorG)')}
    ${range(6)
      .map((i) => rr(100 + i * 430, 1180 + (i % 2) * 60, 320, 10, 5, '#ffffff', 'opacity="0.06"'))
      .join('')}
    ${rect(0, 560, W, 300, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    ${signPlate(920, 40, 820, 110, 'WIRE DRAWING', 'ROD TO PRECISION WIRE')}

    <!-- rod pay-off coil + stand -->
    <polygon points="120,1040 210,640 300,1040" fill="#3c4650"/>
    ${circle(210, 700, 150, 'none', 'stroke="#aeb9c4" stroke-width="26"')}
    ${circle(210, 700, 150, 'none', 'stroke="#e8eef4" stroke-width="7" opacity="0.8"')}
    ${circle(210, 700, 64, 'none', 'stroke="#7c8794" stroke-width="14"')}
    <!-- thick rod to die stand -->
    <path d="M 300 760 C 420 800 520 820 640 830" fill="none" stroke="#aeb9c4" stroke-width="16" stroke-linecap="round"/>
    <path d="M 300 754 C 420 794 520 814 640 824" fill="none" stroke="#e8eef4" stroke-width="5" opacity="0.85" stroke-linecap="round"/>
    ${rr(640, 740, 150, 210, 10, '#39434e')}
    ${rr(660, 770, 110, 60, 6, '#2b333d')}
    ${circle(715, 800, 16, '#f0b429', 'filter="url(#glowSm)"')}
    ${star(715, 800, 34)}

    <!-- drawing machines with gleaming drums -->
    ${machine(860, 620, 560, 380, 170, 'BLOCK 01')}
    ${machine(1520, 668, 500, 340, 148, 'BLOCK 02')}
    ${machine(2100, 710, 430, 300, 126, 'BLOCK 03')}

    <!-- bright drawn wire threading through the line -->
    ${wire(790, 830, 1000, 780, 70)}
    ${wire(1330, 760, 1620, 800, 80)}
    ${wire(1960, 800, 2180, 838, 70)}
    ${star(1010, 812, 30)}${star(1640, 838, 26)}${star(2200, 872, 24, 0.8)}

    <!-- reflections -->
    <g opacity="0.10" filter="url(#blur24)" transform="translate(0,2088) scale(1,-1)">
      ${rr(860, 620, 560, 380, 18, '#000000')}${rr(1520, 668, 500, 340, 18, '#000000')}${rr(2100, 710, 430, 300, 18, '#000000')}
    </g>`,
  );
};

/* ---------------------------------------------------------------- scene 3
   Spoke Division machinery processing polished chrome spokes */
const scene3 = () => {
  const coilStand = `
    <polygon points="2170,1060 2300,580 2430,1060" fill="#3c4650"/>
    ${circle(2300, 660, 170, 'none', 'stroke="#aeb9c4" stroke-width="30"')}
    ${circle(2300, 660, 170, 'none', 'stroke="#eef3f8" stroke-width="8" opacity="0.8"')}
    ${range(14)
      .map((i) => {
        const a = (i / 14) * Math.PI * 2;
        return line(2300 + Math.cos(a) * 72, 660 + Math.sin(a) * 72, 2300 + Math.cos(a) * 156, 660 + Math.sin(a) * 156, '#8b97a3', 5, 'opacity="0.6"');
      })
      .join('')}
    ${circle(2300, 660, 66, 'none', 'stroke="#5f6a76" stroke-width="18"')}`;

  const straightener = range(5)
    .map((i) => {
      const x = 1830 + i * 56;
      return `${rr(x, 616, 46, 88, 8, 'url(#chromeV)')}${circle(x + 23, 660, 15, '#333d49')}${rr(x + 8, 622, 30, 6, 3, '#ffffff', 'opacity="0.5"')}`;
    })
    .join('');

  const flyingSpokes = range(11)
    .map((i) => {
      const y0 = 700 + i * 8;
      const y1 = 900 + i * 12 + (i % 3) * 24;
      const x1 = 300 + i * 44;
      return `<path d="M 1080 ${y0} Q 700 ${y0 - 120 - (i % 4) * 30} ${x1} ${y1}" fill="none" stroke="#eef3f8" stroke-width="5" opacity="0.92"/><path d="M 1080 ${y0} Q 700 ${y0 - 120 - (i % 4) * 30} ${x1} ${y1}" fill="none" stroke="#ffffff" stroke-width="1.6"/>`;
    })
    .join('');

  const trayPile = range(38)
    .map((i) => {
      const x = 200 + (i * 97) % 640;
      const y = 930 + ((i * 53) % 90);
      const a = -30 + ((i * 37) % 60);
      return `<g transform="translate(${x},${y}) rotate(${a})">${rr(-56, -2.5, 112, 5, 2.5, i % 2 ? '#c9d3dd' : '#98a4b0')}${circle(58, 0, 5, '#c8a53c')}</g>`;
    })
    .join('');

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 1020, 'url(#wallG)')}
    ${bokeh(7, 16)}
    ${range(5)
      .map((i) => rr(120 + i * 520, 260, 380, 520, 12, '#414b57', 'opacity="0.55" filter="url(#blur24)"'))
      .join('')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${range(7)
      .map((i) => line(100 + i * 380, 30, 100 + i * 380, 214, '#4d5866', 13))
      .join('')}
    <polygon points="0,0 620,0 260,900 0,900" fill="#ffffff" opacity="0.06" filter="url(#blur48)"/>
    ${rect(0, 1020, W, 420, 'url(#floorG)')}
    <ellipse cx="1430" cy="1064" rx="560" ry="46" fill="#2b3440" opacity="0.45" filter="url(#blur24)"/>
    <ellipse cx="530" cy="1074" rx="420" ry="40" fill="#2b3440" opacity="0.35" filter="url(#blur24)"/>
    <g opacity="0.5">${range(12).map((i) => rr(60 + i * 220, 1268, 120, 14, 7, '#d9a520')).join('')}</g>
    ${rect(0, 976, W, 16, '#d9a520', 'opacity="0.7"')}

    ${signPlate(820, 40, 880, 110, 'SPOKE CUTTING &amp; HEADING', 'AUTOMATIC SPD MACHINES')}

    <!-- spoke making machine -->
    ${rr(1080, 470, 700, 590, 22, 'url(#machineG)')}
    ${rr(1080, 492, 700, 10, 5, 'url(#goldV)')}
    ${rr(1060, 440, 740, 52, 14, '#a3b0bd')}
    ${rr(1240, 300, 320, 160, 18, 'url(#steelP)')}
    ${rr(1288, 330, 224, 100, 8, '#2b333d')}
    ${range(7)
      .map((i) => rr(1300 + i * 30, 344, 12, 72, 3, '#dfe6ee', 'opacity="0.9"'))
      .join('')}
    ${circle(1620, 640, 150, 'url(#drumFace)')}
    ${circle(1620, 640, 150, 'none', 'stroke="#e8eef4" stroke-width="6"')}
    ${range(8)
      .map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return line(1620 + Math.cos(a) * 26, 640 + Math.sin(a) * 26, 1620 + Math.cos(a) * 130, 640 + Math.sin(a) * 130, '#7c8794', 14);
      })
      .join('')}
    ${circle(1620, 640, 30, '#39434e')}
    ${rr(1140, 620, 240, 200, 12, '#39434e')}
    ${range(4)
      .map((i) => `${circle(1180 + i * 62, 700, 26, 'url(#chromeV)')}${circle(1180 + i * 62, 700, 9, '#2b333d')}`)
      .join('')}
    ${rr(1160, 860, 210, 150, 10, '#2c3540')}
    ${range(4)
      .map((i) => rr(1180, 884 + i * 28, 120 - i * 18, 12, 6, i === 1 ? '#2ecc71' : '#5b6673'))
      .join('')}
    ${circle(1430, 452, 26, '#f0b429', 'opacity="0.9" filter="url(#glowSm)"')}
    ${circle(1430, 446, 18, '#f6c352')}
    ${text(1760, 990, 'PWI &#183; SPD', 30, '#d4af37', 'text-anchor="end" font-weight="800" letter-spacing="5" opacity="0.9"')}

    <!-- feed wire from coil through straightener into machine -->
    ${coilStand}
    ${line(2300, 660, 1830, 660, '#dfe6ee', 6)}
    ${line(2300, 656, 1830, 656, '#ffffff', 2)}
    ${straightener}
    ${line(1830, 660, 1080, 664, '#dfe6ee', 6)}
    ${line(1830, 656, 1080, 660, '#ffffff', 2)}

    <!-- finished chrome spokes flying into the collection tray -->
    ${flyingSpokes}
    ${rr(160, 916, 740, 150, 14, '#333d49')}
    <polygon points="160,916 900,916 860,880 200,880" fill="#3d4855"/>
    ${trayPile}

    <g opacity="0.15" filter="url(#blur10)" transform="translate(0,2100) scale(1,-1)">
      ${rr(1080, 470, 700, 560, 22, '#000000')}
    </g>`,
  );
};

/* ---------------------------------------------------------------- scene 4
   Macro: finished glossy chrome spokes & nipples, product photography */
const scene4 = () => {
  const spoke = (len) => `
    ${rr(0, -14, len, 28, 14, 'url(#chromeV)')}
    ${rr(16, -9, len - 32, 6, 3, '#ffffff', 'opacity="0.9"')}
    ${rr(16, 7, len - 32, 4, 2, '#39434e', 'opacity="0.35"')}
    ${range(5)
      .map((i) => rr(10 + i * 12, -14, 6, 28, 3, '#6d7883', 'opacity="0.7"'))
      .join('')}
    <polygon points="${len - 4},-32 ${len + 56},-32 ${len + 72},-20 ${len + 72},20 ${len + 56},32 ${len - 4},32" fill="url(#chromeV)"/>
    ${rr(len + 6, -28, 60, 7, 3, '#ffffff', 'opacity="0.55"')}
    ${rr(len + 6, 18, 60, 6, 3, '#39434e', 'opacity="0.45"')}
    ${circle(len + 38, 0, 9, '#2b3440')}`;
  const row = (y, n, blur, op) =>
    `<g transform="translate(-140,${y}) rotate(-9)" opacity="${op}"${blur ? ` filter="url(#blur${blur})"` : ''}>` +
    range(n)
      .map((i) => `<g transform="translate(${i * 500},0)">${spoke(430)}</g>`)
      .join('') +
    `</g>`;

  const uprightNipple = (x, y) => `
    <g transform="translate(${x},${y})">
      <polygon points="-34,0 34,0 26,-96 -26,-96" fill="url(#chromeV)"/>
      <polygon points="-34,0 34,0 26,-18 -26,-18" fill="#6d7883" opacity="0.65"/>
      <polygon points="-7,-96 7,-96 9,0 -9,0" fill="#ffffff" opacity="0.35"/>
      <ellipse cx="0" cy="-96" rx="26" ry="9" fill="#dfe6ee"/>
      <ellipse cx="0" cy="-96" rx="11" ry="4.4" fill="#2b3440"/>
      ${rr(-30, -34, 60, 7, 3, '#ffffff', 'opacity="0.55"')}
    </g>`;

  return page(
    hallDefs,
    `
    <defs>
      <radialGradient id="mBg" cx="0.48" cy="0.4" r="0.85"><stop offset="0" stop-color="#dfe6ed"/><stop offset=".55" stop-color="#aeb9c5"/><stop offset="1" stop-color="#717d8a"/></radialGradient>
    </defs>
    ${rect(0, 0, W, H, 'url(#mBg)')}
    ${bokeh(21, 18, W, 760)}
    <defs><linearGradient id="paveM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aab6c2" stop-opacity="0"/><stop offset=".16" stop-color="#a8b4c0"/><stop offset="1" stop-color="#76828f"/></linearGradient></defs>
    ${rect(0, 980, W, 460, 'url(#paveM)')}
    ${rr(0, 1040, W, 14, 7, '#ffffff', 'opacity="0.24" filter="url(#blur10)"')}

    <!-- receding rows with depth of field -->
    ${row(360, 7, 9, 0.62)}
    ${row(560, 7, 5, 0.8)}
    ${row(760, 7, 2.5, 0.94)}
    <!-- crisp front row, mirrored on the reflective surface -->
    ${row(980, 7, 0, 1)}
    <g opacity="0.22" filter="url(#blur10)" transform="translate(0,2240) scale(1,-1)">${row(980, 7, 0, 1)}</g>

    <!-- loose crossed spoke + upright nipples for macro depth -->
    <g transform="translate(980,1180) rotate(-24)">${spoke(720)}</g>
    ${uprightNipple(360, 1330)}
    ${uprightNipple(560, 1370)}
    <g opacity="0.28" filter="url(#blur10)" transform="translate(0,2760) scale(1,-1)">
      ${uprightNipple(360, 1330)}${uprightNipple(560, 1370)}
    </g>

    ${star(560, 976, 30)}${star(1180, 776, 26)}${star(2050, 985, 34)}${star(1520, 1168, 28)}`,
  );
};

/* ---------------------------------------------------------------- scene 5
   Control Cable & Outer Casing Division: extrusion line */
const scene5 = () => {
  const trusses = range(9)
    .map((i) => {
      const x = 120 + i * 300;
      return `${line(x, 40, x, 214, '#4d5866', 14)}<path d="M ${x} 214 L ${x + 150} 60 L ${x + 300} 214" fill="none" stroke="#57636f" stroke-width="10"/>`;
    })
    .join('');
  const skylights = range(5)
    .map((i) => {
      const x = 240 + i * 520;
      return `${rr(x, 46, 300, 96, 8, '#dceaf4')}${rr(x - 20, 30, 340, 120, 12, '#eef7fd', 'opacity="0.5" filter="url(#blur24)"')}`;
    })
    .join('');
  const bands = range(7)
    .map((i) => {
      const x = 640 + i * 74;
      return `${rr(x, 566, 40, 148, 8, 'url(#goldV)')}${circle(x + 20, 640, 60, 'url(#lampG)', 'opacity="0.75"')}`;
    })
    .join('');
  const ripples = range(9)
    .map((i) => `<path d="M ${1330 + i * 56} 812 q 22 -9 44 0" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.5"/>`)
    .join('');
  const spoolWind = range(12)
    .map((i) => `<ellipse cx="${2330 + i * 2}" cy="712" rx="160" ry="${140 - i * 9}" fill="none" stroke="${i % 3 === 0 ? '#c0392b' : '#22282f'}" stroke-width="11" opacity="0.95"/>`)
    .join('');

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 760, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trusses}${skylights}
    ${range(4)
      .map((i) => {
        const x = 560 + i * 620;
        return `${line(x, 214, x, 300, '#3f4a56', 6)}<polygon points="${x - 30},300 ${x + 30},300 ${x + 18},336 ${x - 18},336" fill="#46515e"/>${circle(x, 350, 76, 'url(#lampG)')}`;
      })
      .join('')}
    ${rect(0, 760, W, 680, 'url(#floorG)')}
    ${rect(0, 1088, W, 26, '#d9a520', 'opacity="0.55"')}
    ${rect(0, 560, W, 280, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    ${signPlate(760, 40, 880, 110, 'PVC CASING EXTRUSION', 'OUTER CASING DIVISION')}

    <!-- extruder: hopper + motor + heated barrel + crosshead -->
    <polygon points="300,330 560,330 620,560 240,560" fill="url(#steelP)"/>
    ${rr(360, 300, 140, 44, 8, '#8b98a6')}
    ${text(430, 470, 'PWI', 44, '#d4af37', 'text-anchor="middle" font-weight="800" opacity="0.9"')}
    ${rr(180, 560, 460, 190, 16, 'url(#machineG)')}
    ${range(9)
      .map((i) => line(200 + i * 48, 570, 200 + i * 48, 740, '#39434e', 8, 'opacity="0.6"'))
      .join('')}
    ${rr(620, 540, 420, 230, 18, 'url(#steelP)')}
    ${bands}
    ${rr(1030, 580, 170, 160, 12, '#39434e')}
    ${circle(1115, 660, 34, '#2b333d')}
    ${circle(1115, 660, 20, '#4a5460')}

    <!-- cooling trough with water + steam -->
    ${[1300, 1700].map((x) => `<polygon points="${x},880 ${x + 60},880 ${x + 76},1002 ${x - 16},1002" fill="#46515e"/>`).join('')}
    <polygon points="1220,742 1900,742 1960,880 1160,880" fill="url(#steelP)"/>
    <polygon points="1224,746 1896,746 1900,758 1220,758" fill="#ffffff" opacity="0.45"/>
    ${rr(1236, 762, 648, 84, 6, '#6fb0cb', 'opacity="0.95"')}
    ${rr(1236, 762, 648, 22, 6, '#bfe2f0', 'opacity="0.9"')}
    ${rr(1236, 828, 648, 18, 6, '#3f7f97', 'opacity="0.5"')}
    ${ripples}
    ${['1360,66,150', '1560,84,190', '1780,58,130']
      .map((c) => {
        const [x, w, o] = c.split(',');
        return `<ellipse cx="${x}" cy="700" rx="${w}" ry="46" fill="#ffffff" opacity="${Number(o) / 400}" filter="url(#blur24)"/>`;
      })
      .join('')}

    <!-- caterpillar capstan -->
    ${rr(1980, 620, 210, 300, 14, 'url(#machineG)')}
    ${circle(2085, 700, 92, 'url(#drumFace)')}
    ${circle(2085, 700, 92, 'none', 'stroke="#e8eef4" stroke-width="5"')}
    ${circle(2085, 800, 92, 'url(#drumFace)')}
    ${circle(2085, 800, 92, 'none', 'stroke="#e8eef4" stroke-width="5"')}

    <!-- take-up spool with wound cable -->
    ${rr(2244, 892, 216, 122, 12, '#39434e')}
    ${circle(2330, 712, 178, '#46515e')}
    ${spoolWind}
    ${circle(2330, 712, 52, '#8b98a6')}
    ${circle(2330, 712, 20, '#39434e')}
    ${rr(2470, 500, 190, 380, 14, 'url(#steelP)')}
    ${rr(2496, 530, 138, 110, 8, '#20262e')}
    ${range(4)
      .map((i) => rr(2510, 546 + i * 22, 90 - i * 14, 10, 4, ['#2ecc71', '#f0b429', '#5b6673', '#5b6673'][i]))
      .join('')}

    <!-- the cable itself, threading crosshead -> trough -> capstan -> spool -->
    <path d="M 1115 660 C 1180 660 1200 790 1300 802 L 1880 802 C 1955 802 1975 748 1993 700" fill="none" stroke="#181d23" stroke-width="17" stroke-linecap="round"/>
    <path d="M 1115 660 C 1180 660 1200 790 1300 802 L 1880 802 C 1955 802 1975 748 1993 700" fill="none" stroke="#7d8894" stroke-width="4" opacity="0.8" stroke-linecap="round" transform="translate(0,-5)"/>
    <path d="M 1115 652 C 1182 652 1204 782 1302 794 L 1882 794" fill="none" stroke="#c0392b" stroke-width="4" opacity="0.9" stroke-linecap="round"/>
    <path d="M 1993 700 A 92 92 0 0 1 2171 668 C 2196 660 2198 700 2152 712" fill="none" stroke="#181d23" stroke-width="16" stroke-linecap="round"/>
    <path d="M 1993 700 A 92 92 0 0 1 2171 668" fill="none" stroke="#7d8894" stroke-width="4" opacity="0.75" stroke-linecap="round"/>
    ${range(4)
      .map((i) => line(1240 + i * 420, 640, 1400 + i * 420, 640, '#ffffff', 4, 'opacity="0.25" filter="url(#blur6)"'))
      .join('')}

    <!-- control cabinet -->
    ${rr(90, 560, 170, 430, 12, '#46515e')}
    ${rr(112, 590, 126, 150, 8, '#20262e')}
    ${range(3)
      .map((i) => rr(126, 610 + i * 40, 90 - i * 10, 12, 4, ['#2ecc71', '#f0b429', '#5b6673'][i]))
      .join('')}
    ${circle(130, 800, 10, '#2ecc71')}${circle(162, 800, 10, '#e74c3c')}
    ${text(250, 1042, 'PWI &#183; CCD', 30, '#d4af37', 'text-anchor="end" font-weight="800" letter-spacing="5" opacity="0.85"')}

    <g opacity="0.09" filter="url(#blur24)" transform="translate(0,1520) scale(1,-1)">
      ${rr(180, 560, 460, 190, 16, '#000000')}${rr(620, 540, 420, 230, 18, '#000000')}
    </g>`,
  );
};

/* ---------------------------------------------------------------- scene 6
   Control cable cutaway macro: gold-knit jacket, silver braided core */
const scene6 = () => {
  const ferrule = `
    <g>
      ${rr(-220, -108, 260, 216, 14, 'url(#chromeV)')}
      ${range(3)
        .map((i) => rr(-180 + i * 70, -108, 22, 216, 6, '#6d7883', 'opacity="0.7"'))
        .join('')}
      ${rr(-220, -96, 250, 26, 10, '#ffffff', 'opacity="0.45"')}
    </g>`;
  const adjuster = `
    <g>
      ${rr(-460, -78, 280, 156, 10, 'url(#chromeV)')}
      ${range(8)
        .map((i) => rr(-450 + i * 30, -78, 11, 156, 4, '#6d7883', 'opacity="0.75"'))
        .join('')}
      <polygon points="-560,-116 -460,-116 -440,-96 -440,96 -460,116 -560,116 -580,96 -580,-96" fill="url(#chromeV)"/>
      ${rr(-566, -104, 120, 20, 8, '#ffffff', 'opacity="0.5"')}
      ${rr(-452, -70, 266, 18, 8, '#ffffff', 'opacity="0.4"')}
    </g>`;
  const eyelet = `
    <g>
      ${rr(60, -70, 190, 140, 12, 'url(#chromeV)')}
      ${circle(300, 0, 86, 'url(#chromeV)')}
      ${circle(300, 0, 40, '#39434e')}
      ${circle(300, 0, 30, '#20262e')}
      ${circle(286, -22, 12, '#ffffff', 'opacity="0.7"')}
    </g>`;
  const teeth = (x0, x1) => {
    const step = (x1 - x0) / 14;
    let up = '';
    let dn = '';
    for (let i = 0; i <= 14; i++) {
      const x = x0 + i * step;
      const y = i % 2 ? -96 : -70;
      up += `${x},${y} `;
      const y2 = i % 2 ? 96 : 70;
      dn = `${x},${y2} ` + dn;
    }
    return `<polygon points="${up}" fill="#151a20"/><polygon points="${dn}" fill="#151a20"/>`;
  };

  return page(
    hallDefs,
    `
    <defs>
      <radialGradient id="cBg" cx="0.55" cy="0.38" r="0.9"><stop offset="0" stop-color="#e4eaf0"/><stop offset=".6" stop-color="#b3bec9"/><stop offset="1" stop-color="#7f8b98"/></radialGradient>
      <pattern id="helix" width="38" height="38" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <rect width="38" height="38" fill="#20262e"/>
        <rect width="10" height="38" fill="#a8871c" opacity="0.95"/>
        <rect x="11" width="4" height="38" fill="#e0bd57" opacity="0.9"/>
        <rect x="26" width="2" height="38" fill="#5c5326" opacity="0.7"/>
      </pattern>
      <pattern id="braid" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="20" height="20" fill="#7f8c99"/>
        <rect width="9" height="20" fill="#f2f6fa"/>
        <rect x="10" width="4" height="20" fill="#aab6c2" opacity="0.9"/>
        <rect y="0" width="20" height="1.8" fill="#5b6673" opacity="0.7"/>
      </pattern>
      <pattern id="braid2" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="20" height="20" fill="none"/>
        <rect width="7" height="20" fill="#d7e0e9" opacity="0.9"/>
        <rect x="8" width="2" height="20" fill="#6d7883" opacity="0.5"/>
      </pattern>
      <clipPath id="jacketClip"><rect x="-140" y="-96" width="3280" height="192" rx="96"/></clipPath>
    </defs>
    ${rect(0, 0, W, H, 'url(#cBg)')}
    ${bokeh(11, 14, W, 800)}

    <g transform="translate(1280,760) rotate(-11)">
      <!-- outer jacket -->
      ${rr(-140, -96, 3280, 192, 96, 'url(#helix)')}
      ${rr(-140, -96, 3280, 192, 96, 'url(#jacketShade)')}
      <defs><linearGradient id="jacketShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset=".28" stop-color="#ffffff" stop-opacity="0"/><stop offset=".62" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.38"/></linearGradient></defs>
      ${rr(-140, -92, 3280, 18, 9, '#ffffff', 'opacity="0.5" filter="url(#glowSm)"')}

      <!-- cutaway window: jacket removed, liner + silver braid visible -->
      <g clip-path="url(#jacketClip)">
        ${rr(560, -78, 1180, 156, 78, '#8a96a2')}
        ${rr(580, -66, 1140, 132, 66, '#5f6a76')}
        ${rr(600, -58, 1100, 116, 58, '#b9c4cf')}
        ${rr(610, -50, 1080, 100, 50, 'url(#braid)')}
        ${rr(610, -50, 1080, 100, 50, 'url(#braid2)')}
        ${rr(626, -46, 1048, 16, 8, '#ffffff', 'opacity="0.85"')}
        ${range(6)
          .map((i) => star(700 + i * 190, -20 + (i % 3) * 22, 22, 0.75))
          .join('')}
        ${teeth(540, 660)}
        <g transform="translate(2300,0) scale(-1,1)">${teeth(540, 660)}</g>
      </g>

      <!-- end fittings -->
      <g transform="translate(-200,0)">${adjuster}${ferrule}</g>
      <g transform="translate(2500,0)">${ferrule}${eyelet}</g>
      <!-- silver inner wire peeking through the eyelet -->
      <path d="M 2800 0 C 2900 -6 2960 -30 3010 -66" fill="none" stroke="#e9eff5" stroke-width="10" stroke-linecap="round"/>
      <path d="M 2800 -2 C 2898 -8 2956 -32 3004 -68" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round"/>

      <!-- branding etched on the jacket -->
      ${text(60, 34, 'PWI', 44, '#e8c766', 'opacity="0.85" font-weight="800" letter-spacing="6"')}
    </g>

    <!-- grounding reflection -->
    <g opacity="0.22" filter="url(#blur24)" transform="translate(0,2320) scale(1,-1)">
      <g transform="translate(1280,760) rotate(-11)">${rr(-140, -96, 2700, 192, 96, '#39434e')}</g>
    </g>
    ${star(1180, 640, 30)}${star(1980, 560, 26)}${star(760, 880, 24)}`,
  );
};

/* --------------------------------------------- shared blocks (scenes 7..16) */
const trussRow = (step = 300) =>
  range(Math.ceil(W / step))
    .map((i) => {
      const x = 120 + i * step;
      return `${line(x, 40, x, 214, '#4d5866', 14)}<path d="M ${x} 214 L ${x + step / 2} 60 L ${x + step} 214" fill="none" stroke="#57636f" stroke-width="10"/>`;
    })
    .join('');

const skyRow = (x0 = 180) =>
  range(5)
    .map((i) => {
      const x = x0 + i * 520;
      return `${rr(x, 46, 300, 96, 8, '#dceaf4')}${rr(x - 20, 30, 340, 120, 12, '#eef7fd', 'opacity="0.5" filter="url(#blur24)"')}`;
    })
    .join('');

const lampRow = (x0 = 340, gap = 480, n = 5) =>
  range(n)
    .map((i) => {
      const x = x0 + i * gap;
      return `${line(x, 214, x, 286, '#3f4a56', 6)}<polygon points="${x - 34},286 ${x + 34},286 ${x + 20},326 ${x - 20},326" fill="#46515e"/>${circle(x, 340, 84, 'url(#lampG)')}`;
    })
    .join('');

/** Wall sign: dark plate + gold rule + PWI gear + two-line label/sub copy. */
const signPlate = (x, y, w, h, label, sub) =>
  `${rr(x, y, w, h, 10, '#1d2a3a')}${rr(x, y, w, h, 10, 'none', 'stroke="#d4af37" stroke-width="3"')}` +
  `${gearMark(x + h * 0.5, y + h * 0.5, h * 0.34, 14, '#f2f5f8', '#1d2a3a', 'P')}` +
  `${text(x + h, y + h * 0.48, label, h * 0.34, '#f2f5f8', 'font-weight="800" letter-spacing="2"')}` +
  (sub ? `${text(x + h, y + h * 0.84, sub, h * 0.24, '#d4af37', 'font-weight="600" letter-spacing="4"')}` : '');

/** Control cabinet with lamp rows (shared shop-floor prop). */
const cabinet = (x, y, w, h) =>
  `${rr(x, y, w, h, 12, '#46515e')}${rr(x + 18, y + 24, w - 36, h * 0.36, 8, '#20262e')}` +
  range(4)
    .map((i) => rr(x + 34, y + 44 + i * 26, (w - 68) - i * 14, 13, 5, ['#2ecc71', '#f0b429', '#5b6673', '#5b6673'][i]))
    .join('') +
  `${circle(x + w * 0.3, y + h - 42, 11, '#2ecc71')}${circle(x + w * 0.3 + 34, y + h - 42, 11, '#e74c3c')}` +
  `${rr(x + 6, y + h - 16, w - 12, 18, 6, '#2b3440')}`;

/** Pay-off / take-up spool (concentric wound rings on a stand). */
const spool = (cx, cy, r, ringCol = '#22282f') =>
  `${rr(cx - r * 0.34, cy + r * 0.72, r * 0.68, r * 0.9, 8, '#39434e')}` +
  `${circle(cx, cy, r, '#46515e')}` +
  range(11)
    .map((i) => `<ellipse cx="${cx}" cy="${cy}" rx="${r - 10 - i * (r * 0.055)}" ry="${r - 10 - i * (r * 0.055)}" fill="none" stroke="${i % 4 === 0 ? ringCol : i % 4 === 1 ? '#3a434e' : '#2b333d'}" stroke-width="${r * 0.07}" opacity="0.95"/>`)
    .join('') +
  `${circle(cx, cy, r * 0.3, '#8b98a6')}${circle(cx, cy, r * 0.13, '#39434e')}` +
  `${circle(cx - r * 0.3, cy - r * 0.42, r * 0.14, '#ffffff', 'opacity="0.28" filter="url(#blur6)"')}`;

/* ---------------------------------------------------------------- scene 7
   Wire rod raw material yard: bundled rod, pay-off coils, overhead crane */
const scene7 = () => {
  const rack = (x, y, w, h, tiers) =>
    `${rr(x, y, 30, h, 6, '#46515e')}${rr(x + w - 30, y, 30, h, 6, '#46515e')}` +
    range(tiers)
      .map((t) => {
        const ty = y + 40 + t * ((h - 70) / Math.max(1, tiers - 1));
        const bars = range(3)
          .map((b) => {
            const by = ty - 16 - b * 11;
            return `${rr(x + 16, by, w - 32, 8, 4, b % 2 ? '#aeb9c4' : '#8b97a3')}${rr(x + 16, by + 1.4, w - 32, 2.4, 1.2, '#eef3f8', 'opacity="0.75"')}`;
          })
          .join('');
        return `${rr(x, ty, w, 11, 4, '#5f6a76')}${bars}`;
      })
      .join('');

  const coilPile = (cx, cy, r, n) =>
    range(n)
      .map((i) => {
        const rr2 = r - i * 22;
        return `${circle(cx, cy - i * 26, rr2, 'none', `stroke="${i % 2 ? '#98a4b0' : '#7c8794'}" stroke-width="26"`)}${circle(cx, cy - i * 26, rr2, 'none', 'stroke="#e8eef4" stroke-width="6" opacity="0.7"')}`;
      })
      .join('');

  const standCoil = (cx, cy, r) => `
    <polygon points="${cx - r * 0.8},${cy + r * 2.1} ${cx},${cy - r * 0.1} ${cx + r * 0.8},${cy + r * 2.1}" fill="#3c4650"/>
    ${circle(cx, cy, r, 'none', 'stroke="#aeb9c4" stroke-width="30"')}
    ${circle(cx, cy, r, 'none', 'stroke="#eef3f8" stroke-width="8" opacity="0.85"')}
    ${range(10)
      .map((i) => {
        const a = (i / 10) * Math.PI * 2;
        return line(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42, cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, '#8b97a3', 6, 'opacity="0.6"');
      })
      .join('')}
    ${circle(cx, cy, r * 0.34, 'none', 'stroke="#5f6a76" stroke-width="20"')}`;

  return page(
    hallDefs +
      `<linearGradient id="yardWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93a1b0"/><stop offset="1" stop-color="#66717e"/></linearGradient>`,
    `
    ${rect(0, 0, W, 1000, 'url(#yardWall)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow()}
    ${lampRow(300, 560, 5)}
    ${line(0, 470, W, 470, '#46515e', 10, 'opacity="0.6"')}
    <!-- translucent gable wall panels -->
    ${range(6)
      .map((i) => rr(60 + i * 430, 500, 330, 400, 10, '#dce8f2', 'opacity="0.16"'))
      .join('')}
    ${rect(0, 1000, W, 440, 'url(#floorG)')}
    ${rect(0, 986, W, 18, '#d9a520', 'opacity="0.7"')}
    <g opacity="0.5">${range(9).map((i) => rr(40 + i * 300, 1240, 180, 14, 7, '#d9a520')).join('')}</g>

    <!-- overhead crane beam + hook -->
    ${rect(0, 268, W, 44, '#5f6a76')}
    ${range(14).map((i) => rr(i * 190, 268, 96, 44, 0, '#d9a520', 'opacity="0.55"')).join('')}
    ${rr(1120, 312, 300, 130, 12, '#46515e')}
    ${rr(1150, 340, 110, 70, 8, '#20262e')}
    ${circle(1180, 376, 14, '#2ecc71')}${circle(1216, 376, 14, '#f0b429')}
    ${line(1270, 442, 1270, 560, '#8b97a3', 10)}
    <path d="M 1270 560 q 0 46 -34 46 q -30 0 -30 -34" fill="none" stroke="#5f6a76" stroke-width="16" stroke-linecap="round"/>

    <!-- cantilever racks with bundled straight rod -->
    ${rack(120, 560, 620, 470, 4)}
    ${rack(2140, 560, 400, 470, 4)}

    <!-- pay-off coil stands + stacked rod coils -->
    ${standCoil(1050, 700, 200)}
    ${standCoil(1560, 740, 168)}
    ${coilPile(1960, 1040, 190, 4)}
    <ellipse cx="1960" cy="1096" rx="220" ry="34" fill="#2b3440" opacity="0.4" filter="url(#blur10)"/>
    <ellipse cx="1050" cy="1130" rx="250" ry="36" fill="#2b3440" opacity="0.35" filter="url(#blur10)"/>
    <ellipse cx="1560" cy="1120" rx="210" ry="30" fill="#2b3440" opacity="0.3" filter="url(#blur10)"/>

    <!-- thick rod threading yard -> die -> drawing line -->
    <path d="M 1050 700 C 940 760 900 840 830 872" fill="none" stroke="#aeb9c4" stroke-width="16" stroke-linecap="round"/>
    <path d="M 1050 694 C 942 754 902 834 832 866" fill="none" stroke="#e8eef4" stroke-width="5" opacity="0.85" stroke-linecap="round"/>
    ${rr(700, 800, 150, 210, 10, '#39434e')}
    ${rr(720, 830, 110, 60, 6, '#2b333d')}
    ${circle(775, 860, 16, '#f0b429', 'filter="url(#glowSm)"')}

    ${cabinet(480, 640, 170, 360)}
    ${signPlate(760, 470, 760, 120, 'WIRE ROD YARD', 'RAW MATERIAL')}

    <!-- reflections -->
    <g opacity="0.10" filter="url(#blur24)" transform="translate(0,2160) scale(1,-1)">
      ${rr(120, 560, 620, 470, 8, '#000000')}${rr(2140, 560, 400, 470, 8, '#000000')}
      <polygon points="850,700 1250,700 1150,1130 950,1130" fill="#000000"/>
    </g>
    ${star(1050, 520, 30)}${star(1560, 570, 26)}${star(2340, 620, 24, 0.8)}`,
  );
};

/* ---------------------------------------------------------------- scene 8
   Annealing & galvanizing line: furnace glow, zinc bath, bright wire */
const scene8 = () => {
  const furnaceWindows = range(6)
    .map((i) => {
      const x = 360 + i * 190;
      return `${rr(x, 620, 130, 90, 12, '#3a2f1c')}${rr(x + 8, 628, 114, 74, 9, 'url(#hotG)')}${circle(x + 65, 665, 74, '#ffcf6e', 'opacity="0.30" filter="url(#blur24)"')}`;
    })
    .join('');
  const fins = range(11)
    .map((i) => line(340 + i * 150, 560, 340 + i * 150, 760, '#39434e', 9, 'opacity="0.55"'))
    .join('');
  const steam = ['1380,86,170', '1600,104,210', '1840,74,150']
    .map((c) => {
      const [x, w, o] = c.split(',');
      return `<ellipse cx="${x}" cy="716" rx="${w}" ry="52" fill="#ffffff" opacity="${Number(o) / 500}" filter="url(#blur24)"/>`;
    })
    .join('');
  const ripples = range(9)
    .map((i) => `<path d="M ${1350 + i * 56} 830 q 22 -9 44 0" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.55"/>`)
    .join('');

  return page(
    hallDefs +
      `<linearGradient id="hotG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd98a"/><stop offset=".45" stop-color="#f0a13a"/><stop offset="1" stop-color="#b8681d"/></linearGradient>
       <linearGradient id="zincG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8fb"/><stop offset=".3" stop-color="#c3ccd6"/><stop offset=".62" stop-color="#8e99a6"/><stop offset="1" stop-color="#5f6a76"/></linearGradient>`,
    `
    ${rect(0, 0, W, 780, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(240)}
    ${lampRow(420, 520, 5)}
    ${rect(0, 780, W, 660, 'url(#floorG)')}
    ${rect(0, 1112, W, 26, '#d9a520', 'opacity="0.5"')}
    ${rect(0, 560, W, 300, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- annealing furnace tunnel -->
    ${rr(300, 540, 1320, 260, 22, 'url(#machineG)')}
    ${rr(300, 566, 1320, 12, 6, 'url(#goldV)')}
    ${rr(280, 512, 1360, 44, 14, '#a3b0bd')}
    ${fins}${furnaceWindows}
    <!-- exhaust duct -->
    ${rr(430, 300, 120, 240, 10, 'url(#steelP)')}
    ${rr(1360, 330, 96, 210, 10, 'url(#steelP)')}
    ${rr(410, 276, 160, 40, 10, '#8b98a6')}
    ${rr(1344, 306, 128, 40, 10, '#8b98a6')}
    ${text(1580, 700, 'ANNEALING', 30, '#ffd98a', 'text-anchor="end" font-weight="800" letter-spacing="4" opacity="0.9"')}

    <!-- zinc bath with molten surface + steam -->
    <polygon points="1240,856 2020,856 2080,1010 1180,1010" fill="url(#steelP)"/>
    ${rr(1264, 868, 740, 96, 10, 'url(#zincG)')}
    ${rr(1272, 874, 724, 26, 8, '#ffffff', 'opacity="0.85"')}
    ${range(7).map((i) => `<ellipse cx="${1330 + i * 100}" cy="912" rx="46" ry="10" fill="#ffffff" opacity="0.5" filter="url(#blur6)"/>`).join('')}
    ${ripples}${steam}
    ${[1300, 1940].map((x) => `<polygon points="${x},1010 ${x + 64},1010 ${x + 84},1140 ${x - 20},1140" fill="#46515e"/>`).join('')}
    ${rr(2040, 900, 26, 170, 6, '#d9a520', 'opacity="0.8"')}

    <!-- wire path: payoff -> furnace -> zinc -> capstan -> take-up -->
    ${spool(170, 760, 170, '#c9d2dc')}
    <path d="M 300 760 C 320 700 330 668 360 668 L 1600 668" fill="none" stroke="#e9eff5" stroke-width="9" stroke-linecap="round"/>
    <path d="M 300 754 C 322 694 332 662 362 662 L 1602 662" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.9"/>
    <path d="M 1600 668 C 1720 668 1760 900 1900 916 L 2160 916" fill="none" stroke="#f4f8fb" stroke-width="10" stroke-linecap="round"/>
    <path d="M 1602 662 C 1724 664 1766 894 1904 910" fill="none" stroke="#ffffff" stroke-width="3.4" opacity="0.9"/>
    <!-- caterpillar capstan -->
    ${rr(2160, 640, 210, 320, 14, 'url(#machineG)')}
    ${circle(2265, 726, 96, 'url(#drumFace)')}
    ${circle(2265, 726, 96, 'none', 'stroke="#e8eef4" stroke-width="5"')}
    ${circle(2265, 842, 96, 'url(#drumFace)')}
    ${circle(2265, 842, 96, 'none', 'stroke="#e8eef4" stroke-width="5"')}
    <path d="M 2160 916 A 96 96 0 0 1 2356 866" fill="none" stroke="#e9eff5" stroke-width="9" stroke-linecap="round"/>
    <!-- galvanized take-up spool -->
    ${spool(2440, 620, 150, '#e9eff5')}

    ${cabinet(60, 560, 170, 380)}
    ${signPlate(760, 300, 780, 120, 'ANNEAL &amp; GALVANIZE', 'WIRE TREATMENT')}

    <g opacity="0.09" filter="url(#blur24)" transform="translate(0,1600) scale(1,-1)">
      ${rr(300, 540, 1320, 260, 22, '#000000')}${rr(1240, 856, 840, 154, 18, '#000000')}
    </g>
    ${star(1300, 878, 28)}${star(1700, 884, 24)}${star(420, 664, 26)}`,
  );
};

/* ---------------------------------------------------------------- scene 9
   Wire quality control laboratory: tensile tester, microscope, gauges */
const scene9 = () => {
  const gaugeFace = (x, y, r) => `
    ${circle(x, y, r, '#f2f5f8')}${circle(x, y, r, 'none', 'stroke="#8b97a3" stroke-width="6"')}
    ${range(12)
      .map((i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return line(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72, x + Math.cos(a) * r * 0.88, y + Math.sin(a) * r * 0.88, '#5f6a76', 5);
      })
      .join('')}
    ${line(x, y, x + r * 0.5, y - r * 0.5, '#d4af37', 7, 'stroke-linecap="round"')}
    ${circle(x, y, r * 0.1, '#39434e')}`;

  const micrometer = (x, y) => `
    <g transform="translate(${x},${y}) rotate(-6)">
      ${rr(-120, -16, 240, 32, 16, 'url(#chromeV)')}
      <path d="M -120 -16 a 60 60 0 0 0 0 32" fill="url(#chromeV)"/>
      ${rr(60, -34, 74, 68, 10, 'url(#chromeV)')}
      ${range(7).map((i) => line(66 + i * 9, -30, 66 + i * 9, -8, '#39434e', 3, 'opacity="0.7"')).join('')}
      ${rr(134, -12, 56, 24, 8, '#8b98a6')}
    </g>`;

  return page(
    hallDefs +
      `<linearGradient id="labWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe4ec"/><stop offset="1" stop-color="#a9b6c3"/></linearGradient>
       <linearGradient id="benchTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfcfe"/><stop offset="1" stop-color="#d4dce5"/></linearGradient>`,
    `
    ${rect(0, 0, W, H, 'url(#labWall)')}
    ${bokeh(31, 12, W, 820)}
    <!-- frosted lab windows -->
    ${range(5)
      .map((i) => rr(140 + i * 500, 150, 360, 300, 14, '#eef6fc', 'opacity="0.75"'))
      .join('')}
    ${range(5)
      .map((i) => `${rr(140 + i * 500, 150, 360, 300, 14, 'none', 'stroke="#8fa0af" stroke-width="8"')}${line(320 + i * 500, 156, 200 + i * 500, 444, '#ffffff', 26, 'opacity="0.5"')}`)
      .join('')}
    ${rect(0, 640, W, 60, '#8fa0af', 'opacity="0.6"')}
    ${rect(0, 700, W, 740, '#c3ccd6')}

    <!-- long white bench -->
    ${rr(60, 780, 2440, 66, 12, 'url(#benchTop)')}
    ${rr(60, 846, 2440, 26, 8, '#9aa5b0')}
    ${range(6).map((i) => rr(140 + i * 460, 872, 46, 420, 8, '#8b97a3')).join('')}
    ${rr(60, 1000, 2440, 40, 6, '#aab6c2', 'opacity="0.7"')}

    <!-- tensile tester -->
    ${rr(240, 340, 340, 440, 18, 'url(#machineG)')}
    ${rr(264, 366, 292, 120, 10, '#20262e')}
    <path d="M 292 452 L 356 402 L 414 436 L 472 384 L 530 410" fill="none" stroke="#d4af37" stroke-width="6"/>
    ${range(4).map((i) => rr(284, 512 + i * 34, 150 - i * 18, 15, 6, ['#2ecc71', '#f0b429', '#5b6673', '#5b6673'][i])).join('')}
    ${rr(360, 486, 100, 170, 8, '#39434e')}
    <!-- gripped wire sample -->
    ${rr(392, 500, 34, 52, 6, 'url(#chromeV)')}${rr(392, 690, 34, 52, 6, 'url(#chromeV)')}
    ${line(409, 552, 409, 690, '#eef3f8', 9)}${line(412, 552, 412, 690, '#ffffff', 3)}
    ${gaugeFace(680, 430, 110)}
    ${text(680, 588, 'TENSILE', 26, '#55647a', 'text-anchor="middle" font-weight="700" letter-spacing="3"')}

    <!-- microscope -->
    <g transform="translate(1050,0)">
      ${rr(-150, 640, 300, 44, 12, 'url(#chromeV)')}
      ${rr(-34, 540, 68, 108, 10, '#39434e')}
      <polygon points="-46,540 46,540 64,430 -64,430" fill="url(#steelP)"/>
      ${rr(-64, 408, 128, 30, 8, '#46515e')}
      ${rr(-40, 438, 80, 14, 6, '#b9c4cf')}
      ${rr(-24, 300, 48, 118, 14, 'url(#chromeV)')}
      ${rr(-64, 690, 150, 16, 8, '#5f6a76')}
      ${circle(0, 448, 12, '#ffffff', 'opacity="0.8"')}
      ${circle(60, 330, 30, 'url(#goldV)')}
    </g>

    <!-- gauge cluster + sample spool on bench -->
    ${gaugeFace(1420, 660, 78)}
    ${gaugeFace(1600, 686, 58)}
    ${spool(1860, 686, 130, '#e9eff5')}
    ${micrometer(2210, 740)}
    <!-- loose wire samples in a tray -->
    ${rr(1380, 764, 560, 66, 12, '#8b97a3')}
    ${range(9)
      .map((i) => {
        const x = 1410 + i * 60;
        return `${line(x, 776, x + 26, 820, i % 2 ? '#dfe6ee' : '#aab6c2', 7, 'stroke-linecap="round"')}${circle(x + 28, 822, 6, '#d4af37')}`;
      })
      .join('')}

    <!-- QC screen on the wall -->
    ${rr(1960, 180, 460, 300, 16, '#22303f')}
    ${rr(1976, 196, 428, 268, 10, '#0f1720')}
    <path d="M 2010 420 L 2090 360 L 2160 384 L 2240 300 L 2320 322 L 2380 262" fill="none" stroke="#d4af37" stroke-width="7"/>
    <path d="M 2010 448 L 2090 430 L 2160 442 L 2240 404 L 2320 420 L 2380 392" fill="none" stroke="#7fd8c0" stroke-width="5" opacity="0.85"/>
    ${range(8).map((i) => line(2010, 240 + i * 30, 2380, 240 + i * 30, '#ffffff', 2, 'opacity="0.12"')).join('')}
    ${text(2380, 236, 'QC PASS', 34, '#2ecc71', 'text-anchor="end" font-weight="800" letter-spacing="4"')}

    ${signPlate(700, 40, 700, 110, 'QUALITY LAB', 'WIRE &amp; SPOKE QC')}

    <g opacity="0.14" filter="url(#blur10)" transform="translate(0,1746) scale(1,-1)">
      ${rr(240, 340, 340, 440, 18, '#000000')}${rr(60, 780, 2440, 66, 12, '#000000')}
    </g>
    ${star(1420, 596, 26)}${star(1860, 570, 24)}`,
  );
};

/* ---------------------------------------------------------------- scene 10
   Structured wheel lacing: motorcycle wheels built from spokes (patterns) */
const scene10 = () => {
  const wheel = (cx, cy, R, spokes, cross) => {
    const rim =
      `${circle(cx, cy, R, 'none', 'stroke="url(#chromeV)" stroke-width="40"')}` +
      `${circle(cx, cy, R, 'none', 'stroke="#ffffff" stroke-width="9" opacity="0.55"')}` +
      `${circle(cx, cy, R - 34, 'none', 'stroke="#39434e" stroke-width="7" opacity="0.55"')}` +
      `${circle(cx, cy, R + 34, 'none', 'stroke="#39434e" stroke-width="7" opacity="0.5"')}`;
    const lace = range(spokes)
      .map((i) => {
        const a1 = (i / spokes) * Math.PI * 2;
        const side = i % 2 ? 1 : -1;
        const a2 = a1 + (side * cross * Math.PI * 2) / spokes;
        const x1 = cx + Math.cos(a1) * 70;
        const y1 = cy + Math.sin(a1) * 70;
        const x2 = cx + Math.cos(a2) * (R - 30);
        const y2 = cy + Math.sin(a2) * (R - 30);
        return `${line(x1, y1, x2, y2, '#dfe6ee', 8, 'stroke-linecap="round"')}${line(x1, y1, x2, y2, '#ffffff', 3, 'stroke-linecap="round"')}${circle(x2, y2, 8, '#d4af37')}`;
      })
      .join('');
    const hub =
      `${circle(cx, cy, 76, 'url(#chromeV)')}${circle(cx, cy, 76, 'none', 'stroke="#ffffff" stroke-width="5" opacity="0.6"')}` +
      `${circle(cx, cy, 44, '#39434e')}${circle(cx, cy, 20, '#20262e')}${circle(cx - 16, cy - 18, 12, '#ffffff', 'opacity="0.55"')}`;
    return rim + lace + hub;
  };

  const looseRow = (y, n, blur, op) =>
    `<g transform="translate(-160,${y}) rotate(-7)" opacity="${op}"${blur ? ` filter="url(#blur${blur})"` : ''}>` +
    range(n)
      .map((i) => {
        const x = i * 470;
        return `<g transform="translate(${x},0)">${rr(0, -12, 400, 24, 12, 'url(#chromeV)')}${rr(14, -8, 372, 5, 2.5, '#ffffff', 'opacity="0.9"')}${circle(420, 0, 17, '#d4af37')}${circle(388, 0, 11, '#c9d2dc')}</g>`;
      })
      .join('') +
    `</g>`;

  return page(
    hallDefs,
    `
    <defs>
      <radialGradient id="lBg" cx="0.5" cy="0.4" r="0.9"><stop offset="0" stop-color="#e2e9f0"/><stop offset=".55" stop-color="#aeb9c5"/><stop offset="1" stop-color="#6e7a88"/></radialGradient>
    </defs>
    ${rect(0, 0, W, H, 'url(#lBg)')}
    ${bokeh(41, 16, W, 780)}
    ${rect(0, 1060, W, 380, '#8c98a5')}
    ${rr(0, 1060, W, 16, 8, '#ffffff', 'opacity="0.3" filter="url(#blur6)"')}

    <!-- background wheel (soft focus) -->
    <g opacity="0.5" filter="url(#blur9)">${wheel(500, 560, 330, 28, 2)}</g>
    <!-- hero laced wheel -->
    ${wheel(1240, 620, 500, 36, 3)}
    <!-- structured parallel spoke layout, right side -->
    <g transform="translate(1780,0)">${range(9)
      .map((i) => {
        const x = 0;
        const y = 210 + i * 76;
        return `<g transform="translate(${x},${y}) rotate(${i % 2 ? 6 : -6})">${rr(0, -11, 640, 22, 11, 'url(#chromeV)')}${rr(12, -7, 616, 4, 2, '#ffffff', 'opacity="0.85"')}${circle(656, 0, 15, '#d4af37')}</g>`;
      })
      .join('')}</g>
    <!-- loose spoke row foreground -->
    ${looseRow(1210, 7, 0, 1)}
    <g opacity="0.22" filter="url(#blur10)" transform="translate(0,2470) scale(1,-1)">${looseRow(1210, 7, 0, 1)}</g>

    ${signPlate(1560, 40, 900, 110, 'WHEEL LACING', 'STRUCTURED SPOKE LAYOUTS')}
    ${star(1240, 130, 34)}${star(910, 470, 26)}${star(1700, 640, 28)}${star(2340, 1120, 24)}`,
  );
};

/* ---------------------------------------------------------------- scene 11
   Outer casing division: black corrugated protective conduits */
const scene11 = () => {
  const corrug = `corrugP`;
  const tube = (x1, y1, x2, y2, w, col = '#20262e') => `
    ${line(x1, y1, x2, y2, col, w, 'stroke-linecap="round"')}
    ${line(x1, y1 - w * 0.22, x2, y2 - w * 0.22, '#6d7883', w * 0.14, 'opacity="0.55" stroke-linecap="round"')}
    ${line(x1, y1 - w * 0.3, x2, y2 - w * 0.3, '#ffffff', w * 0.07, 'opacity="0.45" stroke-linecap="round"')}`;

  const coilHang = (cx, cy, r) =>
    `${range(4)
      .map((i) => `<circle cx="${cx}" cy="${cy}" r="${r - i * 34}" fill="none" stroke="#232a33" stroke-width="30" stroke-dasharray="14 11"/>`)
      .join('')}` +
    `${range(4)
      .map((i) => `<circle cx="${cx}" cy="${cy}" r="${r - i * 34}" fill="none" stroke="#59626d" stroke-width="7" stroke-dasharray="14 11" opacity="0.8"/>`)
      .join('')}` +
    `${circle(cx, cy, r * 0.3, 'none', 'stroke="#39434e" stroke-width="16"')}`;

  return page(
    hallDefs +
      `<pattern id="${corrug}" width="20" height="20" patternUnits="userSpaceOnUse">
         <rect width="20" height="20" fill="#20262e"/>
         <rect width="8" height="20" fill="#2f3742"/>
         <rect x="9" width="3" height="20" fill="#4a5460" opacity="0.85"/>
         <rect x="13" width="2" height="20" fill="#171c22"/>
       </pattern>`,
    `
    ${rect(0, 0, W, 760, 'url(#wallG)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow()}
    ${lampRow(360, 540, 5)}
    ${rect(0, 760, W, 680, 'url(#floorG)')}
    ${rect(0, 1104, W, 26, '#d9a520', 'opacity="0.55"')}
    ${rect(0, 540, W, 300, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- coiling machine: drum winding a corrugated conduit -->
    ${rr(300, 560, 560, 470, 20, 'url(#machineG)')}
    ${rr(300, 586, 560, 12, 6, 'url(#goldV)')}
    ${rr(280, 530, 600, 46, 14, '#a3b0bd')}
    ${circle(600, 780, 200, '#2b3440')}
    ${range(5)
      .map((i) => `<circle cx="600" cy="780" r="${182 - i * 32}" fill="none" stroke="#232a33" stroke-width="26" stroke-dasharray="13 10"/>`)
      .join('')}
    ${range(5)
      .map((i) => `<circle cx="600" cy="780" r="${182 - i * 32}" fill="none" stroke="#59626d" stroke-width="6" stroke-dasharray="13 10" opacity="0.8"/>`)
      .join('')}
    ${circle(600, 780, 62, '#8b98a6')}${circle(600, 780, 26, '#39434e')}
    ${rr(340, 940, 480, 60, 10, '#39434e')}
    ${cabinet(900, 640, 170, 360)}

    <!-- conduit extrusion head feeding the line -->
    <polygon points="1180,470 1400,470 1450,640 1130,640" fill="url(#steelP)"/>
    ${rr(1230, 444, 120, 40, 8, '#8b98a6')}
    ${rr(1440, 560, 200, 150, 14, 'url(#machineG)')}
    ${circle(1540, 635, 46, '#39434e')}${circle(1540, 635, 30, '#20262e')}
    ${text(1310, 580, 'PWI', 44, '#d4af37', 'text-anchor="middle" font-weight="800" opacity="0.9"')}

    <!-- long conduits on the run -->
    ${tube(1640, 635, 2480, 560, 44)}
    ${tube(1640, 700, 2480, 700, 40)}
    ${tube(1640, 764, 2480, 830, 36)}
    <!-- gold-striped conduit variant -->
    ${line(1640, 880, 2480, 950, '#20262e', 46, 'stroke-linecap="round"')}
    ${line(1640, 872, 2480, 942, '#d4af37', 7, 'opacity="0.9" stroke-linecap="round"')}
    ${line(1640, 864, 2480, 934, '#ffffff', 3, 'opacity="0.5" stroke-linecap="round"')}

    <!-- wall-hung coils + stacked cut lengths -->
    ${coilHang(300, 320, 190)}
    ${coilHang(640, 290, 150)}
    ${coilHang(1980, 300, 210)}
    ${coilHang(2360, 340, 160)}
    ${rr(1780, 1060, 660, 60, 10, '#46515e')}
    ${range(6)
      .map((i) => {
        const y = 1020 - i * 26;
        return `${tube(1800, y, 2420, y, 22)}`;
      })
      .join('')}

    ${signPlate(660, 60, 920, 110, 'FINISHED CONDUITS', 'CONTROL CABLE HOUSINGS')}

    <g opacity="0.12" filter="url(#blur24)" transform="translate(0,2090) scale(1,-1)">
      ${rr(300, 560, 560, 470, 20, '#000000')}${rr(1440, 560, 200, 150, 14, '#000000')}
    </g>
    ${star(1540, 590, 26)}${star(2100, 560, 24)}`,
  );
};

/* ---------------------------------------------------------------- scene 12
   Inner wire division: tinning bath + precision cutting to length */
const scene12 = () => {
  const cutPiece = (x, y, len, a) =>
    `<g transform="translate(${x},${y}) rotate(${a})">` +
    `${rr(-len / 2, -9, len, 18, 9, 'url(#chromeV)')}` +
    `${rr(-len / 2 + 8, -6, len - 16, 4, 2, '#ffffff', 'opacity="0.9"')}` +
    `${circle(len / 2 - 2, 0, 10, '#e9eff5')}${circle(len / 2 - 2, 0, 4.6, '#7f8b98')}</g>`;

  const basket = `
    <g>
      ${rr(1740, 940, 620, 240, 16, '#46515e')}
      ${range(9).map((i) => line(1760 + i * 70, 952, 1760 + i * 70, 1168, '#5f6a76', 8, 'opacity="0.8"')).join('')}
      ${range(3).map((i) => line(1740, 990 + i * 70, 2360, 990 + i * 70, '#5f6a76', 8, 'opacity="0.8"')).join('')}
      ${range(16)
        .map((i) => {
          const x = 1790 + ((i * 137) % 540);
          const y = 946 + ((i * 71) % 60);
          return cutPiece(x, y, 150 + ((i * 37) % 70), -14 + ((i * 29) % 28));
        })
        .join('')}
    </g>`;

  return page(
    hallDefs +
      `<linearGradient id="tinG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f9fc"/><stop offset=".4" stop-color="#c8d1db"/><stop offset="1" stop-color="#7c8794"/></linearGradient>`,
    `
    ${rect(0, 0, W, 780, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(220)}
    ${lampRow(400, 560, 5)}
    ${rect(0, 780, W, 660, 'url(#floorG)')}
    ${rect(0, 1116, W, 26, '#d9a520', 'opacity="0.55"')}
    ${rect(0, 540, W, 300, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- tinning bath: wire dips through molten tin -->
    <polygon points="340,824 940,824 990,980 290,980" fill="url(#steelP)"/>
    ${rr(366, 836, 550, 84, 10, 'url(#tinG)')}
    ${rr(374, 842, 534, 22, 8, '#ffffff', 'opacity="0.9"')}
    ${range(6).map((i) => `<ellipse cx="${430 + i * 92}" cy="874" rx="40" ry="9" fill="#ffffff" opacity="0.55" filter="url(#blur6)"/>`).join('')}
    <ellipse cx="640" cy="800" rx="180" ry="52" fill="#ffffff" opacity="0.3" filter="url(#blur24)"/>
    ${[380, 900].map((x) => `<polygon points="${x},980 ${x + 60},980 ${x + 78},1116 ${x - 18},1116" fill="#46515e"/>`).join('')}

    <!-- pay-off spool feeding the line -->
    ${spool(160, 700, 170, '#c9d2dc')}
    <path d="M 300 700 C 330 700 330 862 396 872" fill="none" stroke="#dfe6ee" stroke-width="9" stroke-linecap="round"/>
    <path d="M 300 694 C 334 696 336 856 398 866" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.9"/>

    <!-- rotary cutting machine -->
    ${rr(1080, 560, 520, 470, 20, 'url(#machineG)')}
    ${rr(1080, 586, 520, 12, 6, 'url(#goldV)')}
    ${rr(1060, 530, 560, 46, 14, '#a3b0bd')}
    ${circle(1340, 760, 150, 'url(#drumFace)')}
    ${circle(1340, 760, 150, 'none', 'stroke="#e8eef4" stroke-width="7"')}
    ${range(16)
      .map((i) => {
        const a = (i / 16) * Math.PI * 2;
        return `<polygon points="${1340 + Math.cos(a) * 150},${760 + Math.sin(a) * 150} ${1340 + Math.cos(a + 0.16) * 172},${760 + Math.sin(a + 0.16) * 172} ${1340 + Math.cos(a + 0.32) * 150},${760 + Math.sin(a + 0.32) * 150}" fill="#c3ccd6"/>`;
      })
      .join('')}
    ${circle(1340, 760, 44, '#39434e')}${circle(1340, 760, 20, '#20262e')}
    <!-- wire in -> measured stop gauge -> cut -->
    <path d="M 940 872 L 1150 872 L 1560 872 L 1660 916" fill="none" stroke="#eef3f8" stroke-width="9" stroke-linecap="round"/>
    <path d="M 942 866 L 1560 866" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.9"/>
    ${rr(1540, 800, 40, 160, 8, '#46515e')}
    ${circle(1560, 820, 16, '#e74c3c')}
    ${range(8).map((i) => line(1160 + i * 46, 906, 1160 + i * 46, 926, '#d9a520', 4, 'opacity="0.8"')).join('')}

    <!-- conveyor of cut-to-length tinned wires -->
    ${rr(1640, 1000, 760, 60, 14, '#39434e')}
    ${range(7).map((i) => circle(1690 + i * 116, 1030, 22, 'url(#drumFace)')).join('')}
    ${range(7)
      .map((i) => cutPiece(1710 + i * 112, 968, 190, i % 2 ? -4 : 4))
      .join('')}

    ${basket}
    ${cabinet(2420, 560, 140, 340)}
    ${signPlate(760, 300, 820, 120, 'TIN &amp; CUT', 'INNER WIRE DIVISION')}

    <g opacity="0.10" filter="url(#blur24)" transform="translate(0,2090) scale(1,-1)">
      ${rr(1080, 560, 520, 470, 20, '#000000')}
    </g>
    ${star(1340, 610, 30)}${star(700, 846, 26)}${star(2100, 964, 24)}`,
  );
};

/* ---------------------------------------------------------------- scene 13
   Braided steel core macro: strands shifting inside the cable */
const scene13 = () => {
  const strand = (i, n, x0, x1, cy, spread, w) => {
    const t = i / (n - 1) - 0.5;
    const y0 = cy + t * 150;
    const y1 = cy + t * spread;
    const c1 = x0 + (x1 - x0) * 0.35;
    const c2 = x0 + (x1 - x0) * 0.72;
    return `
      <path d="M ${x0} ${y0} C ${c1} ${y0 + t * 60} ${c2} ${y1 - t * 70} ${x1} ${y1}" fill="none" stroke="#8b97a3" stroke-width="${w + 8}" stroke-linecap="round"/>
      <path d="M ${x0} ${y0} C ${c1} ${y0 + t * 60} ${c2} ${y1 - t * 70} ${x1} ${y1}" fill="none" stroke="url(#chromeV)" stroke-width="${w}" stroke-linecap="round"/>
      <path d="M ${x0} ${y0 - w * 0.22} C ${c1} ${y0 + t * 60 - w * 0.22} ${c2} ${y1 - t * 70 - w * 0.22} ${x1} ${y1 - w * 0.22}" fill="none" stroke="#ffffff" stroke-width="${w * 0.3}" stroke-linecap="round" opacity="0.85"/>`;
  };

  const braidBand = (y, h, op, blur) =>
    `<g opacity="${op}"${blur ? ` filter="url(#blur${blur})"` : ''}><rect x="-140" y="${y}" width="2840" height="${h}" rx="${h / 2}" fill="url(#braid)"/><rect x="-140" y="${y}" width="2840" height="${h}" rx="${h / 2}" fill="url(#braid2)"/><rect x="-140" y="${y + 6}" width="2840" height="${h * 0.22}" rx="10" fill="#ffffff" opacity="0.35"/><rect x="-140" y="${y + h - h * 0.24}" width="2840" height="${h * 0.2}" rx="10" fill="#1c222b" opacity="0.35"/></g>`;

  return page(
    hallDefs +
      `<pattern id="braid" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
         <rect width="26" height="26" fill="#7f8c99"/>
         <rect width="11" height="26" fill="#f2f6fa"/>
         <rect x="13" width="5" height="26" fill="#aab6c2" opacity="0.9"/>
         <rect y="0" width="26" height="2.2" fill="#5b6673" opacity="0.7"/>
       </pattern>
       <pattern id="braid2" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
         <rect width="26" height="26" fill="none"/>
         <rect width="9" height="26" fill="#d7e0e9" opacity="0.9"/>
         <rect x="11" width="3" height="26" fill="#6d7883" opacity="0.5"/>
       </pattern>
       <radialGradient id="brBg" cx="0.52" cy="0.4" r="0.9"><stop offset="0" stop-color="#e6ecf2"/><stop offset=".58" stop-color="#aeb9c5"/><stop offset="1" stop-color="#75818e"/></radialGradient>`,
    `
    ${rect(0, 0, W, H, 'url(#brBg)')}
    ${bokeh(53, 14, W, 700)}
    <!-- depth: braided bands receding -->
    <g transform="rotate(-7 1280 720)">
      ${braidBand(140, 210, 0.5, 9)}
      ${braidBand(1160, 240, 0.55, 9)}
      ${braidBand(400, 330, 0.85, 2.5)}
      ${braidBand(860, 300, 0.85, 2.5)}
    </g>

    <!-- hero: cable cut end with the bundle unravelling into strands -->
    <g transform="translate(1560,760) rotate(-8)">
      <!-- ferrule base -->
      ${rr(-1180, -230, 340, 460, 26, 'url(#chromeV)')}
      ${range(4).map((i) => rr(-1140 + i * 78, -230, 26, 460, 8, '#6d7883', 'opacity="0.7"')).join('')}
      ${rr(-1180, -210, 330, 40, 14, '#ffffff', 'opacity="0.5"')}
      ${rr(-860, -206, 60, 412, 20, 'url(#goldV)')}
      <!-- sheath before the cut -->
      ${rr(-820, -196, 480, 392, 40, 'url(#braid)')}
      ${rr(-820, -196, 480, 392, 40, 'url(#braid2)')}
      ${rr(-820, -170, 480, 60, 30, '#ffffff', 'opacity="0.32"')}
      <!-- unravelling silver strands -->
      ${range(9)
        .map((i) => strand(i, 9, -360, 760, 0, 660, 46))
        .join('')}
      <!-- frayed tips -->
      ${range(9)
        .map((i) => {
          const t = i / 8 - 0.5;
          const y = t * 660;
          return `${circle(780, y, 30, '#e9eff5')}${circle(792, y - 8, 12, '#ffffff')}`;
        })
        .join('')}
    </g>

    <!-- foreground macro: circular cross-section of the dense braided core -->
    <g>
      ${circle(520, 1040, 330, '#20262e')}
      <circle cx="520" cy="1040" r="330" fill="none" stroke="url(#braid)" stroke-width="96"/>
      <circle cx="520" cy="1040" r="330" fill="none" stroke="url(#braid2)" stroke-width="96"/>
      ${circle(520, 1040, 330, 'none', 'stroke="#39434e" stroke-width="10"')}
      ${circle(520, 1040, 234, '#5f6a76')}
      ${circle(520, 1040, 224, '#39434e')}
      ${range(37)
        .map((i) => {
          const a = (i / 37) * Math.PI * 2;
          const r2 = 62 + (i % 3) * 56;
          return circle((520 + Math.cos(a) * r2).toFixed(1), (1040 + Math.sin(a) * r2).toFixed(1), 26, 'url(#chromeV)');
        })
        .join('')}
      ${range(12)
        .map((i) => {
          const a = (i / 12) * Math.PI * 2 + 0.26;
          return circle((520 + Math.cos(a) * 116).toFixed(1), (1040 + Math.sin(a) * 116).toFixed(1), 22, 'url(#chromeV)');
        })
        .join('')}
      ${circle(520, 1040, 40, 'url(#goldV)')}
      ${circle(520, 1040, 330, 'none', 'stroke="#ffffff" stroke-width="5" opacity="0.4"')}
      ${rr(220, 690, 320, 46, 8, '#1d2a3a')}
      ${rr(220, 690, 320, 46, 8, 'none', 'stroke="#d4af37" stroke-width="2"')}
      ${text(380, 723, 'BRAID + CORE &#216;', 28, '#f2f5f8', 'text-anchor="middle" font-weight="800" letter-spacing="2"')}
      <path d="M 360 736 L 430 852" stroke="#d4af37" stroke-width="4" stroke-dasharray="12 8"/>
    </g>

    <!-- sparkle highlights -->
    ${star(1140, 620, 34)}${star(1720, 480, 30)}${star(2130, 880, 32)}${star(740, 940, 26)}${star(1980, 1180, 24)}
    ${signPlate(60, 60, 900, 110, 'BRAIDED CORE MACRO', 'CROSS-SECTION VIEW')}`,
  );
};

/* ---------------------------------------------------------------- scene 14
   Polymer & PVC section: hoppers, granules, masterbatch */
const scene14 = () => {
  const hopper = (cx, topY, w) => `
    <polygon points="${cx - w / 2},${topY} ${cx + w / 2},${topY} ${cx + w * 0.17},${topY + 330} ${cx - w * 0.17},${topY + 330}" fill="url(#chromeV)"/>
    ${rr(cx - w / 2, topY - 46, w, 52, 10, '#8b98a6')}
    ${rr(cx - w * 0.3, topY - 74, w * 0.6, 34, 8, '#a3b0bd')}
    ${rr(cx - w * 0.17, topY + 330, w * 0.34, 66, 8, 'url(#steelP)')}
    ${rr(cx - w * 0.42, topY + 70, w * 0.2, 150, 10, '#ffffff', 'opacity="0.4"')}
    ${range(3).map((i) => line(cx - w / 2 + 20 + i * 40, topY + 16, cx + w / 2 - 20 - i * 40, topY + 16, '#5f6a76', 5, 'opacity="0.5"')).join('')}
    <!-- legs -->
    ${line(cx - w * 0.42, topY + 396, cx - w * 0.5, topY + 560, '#46515e', 18)}
    ${line(cx + w * 0.42, topY + 396, cx + w * 0.5, topY + 560, '#46515e', 18)}`;

  const granuleHeap = (cx, cy, rx, col, n, seed) => {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return (
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.3}" fill="${col}" opacity="0.92"/>` +
      `<ellipse cx="${cx - rx * 0.3}" cy="${cy - rx * 0.12}" rx="${rx * 0.4}" ry="${rx * 0.16}" fill="#ffffff" opacity="0.28" filter="url(#blur6)"/>` +
      range(n)
        .map(() => {
          const a = rnd() * Math.PI;
          const r = Math.sqrt(rnd()) * rx * 0.96;
          const x = cx + Math.cos(a + Math.PI) * r;
          const y = cy - Math.abs(Math.sin(a)) * rx * 0.26 * (1 - r / rx) + rnd() * 14;
          return circle(x.toFixed(1), y.toFixed(1), 7 + rnd() * 5, rnd() > 0.75 ? '#f6e3ae' : col, `stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.25"`);
        })
        .join('')
    );
  };

  const hose = (x1, y1, x2, y2) =>
    `<path d="M ${x1} ${y1} C ${x1 - 120} ${y1 + 160} ${x2 + 140} ${y2 - 220} ${x2} ${y2}" fill="none" stroke="#98a4b0" stroke-width="34" stroke-linecap="round"/>` +
    `<path d="M ${x1} ${y1} C ${x1 - 120} ${y1 + 160} ${x2 + 140} ${y2 - 220} ${x2} ${y2}" fill="none" stroke="#dfe6ee" stroke-width="10" stroke-linecap="round" opacity="0.7"/>`;

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 800, 'url(#wallG)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(260)}
    ${lampRow(440, 520, 5)}
    ${rect(0, 800, W, 640, 'url(#floorG)')}
    ${rect(0, 1140, W, 24, '#d9a520', 'opacity="0.55"')}
    ${rect(0, 560, W, 300, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- dosing / mixing skid -->
    ${rr(140, 820, 720, 320, 18, 'url(#machineG)')}
    ${rr(140, 846, 720, 12, 6, 'url(#goldV)')}
    ${circle(340, 980, 92, '#2b3440')}${circle(340, 980, 60, '#39434e')}${circle(340, 980, 24, '#8b98a6')}
    ${rr(520, 890, 300, 150, 12, '#39434e')}
    ${range(5).map((i) => rr(546, 914 + i * 24, 180 - i * 20, 12, 5, ['#2ecc71', '#f0b429', '#5b6673', '#5b6673', '#5b6673'][i])).join('')}

    <!-- stainless hoppers on a frame -->
    ${hopper(1240, 300, 460)}
    ${hopper(1740, 360, 380)}
    ${hopper(2140, 300, 340)}
    ${hose(1330, 700, 640, 900)}
    ${hose(1810, 760, 900, 950)}

    <!-- extruder inlet throat -->
    <polygon points="2320,760 2520,760 2560,920 2280,920" fill="url(#steelP)"/>
    ${rr(2340, 920, 200, 130, 14, 'url(#machineG)')}

    <!-- granule heaps on pallets -->
    ${rr(180, 1200, 700, 60, 10, '#8b7355', 'opacity="0.9"')}
    ${granuleHeap(340, 1180, 230, '#e8ecf1', 90, 7)}
    ${granuleHeap(700, 1190, 190, '#20262e', 80, 23)}
    ${rr(980, 1210, 560, 56, 10, '#8b7355', 'opacity="0.9"')}
    ${granuleHeap(1160, 1190, 200, '#d9b23f', 80, 41)}
    ${granuleHeap(1400, 1200, 160, '#e8ecf1', 70, 61)}

    <!-- big bags with PWI print -->
    ${rr(1720, 940, 300, 340, 18, '#e9edf2')}
    ${rr(1740, 962, 260, 90, 10, '#ffffff', 'opacity="0.8"')}
    ${text(1870, 1022, 'PWI', 46, '#a97b12', 'text-anchor="middle" font-weight="800"')}
    ${text(1870, 1130, 'PVC RESIN', 26, '#55647a', 'text-anchor="middle" font-weight="700" letter-spacing="3"')}
    ${range(4).map((i) => line(1746, 1180 + i * 24, 1994, 1180 + i * 24, '#c3ccd6', 8)).join('')}
    ${rr(2060, 980, 270, 300, 16, '#dde3ea')}
    ${text(2195, 1140, 'MASTERBATCH', 22, '#55647a', 'text-anchor="middle" font-weight="700" letter-spacing="2"')}

    ${signPlate(660, 60, 800, 110, 'POLYMER SECTION', 'GRANULES &amp; PVC')}

    <g opacity="0.10" filter="url(#blur24)" transform="translate(0,2300) scale(1,-1)">
      ${rr(140, 820, 720, 320, 18, '#000000')}
    </g>
    ${star(1240, 470, 28)}${star(700, 950, 26)}${star(2140, 460, 24)}`,
  );
};

/* ---------------------------------------------------------------- scene 15
   Maintenance & CNC workshop: lathe, tooling bench, pegboard tools */
const scene15 = () => {
  const wrench = (x, y, a, l) =>
    `<g transform="translate(${x},${y}) rotate(${a})">` +
    `${rr(-9, 0, 18, l, 9, 'url(#chromeV)')}` +
    `<path d="M -22 0 a 22 22 0 0 1 44 0 l -12 0 a 10 10 0 0 0 -20 0 Z" fill="url(#chromeV)"/>` +
    `</g>`;

  const benchTool = (x, y, kind) => {
    if (kind === 'gear')
      return `${gearMark(x, y, 54, 10, '#c3ccd6', '#5f6a76', '')}${circle(x, y, 18, '#39434e')}`;
    if (kind === 'ring')
      return `${circle(x, y, 44, 'none', 'stroke="url(#chromeV)" stroke-width="20"')}${circle(x, y, 44, 'none', 'stroke="#ffffff" stroke-width="5" opacity="0.55"')}`;
    return `${rr(x - 70, y - 14, 140, 28, 14, 'url(#chromeV)')}${rr(x - 60, y - 9, 100, 6, 3, '#ffffff', 'opacity="0.85"')}`;
  };

  return page(
    hallDefs +
      `<linearGradient id="cncG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa7b4"/><stop offset=".12" stop-color="#5d6a78"/><stop offset=".5" stop-color="#3d4855"/><stop offset=".85" stop-color="#4b5764"/><stop offset="1" stop-color="#2b3440"/></linearGradient>
       <linearGradient id="peg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7b8794"/><stop offset="1" stop-color="#59636f"/></linearGradient>
       <linearGradient id="benchTop2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7fa"/><stop offset="1" stop-color="#ccd5de"/></linearGradient>`,
    `
    ${rect(0, 0, W, 820, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(300)}
    ${lampRow(380, 560, 5)}
    ${rect(0, 820, W, 620, 'url(#floorG)')}
    ${rect(0, 1148, W, 24, '#d9a520', 'opacity="0.5"')}
    ${rect(0, 560, W, 300, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- CNC turning centre -->
    ${rr(160, 420, 980, 560, 22, 'url(#cncG)')}
    ${rr(160, 452, 980, 14, 7, 'url(#goldV)')}
    ${rr(140, 390, 1020, 44, 14, '#a3b0bd')}
    <!-- window -->
    ${rr(220, 500, 560, 380, 18, '#1c242e')}
    ${rr(234, 514, 532, 352, 14, '#28323e')}
    <!-- chuck + part inside -->
    ${circle(430, 690, 110, '#5f6a76')}${circle(430, 690, 74, '#39434e')}
    ${range(3)
      .map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return rr(430 + Math.cos(a) * 84 - 20, 690 + Math.sin(a) * 84 - 26, 40, 52, 6, '#8b98a6');
      })
      .join('')}
    ${rr(540, 668, 210, 44, 22, 'url(#chromeV)')}
    ${rr(540, 662, 210, 12, 6, '#ffffff', 'opacity="0.8"')}
    <!-- coolant spray -->
    ${range(5).map((i) => line(700, 560 + i * 16, 620, 640 + i * 20, '#bfe2f0', 6, 'opacity="0.55" stroke-linecap="round"')).join('')}
    ${rr(244, 514, 240, 30, 6, '#ffffff', 'opacity="0.16"')}
    <!-- control pendant -->
    ${rr(830, 470, 280, 300, 14, '#39434e')}
    ${rr(850, 492, 240, 130, 8, '#0f1720')}
    <path d="M 866 596 L 916 560 L 962 578 L 1014 530 L 1070 548" fill="none" stroke="#7fd8c0" stroke-width="5"/>
    ${range(3).map((i) => rr(854, 646 + i * 34, 74, 22, 6, ['#2ecc71', '#f0b429', '#5b6673'][i])).join('')}
    ${range(3).map((i) => rr(948, 646 + i * 34, 74, 22, 6, '#5b6673')).join('')}
    ${text(1100, 940, 'CNC-01', 30, '#dfe6ee', 'text-anchor="end" font-weight="700" letter-spacing="4" opacity="0.85"')}

    <!-- pegboard + hanging tools -->
    ${rr(1300, 380, 640, 430, 14, 'url(#peg)')}
    ${range(10)
      .map((i) => range(6).map((j) => circle(1330 + i * 62, 412 + j * 66, 5, '#39434e', 'opacity="0.8"')).join(''))
      .join('')}
    ${wrench(1400, 420, -8, 240)}${wrench(1540, 430, 5, 200)}${wrench(1680, 420, -4, 260)}${wrench(1840, 440, 9, 190)}
    ${rr(1330, 720, 300, 60, 10, '#46515e')}
    ${range(5).map((i) => rr(1350 + i * 58, 730, 44, 40, 6, ['#c3ccd6', '#8b98a6', '#c3ccd6', '#8b98a6', '#c3ccd6'][i])).join('')}

    <!-- steel workbench with vise + parts -->
    ${rr(1240, 900, 1280, 54, 12, 'url(#benchTop2)')}
    ${rr(1240, 954, 1280, 26, 8, '#9aa5b0')}
    ${range(5).map((i) => rr(1300 + i * 300, 980, 44, 320, 8, '#8b97a3')).join('')}
    <!-- vise -->
    ${rr(1320, 810, 240, 90, 12, 'url(#machineG)')}
    ${rr(1336, 790, 90, 44, 8, '#8b98a6')}${rr(1456, 790, 90, 44, 8, '#8b98a6')}
    ${line(1440, 770, 1560, 770, '#c3ccd6', 16, 'stroke-linecap="round"')}
    ${circle(1440, 770, 22, 'url(#chromeV)')}
    <!-- parts + toolbox -->
    ${benchTool(1760, 856, 'gear')}${benchTool(1920, 866, 'ring')}${benchTool(2060, 860, 'bar')}
    ${rr(2200, 800, 300, 100, 12, '#59636f')}
    ${rr(2200, 786, 300, 30, 10, '#6d7883')}
    ${rr(2300, 776, 100, 18, 8, 'url(#goldV)')}

    <!-- tooling cabinet -->
    ${rr(2000, 420, 420, 350, 14, '#46515e')}
    ${range(6).map((i) => rr(2024, 444 + i * 52, 372, 42, 8, '#5f6a76')).join('')}
    ${range(6).map((i) => rr(2160, 458 + i * 52, 100, 12, 6, '#c3ccd6')).join('')}

    ${signPlate(1240, 60, 800, 110, 'MAINTENANCE', 'CNC &amp; TOOLROOM')}

    <g opacity="0.12" filter="url(#blur24)" transform="translate(0,1990) scale(1,-1)">
      ${rr(160, 420, 980, 560, 22, '#000000')}
    </g>
    ${star(430, 580, 26)}${star(1760, 830, 24)}`,
  );
};

/* ---------------------------------------------------------------- scene 16
   Packing & dispatch: racking, cartons, pallets, dock */
const scene16 = () => {
  const carton = (x, y, w, h) =>
    `${rr(x, y, w, h, 8, '#c9a06a')}${rr(x, y, w, h, 8, 'none', 'stroke="#a8824f" stroke-width="4"')}` +
    `${rect(x + w * 0.46, y, w * 0.08, h, '#e3cba4', 'opacity="0.85"')}` +
    `${rr(x + 14, y + h * 0.3, w - 28, h * 0.3, 6, '#f4ede2')}` +
    `${text(x + w / 2, y + h * 0.44, 'PWI', Math.min(40, w * 0.24), '#a97b12', 'text-anchor="middle" font-weight="800"')}` +
    `${text(x + w / 2, y + h * 0.56, 'WIRE &#183; SPOKES', Math.min(18, w * 0.12), '#55647a', 'text-anchor="middle" font-weight="700" letter-spacing="1"')}` +
    `${rr(x + 16, y + h - 34, 70, 20, 4, '#ffffff')}` +
    range(5).map((i) => line(x + 24 + i * 12, y + h - 30, x + 24 + i * 12, y + h - 18, '#39434e', 3)).join('');

  const wrappedCoil = (cx, cy, r) =>
    `${circle(cx, cy, r, '#39434e')}` +
    range(7)
      .map((i) => `<ellipse cx="${cx}" cy="${cy}" r="${r - 6 - i * (r * 0.115)}" fill="none" stroke="${i % 2 ? '#5a6472' : '#222a34'}" stroke-width="${r * 0.1}" opacity="0.96"/>`)
      .join('') +
    `${circle(cx, cy, r, 'none', `stroke="#aeb9c4" stroke-width="${r * 0.08}" opacity="0.85"`)}${circle(cx, cy, r * 0.26, '#8b98a6')}${circle(cx, cy, r * 0.11, '#39434e')}` +
    `<path d="M ${cx - r * 0.72} ${cy - r * 0.3} A ${r} ${r} 0 0 1 ${cx - r * 0.18} ${cy - r * 0.97}" fill="none" stroke="#ffffff" stroke-width="${r * 0.09}" opacity="0.5" stroke-linecap="round"/>`;

  const rackBay = (x, w, shelves) => `
    ${rr(x, 340, 40, 900, 8, '#c0392b', 'opacity="0.9"')}${rr(x + w - 40, 340, 40, 900, 8, '#c0392b', 'opacity="0.9"')}
    ${range(shelves)
      .map((s) => {
        const y = 420 + s * 250;
        return `${rr(x, y, w, 30, 6, '#5f6a76')}${rr(x, y - 8, w, 12, 4, '#d9a520', 'opacity="0.75"')}` +
          (s % 2
            ? `${carton(x + 60, y - 170, 220, 170)}${carton(x + 320, y - 150, 180, 150)}`
            : `${wrappedCoil(x + 170, y - 90, 90)}${carton(x + 320, y - 150, 180, 150)}`);
      })
      .join('')}`;

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 900, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(200)}
    ${lampRow(320, 500, 6)}
    ${rect(0, 900, W, 540, 'url(#floorG)')}
    <g opacity="0.4">${range(10).map((i) => rr(20 + i * 280, 1250, 170, 14, 7, '#d9a520')).join('')}</g>
    ${rect(0, 700, W, 260, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- open dock door with trailer backed in -->
    ${rr(1760, 380, 740, 640, 12, '#78909f')}
    ${rr(1790, 410, 680, 590, 8, '#cfe0ea')}
    ${rr(1790, 410, 680, 590, 8, '#ffffff', 'opacity="0.35"')}
    ${rr(1900, 520, 520, 460, 10, '#dde3ea')}
    ${rr(1930, 560, 460, 180, 8, '#aab6c2')}
    ${text(2160, 670, 'PWI DISPATCH', 40, '#39434e', 'text-anchor="middle" font-weight="800" letter-spacing="4"')}
    ${circle(1960, 960, 60, '#2b3440')}${circle(1960, 960, 26, '#8b98a6')}
    ${circle(2360, 960, 60, '#2b3440')}${circle(2360, 960, 26, '#8b98a6')}

    <!-- racking bays -->
    ${rackBay(80, 560, 4)}
    ${rackBay(700, 560, 4)}

    <!-- forklift -->
    <g transform="translate(1340,860)">
      ${rr(0, 180, 420, 220, 26, '#d9a520')}
      ${rr(20, 60, 200, 200, 18, '#c8941a')}
      ${rr(44, 86, 150, 96, 12, '#28323e')}
      ${rr(60, 96, 118, 66, 8, '#bfe2f0', 'opacity="0.7"')}
      ${rr(0, 380, 420, 46, 14, '#b8860b')}
      ${circle(90, 440, 66, '#2b3440')}${circle(90, 440, 28, '#8b98a6')}
      ${circle(340, 440, 52, '#2b3440')}${circle(340, 440, 22, '#8b98a6')}
      ${rr(420, 30, 34, 470, 8, '#5f6a76')}${rr(470, 30, 24, 470, 8, '#5f6a76')}
      ${rr(454, 470, 320, 26, 8, '#8b98a6')}${rr(454, 400, 320, 22, 8, '#8b98a6')}
      ${carton(470, 260, 280, 210)}
      ${rr(150, 300, 120, 40, 8, '#20262e')}
      ${circle(176, 320, 12, '#2ecc71')}${circle(212, 320, 12, '#f0b429')}
    </g>

    <!-- pallet stacks foreground -->
    ${[160, 640, 1120].map((x) => `${rr(x, 1180, 380, 40, 8, '#8b7355')}${range(6).map((i) => rr(x + 8 + i * 62, 1186, 46, 26, 4, '#a5875f')).join('')}`).join('')}
    ${wrappedCoil(350, 1140, 130)}
    ${carton(560, 960, 340, 220)}
    ${wrappedCoil(1290, 1120, 110)}
    ${carton(860, 1010, 240, 170)}

    ${signPlate(700, 60, 820, 110, 'PACKING &amp; DISPATCH', 'WAREHOUSE')}

    <g opacity="0.12" filter="url(#blur24)" transform="translate(0,2420) scale(1,-1)">
      ${rr(0, 1180, 1500, 40, 8, '#000000')}
    </g>
    ${star(2160, 470, 28)}${star(1540, 760, 26)}${star(420, 700, 24)}`,
  );
};

/* ---------------------------------------------------------------- scene: welcome-03
   Close-up of mechanical wire drawing dies, die boxes and lubricants */
const sceneDies = () => {
  const gaugeFace = (x, y, r) => `
    ${circle(x, y, r, '#f2f5f8')}${circle(x, y, r, 'none', 'stroke="#8b97a3" stroke-width="6"')}
    ${range(12)
      .map((i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return line(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72, x + Math.cos(a) * r * 0.88, y + Math.sin(a) * r * 0.88, '#5f6a76', 5);
      })
      .join('')}
    ${line(x, y, x + r * 0.52, y - r * 0.44, '#d4af37', 7, 'stroke-linecap="round"')}
    ${circle(x, y, r * 0.1, '#39434e')}`;

  const spareDie = (x, y) => `
    <g transform="translate(${x},${y})">
      ${rr(-46, -110, 92, 220, 12, 'url(#chromeV)')}
      ${rr(-40, -96, 80, 12, 5, '#ffffff', 'opacity="0.5"')}
      ${circle(0, -110, 46, '#c3ccd6')}${circle(0, -110, 18, '#20262e')}
      ${rr(-30, 16, 60, 8, 4, '#6d7883', 'opacity="0.8"')}
    </g>`;

  const powderHeap = (cx, cy, rx, n, seed) => {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return (
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.32}" fill="#d9cdb2"/>` +
      `<ellipse cx="${cx - rx * 0.28}" cy="${cy - rx * 0.12}" rx="${rx * 0.42}" ry="${rx * 0.17}" fill="#f4ecd9" opacity="0.85" filter="url(#blur6)"/>` +
      range(n)
        .map(() => {
          const a = rnd() * Math.PI;
          const r = Math.sqrt(rnd()) * rx * 0.94;
          const x = cx + Math.cos(a + Math.PI) * r;
          const y = cy - Math.abs(Math.sin(a)) * rx * 0.26 * (1 - r / rx) + rnd() * 10;
          return circle(x.toFixed(1), y.toFixed(1), 5 + rnd() * 4, rnd() > 0.7 ? '#f4ecd9' : '#cbbf9f');
        })
        .join('')
    );
  };

  return page(
    hallDefs +
      `<linearGradient id="powderG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe6d0"/><stop offset="1" stop-color="#c9bc9b"/></linearGradient>`,
    `
    ${rect(0, 0, W, 840, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(300)}
    ${lampRow(420, 540, 5)}
    ${rect(0, 840, W, 600, 'url(#floorG)')}
    ${rect(0, 1136, W, 24, '#d9a520', 'opacity="0.55"')}
    ${rect(0, 540, W, 320, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- central die stand: powder hopper + die box + carbide die -->
    ${rr(960, 900, 740, 90, 12, '#2b3440')}
    ${rr(1010, 990, 90, 120, 8, '#39434e')}${rr(1560, 990, 90, 120, 8, '#39434e')}
    ${rr(980, 560, 700, 350, 20, 'url(#machineG)')}
    ${rr(980, 586, 700, 12, 6, 'url(#goldV)')}
    ${rr(960, 530, 740, 44, 14, '#a3b0bd')}
    <polygon points="1120,300 1520,300 1430,530 1210,530" fill="url(#powderG)"/>
    ${rr(1104, 276, 432, 40, 10, '#8b98a6')}
    ${rr(1300, 250, 140, 32, 8, '#a3b0bd')}
    ${rr(1240, 330, 150, 22, 8, '#f4ecd9', 'opacity="0.8"')}
    ${text(1320, 470, 'CaSt&#8322;', 40, '#8a7d5c', 'text-anchor="middle" font-weight="800"')}
    ${rr(1300, 530, 60, 60, 6, 'url(#steelP)')}
    ${circle(1330, 740, 172, 'url(#chromeV)')}
    ${circle(1330, 740, 172, 'none', 'stroke="#ffffff" stroke-width="7" opacity="0.55"')}
    ${circle(1330, 740, 112, 'url(#steelP)')}
    ${circle(1330, 740, 58, '#39434e')}${circle(1330, 740, 34, '#20262e')}
    ${rr(940, 660, 52, 160, 8, '#39434e')}
    ${['1060,90,0.24', '1180,120,0.3', '1500,80,0.2']
      .map((c) => {
        const [x, w, o] = c.split(',');
        return `<ellipse cx="${x}" cy="620" rx="${w}" ry="56" fill="#e9ddc2" opacity="${o}" filter="url(#blur24)"/>`;
      })
      .join('')}

    <!-- pay-off coil: thick rod entering, fine wire exiting to the capstan -->
    <polygon points="240,1040 330,660 420,1040" fill="#3c4650"/>
    ${circle(330, 720, 150, 'none', 'stroke="#aeb9c4" stroke-width="26"')}
    ${circle(330, 720, 150, 'none', 'stroke="#e8eef4" stroke-width="7" opacity="0.8"')}
    ${circle(330, 720, 62, 'none', 'stroke="#7c8794" stroke-width="14"')}
    <path d="M 470 762 C 700 782 900 756 1156 746" fill="none" stroke="#98a4b0" stroke-width="27" stroke-linecap="round"/>
    <path d="M 472 754 C 702 774 902 748 1158 738" fill="none" stroke="#e8eef4" stroke-width="7" opacity="0.85" stroke-linecap="round"/>
    ${star(1160, 744, 30)}
    <path d="M 1502 740 C 1740 730 1900 716 2120 704" fill="none" stroke="#e9eff5" stroke-width="13" stroke-linecap="round"/>
    <path d="M 1502 734 C 1742 724 1902 710 2122 698" fill="none" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round"/>
    ${star(1520, 742, 26)}
    ${rr(2140, 780, 300, 280, 16, 'url(#machineG)')}
    ${circle(2290, 880, 128, 'url(#drumFace)')}
    ${circle(2290, 880, 128, 'none', 'stroke="#e8eef4" stroke-width="6"')}
    ${circle(2290, 880, 40, '#39434e')}
    <path d="M 2120 704 C 2200 700 2250 760 2266 800" fill="none" stroke="#e9eff5" stroke-width="12" stroke-linecap="round"/>

    <!-- spare dies on the bench + lubricant powder samples -->
    ${rr(220, 1010, 700, 44, 10, 'url(#steelP)')}
    ${rr(220, 1054, 700, 22, 6, '#9aa5b0')}
    ${range(4).map((i) => rr(280 + i * 160, 1076, 40, 150, 8, '#8b97a3')).join('')}
    ${spareDie(330, 896)}${spareDie(490, 892)}${spareDie(650, 896)}${spareDie(810, 892)}
    ${rr(1740, 1280, 800, 46, 8, '#8b7355', 'opacity="0.85"')}
    ${powderHeap(1900, 1290, 210, 70, 11)}
    ${powderHeap(2260, 1310, 160, 55, 47)}

    <!-- dial gauge measuring the exiting wire -->
    ${rr(1980, 900, 26, 260, 8, '#5f6a76')}
    ${rr(1930, 1140, 126, 26, 8, '#5f6a76')}
    ${line(1993, 900, 1993, 728, '#c3ccd6', 10)}
    ${gaugeFace(1993, 620, 108)}
    ${text(1993, 1052, 'WIRE &#216;', 26, '#55647a', 'text-anchor="middle" font-weight="700" letter-spacing="3"')}

    ${cabinet(60, 620, 170, 380)}
    ${signPlate(760, 40, 840, 110, 'DRAWING DIES', 'DIES &amp; LUBRICANTS')}

    <g opacity="0.10" filter="url(#blur24)" transform="translate(0,2140) scale(1,-1)">
      ${rr(980, 560, 700, 350, 20, '#000000')}${rr(2140, 780, 300, 280, 16, '#000000')}
    </g>
    ${star(650, 940, 24)}${star(1330, 604, 26)}`,
  );
};

/* ---------------------------------------------------------------- scene: welcome-06
   Thread rolling machine + nipple alignment jig — bike spoke division */
const sceneThreadRoll = () => {
  const dieRoll = (cx, cy, r) => `
    ${circle(cx, cy, r, 'url(#drumFace)')}
    ${circle(cx, cy, r, 'none', 'stroke="#e8eef4" stroke-width="7"')}
    ${range(20)
      .map((i) => {
        const a = (i / 20) * Math.PI * 2;
        return line(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94, '#6d7883', 9, 'opacity="0.8"');
      })
      .join('')}
    ${circle(cx, cy, r * 0.24, '#39434e')}${circle(cx, cy, r * 0.1, '#20262e')}
    <path d="M ${cx - r * 0.62} ${cy - r * 0.5} A ${r * 0.8} ${r * 0.8} 0 0 1 ${cx + r * 0.16} ${cy - r * 0.79}" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.5" stroke-linecap="round"/>`;

  const nipple = (x, y, s = 1) => `
    <g transform="translate(${x},${y}) scale(${s})">
      <polygon points="-20,0 20,0 15,-52 -15,-52" fill="url(#chromeV)"/>
      <polygon points="-20,0 20,0 15,-12 -15,-12" fill="#6d7883" opacity="0.6"/>
      ${range(3).map((i) => rr(-14, -46 + i * 11, 28, 4, 2, '#8b97a3', 'opacity="0.75"')).join('')}
      <ellipse cx="0" cy="-52" rx="15" ry="5" fill="#dfe6ee"/>
      <ellipse cx="0" cy="-52" rx="6" ry="2.4" fill="#2b3440"/>
      ${rr(-16, -22, 32, 4, 2, '#ffffff', 'opacity="0.55"')}
    </g>`;

  const jigPlate = (x, y, w, h, cols, rows) => `
    ${rr(x, y, w, h, 12, '#5f6a76')}
    ${rr(x, y, w, 12, 6, '#8b98a6', 'opacity="0.8"')}
    ${range(cols * rows)
      .map((i) => {
        const cxi = x + 44 + (i % cols) * ((w - 88) / (cols - 1));
        const cyi = y + 52 + Math.floor(i / cols) * ((h - 96) / Math.max(1, rows - 1));
        return `${circle(cxi, cyi, 21, '#2b3440')}${nipple(cxi, cyi + 16, 0.66)}`;
      })
      .join('')}`;

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 820, 'url(#wallG)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(240)}
    ${lampRow(400, 540, 5)}
    ${rect(0, 820, W, 620, 'url(#floorG)')}
    ${rect(0, 1120, W, 24, '#d9a520', 'opacity="0.55"')}
    ${rect(0, 540, W, 300, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- blank feed rail: rod blanks sliding into the rolls -->
    <polygon points="60,560 420,620 420,660 60,600" fill="#46515e"/>
    ${range(6)
      .map((i) => rr(90 + i * 56, 566 + i * 9, 46, 7, 3.5, '#dfe6ee', 'opacity="0.9"'))
      .join('')}

    <!-- thread rolling machine: two dies rolling the thread onto the blank -->
    ${rr(440, 540, 780, 470, 20, 'url(#machineG)')}
    ${rr(440, 566, 780, 12, 6, 'url(#goldV)')}
    ${rr(420, 510, 820, 44, 14, '#a3b0bd')}
    ${rr(480, 948, 700, 62, 10, '#2b3440')}
    ${dieRoll(700, 740, 152)}
    ${dieRoll(1000, 740, 152)}
    ${rr(300, 728, 1000, 22, 11, 'url(#chromeV)')}
    ${rr(316, 732, 968, 6, 3, '#ffffff', 'opacity="0.85"')}
    ${range(24)
      .map((i) => line(760 + i * 10, 730, 764 + i * 10, 748, '#6d7883', 3, 'opacity="0.8"'))
      .join('')}
    ${circle(320, 739, 26, 'url(#chromeV)')}${circle(320, 739, 10, '#39434e')}
    ${star(860, 716, 26)}${star(920, 768, 22, 0.8)}
    ${circle(850, 500, 86, 'url(#drumFace)')}
    ${circle(850, 500, 86, 'none', 'stroke="#e8eef4" stroke-width="5"')}
    ${range(10)
      .map((i) => {
        const a = (i / 10) * Math.PI * 2;
        return line(850 + Math.cos(a) * 20, 500 + Math.sin(a) * 20, 850 + Math.cos(a) * 72, 500 + Math.sin(a) * 72, '#7c8794', 8);
      })
      .join('')}
    ${rr(1130, 620, 150, 200, 12, '#39434e')}
    ${range(4).map((i) => rr(1148, 644 + i * 36, 100 - i * 14, 14, 5, ['#2ecc71', '#f0b429', '#5b6673', '#5b6673'][i])).join('')}

    <!-- threaded spoke exiting onto the collection rail -->
    <path d="M 1220 739 L 1560 739" fill="none" stroke="#e9eff5" stroke-width="14" stroke-linecap="round"/>
    ${range(20)
      .map((i) => line(1240 + i * 15, 732, 1244 + i * 15, 746, '#8b97a3', 3, 'opacity="0.85"'))
      .join('')}
    ${rr(1540, 720, 30, 150, 8, '#5f6a76')}
    ${rr(1240, 860, 420, 130, 12, '#333d49')}
    <polygon points="1240,860 1660,860 1620,828 1280,828" fill="#3d4855"/>
    ${range(9)
      .map((i) => {
        const x = 1280 + ((i * 97) % 340);
        const y = 872 + ((i * 41) % 40);
        return `<g transform="translate(${x},${y}) rotate(${-8 + ((i * 31) % 16)})">${rr(0, -8, 300, 16, 8, 'url(#chromeV)')}${range(8).map((j) => line(220 + j * 8, -7, 223 + j * 7, 7, '#6d7883', 2.6, 'opacity="0.8"')).join('')}</g>`;
      })
      .join('')}

    <!-- nipple alignment station: jig plates with seated nipples -->
    ${rr(1660, 620, 840, 460, 16, '#46515e')}
    ${rr(1640, 590, 880, 44, 12, '#a3b0bd')}
    ${jigPlate(1700, 660, 380, 180, 8, 3)}
    ${jigPlate(2120, 660, 340, 180, 7, 3)}
    ${jigPlate(1700, 880, 760, 170, 14, 2)}
    ${rr(1660, 1080, 840, 56, 10, '#2b3440')}
    ${nipple(1760, 1270, 1.5)}${nipple(1880, 1290, 1.35)}${nipple(2000, 1272, 1.5)}${nipple(2120, 1292, 1.3)}
    ${rr(2180, 1180, 300, 14, 7, 'url(#chromeV)')}
    ${circle(2470, 1187, 16, '#d4af37')}

    ${cabinet(120, 640, 170, 360)}
    ${signPlate(700, 40, 880, 110, 'THREAD ROLLING', 'NIPPLE ALIGNMENT')}

    <g opacity="0.12" filter="url(#blur24)" transform="translate(0,2130) scale(1,-1)">
      ${rr(440, 540, 780, 470, 20, '#000000')}${rr(1660, 620, 840, 460, 16, '#000000')}
    </g>
    ${star(2200, 630, 24)}${star(560, 480, 24)}`,
  );
};

/* ---------------------------------------------------------------- scene: welcome-07
   Plating section: zinc & chrome electroplating baths with hanging racks */
const scenePlating = () => {
  const hood = (cx) => `
    <polygon points="${cx - 200},320 ${cx + 200},320 ${cx + 130},470 ${cx - 130},470" fill="url(#steelP)"/>
    ${rr(cx - 46, 180, 92, 150, 8, 'url(#steelP)')}
    ${rr(cx - 60, 160, 120, 32, 8, '#8b98a6')}`;

  const hangBundle = (cx, topY, botY, n) => `
    ${circle(cx, topY - 26, 22, 'none', 'stroke="#8b97a3" stroke-width="10"')}
    ${rr(cx - 90, topY, 180, 16, 6, '#c3ccd6')}
    ${range(n)
      .map((i) => {
        const x = cx - 70 + i * (140 / (n - 1));
        return `${line(x, topY + 16, x, botY, i % 2 ? '#e9eff5' : '#aeb9c4', 9, 'stroke-linecap="round"')}${line(x - 1.6, topY + 16, x - 1.6, botY, '#ffffff', 3, 'opacity="0.8"')}`;
      })
      .join('')}`;

  const bath = (x, w, liqGrad, label) => `
    ${rr(x, 780, w, 320, 12, 'url(#steelP)')}
    ${rr(x + 18, 796, w - 36, 120, 8, `url(#${liqGrad})`)}
    ${rr(x + 24, 800, w - 48, 26, 6, '#ffffff', 'opacity="0.8"')}
    ${range(7)
      .map((i) => `<ellipse cx="${x + 70 + i * 76}" cy="836" rx="26" ry="7" fill="#ffffff" opacity="0.5" filter="url(#blur6)"/>`)
      .join('')}
    ${rr(x + 18, 916, w - 36, 150, 8, '#5f6a76', 'opacity="0.6"')}
    ${range(4)
      .map((i) => circle(x + 70 + i * 90, 960 + (i % 2) * 44, 12, '#8b98a6', 'opacity="0.85"'))
      .join('')}
    ${text(x + w / 2, 1150, label, 30, '#dfe6ee', 'text-anchor="middle" font-weight="800" letter-spacing="5" opacity="0.9"')}`;

  return page(
    hallDefs +
      `<linearGradient id="zincLiq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8fb"/><stop offset=".45" stop-color="#c3ccd6"/><stop offset="1" stop-color="#7c8794"/></linearGradient>
       <linearGradient id="chromeLiq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f3fb"/><stop offset=".45" stop-color="#a9c9df"/><stop offset="1" stop-color="#5f88a6"/></linearGradient>`,
    `
    ${rect(0, 0, W, 800, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(280)}
    ${lampRow(460, 540, 4)}
    ${rect(0, 800, W, 640, 'url(#floorG)')}
    ${rect(0, 1122, W, 24, '#d9a520', 'opacity="0.5"')}
    ${rect(0, 520, W, 320, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- overhead hoist rail + trolley -->
    ${rect(0, 300, W, 34, '#5f6a76')}
    ${rr(980, 334, 190, 90, 10, '#46515e')}
    ${circle(1010, 424, 16, '#d9a520')}${circle(1140, 424, 16, '#d9a520')}

    ${hood(620)}${hood(1330)}${hood(2040)}

    <!-- baths: acid zinc · bright zinc · chrome -->
    ${bath(300, 620, 'zincLiq', 'ACID ZINC')}
    ${bath(1010, 620, 'zincLiq', 'BRIGHT ZINC')}
    ${bath(1720, 620, 'chromeLiq', 'CHROME')}

    <!-- copper bus bars across the tanks -->
    ${line(280, 762, 2360, 762, '#d9a520', 12, 'opacity="0.95"')}
    ${line(280, 754, 2360, 754, '#f0c75e', 4, 'opacity="0.9"')}
    ${range(9).map((i) => rr(340 + i * 250, 748, 26, 28, 6, '#8b6b1e')).join('')}

    <!-- hanging racks of spokes dipping into the baths -->
    ${hangBundle(620, 430, 880, 6)}
    ${hangBundle(1330, 430, 880, 6)}
    ${hangBundle(2040, 430, 880, 6)}

    ${['620,120,0.16', '1330,150,0.2', '2040,110,0.16']
      .map((c) => {
        const [x, w, o] = c.split(',');
        return `<ellipse cx="${x}" cy="520" rx="${w}" ry="70" fill="#ffffff" opacity="${o}" filter="url(#blur24)"/>`;
      })
      .join('')}

    <!-- rectifier + feeder cables -->
    ${cabinet(2330, 560, 180, 420)}
    <path d="M 2360 640 C 2200 620 2100 700 2020 754" fill="none" stroke="#20262e" stroke-width="14" stroke-linecap="round"/>
    <path d="M 2380 660 C 2240 650 2160 720 2100 754" fill="none" stroke="#c0392b" stroke-width="9" stroke-linecap="round"/>
    ${text(2420, 1042, '24V DC', 26, '#d4af37', 'text-anchor="middle" font-weight="800" letter-spacing="3"')}

    <!-- rinse tank foreground -->
    ${rr(120, 1180, 620, 130, 12, 'url(#steelP)')}
    ${rr(138, 1192, 584, 52, 8, '#9fc3d8', 'opacity="0.9"')}
    ${rr(144, 1196, 572, 16, 6, '#d7ecf7', 'opacity="0.9"')}
    ${text(430, 1300, 'RINSE', 24, '#8b97a3', 'text-anchor="middle" font-weight="700" letter-spacing="4"')}

    ${signPlate(660, 40, 900, 110, 'PLATING SECTION', 'ZINC &amp; CHROME')}

    <g opacity="0.10" filter="url(#blur24)" transform="translate(0,2260) scale(1,-1)">
      ${rr(300, 780, 620, 320, 12, '#000000')}${rr(1720, 780, 620, 320, 12, '#000000')}
    </g>
    ${star(620, 700, 26)}${star(2040, 690, 24)}${star(1330, 860, 22, 0.8)}`,
  );
};

/* ---------------------------------------------------------------- scene: welcome-11
   Multi-size outer casing inventory: racks of coils sorted by diameter */
const sceneInventory = () => {
  const coilR = (cx, cy, r) =>
    `${range(4)
      .map((i) => `<circle cx="${cx}" cy="${cy}" r="${r - i * (r * 0.19)}" fill="none" stroke="#232a33" stroke-width="${r * 0.17}" stroke-dasharray="13 10"/>`)
      .join('')}` +
    `${range(4)
      .map((i) => `<circle cx="${cx}" cy="${cy}" r="${r - i * (r * 0.19)}" fill="none" stroke="#59626d" stroke-width="6" stroke-dasharray="13 10" opacity="0.8"/>`)
      .join('')}` +
    `${circle(cx, cy, r * 0.28, 'none', 'stroke="#39434e" stroke-width="16"')}`;

  const bay = (x, w, tiers, sizes) => `
    ${rr(x, 330, 44, 830, 8, '#5f6a76')}${rr(x + w - 44, 330, 44, 830, 8, '#5f6a76')}
    ${range(tiers)
      .map((t) => {
        const y = 500 + t * 205;
        return (
          `${rr(x, y, w, 26, 6, '#8b98a6')}${rr(x, y - 8, w, 10, 4, '#d9a520', 'opacity="0.7"')}` +
          range(3)
            .map((k) => coilR(x + 120 + k * 250, y - 84, 80))
            .join('') +
          `${rr(x + w / 2 - 75, y - 6, 150, 38, 6, '#1d2a3a')}` +
          `${rr(x + w / 2 - 75, y - 6, 150, 38, 6, 'none', 'stroke="#d4af37" stroke-width="2"')}` +
          `${text(x + w / 2, y + 22, `&#8960;${sizes[t]}mm`, 26, '#f2f5f8', 'text-anchor="middle" font-weight="800"')}`
        );
      })
      .join('')}`;

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 860, 'url(#wallG)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(200)}
    ${lampRow(360, 540, 5)}
    ${rect(0, 860, W, 580, 'url(#floorG)')}
    ${rect(0, 1160, W, 22, '#d9a520', 'opacity="0.5"')}
    ${rect(0, 520, W, 320, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- inventory racking bays: 16 / 20 / 25 / 32 / 40 / 50 mm families -->
    ${bay(80, 760, 4, ['16', '20', '25', '32'])}
    ${bay(900, 760, 4, ['20', '25', '32', '40'])}
    ${bay(1720, 760, 4, ['25', '32', '40', '50'])}

    <!-- foreground pallet with hero coil + diameter callout -->
    ${rr(760, 1230, 620, 44, 8, '#8b7355', 'opacity="0.9"')}
    ${range(6).map((i) => rr(770 + i * 100, 1236, 76, 30, 4, '#a5875f')).join('')}
    ${coilR(1060, 1120, 150)}
    ${line(940, 1120, 1180, 1120, '#d4af37', 5, 'stroke-dasharray="14 10"')}
    <polygon points="940,1120 964,1110 964,1130" fill="#d4af37"/>
    <polygon points="1180,1120 1156,1110 1156,1130" fill="#d4af37"/>
    ${text(1060, 1064, '&#8960;40 &#183; 100m', 34, '#f0c75e', 'text-anchor="middle" font-weight="800"')}

    <!-- hand pallet truck -->
    <g transform="translate(1500,1180)">
      ${rr(0, 60, 360, 40, 10, '#d9a520')}
      ${rr(0, 40, 140, 26, 8, '#c8941a')}
      ${circle(60, 116, 26, '#2b3440')}${circle(300, 116, 26, '#2b3440')}
      ${rr(120, -150, 26, 210, 8, '#5f6a76')}
      ${rr(100, -160, 80, 24, 8, '#8b98a6')}
    </g>

    ${cabinet(2440, 700, 150, 340)}
    ${signPlate(660, 40, 940, 110, 'CASING INVENTORY', 'SORTED BY DIAMETER')}

    <g opacity="0.12" filter="url(#blur24)" transform="translate(0,2400) scale(1,-1)">
      ${rr(80, 330, 760, 830, 8, '#000000')}${rr(1720, 330, 760, 830, 8, '#000000')}
    </g>
    ${star(1060, 980, 26)}${star(420, 700, 24)}${star(2100, 690, 22)}`,
  );
};

/* ---------------------------------------------------------------- scene: welcome-12
   Casing text printing + automatic length cutting department */
const scenePrintCut = () => {
  const rollerConv = (x0, x1, y) => `
    ${rr(x0, y, x1 - x0, 54, 12, '#39434e')}
    ${range(8)
      .map((i) => circle(x0 + 70 + i * ((x1 - x0 - 140) / 7), y + 27, 21, 'url(#drumFace)'))
      .join('')}`;

  const cutLen = (x, y, len, a) =>
    `<g transform="translate(${x},${y}) rotate(${a})">` +
    `${rr(-len / 2, -20, len, 40, 20, '#20262e')}` +
    `${rr(-len / 2 + 8, -14, len - 16, 8, 4, '#6d7883', 'opacity="0.7"')}` +
    range(4)
      .map((i) => rr(-len / 2 + 30 + i * (len * 0.22), -8, len * 0.13, 6, 3, '#e9eff5', 'opacity="0.85"'))
      .join('') +
    `</g>`;

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 800, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(240)}
    ${lampRow(420, 540, 5)}
    ${rect(0, 800, W, 640, 'url(#floorG)')}
    ${rect(0, 1128, W, 24, '#d9a520', 'opacity="0.55"')}
    ${rect(0, 520, W, 320, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- the conduit line running through the whole department -->
    <path d="M 60 780 L 2160 780" fill="none" stroke="#20262e" stroke-width="46" stroke-linecap="round"/>
    <path d="M 60 768 L 2160 768" fill="none" stroke="#6d7883" stroke-width="10" opacity="0.6" stroke-linecap="round"/>
    ${rr(360, 700, 200, 170, 14, 'url(#machineG)')}
    ${circle(460, 780, 46, 'url(#drumFace)')}${circle(460, 780, 46, 'none', 'stroke="#e8eef4" stroke-width="5"')}

    <!-- inkjet printing head marking the moving conduit -->
    ${rr(940, 560, 300, 180, 16, 'url(#machineG)')}
    ${rr(940, 584, 300, 10, 5, 'url(#goldV)')}
    <polygon points="1050,740 1130,740 1112,790 1068,790" fill="#46515e"/>
    ${circle(1090, 726, 12, '#2ecc71', 'filter="url(#glowSm)"')}
    ${rr(980, 596, 90, 70, 8, '#20262e')}
    ${circle(1025, 631, 24, 'url(#goldV)')}
    ${range(3).map((i) => rr(1110, 602 + i * 30, 100 - i * 16, 13, 5, ['#2ecc71', '#f0b429', '#5b6673'][i])).join('')}
    ${text(1300, 796, 'PWI &#8960;25 &#183; 50m', 26, '#e9eff5', 'font-weight="700" letter-spacing="2" opacity="0.95"')}

    <!-- measuring encoder wheel + rotary flying-shear cutter -->
    ${rr(685, 706, 30, 130, 8, '#5f6a76')}
    ${circle(700, 692, 66, 'url(#drumFace)')}
    ${circle(700, 692, 66, 'none', 'stroke="#e8eef4" stroke-width="5"')}
    ${range(8)
      .map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return line(700 + Math.cos(a) * 16, 692 + Math.sin(a) * 16, 700 + Math.cos(a) * 54, 692 + Math.sin(a) * 54, '#7c8794', 7);
      })
      .join('')}
    ${rr(1560, 660, 420, 380, 18, 'url(#machineG)')}
    ${rr(1560, 686, 420, 12, 6, 'url(#goldV)')}
    ${circle(1770, 800, 150, 'url(#drumFace)')}
    ${circle(1770, 800, 150, 'none', 'stroke="#e8eef4" stroke-width="7"')}
    ${range(12)
      .map((i) => {
        const a = (i / 12) * Math.PI * 2;
        return `<polygon points="${1770 + Math.cos(a) * 150},${800 + Math.sin(a) * 150} ${1770 + Math.cos(a + 0.18) * 180},${800 + Math.sin(a + 0.18) * 180} ${1770 + Math.cos(a + 0.36) * 150},${800 + Math.sin(a + 0.36) * 150}" fill="#c3ccd6"/>`;
      })
      .join('')}
    ${circle(1770, 800, 40, '#39434e')}${circle(1770, 800, 18, '#20262e')}
    ${star(1900, 830, 30)}

    <!-- cut-to-length pieces on the conveyor + stop gauge -->
    <path d="M 1980 780 L 2160 780" fill="none" stroke="#20262e" stroke-width="44" stroke-linecap="round"/>
    ${rollerConv(2140, 2560, 810)}
    ${cutLen(2230, 772, 300, -3)}${cutLen(2430, 768, 300, 2)}
    ${rr(2050, 640, 44, 200, 10, '#46515e')}
    ${rr(2036, 610, 74, 26, 6, '#39434e')}
    ${circle(2072, 660, 16, '#e74c3c', 'filter="url(#glowSm)"')}

    ${cabinet(120, 580, 170, 400)}
    ${signPlate(680, 40, 900, 110, 'PRINTING &amp; CUTTING', 'CASING DEPARTMENT')}

    <g opacity="0.12" filter="url(#blur24)" transform="translate(0,2090) scale(1,-1)">
      ${rr(940, 560, 300, 180, 16, '#000000')}${rr(1560, 660, 420, 380, 18, '#000000')}
    </g>
    ${star(1090, 560, 24)}${star(640, 780, 22, 0.8)}`,
  );
};

/* ---------------------------------------------------------------- scene: welcome-13
   Wire stranding machines twisting filaments into braided meter wire */
const sceneStranding = () => {
  const bobbin = (cx, cy, r) => `
    <ellipse cx="${cx}" cy="${cy - r * 0.66}" rx="${r}" ry="${r * 0.3}" fill="#8b98a6"/>
    <ellipse cx="${cx}" cy="${cy - r * 0.66}" rx="${r}" ry="${r * 0.3}" fill="none" stroke="#c3ccd6" stroke-width="5"/>
    ${rr(cx - r * 0.5, cy - r * 0.66, r, r * 1.32, 6, '#c9d2dc')}
    ${range(5)
      .map((i) => rr(cx - r * 0.46, cy - r * 0.5 + i * r * 0.24, r * 0.92, r * 0.14, 4, i % 2 ? '#aab6c2' : '#e3e9ef', 'opacity="0.9"'))
      .join('')}
    <ellipse cx="${cx}" cy="${cy + r * 0.66}" rx="${r}" ry="${r * 0.3}" fill="#6d7883"/>
    ${rr(cx - 6, cy - r, 12, r * 2, 4, '#46515e')}`;

  return page(
    hallDefs,
    `
    ${rect(0, 0, W, 800, 'url(#wallG)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(260)}
    ${lampRow(420, 520, 5)}
    ${rect(0, 800, W, 640, 'url(#floorG)')}
    ${rect(0, 1124, W, 24, '#d9a520', 'opacity="0.55"')}
    ${rect(0, 520, W, 320, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- bobbin creel: rows of fine-wire spools feeding the strander -->
    ${rr(140, 420, 720, 660, 16, '#46515e')}
    ${rr(140, 440, 720, 12, 6, '#5f6a76')}
    ${range(16)
      .map((i) => bobbin(230 + (i % 4) * 190, 520 + Math.floor(i / 4) * 160, 66))
      .join('')}
    ${range(16)
      .map((i) => line(230 + (i % 4) * 190 + 60, 520 + Math.floor(i / 4) * 160, 990, 720, '#e9eff5', 3, 'opacity="0.75"'))
      .join('')}

    <!-- closing die + turning stranding barrel -->
    ${rr(950, 640, 140, 170, 12, 'url(#machineG)')}
    ${circle(1020, 720, 46, 'url(#chromeV)')}${circle(1020, 720, 20, '#20262e')}
    ${star(1030, 720, 26)}
    ${rr(1110, 560, 720, 320, 26, 'url(#steelP)')}
    <ellipse cx="1110" cy="720" rx="40" ry="160" fill="#6d7883"/>
    <ellipse cx="1830" cy="720" rx="40" ry="160" fill="#8b98a6"/>
    ${range(6).map((i) => circle(1210 + i * 110, 640, 22, '#39434e')).join('')}
    ${range(6).map((i) => circle(1210 + i * 110, 800, 22, '#39434e')).join('')}
    ${rr(1110, 586, 720, 10, 5, '#ffffff', 'opacity="0.3"')}
    ${rr(1150, 880, 640, 70, 10, '#2b3440')}
    <path d="M 1300 512 A 300 130 0 0 1 1700 512" fill="none" stroke="#d4af37" stroke-width="8" stroke-dasharray="26 18" opacity="0.9"/>
    <polygon points="1716,518 1678,492 1686,532" fill="#d4af37"/>

    <!-- twisted strand exiting to the take-up capstan -->
    <path d="M 1860 720 C 2010 720 2060 760 2140 800" fill="none" stroke="#8b97a3" stroke-width="34" stroke-linecap="round"/>
    <path d="M 1860 720 C 2010 720 2060 760 2140 800" fill="none" stroke="#dfe6ee" stroke-width="26" stroke-linecap="round"/>
    ${range(16)
      .map((i) => {
        const t = i / 16;
        return line((1870 + t * 260).toFixed(1), (722 + t * t * 76 - 13).toFixed(1), (1886 + t * 260).toFixed(1), (722 + t * t * 76 + 13).toFixed(1), '#98a4b0', 6, 'opacity="0.9"');
      })
      .join('')}
    ${rr(2140, 640, 240, 300, 14, 'url(#machineG)')}
    ${circle(2260, 720, 108, 'url(#drumFace)')}
    ${circle(2260, 720, 108, 'none', 'stroke="#e8eef4" stroke-width="5"')}
    ${circle(2260, 720, 34, '#39434e')}
    <path d="M 2140 800 A 108 108 0 0 1 2366 760" fill="none" stroke="#e9eff5" stroke-width="12" stroke-linecap="round"/>
    ${spool(2460, 480, 130, '#dfe6ee')}

    ${cabinet(60, 620, 160, 360)}
    ${signPlate(1360, 40, 960, 110, 'WIRE STRANDING', 'BRAIDED METER WIRE')}

    <g opacity="0.12" filter="url(#blur24)" transform="translate(0,2100) scale(1,-1)">
      ${rr(950, 640, 140, 170, 12, '#000000')}${rr(2140, 640, 240, 300, 14, '#000000')}
    </g>
    ${star(1020, 850, 24)}${star(2260, 600, 22)}`,
  );
};

/* ---------------------------------------------------------------- scene: welcome-16
   Finished inner wires bundled and prepared for control cable assembly */
const sceneBundles = () => {
  const tinnedPiece = (x, y, len, a) =>
    `<g transform="translate(${x},${y}) rotate(${a})">` +
    `${rr(-len / 2, -8, len, 16, 8, 'url(#chromeV)')}` +
    `${rr(-len / 2 + 8, -5, len - 16, 3.6, 2, '#ffffff', 'opacity="0.9"')}` +
    `${circle(len / 2 - 2, 0, 9, '#e9c76a')}${circle(len / 2 - 4, -2, 3.6, '#fff3cf')}</g>`;

  const bundle = (x, y, w, n, a) =>
    `<g transform="translate(${x},${y}) rotate(${a})">` +
    range(n)
      .map((i) => tinnedPiece(0, -14 + (i % 4) * 9 + Math.floor(i / 4) * 3, w, 0))
      .join('') +
    `${rr(-w / 2 + w * 0.24, -34, 22, 84, 6, 'url(#goldV)')}` +
    `${rr(w / 2 - w * 0.24 - 22, -34, 22, 84, 6, 'url(#goldV)')}` +
    `</g>`;

  const basket = (x, y) =>
    `${rr(x, y, 560, 230, 14, '#46515e')}` +
    range(8)
      .map((i) => line(x + 20 + i * 70, y + 12, x + 20 + i * 70, y + 218, '#5f6a76', 7, 'opacity="0.8"'))
      .join('') +
    range(3)
      .map((i) => line(x, y + 60 + i * 60, x + 560, y + 60 + i * 60, '#5f6a76', 7, 'opacity="0.8"'))
      .join('') +
    range(10)
      .map((i) => tinnedPiece(x + 120 + ((i * 89) % 380), y - 6 + ((i * 53) % 60), 170 + ((i * 41) % 60), -10 + ((i * 23) % 20)))
      .join('');

  return page(
    hallDefs +
      `<linearGradient id="benchB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f5f9"/><stop offset="1" stop-color="#c9d2dc"/></linearGradient>`,
    `
    ${rect(0, 0, W, 820, 'url(#wallL)')}
    ${rect(0, 0, W, 240, '#8794a1')}
    ${trussRow()}${skyRow(220)}
    ${lampRow(400, 520, 5)}
    ${rect(0, 820, W, 620, 'url(#floorG)')}
    ${rect(0, 1140, W, 24, '#d9a520', 'opacity="0.5"')}
    ${rect(0, 520, W, 320, '#ffffff', 'opacity="0.05" filter="url(#blur48)"')}

    <!-- overhead storage shelf with bundles stacked ready -->
    ${rr(360, 384, 1560, 26, 6, '#8b98a6')}
    ${rr(360, 376, 1560, 10, 4, '#d9a520', 'opacity="0.6"')}
    ${rr(400, 410, 30, 210, 8, '#5f6a76')}${rr(1850, 410, 30, 210, 8, '#5f6a76')}
    ${bundle(620, 350, 420, 8, -2)}
    ${bundle(1120, 356, 420, 8, 2)}
    ${bundle(1600, 348, 380, 7, -1)}

    <!-- assembly workbench with stacked tinned bundles -->
    ${rr(260, 900, 2040, 56, 12, 'url(#benchB)')}
    ${rr(260, 956, 2040, 24, 8, '#9aa5b0')}
    ${range(6).map((i) => rr(330 + i * 380, 980, 46, 300, 8, '#8b97a3')).join('')}
    ${bundle(700, 850, 620, 12, -3)}
    ${bundle(1400, 858, 620, 12, 2)}
    ${bundle(1060, 766, 560, 10, -1)}
    ${basket(1660, 1060)}
    ${basket(300, 1080)}

    <!-- assembly kit: ferrules, eyelets, casing stub + source spool -->
    ${rr(2360, 820, 200, 90, 12, '#39434e')}
    ${range(6)
      .map((i) => circle(2400 + (i % 3) * 60, 848 + Math.floor(i / 3) * 36, 16, 'none', 'stroke="url(#chromeV)" stroke-width="8"'))
      .join('')}
    <path d="M 2340 1240 C 2440 1240 2500 1160 2560 1120" fill="none" stroke="#20262e" stroke-width="40" stroke-linecap="round"/>
    <path d="M 2340 1228 C 2444 1228 2506 1150 2560 1110" fill="none" stroke="#6d7883" stroke-width="9" opacity="0.6" stroke-linecap="round"/>
    ${spool(220, 620, 150, '#c9d2dc')}
    ${cabinet(2440, 480, 150, 320)}

    ${signPlate(660, 40, 960, 110, 'FINISHED INNER WIRE', 'CABLE ASSEMBLY READY')}

    <g opacity="0.12" filter="url(#blur24)" transform="translate(0,2040) scale(1,-1)">
      ${rr(260, 900, 2040, 56, 12, '#000000')}
    </g>
    ${star(700, 770, 26)}${star(1420, 780, 24)}${star(1060, 660, 22)}`,
  );
};

/* ---------------------------------------------------------------- render
 * ACTIVE slot map — file number == slideshow slot == 3D panel index, split
 * across PWI's 4 core divisions (see the header for the full spec):
 *   01-04 Wire Rod Drawing · 05-08 Spoke · 09-12 Outer Casing · 13-16 Inner Wire
 * Retired scenes (factory gate, cable cutaway, QC lab, wheel lacing, polymer,
 * CNC workshop, dispatch) remain defined above for reference but are NOT
 * rendered. */
const scenes = [
  // 1. WIRE ROD DRAWING DIVISION
  ['welcome-01.jpg', scene7()], // raw wire rod storage yard + incoming coils
  ['welcome-02.jpg', scene2()], // wire drawing machines: rod into fine wire
  ['welcome-03.jpg', sceneDies()], // drawing dies + lubricants, close-up
  ['welcome-04.jpg', scene8()], // annealing & galvanizing furnace lines
  // 2. SPOKE DIVISION / bike spokes
  ['welcome-05.jpg', scene3()], // spoke cutting & head-heading machines
  ['welcome-06.jpg', sceneThreadRoll()], // thread rolling + nipple alignment
  ['welcome-07.jpg', scenePlating()], // zinc & chrome electroplating baths
  ['welcome-08.jpg', scene4()], // macro: finished spokes & nipples
  // 3. OUTER CASING DIVISION
  ['welcome-09.jpg', scene5()], // PVC casing extrusion production line
  ['welcome-10.jpg', scene11()], // rows of finished flexible black conduits
  ['welcome-11.jpg', sceneInventory()], // multi-size casing stock by diameter
  ['welcome-12.jpg', scenePrintCut()], // casing text printing + length cutting
  // 4. INNER WIRE / BRAIDED METER WIRE DIVISION
  ['welcome-13.jpg', sceneStranding()], // stranding machines twisting filaments
  ['welcome-14.jpg', scene13()], // braided core cross-section macro
  ['welcome-15.jpg', scene12()], // inner wire meter-cutting + tinning
  ['welcome-16.jpg', sceneBundles()], // finished wires bundled for assembly
];

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
for (const [file, html] of scenes) {
  await tab.setContent(html, { waitUntil: 'load', timeout: 60000 });
  await tab.waitForTimeout(300);
  await tab.screenshot({ path: OUT + file, type: 'jpeg', quality: 90 });
  console.log('wrote', file);
}
await browser.close();
console.log('done');
