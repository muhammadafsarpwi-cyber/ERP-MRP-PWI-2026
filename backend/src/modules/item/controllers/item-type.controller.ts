import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ItemTypeService } from '../services/item-type.service';
import { CreateItemTypeDto, UpdateItemTypeDto } from '../dto/item-type.dto';
import { ItemTypeStatus } from '../entities/item-type.entity';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/item-types')
@Controller('master-data/item-types')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ItemTypeController {
  constructor(private readonly service: ItemTypeService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('item_type.create')
  @ApiOperation({ summary: 'Create an item type' })
  async create(@Body() dto: CreateItemTypeDto) {
    const itemType = await this.service.create(dto);
    return { success: true, data: itemType, message: 'Item type created' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('item_type.view')
  @ApiOperation({ summary: 'List item types' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'status', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.service.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, status: status as ItemTypeStatus });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_type.view')
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const itemType = await this.service.findOne(id);
    return { success: true, data: itemType };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_type.update')
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateItemTypeDto) {
    const itemType = await this.service.update(id, dto);
    return { success: true, data: itemType, message: 'Item type updated' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_type.activate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string) {
    const itemType = await this.service.activate(id);
    return { success: true, data: itemType, message: 'Item type activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_type.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const itemType = await this.service.deactivate(id);
    return { success: true, data: itemType, message: 'Item type deactivated' };
  }
}