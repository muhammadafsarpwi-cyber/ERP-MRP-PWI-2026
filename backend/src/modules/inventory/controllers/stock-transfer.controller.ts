import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { StockTransferService } from '../services/stock-transfer.service';
import { CreateStockTransferDto, CreateStockTransferLineDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/transfers')
@Controller('inventory/transfers')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class StockTransferController {
  constructor(private readonly stockTransferService: StockTransferService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @ApiOperation({ summary: 'Create a stock transfer' })
  async create(@Body() dto: CreateStockTransferDto) {
    const transfer = await this.stockTransferService.create(dto);
    return { success: true, data: transfer, message: 'Stock transfer created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'List stock transfers' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'fromWarehouseId', required: false })
  @ApiQuery({ name: 'toWarehouseId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('fromWarehouseId') fromWarehouseId?: string,
    @Query('toWarehouseId') toWarehouseId?: string,
    @Query('status') status?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.stockTransferService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, fromWarehouseId,
      toWarehouseId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get stock transfer by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const transfer = await this.stockTransferService.findOne(id);
    return { success: true, data: transfer };
  }

  @Post(':id/lines')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @ApiOperation({ summary: 'Add line to stock transfer' })
  @ApiParam({ name: 'id' })
  async addLine(@Param('id') id: string, @Body() dto: CreateStockTransferLineDto) {
    const line = await this.stockTransferService.addLine(id, dto);
    return { success: true, data: line, message: 'Transfer line added successfully' };
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove line from stock transfer' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'lineId' })
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    await this.stockTransferService.removeLine(id, lineId);
    return { success: true, message: 'Transfer line removed successfully' };
  }

  @Patch(':id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit stock transfer' })
  @ApiParam({ name: 'id' })
  async submit(@Param('id') id: string) {
    const transfer = await this.stockTransferService.submit(id);
    return { success: true, data: transfer, message: 'Stock transfer submitted' };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve stock transfer' })
  @ApiParam({ name: 'id' })
  async approve(@Param('id') id: string) {
    const transfer = await this.stockTransferService.approve(id);
    return { success: true, data: transfer, message: 'Stock transfer approved' };
  }

  @Patch(':id/post')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post stock transfer' })
  @ApiParam({ name: 'id' })
  async post(@Param('id') id: string) {
    const transfer = await this.stockTransferService.post(id);
    return { success: true, data: transfer, message: 'Stock transfer posted' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel stock transfer' })
  @ApiParam({ name: 'id' })
  async cancel(@Param('id') id: string) {
    const transfer = await this.stockTransferService.cancel(id);
    return { success: true, data: transfer, message: 'Stock transfer cancelled' };
  }
}
