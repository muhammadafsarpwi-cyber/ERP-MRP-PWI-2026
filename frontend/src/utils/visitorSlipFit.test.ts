/**
 * Prompt #19B §4/§5 — the preview fit.
 *
 * The whole mobile-preview fix rests on one function, so it is tested as a pure
 * unit: no DOM, no browser, no guessing about what a transform does to layout.
 */
import { fitSlipToWidth, MIN_SLIP_PREVIEW_SCALE } from './visitorSlipFit';

/** 190mm at the CSS reference resolution of 96dpi. */
const A4_CONTENT_PX = Math.round(190 * (96 / 25.4));
const A4_SLIP_PX = 718;
const A4_SLIP_HEIGHT_PX = 667;

describe('fitSlipToWidth', () => {
  it('uses the A4 content width as the document width the whole module is built around', () => {
    expect(A4_CONTENT_PX).toBe(718);
  });

  // ── The behaviour §4 asks for ─────────────────────────────────────────────
  it('scales the document down to fit a narrow viewport instead of letting it overflow', () => {
    // A 390px phone: modal padding leaves roughly 302px of stage.
    const fit = fitSlipToWidth(A4_SLIP_PX, A4_SLIP_HEIGHT_PX, 302);
    expect(fit.scale).toBeLessThan(1);
    expect(fit.width).toBeCloseTo(302, 1);
    expect(fit.scrolls).toBe(false);
  });

  it('never magnifies: a wide viewport shows the document 1:1', () => {
    const fit = fitSlipToWidth(A4_SLIP_PX, A4_SLIP_HEIGHT_PX, 1400);
    expect(fit.scale).toBe(1);
    expect(fit.width).toBe(A4_SLIP_PX);
    expect(fit.height).toBe(A4_SLIP_HEIGHT_PX);
    expect(fit.scrolls).toBe(false);
  });

  it('stays 1:1 at exactly the A4 width — the printer-equivalent view', () => {
    expect(fitSlipToWidth(A4_SLIP_PX, A4_SLIP_HEIGHT_PX, A4_SLIP_PX).scale).toBe(1);
    // One pixel narrower is enough to start scaling; the fit is continuous.
    expect(fitSlipToWidth(A4_SLIP_PX, A4_SLIP_HEIGHT_PX, A4_SLIP_PX - 1).scale).toBeLessThan(1);
  });

  // ── The floor that keeps the letterhead legible ───────────────────────────
  it('stops shrinking at the legibility floor and lets the frame scroll instead', () => {
    const tiny = fitSlipToWidth(A4_SLIP_PX, A4_SLIP_HEIGHT_PX, 10);
    expect(tiny.scale).toBe(MIN_SLIP_PREVIEW_SCALE);
    expect(tiny.width).toBeGreaterThan(10);
    // Above the available width, so the caller must let the frame scroll.
    expect(tiny.scrolls).toBe(true);
  });

  it('scales proportionally in between', () => {
    // Half the A4 width is half the document.
    const half = fitSlipToWidth(A4_SLIP_PX, A4_SLIP_HEIGHT_PX, A4_SLIP_PX / 2);
    expect(half.scale).toBeCloseTo(0.5, 5);
    expect(half.height).toBeCloseTo(A4_SLIP_HEIGHT_PX / 2, 5);
    expect(half.scrolls).toBe(false);
  });

  // ── Degenerate inputs: first paint, a hidden modal, jsdom ────────────────
  it('falls back to 1:1 when nothing has been measured yet', () => {
    for (const args of [
      [0, 0, 0],
      [A4_SLIP_PX, 0, 302],
      [0, A4_SLIP_HEIGHT_PX, 302],
      [A4_SLIP_PX, A4_SLIP_HEIGHT_PX, 0],
    ]) {
      const fit = fitSlipToWidth(args[0], args[1], args[2]);
      expect(fit.scale).toBe(1);
      expect(fit.scrolls).toBe(false);
    }
  });

  it('never produces NaN or a negative size from junk measurements', () => {
    for (const bad of [NaN, Infinity, -Infinity, -10]) {
      const fit = fitSlipToWidth(bad, bad, bad);
      expect(Number.isFinite(fit.scale)).toBe(true);
      expect(Number.isFinite(fit.width)).toBe(true);
      expect(Number.isFinite(fit.height)).toBe(true);
      expect(fit.width).toBeGreaterThanOrEqual(0);
      expect(fit.height).toBeGreaterThanOrEqual(0);
      expect(fit.scale).toBeGreaterThan(0);
    }
  });

  it('always reports a scale inside the documented range', () => {
    for (const available of [0, 1, 10, 100, 302, 680, 717, 718, 719, 1000, 5000]) {
      const { scale } = fitSlipToWidth(A4_SLIP_PX, A4_SLIP_HEIGHT_PX, available);
      expect(scale).toBeGreaterThanOrEqual(MIN_SLIP_PREVIEW_SCALE);
      expect(scale).toBeLessThanOrEqual(1);
    }
  });

  it('agrees with itself: a non-scrolling fit always fits the width it was given', () => {
    for (const available of [200, 302, 480, 680, 717, 718, 900]) {
      const fit = fitSlipToWidth(A4_SLIP_PX, A4_SLIP_HEIGHT_PX, available);
      if (fit.scrolls) continue;
      expect(fit.width).toBeLessThanOrEqual(available + 0.5);
    }
  });
});
