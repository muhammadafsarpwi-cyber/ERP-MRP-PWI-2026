import {
  Controller, Get, Post, Put, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards';
import { PermissionGuard, RequirePermission } from '../../auth/guards';
import { MaintenanceCategoryService } from '../services';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto';

@ApiTags('Maintenance - Categories')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, PermissionGuard)
@Controller('master-data/maintenance/categories')
export class MaintenanceCategoryController {
  constructor(private readonly categoryService: MaintenanceCategoryService) {}

  @Get('complaint')
  @RequirePermission('maintenance.category.view')
  @ApiOperation({ summary: 'List complaint categories' })
  getComplaintCategories(@Query('companyId') companyId?: string) {
    return this.categoryService.findComplaintCategories(companyId);
  }

  @Post('complaint')
  @RequirePermission('maintenance.category.manage')
  @ApiOperation({ summary: 'Create complaint category' })
  createComplaintCategory(@Body() dto: CreateCategoryDto) {
    return this.categoryService.createComplaintCategory(dto);
  }

  @Put('complaint/:id')
  @RequirePermission('maintenance.category.manage')
  @ApiOperation({ summary: 'Update complaint category' })
  updateComplaintCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.updateComplaintCategory(id, dto);
  }

  @Get('root-cause')
  @RequirePermission('maintenance.category.view')
  @ApiOperation({ summary: 'List root cause categories' })
  getRootCauseCategories(@Query('companyId') companyId?: string) {
    return this.categoryService.findRootCauseCategories(companyId);
  }

  @Post('root-cause')
  @RequirePermission('maintenance.category.manage')
  @ApiOperation({ summary: 'Create root cause category' })
  createRootCauseCategory(@Body() dto: CreateCategoryDto) {
    return this.categoryService.createRootCauseCategory(dto);
  }

  @Put('root-cause/:id')
  @RequirePermission('maintenance.category.manage')
  @ApiOperation({ summary: 'Update root cause category' })
  updateRootCauseCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.updateRootCauseCategory(id, dto);
  }

  @Get('failure')
  @RequirePermission('maintenance.category.view')
  @ApiOperation({ summary: 'List failure categories' })
  getFailureCategories(@Query('companyId') companyId?: string) {
    return this.categoryService.findFailureCategories(companyId);
  }

  @Post('failure')
  @RequirePermission('maintenance.category.manage')
  @ApiOperation({ summary: 'Create failure category' })
  createFailureCategory(@Body() dto: CreateCategoryDto) {
    return this.categoryService.createFailureCategory(dto);
  }

  @Put('failure/:id')
  @RequirePermission('maintenance.category.manage')
  @ApiOperation({ summary: 'Update failure category' })
  updateFailureCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.updateFailureCategory(id, dto);
  }
}
