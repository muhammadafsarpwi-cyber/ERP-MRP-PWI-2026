import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SectionService } from '../services';
import { CreateSectionDto, UpdateSectionDto } from '../dto';
import { SectionStatus } from '../entities';

@ApiTags('organization/sections')
@Controller('sections')
@UseGuards(SupabaseJwtGuard, PermissionGuard)
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Post()
  @RequirePermission('section.create')
  @ApiOperation({ summary: 'Create a new section' })
  @ApiResponse({ status: 201, description: 'Section created successfully' })
  @ApiResponse({ status: 409, description: 'Section code already exists' })
  async create(@Req() req: any, @Body() createSectionDto: CreateSectionDto) {
    const userId = req.user?.id || req.user?.sub;
    const section = await this.sectionService.create(createSectionDto, userId);
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
  async update(@Req() req: any, @Param('id') id: string, @Body() updateSectionDto: UpdateSectionDto) {
    const userId = req.user?.id || req.user?.sub;
    const section = await this.sectionService.update(id, updateSectionDto, userId);
    return { success: true, data: section, message: 'Section updated successfully' };
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('section.activate')
  @ApiOperation({ summary: 'Activate a section' })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section activated successfully' })
  async activate(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.sub;
    const section = await this.sectionService.activate(id, userId);
    return { success: true, data: section, message: 'Section activated successfully' };
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('section.deactivate')
  @ApiOperation({ summary: 'Deactivate a section' })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section deactivated successfully' })
  async deactivate(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.sub;
    const section = await this.sectionService.deactivate(id, userId);
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
