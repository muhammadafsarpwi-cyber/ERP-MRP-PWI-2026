import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Accepts both RFC-4122 UUIDs and seeded PostgreSQL hex-UUIDs (e.g. d1000000-0000-0000-0000-000000000001)
const PG_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ReceiptAllocationItemDto {
  @ApiProperty({ description: 'Sales Invoice ID' })
  @Matches(PG_UUID_REGEX, { message: 'salesInvoiceId must be a valid UUID' })
  @IsNotEmpty()
  salesInvoiceId: string;

  @ApiProperty({ description: 'Amount to allocate to this invoice' })
  @IsNumber()
  @Min(0.01)
  allocatedAmount: number;
}

export class CreateCustomerReceiptDto {
  @ApiPropertyOptional({ description: 'Company ID (set from JWT if omitted)' })
  @ValidateIf((o) => Boolean(o.companyId && String(o.companyId).trim()))
  @Matches(PG_UUID_REGEX, { message: 'companyId must be a valid UUID' })
  @IsOptional()
  companyId?: string;

  @ApiProperty({ description: 'Customer ID (Master or Sales customer UUID)' })
  @Matches(PG_UUID_REGEX, { message: 'customerId must be a valid UUID' })
  @IsNotEmpty()
  customerId: string;

  @ApiPropertyOptional({ description: 'Division ID (UUID, division code, or division name)' })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'Receipt Date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  receiptDate?: string;

  @ApiPropertyOptional({ description: 'Sales Order ID (optional)' })
  @ValidateIf((o) => Boolean(o.salesOrderId && String(o.salesOrderId).trim()))
  @Matches(PG_UUID_REGEX, { message: 'salesOrderId must be a valid UUID' })
  @IsOptional()
  salesOrderId?: string;

  @ApiPropertyOptional({ description: 'SOC Number reference' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  socNumber?: string;

  @ApiPropertyOptional({ description: 'Customer PO reference' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  poReference?: string;

  @ApiPropertyOptional({
    description: 'Receipt classification',
    enum: ['INVOICE_PAYMENT', 'ADVANCE_PAYMENT', 'ON_ACCOUNT'],
  })
  @IsString()
  @IsIn(['INVOICE_PAYMENT', 'ADVANCE_PAYMENT', 'ON_ACCOUNT'])
  @IsOptional()
  receiptType?: string;

  @ApiProperty({
    description: 'Payment mode',
    enum: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'OTHER'],
  })
  @IsString()
  @IsIn(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'OTHER'])
  paymentMode: string;

  @ApiPropertyOptional({ description: 'Deposit Cash/Bank COA account ID' })
  @ValidateIf((o) => Boolean(o.bankAccountId && String(o.bankAccountId).trim()))
  @Matches(PG_UUID_REGEX, { message: 'bankAccountId must be a valid UUID' })
  @IsOptional()
  bankAccountId?: string;

  @ApiPropertyOptional({ description: 'Bank name' })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional({ description: 'Cheque / Slip / Transaction number' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  chequeNumber?: string;

  @ApiPropertyOptional({ description: 'Cheque Date (YYYY-MM-DD)' })
  @ValidateIf((o) => Boolean(o.chequeDate && String(o.chequeDate).trim()))
  @IsDateString()
  @IsOptional()
  chequeDate?: string;

  @ApiPropertyOptional({
    description: 'Cheque clearance status',
    enum: ['CLEARED', 'PENDING_CLEARANCE', 'BOUNCED'],
  })
  @IsString()
  @IsIn(['CLEARED', 'PENDING_CLEARANCE', 'BOUNCED'])
  @IsOptional()
  clearanceStatus?: string;

  @ApiProperty({ description: 'Total amount received' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Manual or bank reference' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  referenceNo?: string;

  @ApiPropertyOptional({ description: 'Remarks / narration' })
  @IsString()
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Auto-allocate excess or full amount FIFO across oldest open invoices' })
  @IsBoolean()
  @IsOptional()
  autoAllocate?: boolean;

  @ApiPropertyOptional({ description: 'Bill-to-bill invoice allocations' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationItemDto)
  allocations?: ReceiptAllocationItemDto[];
}

export class ApplyAdvanceDto {
  @ApiProperty({ description: 'Customer ID' })
  @Matches(PG_UUID_REGEX, { message: 'customerId must be a valid UUID' })
  @IsNotEmpty()
  customerId: string;

  @ApiPropertyOptional({ description: 'Specific advance receipt ID (if omitted, consumes oldest available advances FIFO)' })
  @ValidateIf((o) => Boolean(o.receiptId && String(o.receiptId).trim()))
  @Matches(PG_UUID_REGEX, { message: 'receiptId must be a valid UUID' })
  @IsOptional()
  receiptId?: string;

  @ApiPropertyOptional({ description: 'Adjustment Date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  adjustmentDate?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ description: 'Open invoice allocations to settle using advance' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationItemDto)
  invoiceAllocations: ReceiptAllocationItemDto[];
}

export class ClearChequeDto {
  @ApiPropertyOptional({ description: 'Clearance Date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  clearanceDate?: string;

  @ApiPropertyOptional({ description: 'Deposit Bank GL Account ID' })
  @ValidateIf((o) => Boolean(o.bankAccountId && String(o.bankAccountId).trim()))
  @Matches(PG_UUID_REGEX, { message: 'bankAccountId must be a valid UUID' })
  @IsOptional()
  bankAccountId?: string;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class BounceChequeDto {
  @ApiProperty({ description: 'Reason cheque was dishonored / bounced' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Bounce Date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  bounceDate?: string;
}

export class RecordInvoicePaymentDto {
  @IsNumber()
  @IsOptional()
  paidAmount?: number;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  paymentMode?: string;

  @ValidateIf((o) => Boolean(o.bankAccountId && String(o.bankAccountId).trim()))
  @Matches(PG_UUID_REGEX, { message: 'bankAccountId must be a valid UUID' })
  @IsOptional()
  bankAccountId?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  chequeNumber?: string;

  @ValidateIf((o) => Boolean(o.chequeDate && String(o.chequeDate).trim()))
  @IsDateString()
  @IsOptional()
  chequeDate?: string;

  @IsString()
  @IsOptional()
  clearanceStatus?: string;

  @IsString()
  @IsOptional()
  receiptDate?: string;

  @IsString()
  @IsOptional()
  referenceNo?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreditOverrideDto {
  @IsBoolean()
  @IsOptional()
  creditOverride?: boolean;

  @IsString()
  @IsOptional()
  creditOverrideReason?: string;
}
