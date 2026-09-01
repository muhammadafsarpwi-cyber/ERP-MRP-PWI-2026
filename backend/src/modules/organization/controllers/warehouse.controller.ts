import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { WarehouseService } from '../services';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../dto';
import { WarehouseStatus, WarehouseType } from '../entities';

@ApiTags('organization/warehouses')
@Controller('warehouses')
@UseGuards(PermissionGuard)
@RequirePermission('admin.users.update')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new warehouse' })
  @ApiResponse({ status: 201, description: 'Warehouse created successfully' })
  @ApiResponse({ status: 409, description: 'Warehouse code already exists' })
  async create(@Body() createWarehouseDto: CreateWarehouseDto) {
    const warehouse = await this.warehouseService.create(createWarehouseDto);
    return { success: true, data: warehouse, message: 'Warehouse created successfully' };
  }

  @Get()
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get all warehouses' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: WarehouseStatus })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  @ApiQuery({ name: 'businessUnitId', required: false, type: String })
  @ApiQuery({ name: 'warehouseType', required: false, enum: WarehouseType })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: WarehouseStatus,
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('warehouseType') warehouseType?: WarehouseType,
  ) {
    const result = await this.warehouseService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, status, companyId, branchId, businessUnitId, warehouseType,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get a warehouse by ID' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Warehouse found' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  async findOne(@Param('id') id: string) {
    const warehouse = await this.warehouseService.findOne(id);
    return { success: true, data: warehouse };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Warehouse updated successfully' })
  async update(@Param('id') id: string, @Body() updateWarehouseDto: UpdateWarehouseDto) {
    const warehouse = await this.warehouseService.update(id, updateWarehouseDto);
    return { success: true, data: warehouse, message: 'Warehouse updated successfully' };
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Warehouse activated successfully' })
  async activate(@Param('id') id: string) {
    const warehouse = await this.warehouseService.activate(id);
    return { success: true, data: warehouse, message: 'Warehouse activated successfully' };
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Warehouse deactivated successfully' })
  async deactivate(@Param('id') id: string) {
    const warehouse = await this.warehouseService.deactivate(id);
    return { success: true, data: warehouse, message: 'Warehouse deactivated successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 204, description: 'Warehouse deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.warehouseService.remove(id);
  }
}
