import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../entities/item-document.entity';

export class CreateItemDocumentDto {
  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Document name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  documentName: string;

  @ApiPropertyOptional({ description: 'Document type', enum: DocumentType })
  @IsEnum(DocumentType)
  @IsOptional()
  documentType?: DocumentType;

  @ApiProperty({ description: 'File URL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  fileUrl: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsNumber()
  @IsOptional()
  fileSize?: number;

  @ApiPropertyOptional({ description: 'MIME type' })
  @IsString()
  @IsOptional()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Document description' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateItemDocumentDto {
  @ApiPropertyOptional({ description: 'Document name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  documentName?: string;

  @ApiPropertyOptional({ description: 'Document type', enum: DocumentType })
  @IsEnum(DocumentType)
  @IsOptional()
  documentType?: DocumentType;

  @ApiPropertyOptional({ description: 'Document description' })
  @IsString()
  @IsOptional()
  description?: string;
}
