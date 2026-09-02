import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Request, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseInvoiceService } from '../services/purchase-invoice.service';
import { CreatePurchaseInvoiceDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/invoices')
@Controller('procurement/invoices')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class PurchaseInvoiceController {
  constructor(private readonly service: PurchaseInvoiceService) {}

  /**
   * Resolve the authoritative company from the authenticated org scopes and
   * NEVER trust the client blindly: a client-supplied companyId is accepted
   * only when it is within the caller's scope.
   */
  private resolveCompany(req: any, requestedCompanyId?: string): string {
    const scopes = req.orgScopes || [];
    if (!scopes.length) throw new ForbiddenException('No organizational access scope assigned');
    if (requestedCompanyId) {
      if (!scopes.some((s: any) => s.companyId === requestedCompanyId)) {
        throw new ForbiddenException('Company ID is outside your organization scope');
      }
      return requestedCompanyId;
    }
    const defaultCompanyId = req.erpUser?.defaultCompanyId;
    if (defaultCompanyId && scopes.some((s: any) => s.companyId === defaultCompanyId)) {
      return defaultCompanyId;
    }
    return scopes[0].companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.user?.id;
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('procurement.invoice.create')
  @ApiOperation({ summary: 'Create purchase invoice' })
  async create(@Body() dto: CreatePurchaseInvoiceDto, @Request() req: any) {
    const companyId = this.resolveCompany(req, dto.companyId);
    const invoice = await this.service.create(dto, companyId, this.getUserId(req));
    return { success: true, data: invoice, message: 'Purchase invoice created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('procurement.invoice.view')
  @ApiOperation({ summary: 'List purchase invoices' })
  async findAll(
    @Request() req: any,
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('poId') poId?: string,
    @Query('supplierId') supplierId?: string, @Query('status') status?: string,
    @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const scopedCompanyId = this.resolveCompany(req, companyId);
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search,
      companyId: scopedCompanyId, poId, supplierId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('procurement.invoice.view')
  @ApiOperation({ summary: 'Get purchase invoice by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    const companyId = this.resolveCompany(req, req.query?.companyId);
    const invoice = await this.service.findOne(id, companyId);
    return { success: true, data: invoice };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('procurement.invoice.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve purchase invoice' })
  async approve(@Param('id') id: string, @Request() req: any) {
    const companyId = this.resolveCompany(req, req.query?.companyId);
    const invoice = await this.service.approve(id, companyId, this.getUserId(req));
    return { success: true, data: invoice, message: 'Purchase invoice approved' };
  }

  @Patch(':id/post')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('procurement.invoice.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post purchase invoice (atomic: PO invoiced value + AP journal)' })
  async post(@Param('id') id: string, @Request() req: any) {
    const companyId = this.resolveCompany(req, req.query?.companyId);
    const invoice = await this.service.post(id, companyId, this.getUserId(req));
    return { success: true, data: invoice, message: 'Purchase invoice posted' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('procurement.invoice.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel purchase invoice' })
  async cancel(@Param('id') id: string, @Request() req: any) {
    const companyId = this.resolveCompany(req, req.query?.companyId);
    const invoice = await this.service.cancel(id, companyId, this.getUserId(req));
    return { success: true, data: invoice, message: 'Purchase invoice cancelled' };
  }

  @Patch(':id/record-payment')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('procurement.invoice.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record supplier payment against purchase invoice (atomic AP/cash journal)' })
  async recordPayment(@Param('id') id: string, @Body('paidAmount') paidAmount: number, @Request() req: any) {
    const companyId = this.resolveCompany(req, req.query?.companyId);
    if (paidAmount == null || Number.isNaN(Number(paidAmount))) {
      throw new BadRequestException('paidAmount is required');
    }
    const invoice = await this.service.recordPayment(id, Number(paidAmount), companyId, this.getUserId(req));
    return { success: true, data: invoice, message: 'Payment recorded successfully' };
  }
}
