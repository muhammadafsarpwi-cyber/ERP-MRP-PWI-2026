/**
 * CENTRALIZED COMPANY & WELCOME PORTAL CONFIGURATION
 * ---------------------------------------------------------------------------
 * Single source of truth connecting Company Settings (`/settings/company` &
 * `/settings/profile-branding`) dynamically with the Welcome Portal (`/`),
 * Department-Synchronized Background Transitions, Top Corporate Marquee Ribbon,
 * and Authentication Brand Pane.
 *
 * Adding, editing, reordering, toggling, or removing a division (e.g., a 5th
 * or 6th division) or its department process flow and visual scene mapping in
 * Company Settings updates the Welcome screen automatically with zero code changes.
 */

export const COMPANY_SETTINGS_STORAGE_KEY = 'erp_company_settings_v1';
export const COMPANY_SETTINGS_UPDATED_EVENT = 'erp-company-settings-updated';

export type DivisionFlowLayout = 'sequential' | 'wire_and_stranding' | 'stranding';

export type DepartmentSceneKey =
  | 'global_earth'
  | 'raw_material'
  | 'straightener'
  | 'swagging'
  | 'spoke_forming'
  | 'electroplating'
  | 'flattening'
  | 'spiral_winding'
  | 'pvc_extrusion'
  | 'wire_drawing'
  | 'annealing_prep'
  | 'spooling_qc'
  | 'stranding_machine'
  | 'wire_bundles'
  | 'packing_dispatch';

export interface DepartmentScenePreset {
  key: DepartmentSceneKey;
  label: string;
  imageUrl: string;
  telemetryTag: string;
}

const PUB = process.env.PUBLIC_URL || '';

export const FUTURISTIC_EARTH_BANNER_URL = `${PUB}/images/welcome/welcome-00.jpg`;

/**
 * High-Tech Dark Corporate Manufacturing Scene Catalog (Purple & Neon Blue Theme).
 * Each preset maps to a dedicated 16:9 holographic industrial scene in public assets.
 */
export const DEPARTMENT_SCENE_CATALOG: DepartmentScenePreset[] = [
  {
    key: 'raw_material',
    label: 'Raw Wire Rod & Steel Coils Yard',
    imageUrl: `${PUB}/images/welcome/departments/dept-raw-material.jpg`,
    telemetryTag: 'RAW STEEL WIRE ROD & COIL STORAGE YARD',
  },
  {
    key: 'straightener',
    label: 'Precision Roller Wire Straightener',
    imageUrl: `${PUB}/images/welcome/departments/dept-straightener.jpg`,
    telemetryTag: 'MULTI-ROLLER PRECISION WIRE STRAIGHTENING',
  },
  {
    key: 'swagging',
    label: 'Rotary Swagging & Cold-Heading Machine',
    imageUrl: `${PUB}/images/welcome/departments/dept-swagging.jpg`,
    telemetryTag: 'HIGH-SPEED ROTARY SWAGGING & FORGING',
  },
  {
    key: 'spoke_forming',
    label: 'Automated Spoke Forming & Thread Rolling',
    imageUrl: `${PUB}/images/welcome/departments/dept-spoke-forming.jpg`,
    telemetryTag: 'AUTOMATED SPOKE CUTTING, HEADING & THREADING',
  },
  {
    key: 'electroplating',
    label: 'Robotic Nickel-Chrome & Zinc Electroplating',
    imageUrl: `${PUB}/images/welcome/departments/dept-electroplating.jpg`,
    telemetryTag: 'AUTOMATED ELECTROPLATING & GALVANIZING BATHS',
  },
  {
    key: 'flattening',
    label: 'Tandem Wire Flattening Rolling Mill',
    imageUrl: `${PUB}/images/welcome/departments/dept-flattening.jpg`,
    telemetryTag: 'PRECISION TANDEM WIRE FLATTENING MILL',
  },
  {
    key: 'spiral_winding',
    label: 'Control Cable Spiral Conduit Winding',
    imageUrl: `${PUB}/images/welcome/departments/dept-spiral-winding.jpg`,
    telemetryTag: 'HIGH-SPEED HELICAL CONDUIT SPIRAL WINDING',
  },
  {
    key: 'pvc_extrusion',
    label: 'Polymer PVC Extrusion & Laser Sizing Line',
    imageUrl: `${PUB}/images/welcome/departments/dept-pvc-extrusion.jpg`,
    telemetryTag: 'POLYMER PVC EXTRUSION & LASER DIAMETER CONTROL',
  },
  {
    key: 'wire_drawing',
    label: 'Multi-Stage Continuous Wire Drawing',
    imageUrl: `${PUB}/images/welcome/departments/dept-wire-drawing.jpg`,
    telemetryTag: 'MULTI-BLOCK CAPSTAN CONTINUOUS WIRE DRAWING',
  },
  {
    key: 'annealing_prep',
    label: 'Annealing, Heat-Treatment & Surface Prep',
    imageUrl: `${PUB}/images/welcome/departments/dept-annealing-prep.jpg`,
    telemetryTag: 'INDUCTION ANNEALING, PATENTING & SURFACE PREP',
  },
  {
    key: 'spooling_qc',
    label: 'CNC Bobbin Spooling & Laser Quality Lab',
    imageUrl: `${PUB}/images/welcome/departments/dept-spooling-qc.jpg`,
    telemetryTag: 'PRECISION CNC SPOOLING & OPTICAL METROLOGY QC',
  },
  {
    key: 'stranding_machine',
    label: 'High-Speed Tubular Multi-Wire Stranding',
    imageUrl: `${PUB}/images/welcome/departments/dept-stranding-machine.jpg`,
    telemetryTag: 'MULTI-FILAMENT HIGH-SPEED WIRE STRANDING HEAD',
  },
  {
    key: 'wire_bundles',
    label: 'Finished Braided Inner Wire Bundles',
    imageUrl: `${PUB}/images/welcome/departments/dept-wire-bundles.jpg`,
    telemetryTag: 'COMBINED BRAIDED INNER WIRE BUNDLE ASSEMBLY',
  },
  {
    key: 'packing_dispatch',
    label: 'Automated Bundling & Smart Packaging Line',
    imageUrl: `${PUB}/images/welcome/departments/dept-packing-dispatch.jpg`,
    telemetryTag: 'AUTOMATED INDUSTRIAL PACKAGING & PALLETIZING',
  },
  {
    key: 'global_earth',
    label: 'Global Logistics & Enterprise Dispatch Hub',
    imageUrl: FUTURISTIC_EARTH_BANNER_URL,
    telemetryTag: 'GLOBAL ENTERPRISE SUPPLY CHAIN & OEM DISPATCH',
  },
];

