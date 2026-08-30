import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseInvoiceService } from '../services/purchase-invoice.service';
import { CreatePurchaseInvoiceDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/invoices')
@Controller('procurement/invoices')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class PurchaseInvoiceController {
  constructor(private readonly service: PurchaseInvoiceService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.invoice.create')
  @ApiOperation({ summary: 'Create purchase invoice' })
  async create(@Body() dto: CreatePurchaseInvoiceDto) {
    const invoice = await this.service.create(dto);
    return { success: true, data: invoice, message: 'Purchase invoice created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.invoice.view')
  @ApiOperation({ summary: 'List purchase invoices' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('poId') poId?: string,
    @Query('supplierId') supplierId?: string, @Query('status') status?: string,
    @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, poId, supplierId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.invoice.view')
  @ApiOperation({ summary: 'Get purchase invoice by ID' })
  async findOne(@Param('id') id: string) {
    const invoice = await this.service.findOne(id);
    return { success: true, data: invoice };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.invoice.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve purchase invoice' })
  async approve(@Param('id') id: string) {
    const invoice = await this.service.approve(id);
    return { success: true, data: invoice, message: 'Purchase invoice approved' };
  }

  @Patch(':id/post')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.invoice.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post purchase invoice' })
  async post(@Param('id') id: string) {
    const invoice = await this.service.post(id);
    return { success: true, data: invoice, message: 'Purchase invoice posted' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.invoice.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel purchase invoice' })
  async cancel(@Param('id') id: string) {
    const invoice = await this.service.cancel(id);
    return { success: true, data: invoice, message: 'Purchase invoice cancelled' };
  }

  @Patch(':id/record-payment')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.invoice.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record supplier payment against purchase invoice (auto-posts AP/cash journal)' })
  async recordPayment(@Param('id') id: string, @Body('paidAmount') paidAmount: number) {
    const invoice = await this.service.recordPayment(id, Number(paidAmount));
    return { success: true, data: invoice, message: 'Payment recorded successfully' };
  }
}
