import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ItemRouteTypeService } from '../services/item-route-type.service';
import { CreateRouteTypeDto, UpdateRouteTypeDto } from '../dto/item-route-type.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/route-types')
@Controller('master-data/route-types')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ItemRouteTypeController {
  constructor(private readonly service: ItemRouteTypeService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('item_route_type.create')
  @ApiOperation({ summary: 'Create a route type' })
  async create(@Body() dto: CreateRouteTypeDto) {
    const rt = await this.service.create(dto);
    return { success: true, data: rt, message: 'Route type created' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('item_route_type.view')
  @ApiOperation({ summary: 'List route types' })
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
    const result = await this.service.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, status: status as any });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_route_type.view')
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const rt = await this.service.findOne(id);
    return { success: true, data: rt };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_route_type.update')
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateRouteTypeDto) {
    const rt = await this.service.update(id, dto);
    return { success: true, data: rt, message: 'Route type updated' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_route_type.activate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string) {
    const rt = await this.service.activate(id);
    return { success: true, data: rt, message: 'Route type activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_route_type.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const rt = await this.service.deactivate(id);
    return { success: true, data: rt, message: 'Route type deactivated' };
  }
}