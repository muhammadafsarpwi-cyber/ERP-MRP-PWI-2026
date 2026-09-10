import { create } from 'zustand';

interface LoadingStoreState {
  /** Number of in-flight operations (API calls, navigation pulses, ...). */
  counter: number;
  begin: () => void;
  end: () => void;
}

export const useLoadingStore = create<LoadingStoreState>((set) => ({
  counter: 0,
  begin: () => set((state) => ({ counter: state.counter + 1 })),
  end: () =>
    set((state) => ({
      counter: Math.max(0, state.counter - 1),
    })),
}));