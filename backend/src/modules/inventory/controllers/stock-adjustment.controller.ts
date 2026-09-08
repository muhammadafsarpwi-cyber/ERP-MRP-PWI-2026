import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { StockAdjustmentService } from '../services/stock-adjustment.service';
import {
  CreateStockAdjustmentDto,
  CreateStockAdjustmentLineDto,
  UpdateStockAdjustmentDto,
  SubmitStockAdjustmentDto,
  ApproveStockAdjustmentDto,
  ReturnStockAdjustmentDto,
  RejectStockAdjustmentDto,
  PostStockAdjustmentDto,
} from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('inventory/adjustments')
@Controller('inventory/adjustments')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class StockAdjustmentController {
  constructor(private readonly stockAdjustmentService: StockAdjustmentService) {}

  private resolveCompanyId(req: any, queryCompanyId?: string): string {
    const defaultCompanyId = req?.erpUser?.defaultCompanyId || req?.orgScopes?.[0]?.companyId;
    if (queryCompanyId) {
      if (req?.orgScopes && req.orgScopes.length > 0) {
        const hasScope = req.orgScopes.some((s: any) => s.companyId === queryCompanyId);
        if (!hasScope && queryCompanyId !== defaultCompanyId) {
          throw new BadRequestException('Unauthorized access to specified company scope.');
        }
      }
      return queryCompanyId;
    }
    if (!defaultCompanyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return defaultCompanyId;
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.adjustment.create')
  @ApiOperation({ summary: 'Create a stock adjustment' })
  async create(@Req() req: any, @Body() dto: CreateStockAdjustmentDto) {
    dto.companyId = this.resolveCompanyId(req, dto.companyId);
    const userId = req?.erpUser?.id;
    const adjustment = await this.stockAdjustmentService.create(dto, userId);
    return { success: true, data: adjustment, message: 'Stock adjustment created successfully' };
  }

  @Get('counts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get stock adjustment counts by status' })
  async getCounts(@Req() req: any, @Query('companyId') companyId?: string) {
    const resolvedCompanyId = this.resolveCompanyId(req, companyId);
    const counts = await this.stockAdjustmentService.getCounts(resolvedCompanyId);
    return { success: true, data: counts };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'List stock adjustments' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'adjustmentType', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('adjustmentType') adjustmentType?: string,
    @Query('status') status?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(req, companyId);
    const result = await this.stockAdjustmentService.findAll({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
      companyId: resolvedCompanyId,
      warehouseId,
      adjustmentType,
      status,
      sortField,
      sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get stock adjustment by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const adjustment = await this.stockAdjustmentService.findOne(id, companyId);
    return { success: true, data: adjustment };
  }

  @Get(':id/history')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get workflow history for stock adjustment' })
  @ApiParam({ name: 'id' })
  async getHistory(@Param('id') id: string, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const history = await this.stockAdjustmentService.getHistory(id, companyId);
    return { success: true, data: history };
  }

  @Get(':id/impact')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get live inventory impact for stock adjustment' })
  @ApiParam({ name: 'id' })
  async getLiveStockImpact(@Param('id') id: string, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const impact = await this.stockAdjustmentService.getLiveStockImpact(id, companyId);
    return { success: true, data: impact };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.adjustment.create')
  @ApiOperation({ summary: 'Update a draft stock adjustment' })
  @ApiParam({ name: 'id' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStockAdjustmentDto,
    @Req() req: any,
  ) {
    const companyId = this.resolveCompanyId(req);
    const userId = req?.erpUser?.id;
    const adjustment = await this.stockAdjustmentService.update(id, dto, userId, companyId);
    return { success: true, data: adjustment, message: 'Stock adjustment updated successfully' };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.adjustment.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a draft or returned stock adjustment' })
  @ApiParam({ name: 'id' })
  async delete(@Param('id') id: string, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const userId = req?.erpUser?.id;
    await this.stockAdjustmentService.delete(id, userId, companyId);
    return { success: true, message: 'Stock adjustment deleted successfully' };
  }

  @Post(':id/lines')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.create')
  @ApiOperation({ summary: 'Add line to stock adjustment' })
  @ApiParam({ name: 'id' })
  async addLine(@Param('id') id: string, @Body() dto: CreateStockAdjustmentLineDto) {
    const line = await this.stockAdjustmentService.addLine(id, dto);
    return { success: true, data: line, message: 'Adjustment line added successfully' };
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove line from stock adjustment' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'lineId' })
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    await this.stockAdjustmentService.removeLine(id, lineId);
    return { success: true, message: 'Adjustment line removed successfully' };
  }

  @Patch(':id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit stock adjustment for approval (PATCH)' })
  @ApiParam({ name: 'id' })
  async submit(@Param('id') id: string, @Body() dto: SubmitStockAdjustmentDto, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const userId = req?.erpUser?.id;
    const adjustment = await this.stockAdjustmentService.submit(id, dto, userId, companyId);
    return { success: true, data: adjustment, message: 'Stock adjustment submitted for approval' };
  }

  @Post(':id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit stock adjustment for approval (POST)' })
  @ApiParam({ name: 'id' })
  async submitPost(@Param('id') id: string, @Body() dto: SubmitStockAdjustmentDto, @Req() req: any) {
    return this.submit(id, dto, req);
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve stock adjustment (PATCH)' })
  @ApiParam({ name: 'id' })
  async approve(@Param('id') id: string, @Body() dto: ApproveStockAdjustmentDto, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const userId = req?.erpUser?.id;
    const adjustment = await this.stockAdjustmentService.approve(id, dto, userId, companyId);
    return { success: true, data: adjustment, message: 'Stock adjustment approved' };
  }

  @Post(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve stock adjustment (POST)' })
  @ApiParam({ name: 'id' })
  async approvePost(@Param('id') id: string, @Body() dto: ApproveStockAdjustmentDto, @Req() req: any) {
    return this.approve(id, dto, req);
  }

  @Patch(':id/return')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Return stock adjustment to creator for correction (PATCH)' })
  @ApiParam({ name: 'id' })
  async return(@Param('id') id: string, @Body() dto: ReturnStockAdjustmentDto, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const userId = req?.erpUser?.id;
    const adjustment = await this.stockAdjustmentService.return(id, dto, userId, companyId);
    return { success: true, data: adjustment, message: 'Stock adjustment returned to creator' };
  }

  @Post(':id/return')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Return stock adjustment to creator for correction (POST)' })
  @ApiParam({ name: 'id' })
  async returnPost(@Param('id') id: string, @Body() dto: ReturnStockAdjustmentDto, @Req() req: any) {
    return this.return(id, dto, req);
  }

  @Patch(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject stock adjustment permanently (PATCH)' })
  @ApiParam({ name: 'id' })
  async reject(@Param('id') id: string, @Body() dto: RejectStockAdjustmentDto, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const userId = req?.erpUser?.id;
    const adjustment = await this.stockAdjustmentService.reject(id, dto, userId, companyId);
    return { success: true, data: adjustment, message: 'Stock adjustment rejected' };
  }

  @Post(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject stock adjustment permanently (POST)' })
  @ApiParam({ name: 'id' })
  async rejectPost(@Param('id') id: string, @Body() dto: RejectStockAdjustmentDto, @Req() req: any) {
    return this.reject(id, dto, req);
  }

  @Patch(':id/post')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post approved stock adjustment to inventory (PATCH)' })
  @ApiParam({ name: 'id' })
  async post(@Param('id') id: string, @Body() dto: PostStockAdjustmentDto, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const userId = req?.erpUser?.id;
    const adjustment = await this.stockAdjustmentService.post(id, dto, userId, companyId);
    return { success: true, data: adjustment, message: 'Stock adjustment posted to inventory successfully' };
  }

  @Post(':id/post')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post approved stock adjustment to inventory (POST)' })
  @ApiParam({ name: 'id' })
  async postPost(@Param('id') id: string, @Body() dto: PostStockAdjustmentDto, @Req() req: any) {
    return this.post(id, dto, req);
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.adjustment.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel stock adjustment' })
  @ApiParam({ name: 'id' })
  async cancel(@Param('id') id: string, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const adjustment = await this.stockAdjustmentService.cancel(id, userId);
    return { success: true, data: adjustment, message: 'Stock adjustment cancelled' };
  }
}
