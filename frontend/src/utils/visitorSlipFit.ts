/**
 * PREVIEW FIT — Prompt #19B §4/§5.
 *
 * THE PROBLEM
 *   The slip is an A4 stationery document: its own CSS gives `.visitor-slip`
 *   `max-width: 190mm` and no `width`, so the box is "as wide as the space it is
 *   given, never wider than A4". In the print frame that space is the A4 content
 *   box and the document is correct. In a phone-sized preview modal it is a
 *   ~320 px column, and the header grid — `auto minmax(0,1fr) auto` — hands the
 *   company name a ~100 px middle track. The letterhead then wrapped as
 *
 *       PAKIS / TAN / WIRE / INDUS / TRIES / (PVT.) / LTD.
 *
 *   Nothing was wrong with the print CSS. The preview was showing a REFLOWED
 *   document, which is both ugly and a lie: it is not the page that prints.
 *
 * THE RULE #19B §4 SETS
 *   • A4 output stays a fixed professional A4 layout — untouched.
 *   • Desktop preview sits comfortably in the desktop modal.
 *   • Mobile preview is SCALED/FITTED, with no page-level horizontal overflow.
 *
 * THE FIX
 *   Pin the slip to its real A4 width in the preview and scale the whole
 *   document down with `transform: scale()`. The internal layout is then
 *   identical to the printed page at every screen size — same header grid, same
 *   400 px company track, same signature box — and there is nothing left to
 *   wrap. The scaling lives in `visitorSlipPreview.css`, OUTSIDE `SLIP_CSS`, so
 *   the print pipeline's stylesheet is not modified at all: the print job is
 *   written into a separate document and never sees these rules.
 *
 *   `transform` does not change layout, so this module also reports the scaled
 *   height and the caller hands it to the frame — otherwise the frame would
 *   reserve the unscaled 900 px and the modal would scroll into empty paper.
 */

/**
 * Floor for the fit. Below roughly a third the letterhead stops being readable
 * at all, so rather than shrink further the frame is allowed to scroll
 * horizontally INSIDE the modal (the same pattern the ERP table uses). In
 * practice this only engages below a ~250 px viewport; at 390 px the fit lands
 * near 0.44 and nothing scrolls.
 */
export const MIN_SLIP_PREVIEW_SCALE = 0.34;

export interface SlipFit {
  /** Multiplier applied to the document with `transform: scale()`. */
  scale: number;
  /** Visual width of the scaled document, in px. */
  width: number;
  /** Visual height of the scaled document, in px. */
  height: number;
  /** True when the floor stopped the document fitting, so the frame scrolls. */
  scrolls: boolean;
}

/**
 * Fit an A4 document of `naturalWidth` x `naturalHeight` into `availableWidth`.
 *
 * `naturalWidth`/`naturalHeight` must be the document's UNSCALED box — read them
 * with `offsetWidth`/`offsetHeight`, which a CSS transform leaves untouched.
 * `getBoundingClientRect()` would return the already-scaled values and the fit
 * would feed back on itself.
 *
 * Pure and dependency-free so it can be asserted directly, including for the
 * degenerate inputs a first paint, a hidden modal or jsdom produce.
 */
export function fitSlipToWidth(
  naturalWidth: number,
  naturalHeight: number,
  availableWidth: number,
): SlipFit {
  const w = Number.isFinite(naturalWidth) ? naturalWidth : 0;
  const h = Number.isFinite(naturalHeight) ? naturalHeight : 0;
  const available = Number.isFinite(availableWidth) ? availableWidth : 0;

  // Nothing measurable yet — show the document unscaled rather than guessing.
  if (w <= 0 || h <= 0 || available <= 0) {
    return { scale: 1, width: Math.max(w, 0), height: Math.max(h, 0), scrolls: false };
  }

  // Never magnify: on a wide desktop the document is shown at 1:1, which is
  // also exactly what the printer will produce.
  const scale = Math.min(1, Math.max(MIN_SLIP_PREVIEW_SCALE, available / w));

  return {
    scale,
    width: w * scale,
    height: h * scale,
    scrolls: w * scale > available + 0.5,
  };
}
