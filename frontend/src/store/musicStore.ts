import { create } from 'zustand';
import { classicalAmbientMusic } from '../utils/classicalAmbientMusic';
import {
  getStoredAudioTracks,
  saveAudioFile,
  deleteStoredAudioTrack,
  downloadAudioFile,
  StoredAudioTrack,
} from '../utils/audioStorage';

export const BUILT_IN_TRACK_ID = 'built-in-classical';
export const BUILT_IN_TRACK_TITLE = 'Classical Ambient Harmony (Web Audio Synthesizer)';

export type AudioSourceType = 'procedural' | 'custom';

interface MusicState {
  isPlaying: boolean;
  volume: number; // 0 to 1
  activeTrackId: string;
  activeTrackTitle: string;
  activeTrackType: AudioSourceType;
  customTracks: StoredAudioTrack[];
  isLooping: boolean;
  isLoading: boolean;

  // Actions
  initAudio: () => Promise<void>;
  togglePlay: () => boolean;
  play: () => boolean;
  pause: () => void;
  stop: () => void;
  setVolume: (v: number) => void;
  selectTrack: (trackId: string, autoStart?: boolean) => Promise<boolean>;
  uploadTrack: (file: File) => Promise<StoredAudioTrack>;
  deleteTrack: (trackId: string) => Promise<void>;
  downloadTrack: (trackId: string) => void;
  setLooping: (loop: boolean) => void;
}

// Global HTMLAudioElement singleton for custom uploaded audio tracks
let customAudioEl: HTMLAudioElement | null = null;

