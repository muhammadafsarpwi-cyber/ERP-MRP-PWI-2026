import { Controller, Get, Post, Patch, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ItemBarcodeService } from '../services/item-barcode.service';
import { CreateItemBarcodeDto, UpdateItemBarcodeDto } from '../dto/item-barcode.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/barcodes')
@Controller('master-data')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ItemBarcodeController {
  constructor(private readonly barcodeService: ItemBarcodeService) {}

  @Post('items/:itemId/barcodes')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.create')
  @ApiOperation({ summary: 'Create barcode for item' })
  @ApiParam({ name: 'itemId' })
  async create(@Param('itemId') itemId: string, @Body() dto: CreateItemBarcodeDto) {
    dto.itemId = itemId;
    const barcode = await this.barcodeService.create(dto);
    return { success: true, data: barcode, message: 'Barcode created' };
  }

  @Get('items/:itemId/barcodes')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.view')
  @ApiOperation({ summary: 'List barcodes for item' })
  @ApiParam({ name: 'itemId' })
  async findAllByItem(@Param('itemId') itemId: string) {
    const barcodes = await this.barcodeService.findAllByItem(itemId);
    return { success: true, data: barcodes };
  }

  @Patch('barcodes/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.update')
  @ApiOperation({ summary: 'Update barcode' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateItemBarcodeDto) {
    const barcode = await this.barcodeService.update(id, dto);
    return { success: true, data: barcode, message: 'Barcode updated' };
  }

  @Patch('barcodes/:id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_barcode.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate barcode' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const barcode = await this.barcodeService.deactivate(id);
    return { success: true, data: barcode, message: 'Barcode deactivated' };
  }
}
