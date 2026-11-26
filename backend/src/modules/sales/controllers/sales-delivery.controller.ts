import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesDeliveryService } from '../services/sales-delivery.service';
import { CreateSalesDeliveryDto } from '../dto';
import { CreditOverrideDto } from '../dto/customer-receipt.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { divisionScopeFromRequest } from '../../../common/division-scope.util';

@ApiTags('sales/deliveries')
@Controller('sales/deliveries')
// PROMPT #27 — deliveries inherit the source order's division; the guard
// refuses an explicit out-of-scope `divisionId` before the service runs.
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class SalesDeliveryController {
  constructor(private readonly service: SalesDeliveryService) {}

  /** Server-derived division scope for this request (see SalesOrderController). */
  private divisionScope(req: any): string[] | undefined {
    return divisionScopeFromRequest(req);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.view')
  @ApiOperation({ summary: 'List sales deliveries' })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('customerId') customerId?: string, @Query('divisionId') divisionId?: string,
    @Query('status') status?: string, @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const companyId = req.erpUser?.defaultCompanyId;
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, customerId, divisionId, status, sortField, sortOrder,
      allowedDivisionIds: this.divisionScope(req),
    });
    return { success: true, ...result };
  }

  @Get('next-gate-pass')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.view')
  @ApiOperation({ summary: 'Suggest the next sequential Gate Pass Book serial number' })
  async getNextGatePass(@Req() req: any) {
    const companyId = req.erpUser?.defaultCompanyId;
    const data = await this.service.getNextGatePassNumber(companyId);
    return { success: true, data };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.view')
  @ApiOperation({ summary: 'Get sales delivery by ID' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.findOne(id, companyId, this.divisionScope(req));
    return { success: true, data: delivery };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.create')
  @ApiOperation({ summary: 'Create sales delivery' })
  async create(@Req() req: any, @Body() dto: CreateSalesDeliveryDto) {
    const userId = req.user?.id;
    dto.companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.create(dto, userId);
    return { success: true, data: delivery, message: 'Sales delivery created successfully' };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.update')
  @ApiOperation({ summary: 'Update sales delivery' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateSalesDeliveryDto>) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.update(id, dto, userId, companyId, this.divisionScope(req));
    return { success: true, data: delivery, message: 'Sales delivery updated successfully' };
  }

  @Patch(':id/ship')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ship sales delivery' })
  async ship(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.ship(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: delivery, message: 'Sales delivery shipped' };
  }

  @Patch(':id/deliver')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark sales delivery as delivered' })
  async deliver(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.deliver(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: delivery, message: 'Sales delivery delivered' };
  }

  @Patch(':id/confirm')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm sales delivery' })
  async confirm(@Req() req: any, @Param('id') id: string, @Body() body?: CreditOverrideDto) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.confirm(id, userId, companyId, this.divisionScope(req), body);
    return { success: true, data: delivery, message: 'Sales delivery confirmed' };
  }

  @Patch(':id/apply-tax')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply uniform tax percentage across all lines of a delivery note' })
  async applyTax(
    @Req() req: any,
    @Param('id') id: string,
    @Body('taxPercent') taxPercent?: number,
  ) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const pct = taxPercent !== undefined && taxPercent !== null ? Number(taxPercent) : 18;
    const delivery = await this.service.applyTaxRate(id, pct, userId, companyId, this.divisionScope(req));
    return {
      success: true,
      data: delivery,
      message: `${pct}% tax applied to delivery note ${delivery.deliveryNumber}`,
    };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel sales delivery' })
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.cancel(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: delivery, message: 'Sales delivery cancelled' };
  }

  @Patch(':id/restore')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a cancelled sales delivery back to DRAFT status' })
  async restore(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.restoreToDraft(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: delivery, message: 'Sales delivery restored to DRAFT' };
  }

  @Post(':id/convert-to-invoice')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create sales invoice from delivery' })
  async convertToInvoice(@Req() req: any, @Param('id') id: string, @Body() body?: any) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const invoice = await this.service.convertToInvoice(id, userId, companyId, this.divisionScope(req), body);
    return { success: true, data: invoice, message: `Invoice ${invoice.invoiceNo} created successfully` };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.deliveries.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a Draft gate pass (delivery) to the Recycle Bin (reversible)' })
  async remove(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const delivery = await this.service.remove(id, userId, companyId, this.divisionScope(req));
    return { success: true, data: delivery, message: 'Gate pass moved to the Recycle Bin' };
  }
}
