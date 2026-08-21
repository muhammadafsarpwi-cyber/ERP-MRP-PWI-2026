import { Controller, Get, Post, Patch, Body, Param, Query, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesReturnService } from '../services/sales-return.service';
import { CreateSalesReturnDto } from '../dto';
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
  @RequirePermission('sales.returns.view')
  @ApiOperation({ summary: 'Get sales return by ID' })
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
  @ApiOperation({ summary: 'Receive sales return' })
  async receive(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    const companyId = req.erpUser?.defaultCompanyId;
    const salesReturn = await this.service.receive(id, userId, companyId);
    return { success: true, data: salesReturn, message: 'Sales return received' };
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
