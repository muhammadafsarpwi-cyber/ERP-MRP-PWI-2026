/**
 * WELCOME BACKGROUND IMAGES
 * ------------------------------------------------------------------
 * Single source of truth for the Welcome screen slideshow.
 */
export interface WelcomeSlideItem {
  src: string;
  title: string;
  subtitle: string;
}

export const WELCOME_SLIDE_ITEMS: WelcomeSlideItem[] = [
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-01.jpg`,
    title: 'Precision Wire Manufacturing',
    subtitle: 'High tensile galvanized & annealed steel wire coils',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-02.jpg`,
    title: 'Industrial Heavy Machinery',
    subtitle: 'Advanced automated industrial processing units',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-03.jpg`,
    title: 'Wire Drawing & Straightening',
    subtitle: 'High precision continuous wire drawing and sizing',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-04.jpg`,
    title: 'Component Manufacturing',
    subtitle: 'Automotive & bicycle spokes and precision engineering',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-05.jpg`,
    title: 'Cable Production Plant',
    subtitle: 'High capacity industrial and power cable processing',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-06.jpg`,
    title: 'Factory Floor Operations',
    subtitle: 'Full-scope plant management & quality assurance facility',
  },
];

export const WELCOME_IMAGES: string[] = WELCOME_SLIDE_ITEMS.map((item) => item.src);

/** Seconds each background image stays visible before crossfading. */
export const WELCOME_SLIDE_INTERVAL_MS = 6000;

/** Duration of the crossfade transition in ms. */
export const WELCOME_SLIDE_FADE_MS = 1400;
