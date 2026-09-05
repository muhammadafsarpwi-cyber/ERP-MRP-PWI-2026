import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { CreateGoodsReceiptDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/receipts')
@Controller('procurement/receipts')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class GoodsReceiptController {
  constructor(private readonly service: GoodsReceiptService) {}

  private getCompanyId(req: any): string | undefined {
    return req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.receipt.create')
  @ApiOperation({ summary: 'Create goods receipt' })
  async create(@Body() dto: CreateGoodsReceiptDto) {
    const receipt = await this.service.create(dto);
    return { success: true, data: receipt, message: 'Goods receipt created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.receipt.view')
  @ApiOperation({ summary: 'List goods receipts' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('poId') poId?: string,
    @Query('status') status?: string, @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, poId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.receipt.view')
  @ApiOperation({ summary: 'Get goods receipt by ID' })
  async findOne(@Param('id') id: string) {
    const receipt = await this.service.findOne(id);
    return { success: true, data: receipt };
  }

  @Patch(':id/receive')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.receipt.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark goods receipt as received' })
  async receive(@Param('id') id: string) {
    const receipt = await this.service.receive(id);
    return { success: true, data: receipt, message: 'Goods receipt marked as received' };
  }

  @Patch(':id/inspect')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.receipt.inspect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inspect goods receipt' })
  async inspect(@Param('id') id: string) {
    const receipt = await this.service.inspect(id);
    return { success: true, data: receipt, message: 'Goods receipt moved to inspection' };
  }

  @Patch(':id/accept')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.receipt.inspect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept goods receipt' })
  async accept(@Param('id') id: string) {
    const receipt = await this.service.accept(id);
    return { success: true, data: receipt, message: 'Goods receipt accepted' };
  }

  @Patch(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.receipt.inspect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject goods receipt' })
  async reject(@Param('id') id: string) {
    const receipt = await this.service.reject(id);
    return { success: true, data: receipt, message: 'Goods receipt rejected' };
  }

  @Patch(':id/post')
  @RequireOrgScope()
  @UseGuards(OrgScopeGuard)
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.receipt.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post goods receipt' })
  async post(@Param('id') id: string, @Req() req: any) {
    const receipt = await this.service.post(id, this.getUserId(req), this.getCompanyId(req));
    return { success: true, data: receipt, message: 'Goods receipt posted' };
  }
}
