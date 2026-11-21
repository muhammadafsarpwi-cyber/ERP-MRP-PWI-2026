import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * DTOs for the AI assistant. The global ValidationPipe runs with
 * `whitelist: true` + `forbidNonWhitelisted: true`, so unknown fields are
 * rejected outright — an important hardening detail for an endpoint that
 * feeds user text into an LLM.
 */

export class AskAiDto {
  @ApiProperty({
    description: 'Natural-language question (English, Urdu or mixed)',
    example: 'When was the last entry made in Control Cable Division?',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 2000)
  question: string;

  @ApiPropertyOptional({
    description: 'Optional active UI Division UUID to narrow the query scope (never widens caller permissions)',
    example: 'd1000000-0000-0000-0000-000000000002',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(ALL|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, {
    message: 'divisionId must be a division UUID or ALL',
  })
  divisionId?: string;

  @ApiPropertyOptional({
    description: 'Optional active UI Department UUID to narrow the query scope',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Optional active UI Department name/code to narrow the query scope',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  departmentName?: string;

  @ApiPropertyOptional({
    description: 'Optional ISO start date (YYYY-MM-DD) for active UI date filter',
    example: '2026-11-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be YYYY-MM-DD' })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Optional ISO end date (YYYY-MM-DD) for active UI date filter',
    example: '2026-11-30',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be YYYY-MM-DD' })
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Optional human-readable period label (e.g. November 2026)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  periodLabel?: string;

  @ApiPropertyOptional({
    description: 'Preferred response language: en (default) or ur',
    enum: ['en', 'ur'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'ur'], { message: 'language must be en or ur' })
  language?: 'en' | 'ur';
}

export class TranscribeAudioDto {
  @ApiProperty({
    description: 'Base64-encoded audio (webm/ogg/wav/mp3/m4a), max ~25 MB',
    example: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=',
  })
  @IsString()
  @IsNotEmpty()
  audioBase64: string;

  @ApiPropertyOptional({
    description: 'MIME type of the audio, used to pick the container extension',
    example: 'audio/webm',
  })
  @IsOptional()
  @IsString()
  @Matches(/^audio\/[a-z0-9.+-]+(;.*)?$/i, { message: 'mimeType must be an audio/* MIME type' })
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'ISO-639-1 language hint to improve transcription',
    example: 'en',
    enum: ['ur', 'en', 'pa'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['ur', 'en', 'pa'], { message: 'language must be one of: ur, en, pa' })
  language?: string;

  @ApiPropertyOptional({
    description: 'Optional active UI Division UUID to narrow the query scope (never widens caller permissions)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(ALL|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, {
    message: 'divisionId must be a division UUID or ALL',
  })
  divisionId?: string;

  @ApiPropertyOptional({
    description: 'Optional active UI Department UUID to narrow the query scope',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Optional active UI Department name/code to narrow the query scope',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  departmentName?: string;

  @ApiPropertyOptional({
    description: 'Optional ISO start date (YYYY-MM-DD) for active UI date filter',
    example: '2026-11-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be YYYY-MM-DD' })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Optional ISO end date (YYYY-MM-DD) for active UI date filter',
    example: '2026-11-30',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be YYYY-MM-DD' })
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Optional human-readable period label (e.g. November 2026)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  periodLabel?: string;
}
