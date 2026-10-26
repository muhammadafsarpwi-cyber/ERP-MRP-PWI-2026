import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import {
  BatchCostingService,
  StageCostCalculationInput,
  SaveMonthlyUtilitySheetDto,
} from '../services/batch-costing.service';

@ApiTags('production/batch-costing')
@Controller('production/batch-costing')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class BatchCostingController {
  constructor(private readonly batchCostingService: BatchCostingService) {}

  private getCompanyId(req: any): string {
    return req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
  }

  @Get('margins')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Executive Dashboard Analytics: Real-Time Gross Margin & Batch Costing Ledger (PCS & GROSS)' })
  @ApiQuery({ name: 'contractNumber', required: false, description: 'Filter by contract / SO number' })
  @ApiQuery({ name: 'itemCode', required: false, description: 'Filter by item code' })
  @ApiQuery({ name: 'billingPeriod', required: false, description: 'Billing month (YYYY-MM)' })
  async getMargins(
    @Query('contractNumber') contractNumber?: string,
    @Query('itemCode') itemCode?: string,
    @Query('billingPeriod') billingPeriod?: string,
    @Req() req?: any,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.batchCostingService.getRealTimeMarginAnalytics(companyId, {
      contractNumber,
      itemCode,
      billingPeriod,
    });
    return { success: true, data };
  }

  @Get('utility-sheet')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Get Monthly Overhead & Utility Cost Allocation Sheet with item breakdown' })
  @ApiQuery({ name: 'billingPeriod', required: false, description: 'Billing month (YYYY-MM)' })
  async getUtilitySheet(@Query('billingPeriod') billingPeriod?: string, @Req() req?: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.batchCostingService.getMonthlyUtilityCostSheet(companyId, billingPeriod);
    return { success: true, data };
  }

  @Post('utility-sheet')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save Monthly Utility & Overhead Bills and allocate across items & batches' })
  async saveUtilitySheet(@Body() body: SaveMonthlyUtilitySheetDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const result = await this.batchCostingService.saveMonthlyUtilityCostSheet(companyId, body);
    return result;
  }

  @Post('record-stage')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Append dynamic cost allocation at a sequential production stage' })
  async recordStage(@Body() body: Partial<StageCostCalculationInput>, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const dto: StageCostCalculationInput = {
      ...body,
      companyId: body.companyId || companyId,
      batchNumber: body.batchNumber || `BATCH-${Date.now()}`,
      itemId: body.itemId!,
      stageSequence: body.stageSequence || 1,
      quantityProcessed: body.quantityProcessed || 1440,
    };
    const result = await this.batchCostingService.recordStageCost(dto);
    return { success: true, message: 'Stage cost recorded and accumulated into batch COGM', data: result };
  }

  @Post('reseed')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalculate and re-seed live batch costing ledger with dual UOM from active SOCs' })
  async reseed(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.batchCostingService.autoSeedLiveCostingData(companyId);
    const data = await this.batchCostingService.getRealTimeMarginAnalytics(companyId);
    return { success: true, message: 'Live batch costing ledger recalculated successfully', data };
  }
}
