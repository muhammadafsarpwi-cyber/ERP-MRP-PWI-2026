import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DepartmentService } from '../services';
import { CreateDepartmentDto, UpdateDepartmentDto } from '../dto';
import { DepartmentStatus } from '../entities';

@ApiTags('organization/departments')
@Controller('departments')
@UseGuards(PermissionGuard)
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  @RequirePermission('department.create')
  @ApiOperation({ summary: 'Create a new department' })
  @ApiResponse({ status: 201, description: 'Department created successfully' })
  @ApiResponse({ status: 409, description: 'Department code already exists' })
  async create(@Body() createDepartmentDto: CreateDepartmentDto) {
    const department = await this.departmentService.create(createDepartmentDto);
    return { success: true, data: department, message: 'Department created successfully' };
  }

  @Get()
  @RequirePermission('department.view')
  @ApiOperation({ summary: 'Get all departments' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: DepartmentStatus })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  @ApiQuery({ name: 'businessUnitId', required: false, type: String })
  @ApiQuery({ name: 'divisionId', required: false, type: String })
  @ApiQuery({ name: 'sectionId', required: false, type: String })
  @ApiQuery({ name: 'parentDepartmentId', required: false, type: String })
  @ApiQuery({ name: 'centralizedOnly', required: false, type: Boolean, description: 'Filter to centralized (company-level) departments only' })
  @ApiQuery({ name: 'productionOnly', required: false, type: Boolean, description: 'Filter to production-scoped (division-level) departments only' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: DepartmentStatus,
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('parentDepartmentId') parentDepartmentId?: string,
    @Query('centralizedOnly') centralizedOnly?: string,
    @Query('productionOnly') productionOnly?: string,
  ) {
    const result = await this.departmentService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, status, companyId, branchId, businessUnitId, divisionId, sectionId, parentDepartmentId,
      centralizedOnly: centralizedOnly === 'true',
      productionOnly: productionOnly === 'true',
    });
    return { success: true, ...result };
  }

  @Get('hierarchy')
  @RequirePermission('department.view')
  @ApiOperation({ summary: 'Get department hierarchy' })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  async getHierarchy(@Query('companyId') companyId?: string) {
    const hierarchy = await this.departmentService.getHierarchy(companyId);
    return { success: true, data: hierarchy };
  }

  @Get(':id')
  @RequirePermission('department.view')
  @ApiOperation({ summary: 'Get a department by ID' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  @ApiResponse({ status: 200, description: 'Department found' })
  @ApiResponse({ status: 404, description: 'Department not found' })
  async findOne(@Param('id') id: string) {
    const department = await this.departmentService.findOne(id);
    return { success: true, data: department };
  }

  @Patch(':id')
  @RequirePermission('department.update')
  @ApiOperation({ summary: 'Update a department' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  @ApiResponse({ status: 200, description: 'Department updated successfully' })
  async update(@Param('id') id: string, @Body() updateDepartmentDto: UpdateDepartmentDto) {
    const department = await this.departmentService.update(id, updateDepartmentDto);
    return { success: true, data: department, message: 'Department updated successfully' };
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('department.activate')
  @ApiOperation({ summary: 'Activate a department' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  @ApiResponse({ status: 200, description: 'Department activated successfully' })
  async activate(@Param('id') id: string) {
    const department = await this.departmentService.activate(id);
    return { success: true, data: department, message: 'Department activated successfully' };
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('department.deactivate')
  @ApiOperation({ summary: 'Deactivate a department' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  @ApiResponse({ status: 200, description: 'Department deactivated successfully' })
  async deactivate(@Param('id') id: string) {
    const department = await this.departmentService.deactivate(id);
    return { success: true, data: department, message: 'Department deactivated successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('department.delete')
  @ApiOperation({ summary: 'Delete a department' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  @ApiResponse({ status: 204, description: 'Department deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.departmentService.remove(id);
  }
}
