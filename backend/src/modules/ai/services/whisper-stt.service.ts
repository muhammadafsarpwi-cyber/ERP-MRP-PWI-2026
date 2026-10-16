import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aiConfig } from '../../../config/ai.config';

export interface TranscribeResult {
  text: string;
  /** ISO-639-1 language Whisper detected (best-effort). */
  language?: string;
  durationSeconds?: number;
}

const MIME_EXTENSION: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/mp3': 'mp3',
};

/**
 * Speech-to-Text via the OpenAI Whisper API (`whisper-1`), called with Node
 * 20's built-in `fetch` + `FormData` — no SDK dependency required.
 *
 * Why Whisper for an English/Urdu manufacturing ERP? It is the strongest
 * publicly available model for mixed Urdu/English ("code-switched") speech,
 * which is exactly how shop-floor supervisors talk: "SPT division ka last
 * month ka production show karo".
 *
 * The domain prompt below biases decoding toward ERP vocabulary (division
 * codes SPT / PL / City-CT, production, stock, invoice, حاضری …) which
 * measurably reduces transcription errors on jargon.
 */
@Injectable()
export class WhisperSttService {
  private readonly logger = new Logger(WhisperSttService.name);
  private readonly cfg = aiConfig(this.config).openai;

  /** Domain vocabulary fed to Whisper to bias decoding toward ERP terms. */
  private static readonly DOMAIN_PROMPT =
    'ERP manufacturing terms: SPT, PL, City, CT, division, production, production order, ' +
    'stock, inventory, warehouse, store, invoice, sales order, purchase order, supplier, ' +
    'customer, attendance, overtime, leave, employee, machine, downtime, scrap, quality, ' +
    'inspection, BOM, dispatch, GRN, item, SKU. Urdu and English words may be mixed.';

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.cfg.apiKey);
  }

  /**
   * Transcribe an audio buffer. Throws 503 when OPENAI_API_KEY is missing and
   * 400 for oversized/empty payloads.
   */
  async transcribe(
    audio: Buffer,
    options: { mimeType?: string; language?: string } = {},
  ): Promise<TranscribeResult> {
    if (!this.cfg.apiKey) {
      throw new ServiceUnavailableException({
        success: false,
        error: {
          code: 'AI_STT_NOT_CONFIGURED',
          message: 'OPENAI_API_KEY is not configured — voice queries are disabled.',
          details: 'Add OPENAI_API_KEY to backend/.env to enable Whisper speech-to-text.',
        },
      });
    }

    if (!audio?.length) {
      throw new BadRequestException({
        success: false,
        error: { code: 'AI_EMPTY_AUDIO', message: 'The uploaded audio file is empty.' },
      });
    }

    // Whisper's hard API limit is 25 MB; enforce it before any upload starts.
    const maxBytes = Math.min(this.cfg.maxAudioBytes, 25 * 1024 * 1024);
    if (audio.length > maxBytes) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'AI_AUDIO_TOO_LARGE',
          message: `Audio file is ${(audio.length / 1024 / 1024).toFixed(1)} MB; the limit is ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
          details: 'Record shorter clips (roughly under 10 minutes) or compress the audio client-side.',
        },
      });
    }

    const mimeType = (options.mimeType || 'application/octet-stream').split(';')[0].trim();
    const extension = MIME_EXTENSION[mimeType] ?? 'webm';

    const form = new FormData();
    const blob = new Blob([new Uint8Array(audio)], { type: mimeType });
    form.append('file', blob, `voice-query.${extension}`);
    form.append('model', this.cfg.sttModel);
    form.append('response_format', 'verbose_json');
    form.append('prompt', WhisperSttService.DOMAIN_PROMPT);
    // Optional hint: the frontend usually knows which language the user picked.
    if (options.language && /^[a-z]{2}(-[A-Za-z]{2,8})?$/.test(options.language)) {
      form.append('language', options.language);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        this.logger.warn(`Whisper HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
        if (response.status === 401 || response.status === 403) {
          throw new ServiceUnavailableException({
            success: false,
            error: { code: 'AI_STT_AUTH', message: 'Speech-to-Text credentials were rejected (check OPENAI_API_KEY).' },
          });
        }
        if (response.status === 429) {
          throw new ServiceUnavailableException({
            success: false,
            error: { code: 'AI_STT_RATE_LIMIT', message: 'Speech-to-Text is rate-limited right now — please retry in a moment.' },
          });
        }
        throw new ServiceUnavailableException({
          success: false,
          error: { code: 'AI_STT_FAILED', message: `Speech-to-Text failed (HTTP ${response.status}).` },
        });
      }

      const data = (await response.json()) as {
        text?: string;
        language?: string;
        duration?: number;
      };

      const text = (data.text ?? '').trim();
      if (!text) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'AI_STT_NO_SPEECH',
            message: 'No speech could be detected in the audio.',
            details: 'Move closer to the microphone, reduce background noise and try again.',
          },
        });
      }

      return { text, language: data.language, durationSeconds: data.duration };
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new ServiceUnavailableException({
          success: false,
          error: {
            code: 'AI_STT_TIMEOUT',
            message: `Speech-to-Text timed out after ${this.cfg.timeoutMs / 1000}s.`,
          },
        });
      }
      // NestJS exceptions thrown above must pass through untouched.
      if (err instanceof BadRequestException || err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException({
        success: false,
        error: {
          code: 'AI_STT_FAILED',
          message: `Speech-to-Text failed: ${(err as Error)?.message ?? err}`,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
