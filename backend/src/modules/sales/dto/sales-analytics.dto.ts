import { IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum SalesAnalyticsPeriod {
  TODAY = 'today',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  THIS_QUARTER = 'this_quarter',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom',
}

export enum CustomerRankingMetric {
  SALES_AMOUNT = 'salesAmount',
  DELIVERED_QTY = 'deliveredQuantity',
  INVOICED_AMOUNT = 'invoicedAmount',
  PAID_AMOUNT = 'paidAmount',
  OUTSTANDING_AMOUNT = 'outstandingAmount',
  ORDER_COUNT = 'orderCount',
}

export class SalesAnalyticsFilterDto {
  @IsOptional()
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  itemType?: string;

  @IsOptional()
  @IsEnum(SalesAnalyticsPeriod)
  period?: SalesAnalyticsPeriod;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  salesStatus?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}
