import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone recorder backed by the native MediaRecorder API (no dependencies).
 *
 * Captures audio as a single Blob with a container the backend Whisper
 * pipeline accepts (webm/opus on Chrome & Edge, mp4 on Safari), enforces a
 * maximum duration guard, and always releases the microphone stream so the
 * browser's recording indicator turns off.
 *
 * Pair with blobToBase64() → aiAssistantService.voiceQuery() for the
 * JSON { audioBase64, mimeType, language } voice contract.
 */

/** Stop automatically after this many seconds (Whisper caps at 25 MB / long audio). */
const MAX_RECORDING_SECONDS = 60;

/** Preferred containers, best-first. */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4', // Safari
  'audio/ogg;codecs=opus',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export interface UseVoiceRecorder {
  isRecording: boolean;
  /** Whole seconds elapsed since recording started (0 when idle). */
  elapsedSeconds: number;
  /** Human-readable failure (permission denied, unsupported browser, ...). */
  error: string | null;
  start: () => Promise<boolean>;
  /** Stops and resolves the recorded audio (null when nothing was captured). */
  stop: () => Promise<{ blob: Blob; mimeType: string } | null>;
  reset: () => void;
}

export function useVoiceRecorder(): UseVoiceRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef<string>('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (maxTimeoutRef.current) { clearTimeout(maxTimeoutRef.current); maxTimeoutRef.current = null; }
  }, []);

  /** Stop tracks unconditionally — the mic LED must always turn off. */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback((): Promise<{ blob: Blob; mimeType: string } | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      clearTimers();

      if (!recorder || recorder.state === 'inactive') {
        releaseStream();
        setIsRecording(false);
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = mimeTypeRef.current || recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        recorderRef.current = null;
        releaseStream();
        setIsRecording(false);
        setElapsedSeconds(0);
        resolve(blob.size > 0 ? { blob, mimeType } : null);
      };

      try {
        recorder.stop();
      } catch {
        releaseStream();
        setIsRecording(false);
        resolve(null);
      }
    });
  }, [clearTimers, releaseStream]);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mimeTypeRef.current = mimeType || recorder.mimeType || 'audio/webm';
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start(250); // push chunks periodically so nothing is lost on crash
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setIsRecording(true);
      setElapsedSeconds(0);

      tickRef.current = setInterval(() => {
        setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 500);

      // Hard stop guard — Whisper cost + payload size safety.
      maxTimeoutRef.current = setTimeout(() => {
        void stop();
      }, MAX_RECORDING_SECONDS * 1000);

      return true;
    } catch (err: any) {
      releaseStream();
      setIsRecording(false);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setError('Microphone access was denied. Please allow microphone permission in your browser settings.');
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setError('No microphone was found. Please connect a microphone and try again.');
      } else {
        setError('Could not start recording. Please try again.');
      }
      return false;
    }
  }, [releaseStream, stop]);

  const reset = useCallback(() => {
    clearTimers();
    releaseStream();
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setElapsedSeconds(0);
    setError(null);
  }, [clearTimers, releaseStream]);

  // Unmount safety: never leave the microphone stream open.
  useEffect(() => reset, [reset]);

  return { isRecording, elapsedSeconds, error, start, stop, reset };
}

/**
 * Blob → raw base64 (no data: prefix) for the backend's JSON voice contract.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read the recorded audio.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.readAsDataURL(blob);
  });
}
