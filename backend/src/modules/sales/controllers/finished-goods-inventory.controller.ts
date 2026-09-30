import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinishedGoodsInventoryService } from '../services/finished-goods-inventory.service';
import { FinishedGoodsFilterDto, ItemAvailabilityQueryDto } from '../dto/finished-goods-inventory.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { divisionScopeFromRequest } from '../../../common/division-scope.util';

@ApiTags('sales/finished-goods')
@Controller('sales/finished-goods')
// PROMPT #27 — `FinishedGoodsFilterDto.divisionId` is client-supplied. Before
// this guard it was honoured verbatim, so a restricted caller could request
// another division's stock figures. Now an out-of-scope value is refused and
// the effective scope is intersected in the service.
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class FinishedGoodsInventoryController {
  constructor(private readonly service: FinishedGoodsInventoryService) {}

  /** Server-derived division scope for this request (see SalesOrderController). */
  private divisionScope(req: any): string[] | undefined {
    return divisionScopeFromRequest(req);
  }

  @Get('inventory')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Get finished goods inventory intelligence with division & UOM metrics' })
  async getInventory(
    @Req() req: any,
    @Query() dto: FinishedGoodsFilterDto,
  ) {
    const companyId = req.erpUser?.defaultCompanyId;
    const result = await this.service.getFinishedGoodsInventory(dto, companyId, this.divisionScope(req));
    return { success: true, ...result };
  }

  @Get('item-availability/:itemId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Real-time live finished goods availability check for Sales Order line' })
  async getItemAvailability(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Query() query: ItemAvailabilityQueryDto,
  ) {
    const companyId = req.erpUser?.defaultCompanyId;
    const data = await this.service.getItemAvailability(
      itemId,
      Number(query.orderQuantity || 0),
      companyId,
      this.divisionScope(req),
    );
    return { success: true, data };
  }
}
