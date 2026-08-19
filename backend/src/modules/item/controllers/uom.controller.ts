import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { UomService } from '../services/uom.service';
import { CreateUomDto, UpdateUomDto } from '../dto/uom.dto';
import { UomStatus } from '../entities';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/uom')
@Controller('master-data/uom')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class UomController {
  constructor(private readonly uomService: UomService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('uom.create')
  @ApiOperation({ summary: 'Create a UOM' })
  @ApiResponse({ status: 201, description: 'UOM created' })
  async create(@Body() dto: CreateUomDto) {
    const uom = await this.uomService.create(dto);
    return { success: true, data: uom, message: 'UOM created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('uom.view')
  @ApiOperation({ summary: 'List UOMs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: UomStatus })
  @ApiQuery({ name: 'uomType', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: UomStatus,
    @Query('uomType') uomType?: string,
  ) {
    const result = await this.uomService.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, search, status, uomType });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('uom.view')
  @ApiOperation({ summary: 'Get UOM by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const uom = await this.uomService.findOne(id);
    return { success: true, data: uom };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('uom.update')
  @ApiOperation({ summary: 'Update UOM' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateUomDto) {
    const uom = await this.uomService.update(id, dto);
    return { success: true, data: uom, message: 'UOM updated successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('uom.activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate UOM' })
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string) {
    const uom = await this.uomService.activate(id);
    return { success: true, data: uom, message: 'UOM activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('uom.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate UOM' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const uom = await this.uomService.deactivate(id);
    return { success: true, data: uom, message: 'UOM deactivated' };
  }
}
