import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ItemService } from '../services/item.service';
import { CreateItemDto, UpdateItemDto } from '../dto/item.dto';
import { ItemStatus } from '../entities';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/items')
@Controller('master-data/items')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('item.create')
  @ApiOperation({ summary: 'Create an item' })
  async create(@Body() dto: CreateItemDto) {
    const item = await this.itemService.create(dto);
    return { success: true, data: item, message: 'Item created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'List items' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ItemStatus })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'isPurchasable', required: false })
  @ApiQuery({ name: 'isSellable', required: false })
  @ApiQuery({ name: 'isManufacturable', required: false })
  @ApiQuery({ name: 'isStockItem', required: false })
  @ApiQuery({ name: 'trackInventory', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: ItemStatus,
    @Query('itemType') itemType?: string,
    @Query('categoryId') categoryId?: string,
    @Query('companyId') companyId?: string,
    @Query('isPurchasable') isPurchasable?: boolean,
    @Query('isSellable') isSellable?: boolean,
    @Query('isManufacturable') isManufacturable?: boolean,
    @Query('isStockItem') isStockItem?: boolean,
    @Query('trackInventory') trackInventory?: boolean,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.itemService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, status, itemType, categoryId, companyId,
      isPurchasable, isSellable, isManufacturable, isStockItem, trackInventory,
      sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get('by-code/:companyId/:itemCode')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Find item by item code' })
  @ApiParam({ name: 'companyId' })
  @ApiParam({ name: 'itemCode' })
  async findByItemCode(@Param('companyId') companyId: string, @Param('itemCode') itemCode: string) {
    const item = await this.itemService.findByItemCode(companyId, itemCode);
    return { success: true, data: item };
  }

  @Get('by-sku/:companyId/:sku')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Find item by SKU' })
  @ApiParam({ name: 'companyId' })
  @ApiParam({ name: 'sku' })
  async findBySku(@Param('companyId') companyId: string, @Param('sku') sku: string) {
    const item = await this.itemService.findBySku(companyId, sku);
    return { success: true, data: item };
  }

  @Get('by-barcode/:companyId/:barcode')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Find item by barcode' })
  @ApiParam({ name: 'companyId' })
  @ApiParam({ name: 'barcode' })
  async findByBarcode(@Param('companyId') companyId: string, @Param('barcode') barcode: string) {
    const item = await this.itemService.findByBarcode(companyId, barcode);
    return { success: true, data: item };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const item = await this.itemService.findOne(id);
    return { success: true, data: item };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.update')
  @ApiOperation({ summary: 'Update item' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    const item = await this.itemService.update(id, dto);
    return { success: true, data: item, message: 'Item updated successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate item' })
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string) {
    const item = await this.itemService.activate(id);
    return { success: true, data: item, message: 'Item activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate item' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const item = await this.itemService.deactivate(id);
    return { success: true, data: item, message: 'Item deactivated' };
  }

  @Patch(':id/discontinue')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.discontinue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discontinue item' })
  @ApiParam({ name: 'id' })
  async discontinue(@Param('id') id: string) {
    const item = await this.itemService.discontinue(id);
    return { success: true, data: item, message: 'Item discontinued' };
  }
}
