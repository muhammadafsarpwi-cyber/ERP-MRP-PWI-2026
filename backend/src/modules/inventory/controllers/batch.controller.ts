import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { BatchService } from '../services/batch.service';
import { CreateBatchDto, UpdateBatchDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('inventory/batches')
@Controller('inventory/batches')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.batch.manage')
  @ApiOperation({ summary: 'Create a batch' })
  async create(@Body() dto: CreateBatchDto) {
    const batch = await this.batchService.create(dto);
    return { success: true, data: batch, message: 'Batch created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.batch.view')
  @ApiOperation({ summary: 'List batches' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.batchService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, itemId, warehouseId,
      status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get('by-item-warehouse')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.batch.view')
  @ApiOperation({ summary: 'Find batches by item and warehouse' })
  @ApiQuery({ name: 'companyId', required: true })
  @ApiQuery({ name: 'itemId', required: true })
  @ApiQuery({ name: 'warehouseId', required: true })
  async findByItemAndWarehouse(
    @Query('companyId') companyId: string,
    @Query('itemId') itemId: string,
    @Query('warehouseId') warehouseId: string,
  ) {
    const batches = await this.batchService.findByItemAndWarehouse(companyId, itemId, warehouseId);
    return { success: true, data: batches };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.batch.view')
  @ApiOperation({ summary: 'Get batch by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const batch = await this.batchService.findOne(id);
    return { success: true, data: batch };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.batch.manage')
  @ApiOperation({ summary: 'Update batch' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    const batch = await this.batchService.update(id, dto);
    return { success: true, data: batch, message: 'Batch updated successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.batch.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate batch' })
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string) {
    const batch = await this.batchService.activate(id);
    return { success: true, data: batch, message: 'Batch activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.batch.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate batch' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const batch = await this.batchService.deactivate(id);
    return { success: true, data: batch, message: 'Batch deactivated' };
  }
}
