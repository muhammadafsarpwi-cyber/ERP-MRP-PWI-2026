import { create } from 'zustand';

/**
 * Session-scoped state for the Raw Material Receiving "New Receipt (Gate Pass)"
 * workflow.
 *
 * WHY this store exists (RMR-01-A):
 *  - Minimizing the receipt modal must NOT lose the draft, and the minimized
 *    bar must survive SPA navigation (it lives in MainLayout, not the page).
 *  - Navigating to another route unmounts `RawMaterialReceiving`, so the live
 *    form/rows are copied here the moment they change and restored when the
 *    user returns / hits "Restore" on the persistent bar.
 *
 * Deliberately NOT persisted to localStorage: it holds only transient, possibly
 * incomplete transaction data that must not survive a full browser reload.
 */

export interface RmDraftLine {
  key: string;
  itemId?: string;
  uomId?: string;
  gatePassQuantity?: number;
  receivedQuantity?: number;
}

/**
 * A photo/attachment still being edited (kept client-side as a File object).
 * In-memory only — bytes never touch the server until the receipt header save
 * succeeds (upload-after-save), so cancelling never leaves orphan files.
 */
export interface PendingFile {
  key: string;
  kind: 'PHOTO' | 'ATTACHMENT';
  name: string;
  size: number;
  mime: string;
  file: File;
}

export interface ReceiptDraft {
  editingId: string | null;
  /** Raw antd form values (receiptDate kept as a dayjs object in memory). */
  values: Record<string, unknown>;
  rows: RmDraftLine[];
  /** Photos/attachments added but not yet uploaded (upload-after-save). */
  pendingFiles?: PendingFile[];
}

export interface OrgBundle {
  warehouses: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  uoms: Array<Record<string, unknown>>;
  divisions: Array<Record<string, unknown>>;
  productionOrders: Array<Record<string, unknown>>;
  sections: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
}

const REF_CACHE_TTL_MS = 5 * 60 * 1000;

interface RawReceiptDraftState {
  /** true while the receipt is shown as a minimized bar (draft preserved). */
  minimized: boolean;
  /** one-shot restore request from the persistent dock. */
  pendingRestore: boolean;
  /** the live receipt draft, or null when no session is active. */
  draft: ReceiptDraft | null;
  /** cached form reference data reused across page visits (immediate UI). */
  refCache: { data: OrgBundle; ts: number } | null;
  updateDraft: (draft: ReceiptDraft) => void;
  setMinimized: (minimized: boolean) => void;
  requestRestore: () => void;
  clearPendingRestore: () => void;
  closeDraft: () => void;
  setRefCache: (data: OrgBundle) => void;
  getRefCache: () => { data: OrgBundle; ts: number } | null;
}

export const useRawReceiptDraftStore = create<RawReceiptDraftState>((set, get) => ({
  minimized: false,
  pendingRestore: false,
  draft: null,
  refCache: null,
  updateDraft: (draft) => set({ draft }),
  setMinimized: (minimized) => set({ minimized }),
  requestRestore: () =>
    set((s) => ({
      minimized: false,
      pendingRestore: true,
      draft: s.draft,
    })),
  clearPendingRestore: () => set({ pendingRestore: false }),
  closeDraft: () =>
    set({
      minimized: false,
      pendingRestore: false,
      draft: null,
    }),
  setRefCache: (data) => set({ refCache: { data, ts: Date.now() } }),
  getRefCache: () => {
    const cache = get().refCache;
    if (!cache) return null;
    if (Date.now() - cache.ts > REF_CACHE_TTL_MS) return null;
    return cache;
  },
}));

/** Convenience accessor for non-hook contexts. */
export const rawReceiptDraftStore = useRawReceiptDraftStore;