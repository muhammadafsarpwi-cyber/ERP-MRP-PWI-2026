import { Controller, Get, Post, Patch, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesInvoiceService } from '../services/sales-invoice.service';
import { CreateSalesInvoiceDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('sales/invoices')
@Controller('sales/invoices')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class SalesInvoiceController {
  constructor(private readonly service: SalesInvoiceService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.view')
  @ApiOperation({ summary: 'List sales invoices' })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string, @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const companyId = req.erpUser?.defaultCompanyId;
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, customerId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.view')
  @ApiOperation({ summary: 'Get sales invoice by ID' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const invoice = await this.service.findOne(id, companyId);
    return { success: true, data: invoice };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.create')
  @ApiOperation({ summary: 'Create sales invoice' })
  async create(@Req() req: any, @Body() dto: CreateSalesInvoiceDto) {
    const userId = req.user?.id;
    dto.companyId = req.erpUser?.defaultCompanyId;
    const invoice = await this.service.create(dto, userId);
    return { success: true, data: invoice, message: 'Sales invoice created successfully' };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.update')
  @ApiOperation({ summary: 'Update sales invoice' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateSalesInvoiceDto>) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const invoice = await this.service.update(id, dto, userId, companyId);
    return { success: true, data: invoice, message: 'Sales invoice updated successfully' };
  }

  @Patch(':id/post')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post sales invoice' })
  async post(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const invoice = await this.service.post(id, userId, companyId);
    return { success: true, data: invoice, message: 'Sales invoice posted' };
  }

  @Patch(':id/record-payment')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record payment for sales invoice' })
  async recordPayment(@Req() req: any, @Param('id') id: string, @Body('paidAmount') paidAmount: number) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const invoice = await this.service.recordPayment(id, paidAmount, userId, companyId);
    return { success: true, data: invoice, message: 'Payment recorded successfully' };
  }
}
