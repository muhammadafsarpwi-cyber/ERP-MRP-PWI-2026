/**
 * WELCOME BACKGROUND IMAGES
 * ------------------------------------------------------------------
 * Single source of truth for the Welcome screen slideshow.
 *
 * DEMO IMAGES — REPLACE WITH COMPANY PHOTOGRAPHS
 * The files below are elegant gradient placeholders labelled "DEMO".
 * When PWI provides real factory/wire-production photographs, drop the
 * new .jpg files into  `src/assets/welcome/` and update the imports here.
 * The Welcome component needs NO other change.
 *
 * Recommended real photographs (1600×900 or larger):
 *   welcome-factory-01.jpg        — wire drawing machine floor
 *   welcome-wire-production-02.jpg— production line
 *   welcome-wire-coils-03.jpg     — coils of finished wire
 *   welcome-machine-04.jpg        — production machinery close-up
 *   welcome-production-05.jpg     — industrial operations / workers
 *   welcome-industry-06.jpg       — premium PWI factory scene
 */
import welcomeFactory01 from '../assets/welcome/welcome-factory-01.svg';
import welcomeWireProduction02 from '../assets/welcome/welcome-wire-production-02.svg';
import welcomeWireCoils03 from '../assets/welcome/welcome-wire-coils-03.svg';
import welcomeMachine04 from '../assets/welcome/welcome-machine-04.svg';
import welcomeProduction05 from '../assets/welcome/welcome-production-05.svg';
import welcomeIndustry06 from '../assets/welcome/welcome-industry-06.svg';

export const WELCOME_IMAGES: string[] = [
  welcomeFactory01,
  welcomeWireProduction02,
  welcomeWireCoils03,
  welcomeMachine04,
  welcomeProduction05,
  welcomeIndustry06,
];

/** Seconds each background image stays visible before crossfading. */
export const WELCOME_SLIDE_INTERVAL_MS = 6000;

/** Duration of the crossfade transition in ms. */
export const WELCOME_SLIDE_FADE_MS = 1400;