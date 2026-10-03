import { create } from 'zustand';

export interface EntryContextParams {
  from?: string;
  machineId?: string;
  machineCode?: string;
  machineName?: string;
  entryDate?: string;
  shiftId?: string;
  shiftName?: string;
  divisionId?: string;
  divisionName?: string;
  sectionId?: string;
  sectionName?: string;
  departmentId?: string;
  departmentName?: string;
  entryId?: string;
  mode?: 'create' | 'edit' | 'view';
}

interface EntryDockState {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  showLinkedView: boolean;
  activeStep: number;
  entryParams: EntryContextParams | null;
  draftData: any;
  hasUnsavedChanges: boolean;

  // Actions
  openEntry: (params: EntryContextParams) => void;
  closeEntry: () => void;
  minimize: () => void;
  restore: () => void;
  toggleMaximize: () => void;
  toggleLinkedView: () => void;
  setShowLinkedView: (show: boolean) => void;
  setActiveStep: (step: number) => void;
  setDraftData: (data: any) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
}

export const useEntryDockStore = create<EntryDockState>((set) => ({
  isOpen: false,
  isMinimized: false,
  isMaximized: false,
  showLinkedView: true,
  activeStep: 1,
  entryParams: null,
  draftData: null,
  hasUnsavedChanges: false,

  openEntry: (params) =>
    set({
      isOpen: true,
      isMinimized: false,
      entryParams: params,
      activeStep: 1,
      hasUnsavedChanges: false,
    }),

  closeEntry: () =>
    set({
      isOpen: false,
      isMinimized: false,
      entryParams: null,
      draftData: null,
      hasUnsavedChanges: false,
    }),

  minimize: () => set({ isMinimized: true }),

  restore: () => set({ isMinimized: false }),

  toggleMaximize: () => set((state) => ({ isMaximized: !state.isMaximized })),

  toggleLinkedView: () => set((state) => ({ showLinkedView: !state.showLinkedView })),

  setShowLinkedView: (show) => set({ showLinkedView: show }),

  setActiveStep: (step) => set({ activeStep: step }),

  setDraftData: (data) => set({ draftData: data, hasUnsavedChanges: true }),

  setHasUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
}));
