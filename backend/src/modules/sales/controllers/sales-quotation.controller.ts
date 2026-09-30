import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesQuotationService } from '../services/sales-quotation.service';
import { CreateSalesQuotationDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';

@ApiTags('sales/quotations')
@Controller('sales/quotations')
// PROMPT #27 — `erp_sales.quotations` has NO `division_id` column and no
// relation to a division-scoped entity (`SalesOrder.quotationId` points *at* a
// quotation, never back). A quotation therefore cannot be attributed to any
// division, so there is nothing for a per-division filter to narrow, and no
// division-scoped behaviour is implemented here on purpose.
//
// The guard is still registered so that an explicit `?divisionId=` naming a
// division the caller does not hold is refused with 403 rather than silently
// ignored. This keeps one uniform rule across the whole Sales module and stops
// a client from believing it filtered by division.
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class SalesQuotationController {
  constructor(private readonly service: SalesQuotationService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.view')
  @ApiOperation({ summary: 'List sales quotations' })
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

  @Get('customer/:customerId/summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.view')
  @ApiOperation({ summary: 'Get customer quotation statistics & summary' })
  async getCustomerSummary(@Req() req: any, @Param('customerId') customerId: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const summary = await this.service.getCustomerQuotationSummary(customerId, companyId);
    return { success: true, data: summary };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.view')
  @ApiOperation({ summary: 'Get sales quotation by ID' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const quotation = await this.service.findOne(id, companyId);
    return { success: true, data: quotation };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.create')
  @ApiOperation({ summary: 'Create sales quotation' })
  async create(@Req() req: any, @Body() dto: CreateSalesQuotationDto) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    dto.companyId = companyId;
    const quotation = await this.service.create(dto, userId);
    return { success: true, data: quotation, message: 'Sales quotation created successfully' };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.update')
  @ApiOperation({ summary: 'Update sales quotation' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateSalesQuotationDto>) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const quotation = await this.service.update(id, dto, userId, companyId);
    return { success: true, data: quotation, message: 'Sales quotation updated successfully' };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete sales quotation' })
  async remove(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    await this.service.remove(id, companyId);
    return { success: true, message: 'Sales quotation deleted successfully' };
  }

  @Patch(':id/submit')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit sales quotation' })
  async submit(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const quotation = await this.service.submit(id, userId, companyId);
    return { success: true, data: quotation, message: 'Sales quotation submitted' };
  }

  @Patch(':id/accept')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept sales quotation' })
  async accept(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const quotation = await this.service.accept(id, userId, companyId);
    return { success: true, data: quotation, message: 'Sales quotation accepted' };
  }

  @Patch(':id/reject')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject sales quotation' })
  async reject(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const quotation = await this.service.reject(id, userId, companyId);
    return { success: true, data: quotation, message: 'Sales quotation rejected' };
  }

  @Post(':id/convert-to-order')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert sales quotation to sales order' })
  async convertToOrder(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const result = await this.service.convertToSalesOrder(id, userId, companyId);
    return {
      success: true,
      data: result.salesOrder,
      isExisting: result.isExisting,
      message: result.message,
    };
  }

  @Post(':id/convert')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.quotations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alias: Convert sales quotation to sales order' })
  async convertAlias(@Req() req: any, @Param('id') id: string) {
    return this.convertToOrder(req, id);
  }
}