export const SCENE_PRESET_MAP: Record<DepartmentSceneKey, DepartmentScenePreset> =
  DEPARTMENT_SCENE_CATALOG.reduce(
    (acc, item) => {
      acc[item.key] = item;
      return acc;
    },
    {} as Record<DepartmentSceneKey, DepartmentScenePreset>,
  );

/**
 * Automatically maps any department name (including future 5th/6th division
 * departments added via Company Settings) to the closest dark-corporate scene.
 */
export function inferSceneKeyFromDepartmentName(name: string): DepartmentSceneKey {
  const lower = (name || '').toLowerCase();
  if (lower.includes('straighten')) return 'straightener';
  if (lower.includes('swag')) return 'swagging';
  if (lower.includes('plating') || lower.includes('chrome') || lower.includes('galvaniz')) {
    return 'electroplating';
  }
  if (lower.includes('spoke')) return 'spoke_forming';
  if (lower.includes('flatten') || lower.includes('rolling')) return 'flattening';
  if (lower.includes('spiral') || lower.includes('spring') || lower.includes('coil')) {
    if (lower.includes('raw')) return 'raw_material';
    return 'spiral_winding';
  }
  if (lower.includes('pvc') || lower.includes('extru') || lower.includes('casing')) {
    return 'pvc_extrusion';
  }
  if (lower.includes('draw')) return 'wire_drawing';
  if (
    lower.includes('anneal') ||
    lower.includes('pickl') ||
    lower.includes('surface') ||
    lower.includes('patent') ||
    lower.includes('heat') ||
    lower.includes('furnace') ||
    lower.includes('temper')
  ) {
    return 'annealing_prep';
  }
  if (
    lower.includes('spool') ||
    lower.includes('bobbin') ||
    lower.includes('wind') ||
    lower.includes('quality') ||
    lower.includes('qc') ||
    lower.includes('inspect') ||
    lower.includes('test')
  ) {
    return 'spooling_qc';
  }
  if (lower.includes('bundle')) return 'wire_bundles';
  if (lower.includes('strand') || lower.includes('braid') || lower.includes('twist')) {
    return 'stranding_machine';
  }
  if (lower.includes('pack')) return 'packing_dispatch';
  if (lower.includes('dispatch') || lower.includes('ship') || lower.includes('warehous')) {
    return 'global_earth';
  }
  if (lower.includes('raw') || lower.includes('rod') || lower.includes('material')) {
    return 'raw_material';
  }
  return 'wire_drawing';
}

