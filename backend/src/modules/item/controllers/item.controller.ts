import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ItemService } from '../services/item.service';
import { ItemConversionService } from '../services/item-conversion.service';
import { CreateItemDto, UpdateItemDto, ConvertUomDto, BulkCreateItemsDto } from '../dto/item.dto';
import { ItemStatus } from '../entities';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard, divisionFilterFromRequest } from '../../auth/guards/division-scope.guard';

@ApiTags('master-data/items')
@Controller('master-data/items')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class ItemController {
  constructor(
    private readonly itemService: ItemService,
    private readonly conversionService: ItemConversionService,
  ) {}

  /** Division list a service may filter with; `undefined` = unrestricted. */
  private divisions(req: any): string[] | undefined {
    return divisionFilterFromRequest(req.allowedDivisionIds);
  }

  private async getCompanyId(req: any): Promise<string> {
    const directCompanyId =
      req.headers?.['x-company-id'] ||
      req.query?.companyId ||
      req.erpUser?.defaultCompanyId ||
      req.orgScopes?.[0]?.companyId ||
      req.user?.defaultCompanyId;

    if (directCompanyId) {
      return directCompanyId;
    }

    return await this.itemService.resolveDefaultCompanyId(req.user?.id);
  }

  @Post('bulk')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.create')
  @ApiOperation({ summary: 'Bulk import items' })
  async bulkCreate(@Body() body: { items: CreateItemDto[]; companyId?: string }, @Req() req: any) {
    const companyId = body.companyId || body.items?.[0]?.companyId;
    const result = await this.itemService.bulkImportItems(companyId, body.items || [], req.user?.id);
    return { success: true, data: result, message: 'Bulk import completed' };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('item.create')
  @ApiOperation({ summary: 'Create an item' })
  async create(@Body() dto: CreateItemDto, @Req() req: any) {
    const item = await this.itemService.create(dto, req.user?.id);
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
  @ApiQuery({ name: 'itemTypeId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'routeType', required: false })
  @ApiQuery({ name: 'routeTypeId', required: false })
  @ApiQuery({ name: 'wireSizeMm', required: false })
  @ApiQuery({ name: 'thicknessMm', required: false })
  @ApiQuery({ name: 'widthMm', required: false })
  @ApiQuery({ name: 'active', required: false })
  @ApiQuery({ name: 'isPurchasable', required: false })
  @ApiQuery({ name: 'isSellable', required: false })
  @ApiQuery({ name: 'isManufacturable', required: false })
  @ApiQuery({ name: 'isStockItem', required: false })
  @ApiQuery({ name: 'trackInventory', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: ItemStatus,
    @Query('itemType') itemType?: string,
    @Query('itemTypeId') itemTypeId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('companyId') companyId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('routeType') routeType?: string,
    @Query('routeTypeId') routeTypeId?: string,
    @Query('materialRoleUsage') materialRoleUsage?: string,
    @Query('wireSizeMm') wireSizeMm?: number,
    @Query('thicknessMm') thicknessMm?: number,
    @Query('widthMm') widthMm?: number,
    @Query('active') active?: string,
    @Query('isPurchasable') isPurchasable?: boolean,
    @Query('isSellable') isSellable?: boolean,
    @Query('isManufacturable') isManufacturable?: boolean,
    @Query('isStockItem') isStockItem?: boolean,
    @Query('trackInventory') trackInventory?: boolean,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.itemService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, status, itemType, itemTypeId, categoryId, companyId,
      divisionId, sectionId, departmentId, routeType, routeTypeId, materialRoleUsage,
      wireSizeMm: wireSizeMm !== undefined && wireSizeMm !== null && `${wireSizeMm}` !== '' ? Number(wireSizeMm) : undefined,
      thicknessMm: thicknessMm !== undefined && thicknessMm !== null && `${thicknessMm}` !== '' ? Number(thicknessMm) : undefined,
      widthMm: widthMm !== undefined && widthMm !== null && `${widthMm}` !== '' ? Number(widthMm) : undefined,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      isPurchasable, isSellable, isManufacturable, isStockItem, trackInventory,
      sortField, sortOrder,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, ...result };
  }

  @Get('lookup')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Fast item lookup for dropdowns and caches' })
  @ApiQuery({ name: 'departmentId', required: false })
  async getLookup(@Req() req: any, @Query('departmentId') departmentId?: string) {
    try {
      const items = await this.itemService.getLookupItems(departmentId, this.divisions(req));
      return { success: true, data: items, total: items.length };
    } catch (err: any) {
      return { success: false, error: err.message, stack: err.stack };
    }
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

  @Get('distinct-types')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Get distinct item types filtered by organization scope' })
  async getDistinctTypes(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const types = await this.itemService.getDistinctItemTypes({ divisionId, sectionId, departmentId, allowedDivisionIds: this.divisions(req) });
    return { success: true, data: types };
  }

  @Get('pipeline-stats')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Get item pipeline statistics scoped by division/section/department' })
  async getPipelineStats(
    @Req() req: any,
    @Query('companyId') companyId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const stats = await this.itemService.getPipelineStats({ companyId, divisionId, sectionId, departmentId, allowedDivisionIds: this.divisions(req) });
    return { success: true, data: stats };
  }


  @Post('backfill-identity')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Backfill SKU and Barcode for existing items' })
  async backfillIdentity() {
    const result = await this.itemService.backfillSkuAndBarcode();
    return { success: true, data: result, message: 'Backfill completed' };
  }

  @Get(':id/stock-ledger')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Get stock ledger entries for an item' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async getStockLedger(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const result = await this.itemService.getItemStockLedger(id, Number(limit) || 50, Number(offset) || 0);
    return { success: true, ...result };
  }

  @Get(':id/inventory')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Get inventory balances by warehouse for an item' })
  @ApiParam({ name: 'id' })
  async getInventory(@Param('id') id: string) {
    const data = await this.itemService.getItemInventory(id);
    return { success: true, data };
  }

  @Get(':id/production-history')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Get production history for an item' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async getProductionHistory(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const result = await this.itemService.getItemProductionHistory(id, Number(limit) || 50, Number(offset) || 0);
    return { success: true, ...result };
  }

  @Get(':id/production-flow')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Get production flow (Previous → Current → Next) for an item' })
  @ApiParam({ name: 'id' })
  async getProductionFlow(@Param('id') id: string) {
    const result = await this.itemService.getProductionFlow(id);
    return { success: true, data: result };
  }

  @Get(':id/qr')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Generate QR code for an item' })
  @ApiParam({ name: 'id' })
  async getQrCode(@Param('id') id: string) {
    const result = await this.itemService.getQrCode(id);
    return { success: true, data: result };
  }

  @Get(':id/conversions')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: "Get the item's UOM conversion information (KG/PCS/METER capabilities)" })
  @ApiParam({ name: 'id' })
  async getConversionInfo(@Param('id') id: string) {
    const info = await this.conversionService.getConversionInfo(id);
    return { success: true, data: info };
  }

  @Post(':id/convert')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert a quantity between UOMs using item-specific conversion data' })
  @ApiParam({ name: 'id' })
  async convert(@Param('id') id: string, @Body() dto: ConvertUomDto) {
    const result = await this.conversionService.convert(id, dto);
    return { success: true, data: result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.view')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const item = await this.itemService.findOne(id, this.divisions(req));
    return { success: true, data: item };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.update')
  @ApiOperation({ summary: 'Update item' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateItemDto, @Req() req: any) {
    const item = await this.itemService.update(id, dto, req.user?.id);
    return { success: true, data: item, message: 'Item updated successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate item' })
  @ApiParam({ name: 'id' })
  async activate(@Param('id') id: string, @Req() req: any) {
    const item = await this.itemService.activate(id, req.user?.id);
    return { success: true, data: item, message: 'Item activated' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate item' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string, @Req() req: any) {
    const item = await this.itemService.deactivate(id, req.user?.id);
    return { success: true, data: item, message: 'Item deactivated' };
  }

  @Patch(':id/discontinue')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.discontinue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discontinue item' })
  @ApiParam({ name: 'id' })
  async discontinue(@Param('id') id: string, @Req() req: any) {
    const item = await this.itemService.discontinue(id, req.user?.id);
    return { success: true, data: item, message: 'Item discontinued' };
  }

  @Get('cleanup/dummy-candidates')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.delete')
  @ApiOperation({ summary: 'List dummy/test/demo delete candidates for admin review (flagged + name-pattern matches with dependency counts)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async dummyCandidates(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
  ) {
    const companyId = await this.getCompanyId(req);
    const data = await this.itemService.findDummyCandidates(companyId, search, limit ? Number(limit) : undefined);
    return { success: true, data, total: data.length };
  }

  @Post('cleanup/purge-all-dummy')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.delete')
  @ApiOperation({ summary: 'Admin one-click purge of all dummy, test, and sample items across the system' })
  async purgeAllDummy(@Req() req: any) {
    let companyId: string | undefined;
    try {
      companyId = await this.getCompanyId(req);
    } catch {
      companyId = undefined;
    }
    const result = await this.itemService.purgeAllDummyItems(companyId, {
      authUserId: req.user?.id,
      email: req.user?.email,
    });
    return {
      success: true,
      message: `Successfully purged ${result.totalPurged} dummy/test item(s).`,
      data: result,
    };
  }

  @Get(':id/delete-eligibility')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.delete')
  @ApiOperation({ summary: 'Pre-delete eligibility report: dependency tree, protected history, and delete readiness' })
  @ApiParam({ name: 'id' })
  async deleteEligibility(@Param('id') id: string, @Req() req: any) {
    let companyId: string | undefined;
    try {
      companyId = await this.getCompanyId(req);
    } catch {
      companyId = undefined;
    }
    const data = await this.itemService.getDeleteEligibility(id, companyId);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item.delete')
  @ApiOperation({ summary: 'Delete item. ?force=true cascades and purges all dependencies (Admin power)' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Cascade all dependents (Admin power)' })
  async remove(@Param('id') id: string, @Req() req: any, @Query('force') force?: string) {
    const isForce = force === 'true' || force === '1';
    let companyId: string | undefined;
    try {
      companyId = await this.getCompanyId(req);
    } catch {
      companyId = undefined;
    }
    await this.itemService.remove(id, {
      companyId,
      force: isForce,
      actor: { authUserId: req.user?.id, email: req.user?.email },
    });
    return {
      success: true,
      message: isForce
        ? 'Item and all associated dependent records permanently deleted'
        : 'Item deleted successfully',
    };
  }
}
