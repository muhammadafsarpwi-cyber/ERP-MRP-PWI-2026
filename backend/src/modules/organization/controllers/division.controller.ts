import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DivisionService } from '../services';
import { CreateDivisionDto, UpdateDivisionDto } from '../dto';
import { DivisionStatus } from '../entities';

@ApiTags('organization/divisions')
@Controller('divisions')
export class DivisionController {
  constructor(private readonly divisionService: DivisionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new division' })
  @ApiResponse({ status: 201, description: 'Division created successfully' })
  @ApiResponse({ status: 409, description: 'Division code already exists' })
  async create(@Body() createDivisionDto: CreateDivisionDto) {
    const division = await this.divisionService.create(createDivisionDto);
    return { success: true, data: division, message: 'Division created successfully' };
  }

  @Get()
  @ApiOperation({ summary: 'Get all divisions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: DivisionStatus })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: DivisionStatus,
    @Query('companyId') companyId?: string,
  ) {
    const result = await this.divisionService.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, status, companyId });
    return { success: true, ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a division by ID' })
  @ApiParam({ name: 'id', description: 'Division ID' })
  @ApiResponse({ status: 200, description: 'Division found' })
  @ApiResponse({ status: 404, description: 'Division not found' })
  async findOne(@Param('id') id: string) {
    const division = await this.divisionService.findOne(id);
    return { success: true, data: division };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a division' })
  @ApiParam({ name: 'id', description: 'Division ID' })
  @ApiResponse({ status: 200, description: 'Division updated successfully' })
  async update(@Param('id') id: string, @Body() updateDivisionDto: UpdateDivisionDto) {
    const division = await this.divisionService.update(id, updateDivisionDto);
    return { success: true, data: division, message: 'Division updated successfully' };
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a division' })
  @ApiParam({ name: 'id', description: 'Division ID' })
  @ApiResponse({ status: 200, description: 'Division activated successfully' })
  async activate(@Param('id') id: string) {
    const division = await this.divisionService.activate(id);
    return { success: true, data: division, message: 'Division activated successfully' };
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a division' })
  @ApiParam({ name: 'id', description: 'Division ID' })
  @ApiResponse({ status: 200, description: 'Division deactivated successfully' })
  async deactivate(@Param('id') id: string) {
    const division = await this.divisionService.deactivate(id);
    return { success: true, data: division, message: 'Division deactivated successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a division' })
  @ApiParam({ name: 'id', description: 'Division ID' })
  @ApiResponse({ status: 204, description: 'Division deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.divisionService.remove(id);
  }
}
