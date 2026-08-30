/**
 * WELCOME BACKGROUND IMAGES
 * ------------------------------------------------------------------
 * Single source of truth for the Welcome screen slideshow.
 *
 * These point at the real PWI factory / wire-industry photographs served
 * from  `frontend/public/images/welcome/`  (README in that folder documents
 * the replacement flow). Overwrite a `welcome-0N.jpg` with a new photograph
 * of the same filename and no code change is needed.
 *
 * Existing files (already present):
 *   welcome-01.jpg — wire manufacturing / wire coils
 *   welcome-02.jpg — industrial production machinery
 *   welcome-03.jpg — wire drawing / straightening machinery
 *   welcome-04.jpg — spoke / metal component manufacturing
 *   welcome-05.jpg — cable manufacturing
 *   welcome-06.jpg — factory floor / production line
 */
export const WELCOME_IMAGES: string[] = [
  `${process.env.PUBLIC_URL}/images/welcome/welcome-01.jpg`,
  `${process.env.PUBLIC_URL}/images/welcome/welcome-02.jpg`,
  `${process.env.PUBLIC_URL}/images/welcome/welcome-03.jpg`,
  `${process.env.PUBLIC_URL}/images/welcome/welcome-04.jpg`,
  `${process.env.PUBLIC_URL}/images/welcome/welcome-05.jpg`,
  `${process.env.PUBLIC_URL}/images/welcome/welcome-06.jpg`,
];

/** Seconds each background image stays visible before crossfading. */
export const WELCOME_SLIDE_INTERVAL_MS = 6000;

/** Duration of the crossfade transition in ms. */
export const WELCOME_SLIDE_FADE_MS = 1400;
