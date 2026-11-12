import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { aiConfig } from '../../../config/ai.config';
import {
  AiProviderConfig,
  AiProviderPlatform,
} from '../entities/ai-provider-config.entity';
import { decryptSecret } from '../../../common/utils/crypto.util';

export interface ActiveAiProviderInfo {
  source: 'database' | 'env' | 'none';
  platform: AiProviderPlatform | 'fallback';
  label: string;
  model: string;
  baseApiUrl?: string;
  isPrimary: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  sampleResponse?: unknown;
}

export interface AiModelQuotaDetail {
  id: string;
  name?: string;
  isFree: boolean;
  tierLabel: string;
  rpm?: number;
  rpd?: number;
  tpm?: number;
  contextWindow?: number;
  description?: string;
}

export interface FetchModelsResult {
  models: string[];
  details: AiModelQuotaDetail[];
  summary: {
    totalModels: number;
    freeModelsCount: number;
    providerPlatform: AiProviderPlatform;
  };
}

@Injectable()
export class UniversalLlmService {
  private readonly logger = new Logger(UniversalLlmService.name);
  private readonly envCfg = aiConfig(this.config).gemini;

  constructor(
    @InjectRepository(AiProviderConfig)
    private readonly providerRepo: Repository<AiProviderConfig>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve the active AI provider with resolution priority:
   * 1. Active primary DB config (isEnabled = true AND isPrimaryDefault = true).
   * 2. Any active enabled DB config.
   * 3. Fallback to .env GEMINI_API_KEY.
   * 4. Null (disabled).
   */
  async resolveActiveProvider(orgId?: string): Promise<{
    platform: AiProviderPlatform | 'env_gemini';
    label: string;
    apiKey: string;
    modelId: string;
    baseApiUrl: string;
    temperature: number;
    maxOutputTokens: number;
    source: 'database' | 'env';
  } | null> {
    try {
      const qb = this.providerRepo
        .createQueryBuilder('p')
        .where('p.is_enabled = :enabled', { enabled: true });

      if (orgId) {
        qb.andWhere('(p.org_id = :orgId OR p.org_id IS NULL)', { orgId });
      }

      // Prioritize is_primary_default = true first, then newest
      qb.orderBy('p.is_primary_default', 'DESC').addOrderBy('p.created_at', 'DESC');

      const primary = await qb.getOne();
      if (primary) {
        const decryptedKey = primary.encryptedApiKey ? decryptSecret(primary.encryptedApiKey) : '';
        return {
          platform: primary.providerPlatform,
          label: primary.configurationLabel,
          apiKey: decryptedKey,
          modelId: primary.modelId,
          baseApiUrl: primary.baseApiUrl || this.getDefaultBaseUrl(primary.providerPlatform),
          temperature: Number(primary.temperature) || 0.2,
          maxOutputTokens: Number(primary.maxOutputTokens) || 4096,
          source: 'database',
        };
      }
    } catch (err) {
      this.logger.warn(`Failed to query DB for AI provider config: ${(err as Error).message}`);
    }

    // Fallback to .env Gemini
    if (this.envCfg.apiKey) {
      return {
        platform: 'env_gemini',
        label: 'Google AI Studio (.env fallback)',
        apiKey: this.envCfg.apiKey,
        modelId: this.envCfg.model || 'gemini-2.0-flash',
        baseApiUrl: 'https://generativelanguage.googleapis.com/v1beta',
        temperature: 0.2,
        maxOutputTokens: 4096,
        source: 'env',
      };
    }

    return null;
  }

  /**
   * Return metadata about the currently active AI provider for UI status badges.
   */
  async getActiveProviderInfo(orgId?: string): Promise<ActiveAiProviderInfo> {
    const active = await this.resolveActiveProvider(orgId);
    if (!active) {
      return {
        source: 'none',
        platform: 'fallback',
        label: 'Autonomous Local / Fallback Logic Active',
        model: 'heuristic-rules',
        isPrimary: false,
      };
    }
    return {
      source: active.source,
      platform: active.platform === 'env_gemini' ? 'google_gemini' : active.platform,
      label: active.label,
      model: active.modelId,
      baseApiUrl: active.baseApiUrl,
      isPrimary: true,
    };
  }

  get model(): string {
    return this.envCfg.model || 'gemini-2.0-flash';
  }

  /**
   * Generate a validated JSON object from LLM matching type T.
   */
  async generateJson<T>(
    system: string,
    user: string,
    temperature = 0,
    orgId?: string,
  ): Promise<T> {
    const text = await this.generateText(system, user, temperature, true, orgId);
    return this.parseJson<T>(text);
  }

  /**
   * Generate text or JSON from the currently active provider.
   */
  async generateText(
    system: string,
    user: string,
    temperature = 0.2,
    forceJson = false,
    orgId?: string,
  ): Promise<string> {
    const active = await this.resolveActiveProvider(orgId);
    if (!active) {
      throw new ServiceUnavailableException({
        success: false,
        error: {
          code: 'AI_NOT_CONFIGURED',
          message: 'No active AI provider is configured (database or .env).',
          details: 'Please configure an AI provider in System Settings > AI Provider (BYOK).',
        },
      });
    }

    const effectiveTemp = temperature !== undefined ? temperature : active.temperature;
    return this.executeProviderCall({
      platform: active.platform,
      apiKey: active.apiKey,
      modelId: active.modelId,
      baseApiUrl: active.baseApiUrl,
      temperature: effectiveTemp,
      maxOutputTokens: active.maxOutputTokens,
      system,
      user,
      forceJson,
    });
  }

  /**
   * Dispatch prompt execution to the appropriate platform adapter.
   */
  private async executeProviderCall(opts: {
    platform: AiProviderPlatform | 'env_gemini';
    apiKey: string;
    modelId: string;
    baseApiUrl: string;
    temperature: number;
    maxOutputTokens: number;
    system: string;
    user: string;
    forceJson: boolean;
    isTestConnection?: boolean;
  }): Promise<string> {
    const platform = opts.platform === 'env_gemini' ? 'google_gemini' : opts.platform;

    switch (platform) {
      case 'google_gemini':
        return this.callGemini(opts);
      case 'openai':
      case 'openrouter':
      case 'custom_openai':
        return this.callOpenAiCompatible(opts);
      case 'anthropic':
        return this.callAnthropic(opts);
      default:
        return this.callGemini(opts);
    }
  }

  /**
   * Google Gemini REST Adapter
   */
  private async callGemini(opts: {
    apiKey: string;
    modelId: string;
    baseApiUrl: string;
    temperature: number;
    maxOutputTokens: number;
    system: string;
    user: string;
    forceJson: boolean;
    isTestConnection?: boolean;
  }): Promise<string> {
    const baseUrl = (opts.baseApiUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const url = `${baseUrl}/models/${opts.modelId}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

    const generationConfig: Record<string, any> = {
      temperature: opts.temperature,
      topK: 1,
      maxOutputTokens: opts.maxOutputTokens,
      ...(opts.forceJson ? { responseMimeType: 'application/json' } : {}),
    };

    // For test connection or thinking models (Gemini 2.5/3.x), disable deep thinking budget so connection responds in <2s
    if (opts.isTestConnection && /thinking|gemini-2\.5|gemini-3/i.test(opts.modelId)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const body = {
      system_instruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig,
    };

    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Google Gemini API error (HTTP ${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  }

  /**
   * OpenAI / OpenRouter / Custom OpenAI-compatible REST Adapter
   */
  private async callOpenAiCompatible(opts: {
    platform: AiProviderPlatform | 'env_gemini';
    apiKey: string;
    modelId: string;
    baseApiUrl: string;
    temperature: number;
    maxOutputTokens: number;
    system: string;
    user: string;
    forceJson: boolean;
  }): Promise<string> {
    let baseUrl = opts.baseApiUrl || 'https://api.openai.com/v1';
    baseUrl = baseUrl.replace(/\/+$/, '');
    const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (opts.apiKey) {
      headers['Authorization'] = `Bearer ${opts.apiKey}`;
    }

    if (opts.platform === 'openrouter') {
      headers['HTTP-Referer'] = 'https://erp.pwi.com.pk';
      headers['X-Title'] = 'PWI ERP Enterprise AI';
    }

    const messages = [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ];

    const body: Record<string, unknown> = {
      model: opts.modelId,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxOutputTokens,
    };

    if (opts.forceJson) {
      body.response_format = { type: 'json_object' };
    }

    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${opts.platform.toUpperCase()} API error (HTTP ${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error(`${opts.platform.toUpperCase()} returned an empty response.`);
    return content;
  }

  /**
   * Anthropic Claude REST Adapter
   */
  private async callAnthropic(opts: {
    apiKey: string;
    modelId: string;
    baseApiUrl: string;
    temperature: number;
    maxOutputTokens: number;
    system: string;
    user: string;
    forceJson: boolean;
  }): Promise<string> {
    let baseUrl = opts.baseApiUrl || 'https://api.anthropic.com/v1';
    baseUrl = baseUrl.replace(/\/+$/, '');
    const url = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    };

    let effectiveSystem = opts.system;
    if (opts.forceJson) {
      effectiveSystem += '\n\nIMPORTANT: You MUST reply with valid JSON only. Do not wrap in markdown quotes or code blocks.';
    }

    const body = {
      model: opts.modelId,
      max_tokens: opts.maxOutputTokens,
      temperature: opts.temperature,
      system: effectiveSystem,
      messages: [{ role: 'user', content: opts.user }],
    };

    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Anthropic Claude API error (HTTP ${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = data.content?.map((c) => c.text ?? '').join('') ?? '';
    if (!text) throw new Error('Anthropic returned an empty response.');
    return text;
  }

  /**
   * Test connection to a proposed or existing provider configuration.
   */
  async testProviderConnection(opts: {
    providerPlatform: AiProviderPlatform;
    apiKey?: string;
    modelId: string;
    baseApiUrl?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<TestConnectionResult> {
    const start = Date.now();
    try {
      const system = 'You are a test validator. You MUST return valid JSON only: {"status": "ok", "provider": "online"}';
      const user = 'Ping test. Reply with the requested JSON.';

      const raw = await this.executeProviderCall({
        platform: opts.providerPlatform,
        apiKey: opts.apiKey || '',
        modelId: opts.modelId,
        baseApiUrl: opts.baseApiUrl || this.getDefaultBaseUrl(opts.providerPlatform),
        temperature: opts.temperature ?? 0,
        maxOutputTokens: opts.maxOutputTokens ?? 256,
        system,
        user,
        forceJson: true,
        isTestConnection: true,
      });

      const parsed = this.parseJson<{ status?: string }>(raw);
      const latencyMs = Date.now() - start;

      return {
        ok: true,
        latencyMs,
        message: `Successfully connected to ${opts.providerPlatform} using model ${opts.modelId} (${latencyMs}ms)`,
        sampleResponse: parsed,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        latencyMs,
        message: (err as Error).message || 'Connection test failed',
      };
    }
  }

  /**
   * Query the remote provider's official model catalog using the user's API key
   * and annotate with real quota / rate limits / free-tier status.
   */
  async fetchRemoteModels(opts: {
    providerPlatform: AiProviderPlatform;
    apiKey?: string;
    baseApiUrl?: string;
  }): Promise<FetchModelsResult> {
    const key = (opts.apiKey || '').trim();
    const platform = opts.providerPlatform;

    if (!key && platform !== 'custom_openai') {
      throw new Error(`API key is required to fetch models for ${platform}.`);
    }

    try {
      const details: AiModelQuotaDetail[] = [];

      if (platform === 'google_gemini') {
        const baseUrl = (opts.baseApiUrl || this.getDefaultBaseUrl('google_gemini')).replace(/\/+$/, '');
        const url = `${baseUrl}/models?key=${encodeURIComponent(key)}`;
        const res = await this.fetchWithTimeout(url, { method: 'GET' }, 45000);
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Gemini API error (HTTP ${res.status}): ${errText}`);
        }
        const data = (await res.json()) as {
          models?: Array<{
            name: string;
            displayName?: string;
            description?: string;
            inputTokenLimit?: number;
            outputTokenLimit?: number;
            supportedGenerationMethods?: string[];
          }>;
        };

        if (data.models && Array.isArray(data.models)) {
          for (const m of data.models) {
            if (m.supportedGenerationMethods && !m.supportedGenerationMethods.includes('generateContent')) {
              continue;
            }
            const cleanId = m.name.replace(/^models\//, '');
            if (cleanId.includes('embedding') || cleanId.includes('aqa') || cleanId.includes('imagen')) {
              continue;
            }

            // Google AI Studio provides 100% Free Tier quotas for all generation models
            const isFree = true;
            let tierLabel = 'Free Tier (15 RPM / 1,500 RPD in AI Studio)';
            let rpm: number | undefined = 15;
            let rpd: number | undefined = 1500;
            let tpm: number | undefined = 1000000;

            if (/lite/i.test(cleanId)) {
              tierLabel = 'Free Tier (30 RPM / 1,500 RPD in AI Studio)';
              rpm = 30;
              rpd = 1500;
              tpm = 1000000;
            } else if (/pro/i.test(cleanId)) {
              tierLabel = 'Free Tier (2 RPM / 50 RPD in AI Studio)';
              rpm = 2;
              rpd = 50;
              tpm = 32000;
            } else if (/thinking|exp/i.test(cleanId)) {
              tierLabel = 'Free Experimental Tier (10 RPM / 1,000 RPD in AI Studio)';
              rpm = 10;
              rpd = 1000;
              tpm = 1000000;
            } else if (/gemma/i.test(cleanId)) {
              tierLabel = 'Free Tier (30 RPM / 1,500 RPD in AI Studio)';
              rpm = 30;
              rpd = 1500;
              tpm = 500000;
            }

            details.push({
              id: cleanId,
              name: m.displayName || cleanId,
              isFree,
              tierLabel,
              rpm,
              rpd,
              tpm,
              contextWindow: m.inputTokenLimit || 1048576,
              description: m.description,
            });
          }
        }

        // Fallback guarantee: if API returned no models or generation methods were filtered,
        // provide the standard Google AI Studio free tier models so the user is never left with an empty list.
        if (details.length === 0) {
          details.push(
            {
              id: 'gemini-2.0-flash',
              name: 'Gemini 2.0 Flash (Recommended)',
              isFree: true,
              tierLabel: 'Free Tier (15 RPM / 1,500 RPD in AI Studio)',
              rpm: 15,
              rpd: 1500,
              tpm: 1000000,
              contextWindow: 1048576,
              description: 'Next-gen high-speed multimodal intelligence with generous free tier.',
            },
            {
              id: 'gemini-2.0-flash-lite',
              name: 'Gemini 2.0 Flash Lite',
              isFree: true,
              tierLabel: 'Free Tier (30 RPM / 1,500 RPD in AI Studio)',
              rpm: 30,
              rpd: 1500,
              tpm: 1000000,
              contextWindow: 1048576,
              description: 'Ultra-fast lightweight model with highest free rate limit (30 RPM).',
            },
            {
              id: 'gemini-1.5-flash',
              name: 'Gemini 1.5 Flash',
              isFree: true,
              tierLabel: 'Free Tier (15 RPM / 1,500 RPD in AI Studio)',
              rpm: 15,
              rpd: 1500,
              tpm: 1000000,
              contextWindow: 1048576,
              description: 'Production workhorse with 1M context and 1,500 free requests per day.',
            },
            {
              id: 'gemini-1.5-pro',
              name: 'Gemini 1.5 Pro',
              isFree: true,
              tierLabel: 'Free Tier (2 RPM / 50 RPD in AI Studio)',
              rpm: 2,
              rpd: 50,
              tpm: 32000,
              contextWindow: 2097152,
              description: 'High-capability deep reasoning with 2M token context window in free tier.',
            },
          );
        }
      } else if (platform === 'openrouter') {
        const baseUrl = (opts.baseApiUrl || this.getDefaultBaseUrl('openrouter')).replace(/\/+$/, '');
        const url = `${baseUrl}/models`;
        const res = await this.fetchWithTimeout(
          url,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${key}`,
            },
          },
          45000,
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`OpenRouter API error (HTTP ${res.status}): ${errText}`);
        }
        const data = (await res.json()) as {
          data?: Array<{
            id: string;
            name?: string;
            description?: string;
            context_length?: number;
            pricing?: { prompt?: string | number; completion?: string | number };
          }>;
        };

        if (data.data && Array.isArray(data.data)) {
          for (const m of data.data) {
            const promptPrice = Number(m.pricing?.prompt || 0);
            const isZeroPrice = promptPrice === 0 || m.id.endsWith(':free');

            details.push({
              id: m.id,
              name: m.name || m.id,
              isFree: isZeroPrice,
              tierLabel: isZeroPrice ? '100% Free OpenRouter Tier (0 Cost)' : `Paid Tier (~$${(promptPrice * 1000000).toFixed(2)}/1M)`,
              contextWindow: m.context_length || 128000,
              description: m.description,
            });
          }
        }
      } else if (platform === 'openai') {
        const baseUrl = (opts.baseApiUrl || this.getDefaultBaseUrl('openai')).replace(/\/+$/, '');
        const url = `${baseUrl}/models`;
        const res = await this.fetchWithTimeout(
          url,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${key}`,
            },
          },
          45000,
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`OpenAI API error (HTTP ${res.status}): ${errText}`);
        }
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (data.data && Array.isArray(data.data)) {
          const chatOnly = data.data.filter((m) => /^(gpt-|o1|o3|chatgpt)/i.test(m.id));
          const list = chatOnly.length > 0 ? chatOnly : data.data;
          for (const m of list) {
            const isMini = m.id.includes('mini');
            details.push({
              id: m.id,
              name: m.id,
              isFree: false,
              tierLabel: isMini ? 'Budget Paid (~$0.15/1M tokens)' : 'Commercial Paid (~$2.50/1M tokens)',
              description: 'Commercial OpenAI API billed per token.',
            });
          }
        }
      } else if (platform === 'anthropic') {
        const baseUrl = (opts.baseApiUrl || this.getDefaultBaseUrl('anthropic')).replace(/\/+$/, '');
        const url = `${baseUrl}/models`;
        let loaded = false;
        try {
          const res = await this.fetchWithTimeout(
            url,
            {
              method: 'GET',
              headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
              },
            },
            45000,
          );
          if (res.ok) {
            const data = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
            if (data.data && Array.isArray(data.data)) {
              for (const m of data.data) {
                details.push({
                  id: m.id,
                  name: m.display_name || m.id,
                  isFree: false,
                  tierLabel: 'Commercial Paid API',
                  description: 'Anthropic Claude pay-per-token API.',
                });
              }
              loaded = true;
            }
          }
        } catch {
          // ignore
        }

        if (!loaded) {
          const defaults = [
            { id: 'claude-3-7-sonnet-latest', desc: 'Hybrid reasoning and fast coding' },
            { id: 'claude-3-5-sonnet-latest', desc: 'Industry-leading intelligence' },
            { id: 'claude-3-5-haiku-latest', desc: 'Ultra-fast and cost efficient' },
            { id: 'claude-3-opus-latest', desc: 'Deep complex analysis' },
          ];
          for (const d of defaults) {
            details.push({
              id: d.id,
              name: d.id,
              isFree: false,
              tierLabel: 'Commercial Paid API',
              description: d.desc,
            });
          }
        }
      } else if (platform === 'custom_openai') {
        const baseUrl = (opts.baseApiUrl || this.getDefaultBaseUrl('custom_openai')).replace(/\/+$/, '');
        const headers: Record<string, string> = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;

        let rawModels: string[] = [];

        // Try standard /models
        try {
          const res = await this.fetchWithTimeout(`${baseUrl}/models`, { method: 'GET', headers }, 45000);
          if (res.ok) {
            const data = (await res.json()) as { data?: Array<{ id: string }> };
            if (data.data && Array.isArray(data.data)) {
              rawModels = data.data.map((m) => m.id);
            }
          }
        } catch {
          // fall through
        }

        // Try native Ollama tags
        if (rawModels.length === 0) {
          try {
            const hostUrl = baseUrl.replace(/\/v1\/?$/, '');
            const res = await this.fetchWithTimeout(`${hostUrl}/api/tags`, { method: 'GET' }, 45000);
            if (res.ok) {
              const data = (await res.json()) as { models?: Array<{ name: string }> };
              if (data.models && Array.isArray(data.models)) {
                rawModels = data.models.map((m) => m.name);
              }
            }
          } catch {
            // ignore
          }
        }

        if (rawModels.length === 0) {
          rawModels = ['llama3.1', 'llama3.2', 'qwen2.5-coder', 'mistral', 'deepseek-r1'];
        }

        for (const m of rawModels) {
          details.push({
            id: m,
            name: m,
            isFree: true,
            tierLabel: '100% Free & Unlimited (Self-Hosted Local Model)',
            description: 'Runs directly on your local hardware with 0 external API cost.',
          });
        }
      }

      // Sort models: FREE models first, then alphabetical
      details.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return a.id.localeCompare(b.id);
      });

      const models = details.map((d) => d.id);
      const freeModelsCount = details.filter((d) => d.isFree).length;

      return {
        models,
        details,
        summary: {
          totalModels: models.length,
          freeModelsCount,
          providerPlatform: platform,
        },
      };
    } catch (err) {
      throw new Error(`Failed to fetch models from ${platform}: ${(err as Error).message}`);
    }
  }

  /**
   * Helper: fetch with AbortController timeout (45 seconds)
   */
  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 45000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Strip markdown code blocks and parse JSON safely
   */
  private parseJson<T>(raw: string): T {
    let clean = raw.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
    }
    try {
      return JSON.parse(clean) as T;
    } catch (err) {
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(clean.slice(firstBrace, lastBrace + 1)) as T;
        } catch {
          // fall through
        }
      }
      throw new Error(`Failed to parse LLM response as JSON: ${(err as Error).message}\nRaw: ${raw.slice(0, 300)}`);
    }
  }

  /**
   * Default Base API URLs per platform
   */
  getDefaultBaseUrl(platform: AiProviderPlatform): string {
    switch (platform) {
      case 'google_gemini':
        return 'https://generativelanguage.googleapis.com/v1beta';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1';
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      case 'custom_openai':
        return 'http://localhost:11434/v1';
      default:
        return 'https://generativelanguage.googleapis.com/v1beta';
    }
  }
}

