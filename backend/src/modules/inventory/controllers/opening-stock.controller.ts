import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OpeningStockService } from '../services/opening-stock.service';
import { PostOpeningStockDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/opening-stock')
@Controller('inventory/opening-stock')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class OpeningStockController {
  constructor(private readonly openingStockService: OpeningStockService) {}

  @Get('history')
  @ApiOperation({ summary: 'List posted opening stock batches and their line items' })
  async getHistory(
    @Req() req: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    const companyId = req.user?.defaultCompanyId || req.user?.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    const data = await this.openingStockService.getHistory(companyId, { warehouseId, search });
    return { success: true, data };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post opening stock balances' })
  async postOpeningStock(@Req() req: any, @Body() dto: PostOpeningStockDto) {
    if (!dto.companyId) {
      dto.companyId = req.user?.defaultCompanyId || req.user?.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    }
    const result = await this.openingStockService.postOpeningStock(dto, req.user?.id);
    return { success: true, data: result, message: `Opening stock posted: ${result.posted} lines` };
  }

  @Put('lines/:ledgerId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Update a posted opening stock line quantity/notes and sync inventory balance' })
  async updateLine(
    @Req() req: any,
    @Param('ledgerId') ledgerId: string,
    @Body() body: { quantity: number; notes?: string },
  ) {
    const companyId = req.user?.defaultCompanyId || req.user?.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    const data = await this.openingStockService.updateLine(companyId, ledgerId, body);
    return { success: true, data, message: 'Opening stock line updated and stock balance synced' };
  }

  @Delete('lines/:ledgerId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Reverse and delete a posted opening stock line' })
  async deleteLine(@Req() req: any, @Param('ledgerId') ledgerId: string) {
    const companyId = req.user?.defaultCompanyId || req.user?.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    const data = await this.openingStockService.deleteLine(companyId, ledgerId);
    return { success: true, data, message: 'Opening stock line reversed and deleted' };
  }

  @Delete('batches/:referenceNumber')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Reverse and delete an entire posted opening stock batch by reference number' })
  async deleteBatch(@Req() req: any, @Param('referenceNumber') referenceNumber: string) {
    const companyId = req.user?.defaultCompanyId || req.user?.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    const data = await this.openingStockService.deleteBatch(companyId, decodeURIComponent(referenceNumber));
    return { success: true, data, message: 'Opening stock batch reversed and deleted' };
  }
}
