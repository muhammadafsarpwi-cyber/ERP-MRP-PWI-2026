import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SupplierService } from '../services/supplier.service';
import { CreateSupplierDto, CreateSupplierItemDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/suppliers')
@Controller('procurement/suppliers')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.supplier.create')
  @ApiOperation({ summary: 'Create a supplier' })
  async create(@Body() dto: CreateSupplierDto) {
    const supplier = await this.supplierService.create(dto);
    return { success: true, data: supplier, message: 'Supplier created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.supplier.view')
  @ApiOperation({ summary: 'List suppliers' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('status') status?: string,
    @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.supplierService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.supplier.view')
  @ApiOperation({ summary: 'Get supplier by ID' })
  async findOne(@Param('id') id: string) {
    const supplier = await this.supplierService.findOne(id);
    return { success: true, data: supplier };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.supplier.update')
  @ApiOperation({ summary: 'Update supplier' })
  async update(@Param('id') id: string, @Body() dto: Partial<CreateSupplierDto>) {
    const supplier = await this.supplierService.update(id, dto);
    return { success: true, data: supplier, message: 'Supplier updated successfully' };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.supplier.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete supplier' })
  async remove(@Param('id') id: string) {
    await this.supplierService.remove(id);
    return { success: true, message: 'Supplier deleted successfully' };
  }

  @Post(':id/items')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.supplier_item.create')
  @ApiOperation({ summary: 'Add item to supplier' })
  async addItem(@Param('id') id: string, @Body() dto: CreateSupplierItemDto) {
    const supplier = await this.supplierService.findOne(id);
    const item = await this.supplierService.addItem(id, dto, supplier.companyId);
    return { success: true, data: item, message: 'Supplier item added successfully' };
  }

  @Patch(':id/items/:itemId')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.supplier_item.update')
  @ApiOperation({ summary: 'Update supplier item' })
  async updateItem(@Param('itemId') itemId: string, @Body() dto: Partial<CreateSupplierItemDto>) {
    const item = await this.supplierService.updateItem(itemId, dto);
    return { success: true, data: item, message: 'Supplier item updated successfully' };
  }

  @Delete(':id/items/:itemId')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.supplier_item.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove supplier item' })
  async removeItem(@Param('itemId') itemId: string) {
    await this.supplierService.removeItem(itemId);
    return { success: true, message: 'Supplier item removed successfully' };
  }
}
