import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OpeningStockService } from '../services/opening-stock.service';
import { OpeningStockBatchActionDto, PostOpeningStockDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

const DEFAULT_COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';

@ApiTags('inventory/opening-stock')
@Controller('inventory/opening-stock')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class OpeningStockController {
  constructor(private readonly openingStockService: OpeningStockService) {}

  private resolveCompanyId(req: any, explicitCompanyId?: string): string {
    return (
      explicitCompanyId ||
      req?.erpUser?.defaultCompanyId ||
      req?.erpUser?.companyId ||
      req?.user?.defaultCompanyId ||
      req?.user?.companyId ||
      DEFAULT_COMPANY_ID
    );
  }

  private resolveErpUserId(req: any): string | undefined {
    return req?.erpUser?.id || req?.user?.id;
  }

  @Get('history')
  @ApiOperation({ summary: 'List opening stock batches (posted & reversed) and their line items' })
  async getHistory(
    @Req() req: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const companyId = this.resolveCompanyId(req);
    const data = await this.openingStockService.getHistory(companyId, {
      warehouseId,
      divisionId,
      status,
      search,
    });
    return { success: true, data };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post opening stock balances atomically' })
  async postOpeningStock(@Req() req: any, @Body() dto: PostOpeningStockDto) {
    dto.companyId = this.resolveCompanyId(req, dto.companyId);
    const result = await this.openingStockService.postOpeningStock(dto, this.resolveErpUserId(req));
    return { success: true, data: result, message: `Opening stock posted: ${result.posted} lines` };
  }

  @Post('bulk')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk post opening stock batch atomically from Excel/CSV wizard' })
  async bulkPostOpeningStock(@Req() req: any, @Body() dto: PostOpeningStockDto) {
    dto.companyId = this.resolveCompanyId(req, dto.companyId);
    dto.source = dto.source || 'IMPORT';
    const result = await this.openingStockService.postOpeningStock(dto, this.resolveErpUserId(req));
    return {
      success: true,
      data: result,
      message: `Opening stock batch ${result.referenceNumber} posted: ${result.posted} items`,
    };
  }

  @Post('batches/:referenceNumber/reverse')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo / reverse an opening stock batch safely (prevents negative stock)' })
  async reverseBatch(
    @Req() req: any,
    @Param('referenceNumber') referenceNumber: string,
    @Query('warehouseId') warehouseIdQuery?: string,
    @Body() body?: OpeningStockBatchActionDto,
  ) {
    const companyId = this.resolveCompanyId(req);
    const data = await this.openingStockService.reverseBatch(
      companyId,
      decodeURIComponent(referenceNumber),
      body?.warehouseId || warehouseIdQuery,
      this.resolveErpUserId(req),
    );
    return { success: true, data, message: `Opening stock batch ${data.referenceNumber} reversed safely` };
  }

  @Post('batches/:referenceNumber/restore')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore / re-post a previously reversed opening stock batch' })
  async restoreBatch(
    @Req() req: any,
    @Param('referenceNumber') referenceNumber: string,
    @Query('warehouseId') warehouseIdQuery?: string,
    @Body() body?: OpeningStockBatchActionDto,
  ) {
    const companyId = this.resolveCompanyId(req);
    const data = await this.openingStockService.restoreBatch(
      companyId,
      decodeURIComponent(referenceNumber),
      body?.warehouseId || warehouseIdQuery,
      this.resolveErpUserId(req),
    );
    return { success: true, data, message: `Opening stock batch ${data.referenceNumber} restored and posted` };
  }

  @Put('lines/:ledgerId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Update a posted opening stock line quantity/notes and sync inventory balance' })
  async updateLine(
    @Req() req: any,
    @Param('ledgerId') ledgerId: string,
    @Body() body: { quantity: number; unitCost?: number; notes?: string },
  ) {
    const companyId = this.resolveCompanyId(req);
    const data = await this.openingStockService.updateLine(companyId, ledgerId, body);
    return { success: true, data, message: 'Opening stock line updated and stock balance synced' };
  }

  @Delete('lines/:ledgerId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.delete')
  @ApiOperation({ summary: 'Reverse and delete a posted opening stock line' })
  async deleteLine(@Req() req: any, @Param('ledgerId') ledgerId: string) {
    const companyId = this.resolveCompanyId(req);
    const data = await this.openingStockService.deleteLine(companyId, ledgerId);
    return { success: true, data, message: 'Opening stock line reversed and deleted' };
  }

  @Delete('batches/:referenceNumber')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.delete')
  @ApiOperation({ summary: 'Reverse and delete an entire posted opening stock batch by reference number' })
  async deleteBatch(@Req() req: any, @Param('referenceNumber') referenceNumber: string) {
    const companyId = this.resolveCompanyId(req);
    const data = await this.openingStockService.deleteBatch(companyId, decodeURIComponent(referenceNumber));
    return { success: true, data, message: 'Opening stock batch reversed and deleted' };
  }
}