export interface DepartmentStage {
  id: string;
  name: string;
  /** Mapped visual preset from DEPARTMENT_SCENE_CATALOG */
  sceneKey?: DepartmentSceneKey;
  /** Optional custom high-tech image URL override (defaults to preset imageUrl) */
  backgroundUrl?: string;
}

export interface StrandingProcessConfig {
  /** Raw/drawn wire strands that converge into the stranding machine */
  inputStrands: string[];
  /** Department where multiple wire strands are twisted/combined */
  strandingDepartment: string;
  /** Combined intermediate bundle product */
  bundleOutput: string;
  /** Final finishing, packing, or dispatch stage */
  finalStage: string;
  /** Scene mappings for each of the 4 stranding progression steps */
  inputStrandsSceneKey?: DepartmentSceneKey;
  strandingSceneKey?: DepartmentSceneKey;
  bundleSceneKey?: DepartmentSceneKey;
  finalStageSceneKey?: DepartmentSceneKey;
}

export interface DivisionLifecycleConfig {
  id: string;
  code: string;
  name: string;
  subtitle: string;
  flowLayout: DivisionFlowLayout;
  enabled: boolean;
  /** Sequential department lifecycle stages (used by 'sequential' and 'wire_and_stranding') */
  departments: DepartmentStage[];
  /** Converging multi-strand process layout (used by 'stranding' and 'wire_and_stranding') */
  stranding?: StrandingProcessConfig;
}

export interface ActiveStageVisual {
  imageUrl: string;
  fallbackUrl: string;
  sceneKey: DepartmentSceneKey;
  stageName: string;
  telemetryTag: string;
  divisionName: string;
  divisionCode: string;
  stageIndex: number;
  totalStages: number;
}

/**
 * Resolves the exact synchronized background visual for any division and active stage index.
 */
export function resolveDivisionStageVisual(
  division: DivisionLifecycleConfig | undefined,
  activeStageIndex: number,
  defaultHeroUrl: string = FUTURISTIC_EARTH_BANNER_URL,
): ActiveStageVisual {
  if (!division) {
    return {
      imageUrl: defaultHeroUrl,
      fallbackUrl: FUTURISTIC_EARTH_BANNER_URL,
      sceneKey: 'global_earth',
      stageName: 'Global Enterprise Ecosystem',
      telemetryTag: SCENE_PRESET_MAP.global_earth.telemetryTag,
      divisionName: 'PWI Enterprise',
      divisionCode: 'PWI',
      stageIndex: 0,
      totalStages: 1,
    };
  }

  const showSequential =
    (division.flowLayout === 'sequential' ||
      division.flowLayout === 'wire_and_stranding') &&
    division.departments.length > 0;

  const showStranding =
    (division.flowLayout === 'stranding' ||
      division.flowLayout === 'wire_and_stranding') &&
    Boolean(division.stranding);

  const seqCount = showSequential ? division.departments.length : 0;
  const strandingCount = showStranding ? 4 : 0;
  const totalStages = Math.max(1, seqCount + strandingCount);
  const clampedStage = Math.max(0, Math.min(activeStageIndex, totalStages - 1));

  // Sequential department stage
  if (showSequential && clampedStage < seqCount) {
    const dept = division.departments[clampedStage];
    const resolvedKey =
      dept.sceneKey && SCENE_PRESET_MAP[dept.sceneKey]
        ? dept.sceneKey
        : inferSceneKeyFromDepartmentName(dept.name);
    const preset = SCENE_PRESET_MAP[resolvedKey] || SCENE_PRESET_MAP.global_earth;
    const customUrl = dept.backgroundUrl?.trim();

    return {
      imageUrl: customUrl || preset.imageUrl,
      fallbackUrl: defaultHeroUrl || FUTURISTIC_EARTH_BANNER_URL,
      sceneKey: resolvedKey,
      stageName: dept.name,
      telemetryTag: preset.telemetryTag,
      divisionName: division.name,
      divisionCode: division.code,
      stageIndex: clampedStage,
      totalStages,
    };
  }

  // Stranding process stage (0: Input Strands, 1: Stranding Dept, 2: Wire Bundles, 3: Final Stage)
  if (showStranding && division.stranding) {
    const sIdx = clampedStage - seqCount;
    const st = division.stranding;

    let sceneKey: DepartmentSceneKey = 'stranding_machine';
    let stageName = st.strandingDepartment;

    if (sIdx <= 0) {
      sceneKey = st.inputStrandsSceneKey || 'spooling_qc';
      stageName = st.inputStrands.join(' + ');
    } else if (sIdx === 1) {
      sceneKey = st.strandingSceneKey || 'stranding_machine';
      stageName = st.strandingDepartment;
    } else if (sIdx === 2) {
      sceneKey = st.bundleSceneKey || 'wire_bundles';
      stageName = st.bundleOutput;
    } else {
      sceneKey = st.finalStageSceneKey || 'global_earth';
      stageName = st.finalStage;
    }

    const preset = SCENE_PRESET_MAP[sceneKey] || SCENE_PRESET_MAP.stranding_machine;
    return {
      imageUrl: preset.imageUrl,
      fallbackUrl: defaultHeroUrl || FUTURISTIC_EARTH_BANNER_URL,
      sceneKey,
      stageName,
      telemetryTag: preset.telemetryTag,
      divisionName: division.name,
      divisionCode: division.code,
      stageIndex: clampedStage,
      totalStages,
    };
  }

  return {
    imageUrl: defaultHeroUrl,
    fallbackUrl: FUTURISTIC_EARTH_BANNER_URL,
    sceneKey: 'global_earth',
    stageName: division.name,
    telemetryTag: SCENE_PRESET_MAP.global_earth.telemetryTag,
    divisionName: division.name,
    divisionCode: division.code,
    stageIndex: 0,
    totalStages: 1,
  };
}

