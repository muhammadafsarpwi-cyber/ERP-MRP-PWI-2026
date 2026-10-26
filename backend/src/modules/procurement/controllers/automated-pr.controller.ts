import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AutomatedPrEngineService } from '../services/automated-pr-engine.service';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/automated-pr')
@Controller('procurement/automated-pr')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class AutomatedPrController {
  constructor(private readonly engineService: AutomatedPrEngineService) {}

  @Get('pending')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.view')
  @ApiOperation({ summary: 'List all system-generated pending Purchase Requisitions awaiting approval' })
  async getPendingSystemRequisitions(@Query('companyId') companyId?: string) {
    const result = await this.engineService.getPendingSystemRequisitions(companyId);
    return {
      success: true,
      ...result,
    };
  }

  @Post(['evaluate', 'trigger'])
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger 3-Month Sales Forecasting & Safety Stock replenishment evaluation' })
  async runEvaluation(
    @Body() body: { companyId?: string; triggeredByItemId?: string },
    @Request() req: any,
  ) {
    const userId = req?.user?.id;
    const result = await this.engineService.evaluateAndGenerateRequisitions({
      companyId: body.companyId,
      triggeredByItemId: body.triggeredByItemId,
      userId,
    });
    return {
      success: true,
      data: result,
      message: `Evaluation completed: ${result.deficitItemsCount} raw material deficit(s) identified across ${result.requisitions.length} Purchase Requisition(s).`,
    };
  }

  @Post(':id/approve-to-po')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'One-click approve System-Generated PR and push directly to active Purchase Order (PO) ledger' })
  async approveAndPushToPo(
    @Param('id') id: string,
    @Body() body: {
      supplierId?: string;
      notes?: string;
      lines?: Array<{ lineId: string; quantity?: number; estimatedUnitPrice?: number; supplierId?: string }>;
    },
    @Request() req: any,
  ) {
    const userId = req?.user?.id;
    const result = await this.engineService.approveAndPushToPo(id, body, userId);
    return {
      success: true,
      data: result,
      message: `Purchase Requisition ${result.requisition.requisitionCode} successfully approved and converted to Active Purchase Order ${result.purchaseOrder.poCode}.`,
    };
  }
}
