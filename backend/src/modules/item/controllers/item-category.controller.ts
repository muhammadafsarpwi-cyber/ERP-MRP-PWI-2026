import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ItemCategoryService } from '../services/item-category.service';
import { CreateItemCategoryDto, UpdateItemCategoryDto } from '../dto/item-category.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/categories')
@Controller('master-data/categories')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ItemCategoryController {
  constructor(private readonly categoryService: ItemCategoryService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('item_category.create')
  @ApiOperation({ summary: 'Create item category' })
  async create(@Body() dto: CreateItemCategoryDto) {
    const cat = await this.categoryService.create(dto);
    return { success: true, data: cat, message: 'Category created' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('item_category.view')
  @ApiOperation({ summary: 'List categories' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'parentCategoryId', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('parentCategoryId') parentCategoryId?: string,
  ) {
    const result = await this.categoryService.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, parentCategoryId });
    return { success: true, ...result };
  }

  @Get('hierarchy')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_category.view')
  @ApiOperation({ summary: 'Get category hierarchy' })
  @ApiQuery({ name: 'companyId', required: false })
  async getHierarchy(@Query('companyId') companyId?: string) {
    const tree = await this.categoryService.findHierarchy(companyId);
    return { success: true, data: tree };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_category.view')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Get category by ID' })
  async findOne(@Param('id') id: string) {
    const cat = await this.categoryService.findOne(id);
    return { success: true, data: cat };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_category.update')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update category' })
  async update(@Param('id') id: string, @Body() dto: UpdateItemCategoryDto) {
    const cat = await this.categoryService.update(id, dto);
    return { success: true, data: cat, message: 'Category updated' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_category.activate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string) {
    const cat = await this.categoryService.activate(id);
    return { success: true, data: cat, message: 'Category activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_category.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const cat = await this.categoryService.deactivate(id);
    return { success: true, data: cat, message: 'Category deactivated' };
  }
}
