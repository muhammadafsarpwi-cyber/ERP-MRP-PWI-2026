import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * DTOs for the AI assistant. The global ValidationPipe runs with
 * `whitelist: true` + `forbidNonWhitelisted: true`, so unknown fields are
 * rejected outright — an important hardening detail for an endpoint that
 * feeds user text into an LLM.
 */

export class AskAiDto {
  @ApiProperty({
    description: 'Natural-language question (English, Urdu or mixed)',
    example: 'SPT division mein last month ki total production kitni thi?',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 2000)
  question: string;
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
  @Matches(/^audio\/[a-z0-9.+-]+$/i, { message: 'mimeType must be an audio/* MIME type' })
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'ISO-639-1 language hint to improve transcription',
    example: 'ur',
    enum: ['ur', 'en', 'pa'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['ur', 'en', 'pa'], { message: 'language must be one of: ur, en, pa' })
  language?: string;
}
