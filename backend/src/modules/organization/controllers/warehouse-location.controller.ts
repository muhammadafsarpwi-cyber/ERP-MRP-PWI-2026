import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { WarehouseLocationService } from '../services';
import { CreateWarehouseLocationDto, UpdateWarehouseLocationDto } from '../dto';
import { WarehouseLocationStatus } from '../entities';

@ApiTags('organization/warehouse-locations')
@Controller('warehouse-locations')
export class WarehouseLocationController {
  constructor(private readonly locationService: WarehouseLocationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new warehouse location' })
  @ApiResponse({ status: 201, description: 'Location created successfully' })
  @ApiResponse({ status: 409, description: 'Location code already exists' })
  async create(@Body() createLocationDto: CreateWarehouseLocationDto) {
    const location = await this.locationService.create(createLocationDto);
    return { success: true, data: location, message: 'Location created successfully' };
  }

  @Get()
  @ApiOperation({ summary: 'Get all warehouse locations' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: WarehouseLocationStatus })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'parentLocationId', required: false, type: String })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: WarehouseLocationStatus,
    @Query('warehouseId') warehouseId?: string,
    @Query('parentLocationId') parentLocationId?: string,
  ) {
    const result = await this.locationService.findAll({
      page, limit, search, status, warehouseId, parentLocationId,
    });
    return { success: true, ...result };
  }

  @Get('hierarchy/:warehouseId')
  @ApiOperation({ summary: 'Get location hierarchy for a warehouse' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
  async getHierarchy(@Param('warehouseId') warehouseId: string) {
    const hierarchy = await this.locationService.getHierarchy(warehouseId);
    return { success: true, data: hierarchy };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a location by ID' })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location found' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  async findOne(@Param('id') id: string) {
    const location = await this.locationService.findOne(id);
    return { success: true, data: location };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a location' })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location updated successfully' })
  async update(@Param('id') id: string, @Body() updateLocationDto: UpdateWarehouseLocationDto) {
    const location = await this.locationService.update(id, updateLocationDto);
    return { success: true, data: location, message: 'Location updated successfully' };
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a location' })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location activated successfully' })
  async activate(@Param('id') id: string) {
    const location = await this.locationService.activate(id);
    return { success: true, data: location, message: 'Location activated successfully' };
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a location' })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location deactivated successfully' })
  async deactivate(@Param('id') id: string) {
    const location = await this.locationService.deactivate(id);
    return { success: true, data: location, message: 'Location deactivated successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a location' })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({ status: 204, description: 'Location deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.locationService.remove(id);
  }
}