/**
 * Collects all unique department/stage background image URLs for a division
 * so WelcomeBackground can preload them ahead of automated transitions.
 */
export function collectDivisionImageUrls(
  divisions: DivisionLifecycleConfig[],
  defaultHeroUrl: string = FUTURISTIC_EARTH_BANNER_URL,
): string[] {
  const urls = new Set<string>([defaultHeroUrl, FUTURISTIC_EARTH_BANNER_URL]);
  divisions.forEach((div) => {
    const seqCount =
      div.flowLayout === 'stranding' ? 0 : div.departments.length;
    const strandingCount =
      (div.flowLayout === 'stranding' || div.flowLayout === 'wire_and_stranding') &&
      div.stranding
        ? 4
        : 0;
    const total = Math.max(1, seqCount + strandingCount);
    for (let i = 0; i < total; i += 1) {
      const vis = resolveDivisionStageVisual(div, i, defaultHeroUrl);
      if (vis.imageUrl) urls.add(vis.imageUrl);
    }
  });
  return Array.from(urls);
}

export interface WelcomePortalConfig {
  /** Fallback / global hero background image URL */
  heroBannerUrl: string;
  /** Corporate portal subtitle beneath the company title */
  portalTagline: string;
  /** Automatically cycle through departments & divisions on the Welcome screen */
  autoCycleDivisions: boolean;
  /** Milliseconds to dwell on each division (legacy fallback) */
  divisionCycleIntervalMs: number;
  /** Milliseconds per synchronized department stage & background transition */
  stagePulseIntervalMs: number;
  /** Ordered list of all configured manufacturing divisions */
  divisions: DivisionLifecycleConfig[];
}

export interface CentralizedCompanySettings {
  id?: string;
  companyName: string;
  billingEmail: string;
  phone: string;
  taxNumber: string;
  address: string;
  currency: string;
  currencySymbol: string;
  logoUrl: string | null;
  website: string;
  fiscalYearStart: string;
  timezone: string;
  welcomePortal: WelcomePortalConfig;
}

/**
 * Canonical PWI Division & Department Lifecycles
 * Every department is explicitly mapped to its dedicated dark-corporate 3D scene.
 */
