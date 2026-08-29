import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsIn, IsDateString, Min, MaxLength, IsArray, ValidateNested, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AccountType, NormalBalance } from '../entities';

export class CreateAccountDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) accountCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) accountName: string;
  @ApiProperty({ enum: AccountType }) @IsIn(Object.values(AccountType)) accountType: string;
  @ApiProperty({ enum: NormalBalance }) @IsIn(Object.values(NormalBalance)) normalBalance: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() groupId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() parentAccountId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() currency?: string;
  @ApiPropertyOptional() @IsOptional() isBankCash?: boolean;
  @ApiPropertyOptional() @IsOptional() isAr?: boolean;
  @ApiPropertyOptional() @IsOptional() isAp?: boolean;
}

export class CreateJournalLineDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() accountId: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(500) description?: string;
  @ApiProperty({ default: 0 }) @IsNumber() @Min(0) debit: number;
  @ApiProperty({ default: 0 }) @IsNumber() @Min(0) credit: number;
  @ApiPropertyOptional() @IsString() @IsOptional() referenceType?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() referenceId?: string;
}

export class CreateJournalDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty({ enum: ['GENERAL','RECEIPT','PAYMENT','EXPENSE','SALES_INVOICE','PURCHASE_INVOICE','CONTRA'] })
  @IsIn(['GENERAL','RECEIPT','PAYMENT','EXPENSE','SALES_INVOICE','PURCHASE_INVOICE','CONTRA'])
  journalType: string;
  @ApiProperty() @IsDateString() entryDate: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() periodId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() fiscalYearId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(500) description?: string;
  @ApiProperty({ type: [CreateJournalLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateJournalLineDto)
  lines: CreateJournalLineDto[];
}

export class CreateFiscalYearDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() companyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) fyName: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
}

export class ClosePeriodDto {
  @ApiProperty({ enum: ['OPEN','CLOSED'] }) @IsIn(['OPEN','CLOSED']) status: string;
}