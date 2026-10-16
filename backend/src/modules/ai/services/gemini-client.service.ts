import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aiConfig } from '../../../config/ai.config';

/**
 * Zero-dependency Google Gemini REST client.
 *
 * The official `@google/generative-ai` SDK is intentionally NOT added to
 * package.json: Node 20 ships a global `fetch`, and the single
 * `generateContent` call this module needs is small enough that a hand-rolled
 * client (with proper timeout, retry/backoff and JSON-mode handling) is more
 * transparent and adds no supply-chain surface.
 *
 * Reliability behaviour:
 *  - per-request timeout via AbortController (GEMINI_TIMEOUT_MS),
 *  - exponential backoff + jitter on 429/5xx, honouring `Retry-After`,
 *  - one automatic model fallback when the configured model does not exist,
 *  - response is returned as parsed JSON (`responseMimeType: application/json`)
 *    with fence-stripping as a safety net.
 */
@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly cfg = aiConfig(this.config).gemini;
  private readonly fallbackModel = 'gemini-1.5-pro';

  constructor(private readonly config: ConfigService) {}

  get model(): string {
    return this.cfg.model;
  }

  /**
   * Ask Gemini for a JSON object matching `T`.
   * `temperature` defaults to 0 — SQL generation must be deterministic.
   */
  async generateJson<T>(system: string, user: string, temperature = 0): Promise<T> {
    const text = await this.generateText(system, user, temperature, true);
    return this.parseJson<T>(text);
  }

  async generateText(
    system: string,
    user: string,
    temperature = 0.2,
    forceJson = false,
  ): Promise<string> {
    if (!this.cfg.apiKey) {
      throw new ServiceUnavailableException({
        success: false,
        error: {
          code: 'AI_NOT_CONFIGURED',
          message: 'GEMINI_API_KEY is not configured — the AI assistant is disabled.',
          details: 'Create a key at https://aistudio.google.com/apikey and add GEMINI_API_KEY to backend/.env',
        },
      });
    }

    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        topK: 1,
        maxOutputTokens: 4096,
        ...(forceJson ? { responseMimeType: 'application/json' } : {}),
      },
    };

    return this.callWithRetry(body);
  }

  private async callWithRetry(body: unknown, allowModelFallback = true): Promise<string> {
    let lastError = 'unknown error';

    for (let attempt = 1; attempt <= 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

      try {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${this.cfg.model}` +
          `:generateContent?key=${encodeURIComponent(this.cfg.apiKey)}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await response.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
          if (!text) throw new Error('Gemini returned an empty response (no candidates).');
          return text;
        }

        // Model not found → try the fallback model once.
        if (response.status === 404 && allowModelFallback) {
          this.logger.warn(`Gemini model "${this.cfg.model}" not found — falling back to ${this.fallbackModel}`);
          (this.cfg as { model: string }).model = this.fallbackModel;
          return this.callWithRetry(body, false);
        }

        const errorBody = await response.text().catch(() => '');
        lastError = `Gemini HTTP ${response.status}: ${errorBody.slice(0, 400)}`;

        const retriable = response.status === 429 || response.status >= 500;
        if (!retriable) throw new BadRequestException(lastError);

        const retryAfter = Number(response.headers.get('retry-after'));
        const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 700 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
        await this.sleep(backoffMs);
      } catch (err) {
        if (err instanceof BadRequestException) throw err;

        const isAbort = (err as Error)?.name === 'AbortError';
        lastError = isAbort
          ? `Gemini request timed out after ${this.cfg.timeoutMs}ms`
          : (err as Error)?.message ?? String(err);

        if (attempt >= 3) break;
        this.logger.warn(`Gemini call failed (attempt ${attempt}): ${lastError} — retrying`);
        await this.sleep(700 * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timer);
      }
    }

    throw new ServiceUnavailableException({
      success: false,
      error: {
        code: 'AI_LLM_UNAVAILABLE',
        message: `The language model could not be reached: ${lastError}`,
        details: 'Check GEMINI_API_KEY, quota and network access, then retry.',
      },
    });
  }

  /** Parse a JSON payload defensively (models occasionally wrap it in ```json fences). */
  private parseJson<T>(text: string): T {
    let raw = text.trim();
    const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) raw = fence[1];

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'AI_BAD_LLM_OUTPUT',
          message: 'The language model returned malformed JSON and the query could not be completed.',
          details: raw.slice(0, 300),
        },
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
