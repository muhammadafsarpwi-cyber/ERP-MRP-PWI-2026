import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard, divisionFilterFromRequest } from '../../auth/guards/division-scope.guard';
import { ProductionOpenStockService } from '../services/production-open-stock.service';
import {
  PostProductionOpenStockDto,
  PostProductionStockAdjustmentDto,
} from '../dto/production-open-stock.dto';

@ApiTags('production/open-stock')
@Controller('production/open-stock')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class ProductionOpenStockController {
  constructor(private readonly openStockService: ProductionOpenStockService) {}

  private getCompanyId(req: any): string {
    const companyId =
      req.headers?.['x-company-id'] ||
      req.query?.companyId ||
      req.erpUser?.defaultCompanyId ||
      req.orgScopes?.[0]?.companyId ||
      req.user?.defaultCompanyId;

    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  private divisions(req: any): string[] | undefined {
    return divisionFilterFromRequest(req.allowedDivisionIds);
  }

  @Get('items')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Get production items for open stock with real-time balance annotations' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  async getItems(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('itemType') itemType?: string,
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.openStockService.getProductionItems(companyId, {
      divisionId,
      departmentId,
      itemType,
      search,
      warehouseId,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, data, total: data.length };
  }

  @Get('warehouses')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Get production-relevant warehouses (shop floor & raw material/WIP)' })
  @ApiQuery({ name: 'divisionId', required: false })
  async getWarehouses(@Req() req: any, @Query('divisionId') divisionId?: string) {
    const companyId = this.getCompanyId(req);
    const data = await this.openStockService.getProductionWarehouses(companyId, {
      divisionId,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, data };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post Production Item Open Stock lines and update inventory balances' })
  async postOpeningStock(@Req() req: any, @Body() dto: PostProductionOpenStockDto) {
    try {
      const companyId = this.getCompanyId(req);
      const userId = req.erpUser?.id || req.user?.id;
      const result = await this.openStockService.postOpeningStock(companyId, dto, userId);
      return {
        success: true,
        data: result,
        message: `Production Item Open Stock posted successfully (${result.posted} items)`,
      };
    } catch (err: any) {
      console.error('[ProductionOpenStockController] postOpeningStock ERROR:', err);
      throw err;
    }
  }

  @Post('adjust')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post Production Stock Adjustment (کمی بیشی / surplus & shortage)' })
  async postAdjustment(@Req() req: any, @Body() dto: PostProductionStockAdjustmentDto) {
    try {
      const companyId = this.getCompanyId(req);
      const userId = req.erpUser?.id || req.user?.id;
      const result = await this.openStockService.postStockAdjustment(companyId, dto, userId);
      return {
        success: true,
        data: result,
        message: `Production Stock Adjustment posted successfully (${result.adjusted} items)`,
      };
    } catch (err: any) {
      console.error('[ProductionOpenStockController] postAdjustment ERROR:', err);
      throw err;
    }
  }

  @Get('stats')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Analytics for Production Open Stock and Stock Adjustments (for charts)' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  async getStats(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.openStockService.getStats(companyId, {
      divisionId,
      warehouseId,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, data };
  }

  @Get('matrix')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Department Stock Breakdown & Hierarchy Matrix (Tab 5)' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'search', required: false })
  async getDepartmentStockMatrix(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('search') search?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.openStockService.getDepartmentStockMatrix(companyId, {
      divisionId,
      search,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, data };
  }

  @Get('history')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'History of Production Open Stock and Stock Adjustment transactions' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'transactionType', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getHistory(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('transactionType') transactionType?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const companyId = this.getCompanyId(req);
    const data = await this.openStockService.getHistory(companyId, {
      divisionId,
      departmentId,
      warehouseId,
      transactionType,
      search,
      page,
      limit,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, ...data };
  }

  @Post('history/:id/reverse')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse/cancel a posted production opening stock or adjustment' })
  async reverseTransaction(@Req() req: any, @Param('id') id: string) {
    const companyId = this.getCompanyId(req);
    const userId = req.erpUser?.id || req.user?.id;
    return await this.openStockService.reverseTransaction(companyId, id, userId);
  }
}

