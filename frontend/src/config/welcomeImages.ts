/**
 * WELCOME BACKGROUND IMAGES
 * ------------------------------------------------------------------
 * Single source of truth for the Welcome screen slideshow.
 * Drives the 2D fallback slideshow, the showcase caption/dots, and the
 * 16 volumetric WebGL panels (panel i receives item i's `src` as texture).
 */
export interface WelcomeSlideItem {
  src: string;
  title: string;
  subtitle: string;
}

/**
 * Slideshow content. Images live in `public/images/welcome/` — drop in new
 * high-resolution industrial photography and adjust the captions below; no
 * component changes are required.
 *
 * Slot map: sixteen operational images in exact asset order (slot N shows
 * welcome-N.jpg), split across PWI's 4 core divisions:
 *
 *   1. WIRE ROD DRAWING DIVISION — slots 01–04
 *      rod yard → drawing machines → dies & lubricants → anneal & galvanize
 *   2. SPOKE DIVISION — slots 05–08
 *      cut & heading → thread rolling & nipples → plating baths → finished macro
 *   3. OUTER CASING DIVISION — slots 09–12
 *      PVC extrusion → conduit rows → inventory by diameter → printing & cutting
 *   4. INNER WIRE / BRAIDED METER WIRE DIVISION — slots 13–16
 *      stranding → braided core macro → meter-cutting & tinning → bundles
 */
export const WELCOME_SLIDE_ITEMS: WelcomeSlideItem[] = [
  /* 1. WIRE ROD DRAWING DIVISION (01–04) */
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-01.jpg`,
    title: 'Wire Rod Raw Material Yard',
    subtitle: 'Main raw wire rod storage yard and incoming steel coils',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-02.jpg`,
    title: 'Wire Drawing Machines',
    subtitle: 'Industrial drawing machines pulling raw rods into fine wires',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-03.jpg`,
    title: 'Drawing Dies & Lubricants',
    subtitle: 'Close-up of mechanical wire drawing dies and lubricants',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-04.jpg`,
    title: 'Annealing & Galvanizing',
    subtitle: 'Furnace lines for high-tensile wire — heat treatment & zinc coating',
  },
  /* 2. SPOKE DIVISION (05–08) */
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-05.jpg`,
    title: 'Spoke Cutting & Heading',
    subtitle: 'Automatic spoke cutting and head-heading processing machines',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-06.jpg`,
    title: 'Thread Rolling & Nipples',
    subtitle: 'Thread rolling and nipple alignment setup for bike spokes',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-07.jpg`,
    title: 'Zinc & Chrome Plating',
    subtitle: 'Plating section — shiny zinc and chrome electroplating baths',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-08.jpg`,
    title: 'Finished Spokes & Nipples',
    subtitle: 'Macro view of finished high-polish motorcycle spokes and nipples',
  },
  /* 3. OUTER CASING DIVISION (09–12) */
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-09.jpg`,
    title: 'PVC Casing Extrusion',
    subtitle: 'High-pressure plastic/PVC casing extrusion production line',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-10.jpg`,
    title: 'Finished Black Conduits',
    subtitle: 'Rows of finished flexible black conduits and control cable housings',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-11.jpg`,
    title: 'Casing Inventory',
    subtitle: 'Multi-size outer casing stock organized by diameter',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-12.jpg`,
    title: 'Printing & Length Cutting',
    subtitle: 'Casing text printing and automatic length cutting department',
  },
  /* 4. INNER WIRE / BRAIDED METER WIRE DIVISION (13–16) */
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-13.jpg`,
    title: 'Wire Stranding Machines',
    subtitle: 'Stranding machines twisting multiple filaments into braided wire',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-14.jpg`,
    title: 'Braided Core Macro',
    subtitle: 'Cross-section macro view of dense braided flexible core wire',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-15.jpg`,
    title: 'Inner Wire Cutting & Tinning',
    subtitle: 'High-speed precision inner wire meter-cutting and tinning setup',
  },
  {
    src: `${process.env.PUBLIC_URL}/images/welcome/welcome-16.jpg`,
    title: 'Finished Inner Wire Bundles',
    subtitle: 'Finished inner wires bundled and prepared for control cable assembly',
  },
];

/** Back-compat alias used by the 2D background slideshow component. */
export const WELCOME_IMAGES: string[] = WELCOME_SLIDE_ITEMS.map((item) => item.src);

/** Strict cinematic cadence: one advance every 6 seconds. */
export const WELCOME_SLIDE_INTERVAL_MS = 6000;
/** Crossfade duration between slides. */
export const WELCOME_SLIDE_FADE_MS = 1200;
