import { useEffect } from 'react';
import { create } from 'zustand';
import {
  COMPANY_SETTINGS_STORAGE_KEY,
  COMPANY_SETTINGS_UPDATED_EVENT,
  CentralizedCompanySettings,
  DepartmentSceneKey,
  DepartmentStage,
  DivisionLifecycleConfig,
  SCENE_PRESET_MAP,
  WelcomePortalConfig,
  getDefaultDivisionLifecycles,
  getDefaultStrandingConfig,
  inferSceneKeyFromDepartmentName,
  loadCentralizedCompanySettings,
  normalizeWelcomePortalConfig,
  saveCentralizedCompanySettings,
} from '../config/companyWelcomeConfig';

interface CompanyWelcomeStoreState {
  config: CentralizedCompanySettings;
  hydrateFromStorage: () => void;
  saveConfig: (next: CentralizedCompanySettings) => void;
  updateWelcomePortal: (patch: Partial<WelcomePortalConfig>) => void;
  addDivision: (partial?: Partial<DivisionLifecycleConfig>) => DivisionLifecycleConfig;
  updateDivision: (divisionId: string, patch: Partial<DivisionLifecycleConfig>) => void;
  removeDivision: (divisionId: string) => void;
  reorderDivisions: (fromIndex: number, toIndex: number) => void;
  addDepartment: (
    divisionId: string,
    departmentName: string,
    sceneKey?: DepartmentSceneKey,
  ) => void;
  updateDepartment: (
    divisionId: string,
    departmentId: string,
    name: string,
    sceneKey?: DepartmentSceneKey,
    backgroundUrl?: string,
  ) => void;
  removeDepartment: (divisionId: string, departmentId: string) => void;
  reorderDepartments: (divisionId: string, fromIndex: number, toIndex: number) => void;
  resetDivisionsToDefaults: () => void;
}

function enrichDepartmentStage(id: string, name: string, explicitScene?: DepartmentSceneKey, explicitUrl?: string): DepartmentStage {
  const resolvedKey =
    explicitScene && SCENE_PRESET_MAP[explicitScene]
      ? explicitScene
      : inferSceneKeyFromDepartmentName(name);
  return {
    id,
    name,
    sceneKey: resolvedKey,
    backgroundUrl: explicitUrl?.trim() || SCENE_PRESET_MAP[resolvedKey].imageUrl,
  };
}