export const DEFAULT_DIVISION_LIFECYCLES: DivisionLifecycleConfig[] = [
  {
    id: 'div-spoke',
    code: 'DIV-SPD',
    name: 'Spoke Division',
    subtitle:
      'End-to-end motorcycle & cycle spoke straightening, swagging, plating, packing, and dispatch.',
    flowLayout: 'sequential',
    enabled: true,
    departments: [
      {
        id: 'spd-1',
        name: 'Raw Material',
        sceneKey: 'raw_material',
        backgroundUrl: SCENE_PRESET_MAP.raw_material.imageUrl,
      },
      {
        id: 'spd-2',
        name: 'Straightener Department',
        sceneKey: 'straightener',
        backgroundUrl: SCENE_PRESET_MAP.straightener.imageUrl,
      },
      {
        id: 'spd-3',
        name: 'Swagging Department',
        sceneKey: 'swagging',
        backgroundUrl: SCENE_PRESET_MAP.swagging.imageUrl,
      },
      {
        id: 'spd-4',
        name: 'Spoke Department',
        sceneKey: 'spoke_forming',
        backgroundUrl: SCENE_PRESET_MAP.spoke_forming.imageUrl,
      },
      {
        id: 'spd-5',
        name: 'Spoke Plating Department',
        sceneKey: 'electroplating',
        backgroundUrl: SCENE_PRESET_MAP.electroplating.imageUrl,
      },
      {
        id: 'spd-6',
        name: 'Spoke Packing',
        sceneKey: 'packing_dispatch',
        backgroundUrl: SCENE_PRESET_MAP.packing_dispatch.imageUrl,
      },
      {
        id: 'spd-7',
        name: 'Dispatch Department',
        sceneKey: 'global_earth',
        backgroundUrl: SCENE_PRESET_MAP.global_earth.imageUrl,
      },
    ],
  },
  {
    id: 'div-control-cable',
    code: 'DIV-CCD',
    name: 'Control Cable Division',
    subtitle:
      'Precision wire flattening, spiral winding, PVC extrusion coating, packing, and OEM dispatch.',
    flowLayout: 'sequential',
    enabled: true,
    departments: [
      {
        id: 'ccd-1',
        name: 'Raw Material',
        sceneKey: 'raw_material',
        backgroundUrl: SCENE_PRESET_MAP.raw_material.imageUrl,
      },
      {
        id: 'ccd-2',
        name: 'Flattening Department',
        sceneKey: 'flattening',
        backgroundUrl: SCENE_PRESET_MAP.flattening.imageUrl,
      },
      {
        id: 'ccd-3',
        name: 'Spiral Department',
        sceneKey: 'spiral_winding',
        backgroundUrl: SCENE_PRESET_MAP.spiral_winding.imageUrl,
      },
      {
        id: 'ccd-4',
        name: 'PVC Department',
        sceneKey: 'pvc_extrusion',
        backgroundUrl: SCENE_PRESET_MAP.pvc_extrusion.imageUrl,
      },
      {
        id: 'ccd-5',
        name: 'Packing Department',
        sceneKey: 'packing_dispatch',
        backgroundUrl: SCENE_PRESET_MAP.packing_dispatch.imageUrl,
      },
      {
        id: 'ccd-6',
        name: 'Dispatch Department',
        sceneKey: 'global_earth',
        backgroundUrl: SCENE_PRESET_MAP.global_earth.imageUrl,
      },
    ],
  },
  {
    id: 'div-main-e51',
    code: 'DIV-PWI',
    name: 'Main Division E-51',
    subtitle:
      'Sequential wire rod drawing cycle paired with multi-strand inner wire stranding & bundle finishing.',
    flowLayout: 'wire_and_stranding',
    enabled: true,
    departments: [
      {
        id: 'e51-1',
        name: 'Raw Wire Rod',
        sceneKey: 'raw_material',
        backgroundUrl: SCENE_PRESET_MAP.raw_material.imageUrl,
      },
      {
        id: 'e51-2',
        name: 'Pickling & Surface Prep',
        sceneKey: 'annealing_prep',
        backgroundUrl: SCENE_PRESET_MAP.annealing_prep.imageUrl,
      },
      {
        id: 'e51-3',
        name: 'Wire Drawing Department',
        sceneKey: 'wire_drawing',
        backgroundUrl: SCENE_PRESET_MAP.wire_drawing.imageUrl,
      },
      {
        id: 'e51-4',
        name: 'Annealing & Galvanizing',
        sceneKey: 'electroplating',
        backgroundUrl: SCENE_PRESET_MAP.electroplating.imageUrl,
      },
      {
        id: 'e51-5',
        name: 'Spooling & Quality Check',
        sceneKey: 'spooling_qc',
        backgroundUrl: SCENE_PRESET_MAP.spooling_qc.imageUrl,
      },
      {
        id: 'e51-6',
        name: 'Dispatch Department',
        sceneKey: 'packing_dispatch',
        backgroundUrl: SCENE_PRESET_MAP.packing_dispatch.imageUrl,
      },
    ],
    stranding: {
      inputStrands: ['Raw Wire Strand 1', 'Raw Wire Strand 2', 'Raw Wire Strand 3'],
      strandingDepartment: 'Stranding Department',
      bundleOutput: 'Finished Inner Wire Bundles',
      finalStage: 'Packing & Dispatch Department',
      inputStrandsSceneKey: 'spooling_qc',
      strandingSceneKey: 'stranding_machine',
      bundleSceneKey: 'wire_bundles',
      finalStageSceneKey: 'global_earth',
    },
  },
  {
    id: 'div-nb',
    code: 'DIV-NB',
    name: 'NB Division',
    subtitle:
      'High-speed fine wire drawing cycle & multi-filament stranding into finished inner wire bundles.',
    flowLayout: 'wire_and_stranding',
    enabled: true,
    departments: [
      {
        id: 'nb-1',
        name: 'Raw Wire Rod',
        sceneKey: 'raw_material',
        backgroundUrl: SCENE_PRESET_MAP.raw_material.imageUrl,
      },
      {
        id: 'nb-2',
        name: 'Fine Wire Drawing Department',
        sceneKey: 'wire_drawing',
        backgroundUrl: SCENE_PRESET_MAP.wire_drawing.imageUrl,
      },
      {
        id: 'nb-3',
        name: 'Patenting & Heat Treatment',
        sceneKey: 'annealing_prep',
        backgroundUrl: SCENE_PRESET_MAP.annealing_prep.imageUrl,
      },
      {
        id: 'nb-4',
        name: 'Precision Bobbin Winding',
        sceneKey: 'spooling_qc',
        backgroundUrl: SCENE_PRESET_MAP.spooling_qc.imageUrl,
      },
      {
        id: 'nb-5',
        name: 'Quality Inspection',
        sceneKey: 'straightener',
        backgroundUrl: SCENE_PRESET_MAP.straightener.imageUrl,
      },
      {
        id: 'nb-6',
        name: 'Dispatch Department',
        sceneKey: 'packing_dispatch',
        backgroundUrl: SCENE_PRESET_MAP.packing_dispatch.imageUrl,
      },
    ],
    stranding: {
      inputStrands: ['Raw Wire Strand A', 'Raw Wire Strand B', 'Raw Wire Strand C'],
      strandingDepartment: 'High-Speed Stranding Department',
      bundleOutput: 'Finished Inner Wire Bundles',
      finalStage: 'Final Cutting, Packing & Dispatch',
      inputStrandsSceneKey: 'spooling_qc',
      strandingSceneKey: 'stranding_machine',
      bundleSceneKey: 'wire_bundles',
      finalStageSceneKey: 'global_earth',
    },
  },
];

