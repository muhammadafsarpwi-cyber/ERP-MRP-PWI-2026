import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SectionService } from '../services';
import { CreateSectionDto, UpdateSectionDto } from '../dto';
import { SectionStatus } from '../entities';

@ApiTags('organization/sections')
@Controller('sections')
@UseGuards(PermissionGuard)
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Post()
  @RequirePermission('section.create')
  @ApiOperation({ summary: 'Create a new section' })
  @ApiResponse({ status: 201, description: 'Section created successfully' })
  @ApiResponse({ status: 409, description: 'Section code already exists' })
  async create(@Body() createSectionDto: CreateSectionDto) {
    const section = await this.sectionService.create(createSectionDto);
    return { success: true, data: section, message: 'Section created successfully' };
  }

  @Get()
  @RequirePermission('section.view')
  @ApiOperation({ summary: 'Get all sections' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: SectionStatus })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'divisionId', required: false, type: String })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: SectionStatus,
    @Query('companyId') companyId?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const result = await this.sectionService.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, status, companyId, divisionId });
    return { success: true, ...result };
  }

  @Get(':id')
  @RequirePermission('section.view')
  @ApiOperation({ summary: 'Get a section by ID' })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section found' })
  @ApiResponse({ status: 404, description: 'Section not found' })
  async findOne(@Param('id') id: string) {
    const section = await this.sectionService.findOne(id);
    return { success: true, data: section };
  }

  @Patch(':id')
  @RequirePermission('section.update')
  @ApiOperation({ summary: 'Update a section' })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section updated successfully' })
  async update(@Param('id') id: string, @Body() updateSectionDto: UpdateSectionDto) {
    const section = await this.sectionService.update(id, updateSectionDto);
    return { success: true, data: section, message: 'Section updated successfully' };
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('section.activate')
  @ApiOperation({ summary: 'Activate a section' })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section activated successfully' })
  async activate(@Param('id') id: string) {
    const section = await this.sectionService.activate(id);
    return { success: true, data: section, message: 'Section activated successfully' };
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('section.deactivate')
  @ApiOperation({ summary: 'Deactivate a section' })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section deactivated successfully' })
  async deactivate(@Param('id') id: string) {
    const section = await this.sectionService.deactivate(id);
    return { success: true, data: section, message: 'Section deactivated successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('section.delete')
  @ApiOperation({ summary: 'Delete a section' })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({ status: 204, description: 'Section deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.sectionService.remove(id);
  }
}
