/**
 * IndexedDB storage utility for user uploaded custom background music / audio tracks.
 * Provides persistent local storage without filling up localStorage quota limits.
 */

export interface StoredAudioTrack {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  duration?: number;
  createdAt: number;
}

const DB_NAME = 'pwi_erp_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_audio_tracks';

function openAudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open audio database'));
    };
  });
}

/**
 * Retrieve all custom audio tracks from IndexedDB.
 */
export async function getStoredAudioTracks(): Promise<StoredAudioTrack[]> {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const results: StoredAudioTrack[] = req.result || [];
        // Sort descending by creation date
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };

      req.onerror = () => {
        reject(req.error || new Error('Failed to load audio tracks'));
      };
    });
  } catch (err) {
    console.warn('Audio storage read fallback:', err);
    return [];
  }
}

/**
 * Save an uploaded audio file into IndexedDB.
 */
export async function saveAudioFile(file: File): Promise<StoredAudioTrack> {
  // Convert file to Data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio file'));
    reader.readAsDataURL(file);
  });

  // Try to determine audio duration
  let duration: number | undefined;
  try {
    duration = await new Promise<number>((resolve) => {
      const tempAudio = new Audio();
      tempAudio.src = dataUrl;
      tempAudio.onloadedmetadata = () => {
        resolve(Math.round(tempAudio.duration));
      };
      tempAudio.onerror = () => resolve(0);
      // Timeout fallback
      setTimeout(() => resolve(0), 2000);
    });
  } catch {
    duration = undefined;
  }

  const track: StoredAudioTrack = {
    id: `track_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name.replace(/\.[^/.]+$/, ''), // Clean file name without extension
    size: file.size,
    type: file.type || 'audio/mpeg',
    dataUrl,
    duration,
    createdAt: Date.now(),
  };

  const db = await openAudioDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(track);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to save audio track'));
  });

  return track;
}

/**
 * Delete a custom audio track by ID.
 */
export async function deleteStoredAudioTrack(id: string): Promise<void> {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to delete audio track'));
  });
}

/**
 * Trigger browser download for an audio track.
 */
export function downloadAudioFile(track: StoredAudioTrack): void {
  try {
    const link = document.createElement('a');
    link.href = track.dataUrl;
    const ext = track.type.includes('wav')
      ? 'wav'
      : track.type.includes('ogg')
      ? 'ogg'
      : track.type.includes('aac')
      ? 'aac'
      : 'mp3';
    link.download = `${track.name}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Failed to download audio file:', err);
  }
}
