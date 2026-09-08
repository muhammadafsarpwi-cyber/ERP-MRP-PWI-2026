import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { BarcodeService } from '../services/barcode.service';
import { CreateBarcodeDto, UpdateBarcodeDto } from '../dto/barcode.dto';
import { BarcodeEntityType } from '../entities/barcode.entity';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('barcode-management')
@Controller('barcode-management')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.create')
  @ApiOperation({ summary: 'Create a barcode' })
  async create(@Body() dto: CreateBarcodeDto, @Req() req: any) {
    const companyId = req.user?.defaultCompanyId;
    const barcode = await this.barcodeService.create(dto, companyId, req.user?.id);
    return { success: true, data: barcode, message: 'Barcode created' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.view')
  @ApiOperation({ summary: 'List all barcodes' })
  @ApiQuery({ name: 'entityType', required: false, enum: BarcodeEntityType })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Req() req: any,
    @Query('entityType') entityType?: BarcodeEntityType,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    const companyId = req.user?.defaultCompanyId;
    const result = await this.barcodeService.findAll(companyId, entityType, Number(page) || 1, Number(limit) || 50, search);
    return { success: true, ...result };
  }

  @Get('stats')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.view')
  @ApiOperation({ summary: 'Get barcode statistics by entity type' })
  async getStats(@Req() req: any) {
    const companyId = req.user?.defaultCompanyId;
    const stats = await this.barcodeService.getStats(companyId);
    return { success: true, data: stats };
  }

  @Get('lookup/:barcodeValue')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Look up a barcode value and resolve to entity' })
  @ApiParam({ name: 'barcodeValue' })
  async lookup(@Req() req: any, @Param('barcodeValue') barcodeValue: string) {
    const companyId = req.user?.defaultCompanyId;
    const barcode = await this.barcodeService.findByValue(companyId, barcodeValue);
    return { success: true, data: barcode };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.view')
  @ApiOperation({ summary: 'Get barcode by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const barcode = await this.barcodeService.findOne(id);
    return { success: true, data: barcode };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.update')
  @ApiOperation({ summary: 'Update barcode' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateBarcodeDto) {
    const barcode = await this.barcodeService.update(id, dto);
    return { success: true, data: barcode, message: 'Barcode updated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate barcode' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const barcode = await this.barcodeService.deactivate(id);
    return { success: true, data: barcode, message: 'Barcode deactivated' };
  }

  @Post('backfill')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Backfill barcodes for existing entities' })
  @ApiQuery({ name: 'entityType', required: false, enum: BarcodeEntityType })
  async backfill(
    @Req() req: any,
    @Query('entityType') entityType?: BarcodeEntityType,
  ) {
    const companyId = req.user?.defaultCompanyId;
    const result = await this.barcodeService.backfill(companyId, entityType);
    return { success: true, data: result, message: 'Backfill completed' };
  }
}
