import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { BusinessUnitService } from '../services';
import { CreateBusinessUnitDto, UpdateBusinessUnitDto } from '../dto';
import { BusinessUnitStatus } from '../entities';

@ApiTags('organization/business-units')
@Controller('business-units')
export class BusinessUnitController {
  constructor(private readonly businessUnitService: BusinessUnitService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new business unit' })
  @ApiResponse({ status: 201, description: 'Business unit created successfully' })
  @ApiResponse({ status: 409, description: 'Business unit code already exists' })
  async create(@Body() createBusinessUnitDto: CreateBusinessUnitDto) {
    const businessUnit = await this.businessUnitService.create(createBusinessUnitDto);
    return { success: true, data: businessUnit, message: 'Business unit created successfully' };
  }

  @Get()
  @ApiOperation({ summary: 'Get all business units' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: BusinessUnitStatus })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: BusinessUnitStatus,
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const result = await this.businessUnitService.findAll({ page, limit, search, status, companyId, branchId });
    return { success: true, ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a business unit by ID' })
  @ApiParam({ name: 'id', description: 'Business Unit ID' })
  @ApiResponse({ status: 200, description: 'Business unit found' })
  @ApiResponse({ status: 404, description: 'Business unit not found' })
  async findOne(@Param('id') id: string) {
    const businessUnit = await this.businessUnitService.findOne(id);
    return { success: true, data: businessUnit };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a business unit' })
  @ApiParam({ name: 'id', description: 'Business Unit ID' })
  @ApiResponse({ status: 200, description: 'Business unit updated successfully' })
  async update(@Param('id') id: string, @Body() updateBusinessUnitDto: UpdateBusinessUnitDto) {
    const businessUnit = await this.businessUnitService.update(id, updateBusinessUnitDto);
    return { success: true, data: businessUnit, message: 'Business unit updated successfully' };
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a business unit' })
  @ApiParam({ name: 'id', description: 'Business Unit ID' })
  @ApiResponse({ status: 200, description: 'Business unit activated successfully' })
  async activate(@Param('id') id: string) {
    const businessUnit = await this.businessUnitService.activate(id);
    return { success: true, data: businessUnit, message: 'Business unit activated successfully' };
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a business unit' })
  @ApiParam({ name: 'id', description: 'Business Unit ID' })
  @ApiResponse({ status: 200, description: 'Business unit deactivated successfully' })
  async deactivate(@Param('id') id: string) {
    const businessUnit = await this.businessUnitService.deactivate(id);
    return { success: true, data: businessUnit, message: 'Business unit deactivated successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a business unit' })
  @ApiParam({ name: 'id', description: 'Business Unit ID' })
  @ApiResponse({ status: 204, description: 'Business unit deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.businessUnitService.remove(id);
  }
}
