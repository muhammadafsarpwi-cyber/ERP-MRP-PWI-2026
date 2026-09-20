import { create } from 'zustand';
import { classicalAmbientMusic } from '../utils/classicalAmbientMusic';

interface MusicState {
  isPlaying: boolean;
  volume: number; // 0 to 1
  togglePlay: () => boolean;
  setVolume: (v: number) => void;
  stop: () => void;
}

const getInitialVolume = (): number => {
  try {
    const saved = localStorage.getItem('pwi_classical_music_volume');
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
  } catch {}
  return 0.65; // Default clear & audible volume
};

export const useMusicStore = create<MusicState>((set, get) => ({
  isPlaying: false,
  volume: getInitialVolume(),

  togglePlay: () => {
    const { isPlaying, volume } = get();
    if (isPlaying) {
      classicalAmbientMusic.stop(300);
      set({ isPlaying: false });
      return false;
    } else {
      classicalAmbientMusic.setVolume(volume);
      const ok = classicalAmbientMusic.start();
      set({ isPlaying: ok });
      return ok;
    }
  },

  setVolume: (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem('pwi_classical_music_volume', String(clamped));
    } catch {}
    classicalAmbientMusic.setVolume(clamped);
    set({ volume: clamped });
  },

  stop: () => {
    classicalAmbientMusic.stop(300);
    set({ isPlaying: false });
  },
}));
