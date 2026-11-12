import { apiService } from './api';

export type AiProviderPlatform =
  | 'google_gemini'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'custom_openai';

export interface MaskedAiProviderConfig {
  id: string;
  orgId: string | null;
  providerPlatform: AiProviderPlatform;
  configurationLabel: string;
  maskedApiKey: string;
  hasApiKey: boolean;
  modelId: string;
  baseApiUrl: string | null;
  temperature: number;
  maxOutputTokens: number;
  isEnabled: boolean;
  isPrimaryDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveAiEngineInfo {
  source: 'database' | 'env' | 'none';
  platform: AiProviderPlatform | 'fallback';
  label: string;
  model: string;
  baseApiUrl?: string;
  isPrimary: boolean;
}

export interface ProviderConfigsResponse {
  configs: MaskedAiProviderConfig[];
  activeEngine: ActiveAiEngineInfo;
}

export interface CreateAiProviderDto {
  providerPlatform: AiProviderPlatform;
  configurationLabel: string;
  apiKey?: string;
  modelId: string;
  baseApiUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  isEnabled?: boolean;
  isPrimaryDefault?: boolean;
}

export interface UpdateAiProviderDto {
  providerPlatform?: AiProviderPlatform;
  configurationLabel?: string;
  apiKey?: string;
  modelId?: string;
  baseApiUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  isEnabled?: boolean;
  isPrimaryDefault?: boolean;
}

export interface TestConnectionDto {
  providerPlatform: AiProviderPlatform;
  apiKey?: string;
  modelId: string;
  baseApiUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  configId?: string;
}

export interface TestConnectionResponse {
  ok: boolean;
  latencyMs: number;
  message: string;
  sampleResponse?: unknown;
}

export interface ListModelsDto {
  providerPlatform: AiProviderPlatform;
  apiKey?: string;
  baseApiUrl?: string;
  configId?: string;
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

class AiProviderConfigService {
  async getConfigs(): Promise<ProviderConfigsResponse> {
    const res = await apiService.get<{ success: boolean; data: ProviderConfigsResponse }>('/ai/settings/providers');
    return res.data;
  }

  async createConfig(dto: CreateAiProviderDto): Promise<MaskedAiProviderConfig> {
    const res = await apiService.post<{ success: boolean; data: MaskedAiProviderConfig }>('/ai/settings/providers', dto);
    return res.data;
  }

  async updateConfig(id: string, dto: UpdateAiProviderDto): Promise<MaskedAiProviderConfig> {
    const res = await apiService.patch<{ success: boolean; data: MaskedAiProviderConfig }>(`/ai/settings/providers/${id}`, dto);
    return res.data;
  }

  async setPrimary(id: string): Promise<MaskedAiProviderConfig> {
    const res = await apiService.patch<{ success: boolean; data: MaskedAiProviderConfig }>(`/ai/settings/providers/${id}/set-primary`);
    return res.data;
  }

  async deleteConfig(id: string): Promise<void> {
    await apiService.delete(`/ai/settings/providers/${id}`);
  }

  async testConnection(dto: TestConnectionDto): Promise<TestConnectionResponse> {
    const res = await apiService.post<{ success: boolean; data: TestConnectionResponse }>(
      '/ai/settings/providers/test-connection',
      dto,
      { timeout: 45000 },
    );
    return res.data;
  }

  async listModels(dto: ListModelsDto): Promise<FetchModelsResult> {
    const res = await apiService.post<{ success: boolean; data: FetchModelsResult }>(
      '/ai/settings/providers/list-models',
      dto,
      { timeout: 45000 },
    );
    return res.data;
  }
}

export const aiProviderConfigService = new AiProviderConfigService();
export default aiProviderConfigService;