export const useCompanyWelcomeStore = create<CompanyWelcomeStoreState>((set, get) => ({
  config: loadCentralizedCompanySettings(),

  hydrateFromStorage: () => {
    const fresh = loadCentralizedCompanySettings();
    set({ config: fresh });
  },

  saveConfig: (next) => {
    const saved = saveCentralizedCompanySettings(next);
    set({ config: saved });
  },

  updateWelcomePortal: (patch) => {
    const current = get().config;
    const nextPortal = normalizeWelcomePortalConfig({
      ...current.welcomePortal,
      ...patch,
    });
    const saved = saveCentralizedCompanySettings({
      ...current,
      welcomePortal: nextPortal,
    });
    set({ config: saved });
  },

  addDivision: (partial) => {
    const current = get().config;
    const nextNum = current.welcomePortal.divisions.length + 1;
    const uid = `div-custom-${Date.now()}-${nextNum}`;
    const flowLayout = partial?.flowLayout || 'sequential';
    const defaultDepts: DepartmentStage[] =
      partial?.departments && partial.departments.length > 0
        ? partial.departments.map((d, idx) =>
            enrichDepartmentStage(
              d.id || `${uid}-d${idx + 1}`,
              d.name,
              d.sceneKey,
              d.backgroundUrl,
            ),
          )
        : [
            enrichDepartmentStage(`${uid}-d1`, 'Raw Material', 'raw_material'),
            enrichDepartmentStage(`${uid}-d2`, 'Processing Department', 'wire_drawing'),
            enrichDepartmentStage(`${uid}-d3`, 'Packing Department', 'packing_dispatch'),
            enrichDepartmentStage(`${uid}-d4`, 'Dispatch Department', 'global_earth'),
          ];

    const created: DivisionLifecycleConfig = {
      id: partial?.id || uid,
      code: partial?.code || `DIV-0${nextNum}`,
      name: partial?.name || `Division ${nextNum}`,
      subtitle:
        partial?.subtitle ||
        'Automated manufacturing, quality assurance, packing, and dispatch flow.',
      flowLayout,
      enabled: partial?.enabled !== false,
      departments: defaultDepts,
      stranding:
        flowLayout === 'stranding' || flowLayout === 'wire_and_stranding'
          ? partial?.stranding || getDefaultStrandingConfig()
          : partial?.stranding,
    };

    const nextDivisions = [...current.welcomePortal.divisions, created];
    get().updateWelcomePortal({ divisions: nextDivisions });
    return created;
  },

  updateDivision: (divisionId, patch) => {
    const current = get().config;
    const nextDivisions = current.welcomePortal.divisions.map((div) => {
      if (div.id !== divisionId) return div;
      const merged: DivisionLifecycleConfig = { ...div, ...patch };
      if (
        (merged.flowLayout === 'stranding' || merged.flowLayout === 'wire_and_stranding') &&
        !merged.stranding
      ) {
        merged.stranding = getDefaultStrandingConfig();
      }
      return merged;
    });
    get().updateWelcomePortal({ divisions: nextDivisions });
  },

  removeDivision: (divisionId) => {
    const current = get().config;
    const nextDivisions = current.welcomePortal.divisions.filter(
      (div) => div.id !== divisionId,
    );
    get().updateWelcomePortal({ divisions: nextDivisions });
  },

  reorderDivisions: (fromIndex, toIndex) => {
    const current = get().config;
    const list = [...current.welcomePortal.divisions];
    if (
      fromIndex < 0 ||
      fromIndex >= list.length ||
      toIndex < 0 ||
      toIndex >= list.length
    ) {
      return;
    }
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    get().updateWelcomePortal({ divisions: list });
  },

  addDepartment: (divisionId, departmentName, sceneKey) => {
    const trimmed = departmentName.trim();
    if (!trimmed) return;
    const current = get().config;
    const nextDivisions = current.welcomePortal.divisions.map((div) => {
      if (div.id !== divisionId) return div;
      const nextDept = enrichDepartmentStage(
        `${divisionId}-dept-${Date.now()}-${div.departments.length + 1}`,
        trimmed,
        sceneKey,
      );
      return {
        ...div,
        departments: [...div.departments, nextDept],
      };
    });
    get().updateWelcomePortal({ divisions: nextDivisions });
  },

  updateDepartment: (divisionId, departmentId, name, sceneKey, backgroundUrl) => {
    const current = get().config;
    const nextDivisions = current.welcomePortal.divisions.map((div) => {
      if (div.id !== divisionId) return div;
      return {
        ...div,
        departments: div.departments.map((d) => {
          if (d.id !== departmentId) return d;
          const nextScene =
            sceneKey || d.sceneKey || inferSceneKeyFromDepartmentName(name);
          const nextUrl =
            backgroundUrl !== undefined
              ? backgroundUrl
              : sceneKey
                ? SCENE_PRESET_MAP[sceneKey].imageUrl
                : d.backgroundUrl;
          return {
            ...d,
            name,
            sceneKey: nextScene,
            backgroundUrl: nextUrl,
          };
        }),
      };
    });
    get().updateWelcomePortal({ divisions: nextDivisions });
  },

  removeDepartment: (divisionId, departmentId) => {
    const current = get().config;
    const nextDivisions = current.welcomePortal.divisions.map((div) => {
      if (div.id !== divisionId) return div;
      return {
        ...div,
        departments: div.departments.filter((d) => d.id !== departmentId),
      };
    });
    get().updateWelcomePortal({ divisions: nextDivisions });
  },

  reorderDepartments: (divisionId, fromIndex, toIndex) => {
    const current = get().config;
    const nextDivisions = current.welcomePortal.divisions.map((div) => {
      if (div.id !== divisionId) return div;
      const depts = [...div.departments];
      if (
        fromIndex < 0 ||
        fromIndex >= depts.length ||
        toIndex < 0 ||
        toIndex >= depts.length
      ) {
        return div;
      }
      const [moved] = depts.splice(fromIndex, 1);
      depts.splice(toIndex, 0, moved);
      return { ...div, departments: depts };
    });
    get().updateWelcomePortal({ divisions: nextDivisions });
  },

  resetDivisionsToDefaults: () => {
    get().updateWelcomePortal({ divisions: getDefaultDivisionLifecycles() });
  },
}));

export function useCompanyWelcomeConfig() {
  const config = useCompanyWelcomeStore((s) => s.config);
  const hydrateFromStorage = useCompanyWelcomeStore((s) => s.hydrateFromStorage);

  useEffect(() => {
    hydrateFromStorage();

    const handleCustomUpdate = () => {
      hydrateFromStorage();
    };

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === COMPANY_SETTINGS_STORAGE_KEY) {
        hydrateFromStorage();
      }
    };

    window.addEventListener(COMPANY_SETTINGS_UPDATED_EVENT, handleCustomUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(COMPANY_SETTINGS_UPDATED_EVENT, handleCustomUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, [hydrateFromStorage]);

  const enabledDivisions = config.welcomePortal.divisions.filter((d) => d.enabled);

  return {
    config,
    welcomePortal: config.welcomePortal,
    divisions: config.welcomePortal.divisions,
    enabledDivisions,
  };
}
