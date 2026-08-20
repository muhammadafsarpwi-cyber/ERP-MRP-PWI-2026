import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseOrderService } from '../services/purchase-order.service';
import { CreatePurchaseOrderDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/orders')
@Controller('procurement/orders')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class PurchaseOrderController {
  constructor(private readonly service: PurchaseOrderService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.create')
  @ApiOperation({ summary: 'Create purchase order' })
  async create(@Body() dto: CreatePurchaseOrderDto) {
    const po = await this.service.create(dto);
    return { success: true, data: po, message: 'Purchase order created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.view')
  @ApiOperation({ summary: 'List purchase orders' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('supplierId') supplierId?: string,
    @Query('status') status?: string, @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, supplierId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.view')
  @ApiOperation({ summary: 'Get purchase order by ID' })
  async findOne(@Param('id') id: string) {
    const po = await this.service.findOne(id);
    return { success: true, data: po };
  }

  @Patch(':id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit purchase order' })
  async submit(@Param('id') id: string) {
    const po = await this.service.submit(id);
    return { success: true, data: po, message: 'Purchase order submitted' };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve purchase order' })
  async approve(@Param('id') id: string) {
    const po = await this.service.approve(id);
    return { success: true, data: po, message: 'Purchase order approved' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel purchase order' })
  async cancel(@Param('id') id: string, @Body('reason') reason: string) {
    const po = await this.service.cancel(id, reason);
    return { success: true, data: po, message: 'Purchase order cancelled' };
  }

  @Patch(':id/close')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close purchase order' })
  async close(@Param('id') id: string) {
    const po = await this.service.close(id);
    return { success: true, data: po, message: 'Purchase order closed' };
  }

  @Post(':id/lines')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.create')
  @ApiOperation({ summary: 'Add line to purchase order' })
  async addLine(@Param('id') id: string, @Body() dto: any) {
    const line = await this.service.addLine(id, dto);
    return { success: true, data: line, message: 'PO line added' };
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.order.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove line from purchase order' })
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    await this.service.removeLine(id, lineId);
    return { success: true, message: 'PO line removed' };
  }
}
