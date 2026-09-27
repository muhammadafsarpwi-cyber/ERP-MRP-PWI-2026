import { Controller, Get, Post, Patch, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesReturnService } from '../services/sales-return.service';
import { CreateSalesReturnDto, ReceiveSalesReturnDto, RejectSalesReturnDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('sales/returns')
@Controller('sales/returns')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class SalesReturnController {
  constructor(private readonly service: SalesReturnService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.view')
  @ApiOperation({ summary: 'List sales returns' })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const companyId = req.erpUser?.defaultCompanyId;
    const result = await this.service.findAll({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
      companyId,
      customerId,
      status,
      sortField,
      sortOrder,
    });
    return { success: true, ...result };
  }

  @Get('invoice/:invoiceId/returnable-items')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.view')
  @ApiOperation({ summary: 'Get returnable items with delivered and returned quantities for an invoice' })
  async getReturnableItems(@Req() req: any, @Param('invoiceId') invoiceId: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const data = await this.service.getReturnableItems(invoiceId, companyId);
    return { success: true, data };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.view')
  @ApiOperation({ summary: 'Get sales return by ID with full traceability chain' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.findOne(id, companyId);
    return { success: true, data: salesReturn };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.create')
  @ApiOperation({ summary: 'Create sales return' })
  async create(@Req() req: any, @Body() dto: CreateSalesReturnDto) {
    const userId = req.user?.id;
    dto.companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.create(dto, userId);
    return { success: true, data: salesReturn, message: 'Sales return created successfully' };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.update')
  @ApiOperation({ summary: 'Update sales return (DRAFT only)' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.update(id, dto, userId, companyId);
    return { success: true, data: salesReturn, message: 'Sales return updated successfully' };
  }

  @Patch(':id/submit')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit sales return for approval' })
  async submit(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.submit(id, userId, companyId);
    return { success: true, data: salesReturn, message: 'Sales return submitted successfully' };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve sales return' })
  async approve(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.approve(id, userId, companyId);
    return { success: true, data: salesReturn, message: 'Sales return approved' };
  }

  @Patch(':id/receive')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive returned finished goods into inventory' })
  async receive(@Req() req: any, @Param('id') id: string, @Body() body?: ReceiveSalesReturnDto) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.receiveStock(id, body?.warehouseId, userId, companyId);
    return { success: true, data: salesReturn, message: 'Finished goods stock received into inventory successfully' };
  }

  @Patch(':id/credit-note')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate Credit Note and post credit to Customer Ledger' })
  async generateCreditNote(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.generateCreditNote(id, userId, companyId);
    return { success: true, data: salesReturn, message: 'Credit Note generated and posted to Customer Ledger' };
  }

  @Patch(':id/reject')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject sales return' })
  async reject(@Req() req: any, @Param('id') id: string, @Body() body: RejectSalesReturnDto) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.reject(id, body?.reason, userId, companyId);
    return { success: true, data: salesReturn, message: 'Sales return rejected' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.returns.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel sales return' })
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.cancel(id, userId, companyId);
    return { success: true, data: salesReturn, message: 'Sales return cancelled' };
  }
}
