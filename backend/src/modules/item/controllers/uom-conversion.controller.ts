import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { UomConversionService } from '../services/uom-conversion.service';
import { CreateUomConversionDto, UpdateUomConversionDto } from '../dto/uom-conversion.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/uom-conversions')
@Controller('master-data/uom-conversions')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class UomConversionController {
  constructor(private readonly conversionService: UomConversionService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('uom_conversion.create')
  @ApiOperation({ summary: 'Create UOM conversion' })
  async create(@Body() dto: CreateUomConversionDto) {
    const conv = await this.conversionService.create(dto);
    return { success: true, data: conv, message: 'Conversion created' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('uom_conversion.view')
  @ApiOperation({ summary: 'List UOM conversions' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'fromUomId', required: false })
  @ApiQuery({ name: 'toUomId', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('fromUomId') fromUomId?: string,
    @Query('toUomId') toUomId?: string,
  ) {
    const result = await this.conversionService.findAll({ page: Number(page) || 1, limit: Number(limit) || 20, fromUomId, toUomId });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('uom_conversion.view')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Get conversion by ID' })
  async findOne(@Param('id') id: string) {
    const conv = await this.conversionService.findOne(id);
    return { success: true, data: conv };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('uom_conversion.update')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update conversion' })
  async update(@Param('id') id: string, @Body() dto: UpdateUomConversionDto) {
    const conv = await this.conversionService.update(id, dto);
    return { success: true, data: conv, message: 'Conversion updated' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('uom_conversion.activate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string) {
    const conv = await this.conversionService.activate(id);
    return { success: true, data: conv, message: 'Conversion activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('uom_conversion.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const conv = await this.conversionService.deactivate(id);
    return { success: true, data: conv, message: 'Conversion deactivated' };
  }
}