export const getDefaultDivisionLifecycles = (): DivisionLifecycleConfig[] =>
  DEFAULT_DIVISION_LIFECYCLES.map((div) => ({
    ...div,
    departments: div.departments.map((dept) => ({ ...dept })),
    stranding: div.stranding
      ? {
          ...div.stranding,
          inputStrands: [...div.stranding.inputStrands],
        }
      : undefined,
  }));

export const getDefaultStrandingConfig = (): StrandingProcessConfig => ({
  inputStrands: ['Raw Wire Strand 1', 'Raw Wire Strand 2', 'Raw Wire Strand 3'],
  strandingDepartment: 'Stranding Department',
  bundleOutput: 'Finished Inner Wire Bundles',
  finalStage: 'Packing & Dispatch Department',
  inputStrandsSceneKey: 'spooling_qc',
  strandingSceneKey: 'stranding_machine',
  bundleSceneKey: 'wire_bundles',
  finalStageSceneKey: 'global_earth',
});

export const DEFAULT_WELCOME_PORTAL_CONFIG: WelcomePortalConfig = {
  heroBannerUrl: FUTURISTIC_EARTH_BANNER_URL,
  portalTagline: 'Enterprise Manufacturing & ERP System',
  autoCycleDivisions: true,
  divisionCycleIntervalMs: 14000,
  stagePulseIntervalMs: 2600,
  divisions: getDefaultDivisionLifecycles(),
};

export const DEFAULT_CENTRALIZED_COMPANY_SETTINGS: CentralizedCompanySettings = {
  companyName: 'Pakistan Wire Industries (Pvt.) LTD',
  billingEmail: 'admin1@demo.com',
  phone: '03001000000',
  taxNumber: 'TAX-0001',
  address: 'Suite 1, Demo Plaza, Demo City',
  currency: 'PKR',
  currencySymbol: 'Rs',
  logoUrl: null,
  website: 'https://demo.pwi-erp.com',
  fiscalYearStart: '01-01',
  timezone: 'Asia/Karachi',
  welcomePortal: DEFAULT_WELCOME_PORTAL_CONFIG,
};

/**
 * Normalizes and validates any partial WelcomePortalConfig loaded from storage,
 * automatically hydrating sceneKey & backgroundUrl mappings for every department.
 */
