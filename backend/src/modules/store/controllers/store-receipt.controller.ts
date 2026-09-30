import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GoodsReceiptService } from '../../procurement/services/goods-receipt.service';
import { CreateGoodsReceiptDto } from '../../procurement/dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';

/**
 * Store-facing goods-receipt surface.
 *
 * Reuses the existing procurement goods-receipt engine (deduplication rule:
 * never duplicate GRN logic) while exposing it through the Store module's own
 * store.receive.* permission gates. This lets store/inventory roles receive and
 * post goods into store stock without being granted the full procurement
 * permission set.
 *
 * PROMPT #27 — no division filter is applied here, deliberately. Proven
 * against the live schema, not assumed:
 *   - `goods_receipts` has NO `division_id` column (its full column list is
 *     id, created_*, is_active, company_id, receipt_code, po_id, supplier_id,
 *     warehouse_id, receipt_date, delivery_note_number, grn_number, status,
 *     inspected_by, inspected_at, posted_by, posted_at, notes).
 *   - Its only organisational FK is `warehouse_id`, and `warehouses` itself has
 *     NO `division_id` — so there is no transitive path from a GRN to a
 *     division, direct or indirect.
 *   - A GRN is company-scoped: goods land in company stock and are attributed
 *     to a division only later, by the issue / return / ledger documents, all
 *     of which ARE division-scoped and enforced in `StoreService` and
 *     `StockLedgerService`.
 * The same holds for every other procurement table (purchase orders,
 * requisitions, invoices, returns, RFQs, quotations, suppliers) — none has a
 * `division_id`, and their only organisational FK is `warehouse_id`.
 *
 * The guard is still registered so that an explicit `?divisionId=` naming a
 * division the caller does not hold is refused with 403 rather than silently
 * ignored, and so the rule is uniform across every Store surface.
 */
@ApiTags('store/receipts')
@Controller('store/receipts')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, PermissionGuard, DivisionScopeGuard)
@RequireOrgScope()
@ApiBearerAuth()
export class StoreReceiptController {
  constructor(private readonly service: GoodsReceiptService) {}

  private getCompanyId(req: any): string | undefined {
    return req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  @Post()
  @RequirePermission('store.receive.create')
  @ApiOperation({ summary: 'Create goods receipt (store)' })
  async create(@Body() dto: CreateGoodsReceiptDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const receipt = await this.service.create({ ...dto, companyId: companyId || dto.companyId });
    return { success: true, data: receipt, message: 'Goods receipt created successfully' };
  }

  @Get()
  @RequirePermission('store.receive.view')
  @ApiOperation({ summary: 'List goods receipts (store)' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('poId') poId?: string,
    @Query('status') status?: string, @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
    @Req() req?: any,
  ) {
    const defaultCompanyId = this.getCompanyId(req);
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search,
      companyId: companyId || defaultCompanyId, poId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @RequirePermission('store.receive.view')
  @ApiOperation({ summary: 'Get goods receipt by ID (store)' })
  async findOne(@Param('id') id: string, @Req() req?: any) {
    const receipt = await this.service.findOne(id, this.getCompanyId(req));
    return { success: true, data: receipt };
  }

  @Patch(':id/receive')
  @RequirePermission('store.receive.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark goods receipt as received (store)' })
  async receive(@Param('id') id: string, @Req() req: any) {
    const receipt = await this.service.receive(id, this.getUserId(req), this.getCompanyId(req));
    return { success: true, data: receipt, message: 'Goods receipt marked as received' };
  }

  @Patch(':id/inspect')
  @RequirePermission('store.receive.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inspect goods receipt (store)' })
  async inspect(@Param('id') id: string, @Req() req: any) {
    const receipt = await this.service.inspect(id, this.getUserId(req), this.getCompanyId(req));
    return { success: true, data: receipt, message: 'Goods receipt moved to inspection' };
  }

  @Patch(':id/accept')
  @RequirePermission('store.receive.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept goods receipt (store)' })
  async accept(@Param('id') id: string, @Req() req: any) {
    const receipt = await this.service.accept(id, this.getUserId(req), this.getCompanyId(req));
    return { success: true, data: receipt, message: 'Goods receipt accepted' };
  }

  @Patch(':id/reject')
  @RequirePermission('store.receive.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject goods receipt (store)' })
  async reject(@Param('id') id: string, @Req() req: any) {
    const receipt = await this.service.reject(id, this.getUserId(req), this.getCompanyId(req));
    return { success: true, data: receipt, message: 'Goods receipt rejected' };
  }

  @Patch(':id/post')
  @RequirePermission('store.receive.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post goods receipt to stock (store)' })
  async post(@Param('id') id: string, @Req() req: any) {
    const receipt = await this.service.post(id, this.getUserId(req), this.getCompanyId(req));
    return { success: true, data: receipt, message: 'Goods receipt posted' };
  }
}