function getCustomAudioEl(): HTMLAudioElement {
  if (!customAudioEl && typeof window !== 'undefined') {
    customAudioEl = new Audio();
    customAudioEl.preload = 'auto';
  }
  return customAudioEl!;
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

const getInitialTrackId = (): string => {
  try {
    const saved = localStorage.getItem('pwi_music_active_track_id');
    if (saved) return saved;
  } catch {}
  return BUILT_IN_TRACK_ID;
};

const getInitialLooping = (): boolean => {
  try {
    const saved = localStorage.getItem('pwi_music_is_looping');
    if (saved !== null) return saved === 'true';
  } catch {}
  return true;
};

export const useMusicStore = create<MusicState>((set, get) => ({
  isPlaying: false,
  volume: getInitialVolume(),
  activeTrackId: getInitialTrackId(),
  activeTrackTitle: BUILT_IN_TRACK_TITLE,
  activeTrackType: 'procedural',
  customTracks: [],
  isLooping: getInitialLooping(),
  isLoading: false,

  initAudio: async () => {
    set({ isLoading: true });
    try {
      const tracks = await getStoredAudioTracks();
      const currentTrackId = get().activeTrackId;
      const foundTrack = tracks.find((t) => t.id === currentTrackId);

      if (foundTrack) {
        set({
          customTracks: tracks,
          activeTrackType: 'custom',
          activeTrackTitle: foundTrack.name,
          isLoading: false,
        });
      } else {
        set({
          customTracks: tracks,
          activeTrackId: BUILT_IN_TRACK_ID,
          activeTrackType: 'procedural',
          activeTrackTitle: BUILT_IN_TRACK_TITLE,
          isLoading: false,
        });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  togglePlay: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().pause();
      return false;
    } else {
      return get().play();
    }
  },

  play: () => {
    const { activeTrackType, activeTrackId, customTracks, volume, isLooping } = get();

    if (activeTrackType === 'procedural') {
      // Stop any custom audio
      if (customAudioEl) {
        customAudioEl.pause();
      }
      classicalAmbientMusic.setVolume(volume);
      const ok = classicalAmbientMusic.start();
      set({ isPlaying: ok });
      return ok;
    } else {
      // Stop procedural audio
      classicalAmbientMusic.stop(200);

      const targetTrack = customTracks.find((t) => t.id === activeTrackId);
      if (!targetTrack) {
        // Fallback to procedural
        set({
          activeTrackId: BUILT_IN_TRACK_ID,
          activeTrackType: 'procedural',
          activeTrackTitle: BUILT_IN_TRACK_TITLE,
        });
        classicalAmbientMusic.setVolume(volume);
        const ok = classicalAmbientMusic.start();
        set({ isPlaying: ok });
        return ok;
      }

      const audio = getCustomAudioEl();
      if (!audio.src || !audio.src.includes(targetTrack.id)) {
        audio.src = targetTrack.dataUrl;
      }
      audio.volume = volume;
      audio.loop = isLooping;

      audio.onended = () => {
        if (!get().isLooping) {
          set({ isPlaying: false });
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            set({ isPlaying: true });
          })
          .catch((err) => {
            console.warn('Audio playback blocked or failed:', err);
            set({ isPlaying: false });
          });
      }
      set({ isPlaying: true });
      return true;
    }
  },

  pause: () => {
    const { activeTrackType } = get();
    if (activeTrackType === 'procedural') {
      classicalAmbientMusic.stop(300);
    } else {
      if (customAudioEl) {
        customAudioEl.pause();
      }
    }
    set({ isPlaying: false });
  },

  stop: () => {
    classicalAmbientMusic.stop(300);
    if (customAudioEl) {
      customAudioEl.pause();
      customAudioEl.currentTime = 0;
    }
    set({ isPlaying: false });
  },

  setVolume: (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem('pwi_classical_music_volume', String(clamped));
    } catch {}

    classicalAmbientMusic.setVolume(clamped);
    if (customAudioEl) {
      customAudioEl.volume = clamped;
    }
    set({ volume: clamped });
  },

  selectTrack: async (trackId: string, autoStart = true) => {
    const { customTracks, isPlaying, volume, isLooping } = get();

    // Save selection
    try {
      localStorage.setItem('pwi_music_active_track_id', trackId);
    } catch {}

    if (trackId === BUILT_IN_TRACK_ID) {
      if (customAudioEl) {
        customAudioEl.pause();
      }
      set({
        activeTrackId: BUILT_IN_TRACK_ID,
        activeTrackType: 'procedural',
        activeTrackTitle: BUILT_IN_TRACK_TITLE,
      });

      if (isPlaying || autoStart) {
        classicalAmbientMusic.setVolume(volume);
        const ok = classicalAmbientMusic.start();
        set({ isPlaying: ok });
        return ok;
      }
      return true;
    } else {
      const target = customTracks.find((t) => t.id === trackId);
      if (!target) return false;

      classicalAmbientMusic.stop(200);

      const audio = getCustomAudioEl();
      audio.src = target.dataUrl;
      audio.volume = volume;
      audio.loop = isLooping;

      set({
        activeTrackId: target.id,
        activeTrackType: 'custom',
        activeTrackTitle: target.name,
      });

      if (isPlaying || autoStart) {
        try {
          await audio.play();
          set({ isPlaying: true });
          return true;
        } catch {
          set({ isPlaying: false });
          return false;
        }
      }
      return true;
    }
  },

  uploadTrack: async (file: File) => {
    set({ isLoading: true });
    try {
      const savedTrack = await saveAudioFile(file);
      const updatedTracks = [savedTrack, ...get().customTracks];
      set({
        customTracks: updatedTracks,
        isLoading: false,
      });

      // Automatically switch to the newly uploaded track
      await get().selectTrack(savedTrack.id, true);
      return savedTrack;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  deleteTrack: async (trackId: string) => {
    await deleteStoredAudioTrack(trackId);
    const remaining = get().customTracks.filter((t) => t.id !== trackId);

    // If active track was deleted, switch back to built-in procedural track
    if (get().activeTrackId === trackId) {
      await get().selectTrack(BUILT_IN_TRACK_ID, get().isPlaying);
    }

    set({ customTracks: remaining });
  },

  downloadTrack: (trackId: string) => {
    const { customTracks } = get();
    const track = customTracks.find((t) => t.id === trackId);
    if (track) {
      downloadAudioFile(track);
    }
  },

  setLooping: (loop: boolean) => {
    try {
      localStorage.setItem('pwi_music_is_looping', String(loop));
    } catch {}
    if (customAudioEl) {
      customAudioEl.loop = loop;
    }
    set({ isLooping: loop });
  },
}));

// Initialize custom tracks on module load if in browser
if (typeof window !== 'undefined') {
  setTimeout(() => {
    useMusicStore.getState().initAudio().catch(() => {});
  }, 100);
}
