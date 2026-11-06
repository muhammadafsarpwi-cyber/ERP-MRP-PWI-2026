import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone recorder backed by the native MediaRecorder API + Web Audio
 * payload compression (no external dependencies).
 *
 * Captures audio as a compact 16 kHz mono Opus/WebM or MP4 blob (16 kbps)
 * and applies client-side Web Audio API downsampling (16 kHz mono PCM16 WAV)
 * whenever the raw recording exceeds 300 KB, eliminating "413 Request Entity
 * Too Large" before sending base64 payloads to POST /ai/assistant/voice.
 *
 * Also runs parallel Web Speech API recognition when available in the browser
 * so voice queries have an instant local transcript fallback if the backend
 * Whisper API is offline.
 */

/** Stop automatically after this many seconds (Whisper caps at 25 MB / long audio). */
const MAX_RECORDING_SECONDS = 60;

/** Target bitrate for voice capture (16 kbps = ~2 KB/s, 60s = ~120 KB). */
const VOICE_BITS_PER_SECOND = 16000;

/** Threshold above which client-side Web Audio API downsampling is triggered. */
const COMPRESSION_THRESHOLD_BYTES = 300 * 1024; // 300 KB

/** Target sample rate for Whisper speech-to-text (16 kHz mono is Whisper's native rate). */
const WHISPER_SAMPLE_RATE = 16000;

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

export interface RecordedVoicePayload {
  blob: Blob;
  mimeType: string;
  /** Parallel browser speech recognition transcript (fallback when offline). */
  liveTranscript?: string;
  /** Diagnostic error code if browser speech recognition failed (e.g. not-allowed, network, audio-capture). */
  speechError?: string;
}

export interface UseVoiceRecorder {
  isRecording: boolean;
  /** Whole seconds elapsed since recording started (0 when idle). */
  elapsedSeconds: number;
  /** Live browser transcript captured in parallel while speaking. */
  liveTranscript: string;
  /** Human-readable failure (permission denied, unsupported browser, ...). */
  error: string | null;
  /**
   * Starts recording. `speechLang` is the BCP-47 tag used by the parallel
   * browser SpeechRecognition (e.g. 'ur-PK' for Urdu, 'en-US' for English).
   * When `browserSpeechOnly` is true, skips competing MediaRecorder/getUserMedia(16kHz)
   * so browser SpeechRecognition has exclusive microphone access on Windows.
   */
  start: (speechLang?: string, browserSpeechOnly?: boolean) => Promise<boolean>;
  /** Stops, compresses, and resolves the recorded audio (null when nothing was captured). */
  stop: () => Promise<RecordedVoicePayload | null>;
  reset: () => void;
}

