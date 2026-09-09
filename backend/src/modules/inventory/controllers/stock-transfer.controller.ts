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
import { StockTransferService } from '../services/stock-transfer.service';
import {
  CreateStockTransferDto,
  CreateStockTransferLineDto,
  UpdateStockTransferDto,
  SubmitStockTransferDto,
  ApproveStockTransferDto,
  ReturnStockTransferDto,
  RejectStockTransferDto,
  PostStockTransferDto,
} from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';

@ApiTags('inventory/transfers')
@Controller('inventory/transfers')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class StockTransferController {
  constructor(private readonly stockTransferService: StockTransferService) {}

  private resolveCompanyId(req: any, queryCompanyId?: string): string {
    if (queryCompanyId) return queryCompanyId;
    const companyId = req?.erpUser?.defaultCompanyId || req?.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.transfer.create')
  @ApiOperation({ summary: 'Create a draft stock transfer' })
  async create(@Req() req: any, @Body() dto: CreateStockTransferDto) {
    const companyId = this.resolveCompanyId(req, dto.companyId);
    dto.companyId = companyId;
    const userId = req?.erpUser?.id;
    const transfer = await this.stockTransferService.create(dto, userId, companyId);
    return { success: true, data: transfer, message: 'Stock transfer created successfully as draft' };
  }

  @Get('counts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get summary counts of stock transfers by status' })
  @ApiQuery({ name: 'companyId', required: false })
  async getCounts(@Req() req: any, @Query('companyId') companyId?: string) {
    const resolvedCompanyId = this.resolveCompanyId(req, companyId);
    const counts = await this.stockTransferService.getCounts(resolvedCompanyId);
    return { success: true, data: counts };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'List stock transfers' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'fromWarehouseId', required: false })
  @ApiQuery({ name: 'toWarehouseId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sortField', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('fromWarehouseId') fromWarehouseId?: string,
    @Query('toWarehouseId') toWarehouseId?: string,
    @Query('status') status?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(req, companyId);
    const result = await this.stockTransferService.findAll({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
      companyId: resolvedCompanyId,
      fromWarehouseId,
      toWarehouseId,
      status,
      sortField,
      sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id/impact')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get live inventory impact for source and destination warehouses' })
  @ApiParam({ name: 'id' })
  async getLiveStockImpact(@Param('id') id: string, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const impact = await this.stockTransferService.getLiveStockImpact(id, companyId);
    return { success: true, data: impact };
  }

  @Get(':id/history')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get workflow audit history for a stock transfer' })
  @ApiParam({ name: 'id' })
  async getHistory(@Param('id') id: string, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const history = await this.stockTransferService.getHistory(id, companyId);
    return { success: true, data: history };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get stock transfer by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    const companyId = this.resolveCompanyId(req);
    const transfer = await this.stockTransferService.findOne(id, companyId);
    return { success: true, data: transfer };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @ApiOperation({ summary: 'Update stock transfer' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateStockTransferDto, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const companyId = this.resolveCompanyId(req);
    const transfer = await this.stockTransferService.update(id, dto, userId, companyId);
    return { success: true, data: transfer, message: 'Stock transfer updated successfully' };
  }

  @Post(':id/lines')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @ApiOperation({ summary: 'Add line to stock transfer' })
  @ApiParam({ name: 'id' })
  async addLine(@Param('id') id: string, @Body() dto: CreateStockTransferLineDto) {
    const line = await this.stockTransferService.addLine(id, dto);
    return { success: true, data: line, message: 'Transfer line added successfully' };
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove line from stock transfer' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'lineId' })
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    await this.stockTransferService.removeLine(id, lineId);
    return { success: true, message: 'Transfer line removed successfully' };
  }

  @Patch(':id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit stock transfer for review and approval' })
  @ApiParam({ name: 'id' })
  async submit(@Param('id') id: string, @Body() dto: SubmitStockTransferDto, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const companyId = this.resolveCompanyId(req);
    const transfer = await this.stockTransferService.submit(id, dto, userId, companyId);
    return { success: true, data: transfer, message: 'Stock transfer submitted for approval' };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve stock transfer (Segregation of Duties enforced)' })
  @ApiParam({ name: 'id' })
  async approve(@Param('id') id: string, @Body() dto: ApproveStockTransferDto, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const companyId = this.resolveCompanyId(req);
    const transfer = await this.stockTransferService.approve(id, dto, userId, companyId);
    return { success: true, data: transfer, message: 'Stock transfer approved successfully' };
  }

  @Patch(':id/return')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Return stock transfer to requester with mandatory reason' })
  @ApiParam({ name: 'id' })
  async return(@Param('id') id: string, @Body() dto: ReturnStockTransferDto, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const companyId = this.resolveCompanyId(req);
    const transfer = await this.stockTransferService.return(id, dto, userId, companyId);
    return { success: true, data: transfer, message: 'Stock transfer returned to requester' };
  }

  @Patch(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject stock transfer permanently with mandatory reason' })
  @ApiParam({ name: 'id' })
  async reject(@Param('id') id: string, @Body() dto: RejectStockTransferDto, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const companyId = this.resolveCompanyId(req);
    const transfer = await this.stockTransferService.reject(id, dto, userId, companyId);
    return { success: true, data: transfer, message: 'Stock transfer rejected' };
  }

  @Patch(':id/post')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post approved stock transfer atomically to inventory ledger' })
  @ApiParam({ name: 'id' })
  async post(@Param('id') id: string, @Body() dto: PostStockTransferDto, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const companyId = this.resolveCompanyId(req);
    const transfer = await this.stockTransferService.post(id, dto, userId, companyId);
    return { success: true, data: transfer, message: 'Stock transfer posted to inventory ledger successfully' };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a draft or returned stock transfer' })
  @ApiParam({ name: 'id' })
  async delete(@Param('id') id: string, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const companyId = this.resolveCompanyId(req);
    return this.stockTransferService.delete(id, userId, companyId);
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventory.transfer.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel stock transfer' })
  @ApiParam({ name: 'id' })
  async cancel(@Param('id') id: string, @Req() req: any) {
    const userId = req?.erpUser?.id;
    const companyId = this.resolveCompanyId(req);
    const transfer = await this.stockTransferService.cancel(id, userId, companyId);
    return { success: true, data: transfer, message: 'Stock transfer cancelled' };
  }
}