export function normalizeWelcomePortalConfig(
  raw?: Partial<WelcomePortalConfig> | null,
): WelcomePortalConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_WELCOME_PORTAL_CONFIG,
      divisions: getDefaultDivisionLifecycles(),
    };
  }

  const divisionsInput = Array.isArray(raw.divisions)
    ? raw.divisions
    : getDefaultDivisionLifecycles();

  const normalizedDivisions: DivisionLifecycleConfig[] = divisionsInput.map((div, idx) => {
    const layout: DivisionFlowLayout =
      div?.flowLayout === 'sequential' ||
      div?.flowLayout === 'stranding' ||
      div?.flowLayout === 'wire_and_stranding'
        ? div.flowLayout
        : 'sequential';

    const departments: DepartmentStage[] = Array.isArray(div?.departments)
      ? div.departments
          .filter((d) => d && typeof d.name === 'string' && d.name.trim().length > 0)
          .map((d, dIdx) => {
            const cleanName = d.name.trim();
            const sceneKey: DepartmentSceneKey =
              d.sceneKey && SCENE_PRESET_MAP[d.sceneKey]
                ? d.sceneKey
                : inferSceneKeyFromDepartmentName(cleanName);
            const backgroundUrl =
              d.backgroundUrl?.trim() || SCENE_PRESET_MAP[sceneKey].imageUrl;

            return {
              id: d.id || `dept-${idx + 1}-${dIdx + 1}`,
              name: cleanName,
              sceneKey,
              backgroundUrl,
            };
          })
      : [];

    const needsStranding = layout === 'stranding' || layout === 'wire_and_stranding';
    const rawStranding = div?.stranding;
    const stranding: StrandingProcessConfig | undefined =
      needsStranding || rawStranding
        ? {
            inputStrands:
              Array.isArray(rawStranding?.inputStrands) &&
              rawStranding!.inputStrands.length > 0
                ? rawStranding!.inputStrands.map((s) => String(s).trim()).filter(Boolean)
                : ['Raw Wire Strand 1', 'Raw Wire Strand 2', 'Raw Wire Strand 3'],
            strandingDepartment:
              rawStranding?.strandingDepartment?.trim() || 'Stranding Department',
            bundleOutput:
              rawStranding?.bundleOutput?.trim() || 'Finished Inner Wire Bundles',
            finalStage:
              rawStranding?.finalStage?.trim() || 'Packing & Dispatch Department',
            inputStrandsSceneKey:
              rawStranding?.inputStrandsSceneKey &&
              SCENE_PRESET_MAP[rawStranding.inputStrandsSceneKey]
                ? rawStranding.inputStrandsSceneKey
                : 'spooling_qc',
            strandingSceneKey:
              rawStranding?.strandingSceneKey &&
              SCENE_PRESET_MAP[rawStranding.strandingSceneKey]
                ? rawStranding.strandingSceneKey
                : 'stranding_machine',
            bundleSceneKey:
              rawStranding?.bundleSceneKey &&
              SCENE_PRESET_MAP[rawStranding.bundleSceneKey]
                ? rawStranding.bundleSceneKey
                : 'wire_bundles',
            finalStageSceneKey:
              rawStranding?.finalStageSceneKey &&
              SCENE_PRESET_MAP[rawStranding.finalStageSceneKey]
                ? rawStranding.finalStageSceneKey
                : 'global_earth',
          }
        : undefined;

    return {
      id: div?.id || `div-${idx + 1}`,
      code: div?.code?.trim() || `DIV-0${idx + 1}`,
      name: div?.name?.trim() || `Division ${idx + 1}`,
      subtitle: div?.subtitle?.trim() || 'Automated Manufacturing & Production Flow',
      flowLayout: layout,
      enabled: div?.enabled !== false,
      departments,
      stranding,
    };
  });

  // Upgrade legacy sub-second pulse intervals (950ms) to smooth background crossfade timing (2600ms)
  const rawPulse = raw.stagePulseIntervalMs;
  const stagePulseIntervalMs =
    typeof rawPulse === 'number' && rawPulse >= 1200 && rawPulse !== 950
      ? rawPulse
      : DEFAULT_WELCOME_PORTAL_CONFIG.stagePulseIntervalMs;

  return {
    heroBannerUrl: raw.heroBannerUrl?.trim() || FUTURISTIC_EARTH_BANNER_URL,
    portalTagline:
      raw.portalTagline?.trim() || DEFAULT_WELCOME_PORTAL_CONFIG.portalTagline,
    autoCycleDivisions:
      typeof raw.autoCycleDivisions === 'boolean'
        ? raw.autoCycleDivisions
        : DEFAULT_WELCOME_PORTAL_CONFIG.autoCycleDivisions,
    divisionCycleIntervalMs:
      typeof raw.divisionCycleIntervalMs === 'number' &&
      raw.divisionCycleIntervalMs >= 2000
        ? raw.divisionCycleIntervalMs
        : DEFAULT_WELCOME_PORTAL_CONFIG.divisionCycleIntervalMs,
    stagePulseIntervalMs,
    divisions: normalizedDivisions,
  };
}

