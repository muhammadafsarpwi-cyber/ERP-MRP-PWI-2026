import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseRequisitionService } from '../services/purchase-requisition.service';
import { CreatePurchaseRequisitionDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/requisitions')
@Controller('procurement/requisitions')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class PurchaseRequisitionController {
  constructor(private readonly service: PurchaseRequisitionService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.create')
  @ApiOperation({ summary: 'Create a purchase requisition' })
  async create(@Body() dto: CreatePurchaseRequisitionDto) {
    const requisition = await this.service.create(dto);
    return { success: true, data: requisition, message: 'Purchase requisition created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.view')
  @ApiOperation({ summary: 'List purchase requisitions' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('status') status?: string,
    @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.view')
  @ApiOperation({ summary: 'Get purchase requisition by ID' })
  async findOne(@Param('id') id: string) {
    const requisition = await this.service.findOne(id);
    return { success: true, data: requisition };
  }

  @Patch(':id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit purchase requisition' })
  async submit(@Param('id') id: string) {
    const requisition = await this.service.submit(id);
    return { success: true, data: requisition, message: 'Purchase requisition submitted' };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve purchase requisition' })
  async approve(@Param('id') id: string) {
    const requisition = await this.service.approve(id);
    return { success: true, data: requisition, message: 'Purchase requisition approved' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel purchase requisition' })
  async cancel(@Param('id') id: string) {
    const requisition = await this.service.cancel(id);
    return { success: true, data: requisition, message: 'Purchase requisition cancelled' };
  }

  @Post(':id/lines')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.create')
  @ApiOperation({ summary: 'Add line to purchase requisition' })
  async addLine(@Param('id') id: string, @Body() dto: any) {
    const line = await this.service.addLine(id, dto);
    return { success: true, data: line, message: 'Requisition line added successfully' };
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.requisition.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove line from purchase requisition' })
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    await this.service.removeLine(id, lineId);
    return { success: true, message: 'Requisition line removed successfully' };
  }
}
