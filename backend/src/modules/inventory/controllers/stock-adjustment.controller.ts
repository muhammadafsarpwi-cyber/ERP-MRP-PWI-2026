import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { StockAdjustmentService } from '../services/stock-adjustment.service';
import { CreateStockAdjustmentDto, CreateStockAdjustmentLineDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/adjustments')
@Controller('inventory/adjustments')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class StockAdjustmentController {
  constructor(private readonly stockAdjustmentService: StockAdjustmentService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.create')
  @ApiOperation({ summary: 'Create a stock adjustment' })
  async create(@Body() dto: CreateStockAdjustmentDto) {
    const adjustment = await this.stockAdjustmentService.create(dto);
    return { success: true, data: adjustment, message: 'Stock adjustment created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'List stock adjustments' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'adjustmentType', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('adjustmentType') adjustmentType?: string,
    @Query('status') status?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.stockAdjustmentService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, warehouseId,
      adjustmentType, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get stock adjustment by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const adjustment = await this.stockAdjustmentService.findOne(id);
    return { success: true, data: adjustment };
  }

  @Post(':id/lines')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.create')
  @ApiOperation({ summary: 'Add line to stock adjustment' })
  @ApiParam({ name: 'id' })
  async addLine(@Param('id') id: string, @Body() dto: CreateStockAdjustmentLineDto) {
    const line = await this.stockAdjustmentService.addLine(id, dto);
    return { success: true, data: line, message: 'Adjustment line added successfully' };
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove line from stock adjustment' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'lineId' })
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    await this.stockAdjustmentService.removeLine(id, lineId);
    return { success: true, message: 'Adjustment line removed successfully' };
  }

  @Patch(':id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit stock adjustment' })
  @ApiParam({ name: 'id' })
  async submit(@Param('id') id: string) {
    const adjustment = await this.stockAdjustmentService.submit(id);
    return { success: true, data: adjustment, message: 'Stock adjustment submitted' };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve stock adjustment' })
  @ApiParam({ name: 'id' })
  async approve(@Param('id') id: string) {
    const adjustment = await this.stockAdjustmentService.approve(id);
    return { success: true, data: adjustment, message: 'Stock adjustment approved' };
  }

  @Patch(':id/post')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post stock adjustment' })
  @ApiParam({ name: 'id' })
  async post(@Param('id') id: string) {
    const adjustment = await this.stockAdjustmentService.post(id);
    return { success: true, data: adjustment, message: 'Stock adjustment posted' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel stock adjustment' })
  @ApiParam({ name: 'id' })
  async cancel(@Param('id') id: string) {
    const adjustment = await this.stockAdjustmentService.cancel(id);
    return { success: true, data: adjustment, message: 'Stock adjustment cancelled' };
  }
}