export interface CompanyBrandParts {
  monogram: string;
  headline: string;
  legalSuffix: string;
  fullName: string;
}

export function parseCompanyBrandParts(companyName?: string | null): CompanyBrandParts {
  const full = (companyName || DEFAULT_CENTRALIZED_COMPANY_SETTINGS.companyName).trim();
  if (!full) {
    return {
      monogram: 'PWI',
      headline: 'Pakistan Wire Industries',
      legalSuffix: '(Pvt.) LTD',
      fullName: 'Pakistan Wire Industries (Pvt.) LTD',
    };
  }

  const suffixRegex =
    /\s*(\((?:Pvt\.?|Private)\)\s*(?:LTD\.?|Limited)|(?:Pvt\.?|Private)\s+(?:Ltd\.?|Limited)|LLC|Inc\.?|Corp\.?|PLC|LTD\.?|Limited)$/i;
  const match = full.match(suffixRegex);
  const legalSuffix = match ? match[1].trim() : '';
  const headline = (match ? full.slice(0, match.index).trim() : full) || full;

  const words = headline
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let monogram = 'PWI';
  if (words.length >= 2) {
    monogram = words
      .slice(0, 4)
      .map((w) => w[0].toUpperCase())
      .join('');
  } else if (words.length === 1) {
    monogram = words[0].slice(0, 4).toUpperCase();
  }

  return {
    monogram,
    headline,
    legalSuffix,
    fullName: full,
  };
}

export function formatDivisionFlowSummary(division: DivisionLifecycleConfig): string {
  if (division.flowLayout === 'stranding' && division.stranding) {
    return `${division.stranding.inputStrands.join(' + ')} → ${division.stranding.strandingDepartment} → ${division.stranding.bundleOutput} → ${division.stranding.finalStage}`;
  }
  const seqNames = division.departments.map((d) => d.name);
  if (division.flowLayout === 'wire_and_stranding' && division.stranding) {
    const wireSummary = seqNames.length > 0 ? seqNames.join(' → ') : 'Wire Drawing Cycle';
    return `${wireSummary} | Stranding: ${division.stranding.bundleOutput} → ${division.stranding.finalStage}`;
  }
  return seqNames.join(' → ');
}

export function loadCentralizedCompanySettings(): CentralizedCompanySettings {
  if (typeof window === 'undefined') {
    return {
      ...DEFAULT_CENTRALIZED_COMPANY_SETTINGS,
      welcomePortal: normalizeWelcomePortalConfig(DEFAULT_WELCOME_PORTAL_CONFIG),
    };
  }

  try {
    const raw = window.localStorage.getItem(COMPANY_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_CENTRALIZED_COMPANY_SETTINGS,
        welcomePortal: normalizeWelcomePortalConfig(DEFAULT_WELCOME_PORTAL_CONFIG),
      };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CENTRALIZED_COMPANY_SETTINGS,
      ...parsed,
      companyName:
        parsed?.companyName?.trim() || DEFAULT_CENTRALIZED_COMPANY_SETTINGS.companyName,
      logoUrl: parsed?.logoUrl ?? null,
      welcomePortal: normalizeWelcomePortalConfig(parsed?.welcomePortal),
    };
  } catch {
    return {
      ...DEFAULT_CENTRALIZED_COMPANY_SETTINGS,
      welcomePortal: normalizeWelcomePortalConfig(DEFAULT_WELCOME_PORTAL_CONFIG),
    };
  }
}

export function saveCentralizedCompanySettings(
  next: CentralizedCompanySettings,
): CentralizedCompanySettings {
  const normalized: CentralizedCompanySettings = {
    ...DEFAULT_CENTRALIZED_COMPANY_SETTINGS,
    ...next,
    welcomePortal: normalizeWelcomePortalConfig(next.welcomePortal),
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        COMPANY_SETTINGS_STORAGE_KEY,
        JSON.stringify(normalized),
      );
      window.dispatchEvent(
        new CustomEvent(COMPANY_SETTINGS_UPDATED_EVENT, { detail: normalized }),
      );
    } catch {
      /* ignore storage quota errors */
    }
  }

  return normalized;
}
