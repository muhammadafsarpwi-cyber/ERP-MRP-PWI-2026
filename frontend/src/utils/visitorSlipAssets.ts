import type { VisitorSlipAssets } from './visitorSlipHtml';

/**
 * SLIP IMAGE LOADER — Prompt #19 §6 / §22 / §26.
 *
 * The visitor photo and the host signature live behind authenticated endpoints
 * (`GET /visitor/entries/:id/photo`, `.../signature`) precisely so they are not
 * public. A slip therefore CANNOT reference them by URL: an `<img src>` would
 * either be unauthenticated or would put a token in the print job's resource
 * list. They are fetched with the caller's session through `apiService.getFile`
 * and inlined as data URLs instead.
 *
 * Every failure path returns `null` rather than throwing. A missing photo, an
 * expired session, an image the browser cannot decode — none of them may stop a
 * visitor from being handed a printed slip (§26).
 */

/** The printed photo is a small ID photo; 640px covers it without a big DOM. */
const MAX_PHOTO_EDGE = 640;
/** A signature is a thin line drawing — 480px is generous and keeps the PNG tiny. */
const MAX_SIGNATURE_EDGE = 480;

/** The 1×1 transparent PNG used as a last-resort stand-in. */
const BLANK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });

/**
 * Downscale to `maxEdge` and return a PNG data URL.
 *
 * This is print quality work, not decoration: it keeps the markup small enough
 * that the hidden print iframe stays responsive, and it is also what guarantees
 * the slip never carries a photo at its original (possibly 5 MB) size. Aspect
 * ratio is preserved by the canvas, and the slip's own CSS letterboxes the
 * result, so the image can never be stretched (§6).
 *
 * Falls back to the undecoded data URL if the environment has no 2D canvas (a
 * test runner, an old browser) — the slip still prints, just larger.
 */
async function toPrintablePng(blob: Blob, maxEdge: number): Promise<string | null> {
  const raw = await readAsDataUrl(blob);
  if (!raw.startsWith('data:')) return null;

  try {
    const image = await loadImage(raw);
    if (!image || !image.naturalWidth || !image.naturalHeight) return raw;

    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return raw;
    // Signature strokes are thin and light: fill the background first so a
    // transparent signature does not print as an invisible smear.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } catch {
    return raw;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Fetch one authorised image and inline it for printing.
 *
 * @param loader  the authenticated fetch, injected so this module stays testable
 *                and so the caller keeps ownership of the session
 * @param path    the authorised endpoint path (NOT an absolute URL)
 */
export async function loadSlipImage(
  loader: (path: string) => Promise<Blob>,
  path: string | null | undefined,
  maxEdge: number,
): Promise<string | null> {
  if (!path) return null;
  try {
    const blob = await loader(path);
    if (!blob || blob.size === 0) return null;
    return await toPrintablePng(blob, maxEdge);
  } catch {
    return null;
  }
}

/** The transparent stand-in, exported so a caller can substitute it in tests. */
export const BLANK_SLIP_IMAGE = BLANK_PNG;

/**
 * Load every image a slip may show, never failing the print.
 *
 * `photoPath` / `signaturePath` are the AUTHORISED ENDPOINTS the slip payload
 * returned (`/visitor/entries/:id/photo`, `.../signature`) — the server's own
 * private STORAGE_PATH is never part of them.
 */
export async function loadVisitorSlipAssets(options: {
  fetchBlob: (path: string) => Promise<Blob>;
  photoPath?: string | null;
  signaturePath?: string | null;
  hasPhoto?: boolean;
  hasSignature?: boolean;
}): Promise<VisitorSlipAssets> {
  const wantsPhoto = options.hasPhoto !== false && !!options.photoPath;
  const wantsSignature = options.hasSignature !== false && !!options.signaturePath;

  const [photoDataUrl, signatureDataUrl] = await Promise.all([
    wantsPhoto ? loadSlipImage(options.fetchBlob, options.photoPath, MAX_PHOTO_EDGE) : Promise.resolve(null),
    wantsSignature
      ? loadSlipImage(options.fetchBlob, options.signaturePath, MAX_SIGNATURE_EDGE)
      : Promise.resolve(null),
  ]);

  return { photoDataUrl, signatureDataUrl };
}