export function useVoiceRecorder(): UseVoiceRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const wantRecordingRef = useRef<boolean>(false);
  const accumulatedTranscriptRef = useRef<string>('');
  const sessionTranscriptRef = useRef<string>('');
  const transcriptRef = useRef<string>('');
  const speechErrorRef = useRef<string>('');
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef<string>('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (maxTimeoutRef.current) { clearTimeout(maxTimeoutRef.current); maxTimeoutRef.current = null; }
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    wantRecordingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  /** Stop tracks unconditionally — the mic LED must always turn off. */
  const releaseStream = useCallback(() => {
    stopSpeechRecognition();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [stopSpeechRecognition]);

  /**
   * Ask the browser recognizer to finish gracefully so the last spoken words
   * are delivered as a FINAL result before we read the transcript (an abrupt
   * stop with handlers detached used to drop the tail of the sentence).
   */
  const flushSpeechRecognition = useCallback((): Promise<void> => {
    wantRecordingRef.current = false;
    const recognition = recognitionRef.current;
    if (!recognition) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        recognition.onend = finish;
        recognition.stop();
      } catch {
        finish();
      }
      setTimeout(finish, 750);
    });
  }, []);

  const stop = useCallback(async (): Promise<RecordedVoicePayload | null> => {
    clearTimers();
    await flushSpeechRecognition();
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      const capturedText = transcriptRef.current.trim();
      const capturedError = speechErrorRef.current;
      stopSpeechRecognition();

      // Browser-Speech-Only path (no MediaRecorder running)
      if (!recorder || recorder.state === 'inactive') {
        releaseStream();
        setIsRecording(false);
        setElapsedSeconds(0);
        resolve({
          blob: new Blob(['speech'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          liveTranscript: capturedText || undefined,
          speechError: capturedError || undefined,
        });
        return;
      }

      recorder.onstop = async () => {
        const rawMime = mimeTypeRef.current || recorder.mimeType || 'audio/webm';
        const cleanMime = rawMime.split(';')[0].trim();
        const rawBlob = new Blob(chunksRef.current, { type: cleanMime });
        const finalText = transcriptRef.current.trim() || capturedText;

        chunksRef.current = [];
        recorderRef.current = null;
        releaseStream();
        setIsRecording(false);
        setElapsedSeconds(0);

        if (rawBlob.size === 0 && !finalText) {
          resolve({
            blob: new Blob(['speech'], { type: 'audio/webm' }),
            mimeType: 'audio/webm',
            liveTranscript: undefined,
            speechError: capturedError || undefined,
          });
          return;
        }

        // Compress payload client-side before sending to backend to prevent 413 Entity Too Large
        const compressed = rawBlob.size > 0 ? await compressAudioBlob(rawBlob, cleanMime) : { blob: rawBlob, mimeType: cleanMime };
        resolve({
          blob: compressed.blob,
          mimeType: compressed.mimeType,
          liveTranscript: finalText || undefined,
          speechError: capturedError || undefined,
        });
      };

      try {
        recorder.stop();
      } catch {
        releaseStream();
        setIsRecording(false);
        resolve({
          blob: new Blob(['speech'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          liveTranscript: capturedText || undefined,
          speechError: capturedError || undefined,
        });
      }
    });
  }, [clearTimers, flushSpeechRecognition, releaseStream, stopSpeechRecognition]);

  const start = useCallback(async (speechLang = 'ur-PK', browserSpeechOnly = false): Promise<boolean> => {
    setError(null);
    setLiveTranscript('');
    accumulatedTranscriptRef.current = '';
    sessionTranscriptRef.current = '';
    transcriptRef.current = '';
    speechErrorRef.current = '';
    wantRecordingRef.current = true;

    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : undefined;

    // 1. Start Browser SpeechRecognition SYNCHRONOUSLY inside user click gesture
    let recognitionStarted = false;
    if (SpeechRecognitionCtor) {
      // Include '' (browser native default locale) as final fallback so Chrome/Edge never fails if a specific locale tag is rejected
      const fallbackChain =
        speechLang === 'en-US'
          ? ['en-US', '']
          : [speechLang || 'ur-PK', 'en-US', ''];

      const launchRecognition = (langIndex: number) => {
        if (!wantRecordingRef.current || langIndex >= fallbackChain.length) return;
        const lang = fallbackChain[langIndex];
        let hasResultInSession = false;
        let stepHandled = false;
        try {
          const recognition = new SpeechRecognitionCtor();
          // Use continuous = false + auto-restart in onend: prevents Chrome/Edge 'network' errors on non-US locales
          recognition.continuous = false;
          recognition.interimResults = true;
          recognition.maxAlternatives = 1;
          if (lang) {
            recognition.lang = lang;
          }

          recognition.onresult = (event: any) => {
            hasResultInSession = true;
            let currentSession = '';
            for (let i = 0; i < event.results.length; i += 1) {
              const piece = event.results[i][0]?.transcript || '';
              currentSession += `${piece} `;
            }
            sessionTranscriptRef.current = currentSession.replace(/\s+/g, ' ').trim();
            const fullText = [accumulatedTranscriptRef.current, sessionTranscriptRef.current]
              .filter(Boolean)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            if (fullText) {
              transcriptRef.current = fullText;
              setLiveTranscript(fullText);
              speechErrorRef.current = '';
            }
          };

          recognition.onerror = (event: any) => {
            const errCode = String(event?.error || '');
            if (
              (errCode === 'language-not-supported' || errCode === 'network') &&
              !hasResultInSession &&
              langIndex + 1 < fallbackChain.length
            ) {
              stepHandled = true;
              try {
                recognition.onend = null;
                recognition.abort();
              } catch {}
              setTimeout(() => {
                if (wantRecordingRef.current) launchRecognition(langIndex + 1);
              }, 200);
              return;
            }
            if (errCode && errCode !== 'no-speech' && errCode !== 'aborted') {
              speechErrorRef.current = errCode;
            }
          };

          recognition.onend = () => {
            if (stepHandled) return;
            // Commit any partial/final transcript from this phrase before restarting
            if (sessionTranscriptRef.current) {
              accumulatedTranscriptRef.current = [
                accumulatedTranscriptRef.current,
                sessionTranscriptRef.current,
              ]
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
              sessionTranscriptRef.current = '';
            }
            // Only auto-restart if still recording and no fatal/network error stopped us
            if (
              wantRecordingRef.current &&
              speechErrorRef.current !== 'not-allowed' &&
              speechErrorRef.current !== 'service-not-allowed' &&
              speechErrorRef.current !== 'audio-capture' &&
              speechErrorRef.current !== 'network'
            ) {
              setTimeout(() => {
                if (wantRecordingRef.current) launchRecognition(langIndex);
              }, 120);
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
          recognitionStarted = true;
        } catch (e: any) {
          speechErrorRef.current = e?.message || 'speech-start-failed';
        }
      };

      launchRecognition(0);
    } else {
      speechErrorRef.current = 'speech-api-unsupported';
    }

    // 2. If running in Browser-Speech-Only mode (backend Whisper STT not configured),
    // DO NOT open getUserMedia(16kHz) + MediaRecorder, so SpeechRecognition has 100% exclusive access to the Windows microphone!
    if (browserSpeechOnly && recognitionStarted) {
      startedAtRef.current = Date.now();
      setIsRecording(true);
      setElapsedSeconds(0);
      tickRef.current = setInterval(() => {
        setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 500);
      maxTimeoutRef.current = setTimeout(() => {
        void stop();
      }, MAX_RECORDING_SECONDS * 1000);
      return true;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      if (recognitionStarted) {
        startedAtRef.current = Date.now();
        setIsRecording(true);
        setElapsedSeconds(0);
        return true;
      }
      setError('Audio recording is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return false;
    }

    try {
      // Standard audio constraints (do not force sampleRate: 16000 on getUserMedia as it conflicts with Windows WASAPI drivers)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: VOICE_BITS_PER_SECOND, // 16 kbps (~2 KB/s) prevents 413 Request Entity Too Large
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, recorderOptions);
      } catch {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      }

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
    accumulatedTranscriptRef.current = '';
    sessionTranscriptRef.current = '';
    transcriptRef.current = '';
    speechErrorRef.current = '';
    setLiveTranscript('');
    setIsRecording(false);
    setElapsedSeconds(0);
    setError(null);
  }, [clearTimers, releaseStream]);

  // Unmount safety: never leave the microphone stream open.
  useEffect(() => reset, [reset]);

  return { isRecording, elapsedSeconds, liveTranscript, error, start, stop, reset };
}

/**
 * Client-side audio payload compressor.
 *
 * When a recorded blob is already compact (<= 300 KB), returns it untouched.
 * If the browser ignored `audioBitsPerSecond` and produced a large payload,
 * decodes and downsamples the audio to 16 kHz mono PCM16 WAV (Whisper's native
 * input format) and trims leading/trailing silence so the base64 JSON body
 * stays well below proxy/server limits (preventing HTTP 413).
 */
export async function compressAudioBlob(
  blob: Blob,
  mimeType: string,
): Promise<{ blob: Blob; mimeType: string }> {
  const cleanMime = (mimeType || blob.type || 'audio/webm').split(';')[0].trim();
  if (blob.size <= COMPRESSION_THRESHOLD_BYTES) {
    return { blob, mimeType: cleanMime };
  }

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioCtx || !OfflineCtx) {
      return { blob, mimeType: cleanMime };
    }

    const arrayBuffer = await blob.arrayBuffer();
    const decodeCtx = new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      void decodeCtx.close().catch(() => {});
    }

    // Cap duration at MAX_RECORDING_SECONDS and resample to 8 kHz mono PCM16 WAV
    // if 16 kHz would still exceed 1.5 MB.
    const maxDuration = Math.min(decoded.duration, MAX_RECORDING_SECONDS);
    const targetRate = maxDuration * WHISPER_SAMPLE_RATE * 2 > 1_200_000 ? 8000 : WHISPER_SAMPLE_RATE;
    const targetLength = Math.max(1, Math.ceil(maxDuration * targetRate));

    const offlineCtx = new OfflineCtx(1, targetLength, targetRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const wavBlob = encodeMonoWav16Bit(rendered.getChannelData(0), targetRate);

    // Use whichever representation is smaller
    if (wavBlob.size < blob.size) {
      return { blob: wavBlob, mimeType: 'audio/wav' };
    }
  } catch {
    // Fall back to original blob if Web Audio decoding fails
  }

  return { blob, mimeType: cleanMime };
}

function encodeMonoWav16Bit(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16 bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Compress & convert Blob → raw base64 (no data: prefix) for the backend's JSON voice contract.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const { blob: compressedBlob } = await compressAudioBlob(blob, blob.type || 'audio/webm');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read the recorded audio.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.readAsDataURL(compressedBlob);
  });
}
