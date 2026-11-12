import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AiProviderConfig,
  AiProviderPlatform,
} from '../entities/ai-provider-config.entity';
import {
  CreateAiProviderConfigDto,
  ListAiProviderModelsDto,
  TestAiProviderConnectionDto,
  UpdateAiProviderConfigDto,
} from '../dto/ai-provider-config.dto';
import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
} from '../../../common/utils/crypto.util';
import {
  FetchModelsResult,
  TestConnectionResult,
  UniversalLlmService,
} from './universal-llm.service';

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
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AiProviderConfigService {
  constructor(
    @InjectRepository(AiProviderConfig)
    private readonly configRepo: Repository<AiProviderConfig>,
    private readonly universalLlm: UniversalLlmService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * List all provider configs for the organization, with masked API keys.
   */
  async listConfigs(orgId?: string): Promise<{
    configs: MaskedAiProviderConfig[];
    activeEngine: unknown;
  }> {
    const qb = this.configRepo.createQueryBuilder('p');
    if (orgId) {
      qb.where('p.org_id = :orgId OR p.org_id IS NULL', { orgId });
    }
    qb.orderBy('p.is_primary_default', 'DESC').addOrderBy('p.created_at', 'DESC');

    const list = await qb.getMany();
    const masked = list.map((item) => this.toMasked(item));
    const activeEngine = await this.universalLlm.getActiveProviderInfo(orgId);

    return { configs: masked, activeEngine };
  }

  /**
   * Find raw config by ID (internal use).
   */
  async findRawById(id: string): Promise<AiProviderConfig> {
    const item = await this.configRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`AI Provider Configuration with ID '${id}' not found`);
    }
    return item;
  }

  /**
   * Create a new AI provider config.
   */
  async create(dto: CreateAiProviderConfigDto, orgId?: string): Promise<MaskedAiProviderConfig> {
    return this.dataSource.transaction(async (manager) => {
      // If setting as primary, clear any existing primary in this org
      if (dto.isPrimaryDefault) {
        await manager.update(
          AiProviderConfig,
          orgId ? { orgId } : {},
          { isPrimaryDefault: false },
        );
      }

      const entity = manager.create(AiProviderConfig, {
        orgId: orgId || null,
        providerPlatform: dto.providerPlatform,
        configurationLabel: dto.configurationLabel,
        encryptedApiKey: dto.apiKey ? encryptSecret(dto.apiKey.trim()) : null,
        modelId: dto.modelId.trim(),
        baseApiUrl: dto.baseApiUrl ? dto.baseApiUrl.trim() : this.universalLlm.getDefaultBaseUrl(dto.providerPlatform),
        temperature: dto.temperature !== undefined ? dto.temperature : 0.2,
        maxOutputTokens: dto.maxOutputTokens || 4096,
        isEnabled: dto.isEnabled !== undefined ? dto.isEnabled : true,
        isPrimaryDefault: Boolean(dto.isPrimaryDefault),
      });

      const saved = await manager.save(entity);
      return this.toMasked(saved);
    });
  }

  /**
   * Update an existing AI provider config.
   */
  async update(id: string, dto: UpdateAiProviderConfigDto, orgId?: string): Promise<MaskedAiProviderConfig> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(AiProviderConfig, { where: { id } });
      if (!existing) {
        throw new NotFoundException(`AI Provider Configuration with ID '${id}' not found`);
      }

      // If switching to primary, reset other primaries
      if (dto.isPrimaryDefault && !existing.isPrimaryDefault) {
        await manager.update(
          AiProviderConfig,
          orgId ? { orgId } : {},
          { isPrimaryDefault: false },
        );
      }

      if (dto.providerPlatform) existing.providerPlatform = dto.providerPlatform;
      if (dto.configurationLabel) existing.configurationLabel = dto.configurationLabel;
      if (dto.modelId) existing.modelId = dto.modelId.trim();
      if (dto.baseApiUrl !== undefined) existing.baseApiUrl = dto.baseApiUrl?.trim() || null;
      if (dto.temperature !== undefined) existing.temperature = dto.temperature;
      if (dto.maxOutputTokens !== undefined) existing.maxOutputTokens = dto.maxOutputTokens;
      if (dto.isEnabled !== undefined) existing.isEnabled = dto.isEnabled;
      if (dto.isPrimaryDefault !== undefined) existing.isPrimaryDefault = dto.isPrimaryDefault;

      // Only update API key if a non-masked string was provided
      if (dto.apiKey && !dto.apiKey.includes('••••')) {
        existing.encryptedApiKey = encryptSecret(dto.apiKey.trim());
      }

      const saved = await manager.save(existing);
      return this.toMasked(saved);
    });
  }

  /**
   * Set a provider as the active primary.
   */
  async setPrimary(id: string, orgId?: string): Promise<MaskedAiProviderConfig> {
    return this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(AiProviderConfig, { where: { id } });
      if (!target) {
        throw new NotFoundException(`AI Provider Configuration with ID '${id}' not found`);
      }

      // Unset all existing primaries
      await manager.update(
        AiProviderConfig,
        orgId ? { orgId } : {},
        { isPrimaryDefault: false },
      );

      target.isPrimaryDefault = true;
      target.isEnabled = true; // Ensure primary is also enabled
      const saved = await manager.save(target);
      return this.toMasked(saved);
    });
  }

  /**
   * Delete an AI provider config.
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.findRawById(id);
    await this.configRepo.remove(existing);
    return { success: true, message: `AI Provider '${existing.configurationLabel}' removed successfully.` };
  }

  /**
   * Test connection to a proposed or existing provider.
   */
  async testConnection(dto: TestAiProviderConnectionDto): Promise<TestConnectionResult> {
    let resolvedKey = dto.apiKey?.trim();

    // If testing an existing configuration and no new key was entered in the form
    if (dto.configId && (!resolvedKey || resolvedKey.includes('••••'))) {
      const existing = await this.findRawById(dto.configId);
      resolvedKey = existing.encryptedApiKey ? decryptSecret(existing.encryptedApiKey) : '';
    }

    if (
      !resolvedKey &&
      dto.providerPlatform !== 'custom_openai' // Local Ollama might not require a key
    ) {
      throw new BadRequestException('API key is required to test the connection.');
    }

    return this.universalLlm.testProviderConnection({
      providerPlatform: dto.providerPlatform,
      apiKey: resolvedKey,
      modelId: dto.modelId,
      baseApiUrl: dto.baseApiUrl,
      temperature: dto.temperature,
      maxOutputTokens: dto.maxOutputTokens,
    });
  }

  /**
   * List live models and quota details available for this provider platform and API key.
   */
  async listModels(dto: ListAiProviderModelsDto): Promise<FetchModelsResult> {
    let resolvedKey = dto.apiKey?.trim();

    if (dto.configId && (!resolvedKey || resolvedKey.includes('••••'))) {
      const existing = await this.findRawById(dto.configId);
      resolvedKey = existing.encryptedApiKey ? decryptSecret(existing.encryptedApiKey) : '';
    }

    if (!resolvedKey && dto.providerPlatform !== 'custom_openai') {
      throw new BadRequestException('API key is required to list available models.');
    }

    return this.universalLlm.fetchRemoteModels({
      providerPlatform: dto.providerPlatform,
      apiKey: resolvedKey,
      baseApiUrl: dto.baseApiUrl,
    });
  }

  /**
   * Map database entity to safe masked DTO.
   */
  private toMasked(entity: AiProviderConfig): MaskedAiProviderConfig {
    const rawKey = entity.encryptedApiKey ? decryptSecret(entity.encryptedApiKey) : '';
    return {
      id: entity.id,
      orgId: entity.orgId,
      providerPlatform: entity.providerPlatform,
      configurationLabel: entity.configurationLabel,
      maskedApiKey: rawKey ? maskApiKey(rawKey) : 'Not Configured',
      hasApiKey: Boolean(rawKey),
      modelId: entity.modelId,
      baseApiUrl: entity.baseApiUrl,
      temperature: Number(entity.temperature),
      maxOutputTokens: entity.maxOutputTokens,
      isEnabled: entity.isEnabled,
      isPrimaryDefault: entity.isPrimaryDefault,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

