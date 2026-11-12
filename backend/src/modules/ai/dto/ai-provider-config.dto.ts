import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AiProviderPlatform } from '../entities/ai-provider-config.entity';

export const AI_PROVIDER_PLATFORMS: AiProviderPlatform[] = [
  'google_gemini',
  'openrouter',
  'openai',
  'anthropic',
  'custom_openai',
];

export class CreateAiProviderConfigDto {
  @IsIn(AI_PROVIDER_PLATFORMS)
  providerPlatform: AiProviderPlatform;

  @IsString()
  configurationLabel: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsString()
  modelId: string;

  @IsOptional()
  @IsString()
  baseApiUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(1.0)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(256)
  @Max(32768)
  maxOutputTokens?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimaryDefault?: boolean;
}

export class UpdateAiProviderConfigDto {
  @IsOptional()
  @IsIn(AI_PROVIDER_PLATFORMS)
  providerPlatform?: AiProviderPlatform;

  @IsOptional()
  @IsString()
  configurationLabel?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsString()
  baseApiUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(1.0)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(256)
  @Max(32768)
  maxOutputTokens?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimaryDefault?: boolean;
}

export class TestAiProviderConnectionDto {
  @IsIn(AI_PROVIDER_PLATFORMS)
  providerPlatform: AiProviderPlatform;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsString()
  modelId: string;

  @IsOptional()
  @IsString()
  baseApiUrl?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  maxOutputTokens?: number;

  /** If testing an existing saved configuration by ID */
  @IsOptional()
  @IsString()
  configId?: string;
}

export class ListAiProviderModelsDto {
  @IsIn(AI_PROVIDER_PLATFORMS)
  providerPlatform: AiProviderPlatform;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseApiUrl?: string;

  @IsOptional()
  @IsString()
  configId?: string;
}

