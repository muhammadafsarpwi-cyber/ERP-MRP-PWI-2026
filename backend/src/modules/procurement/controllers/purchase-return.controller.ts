import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseReturnService } from '../services/purchase-return.service';
import { CreatePurchaseReturnDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/returns')
@Controller('procurement/returns')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class PurchaseReturnController {
  constructor(private readonly service: PurchaseReturnService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.return.create')
  @ApiOperation({ summary: 'Create purchase return' })
  async create(@Body() dto: CreatePurchaseReturnDto) {
    const purchaseReturn = await this.service.create(dto);
    return { success: true, data: purchaseReturn, message: 'Purchase return created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.return.view')
  @ApiOperation({ summary: 'List purchase returns' })
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
  @RequirePermission('procurement.return.view')
  @ApiOperation({ summary: 'Get purchase return by ID' })
  async findOne(@Param('id') id: string) {
    const purchaseReturn = await this.service.findOne(id);
    return { success: true, data: purchaseReturn };
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.return.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve purchase return' })
  async approve(@Param('id') id: string) {
    const purchaseReturn = await this.service.approve(id);
    return { success: true, data: purchaseReturn, message: 'Purchase return approved' };
  }

  @Patch(':id/ship')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.return.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ship purchase return' })
  async ship(@Param('id') id: string) {
    const purchaseReturn = await this.service.ship(id);
    return { success: true, data: purchaseReturn, message: 'Purchase return shipped' };
  }

  @Patch(':id/complete')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.return.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete purchase return' })
  async complete(@Param('id') id: string) {
    const purchaseReturn = await this.service.complete(id);
    return { success: true, data: purchaseReturn, message: 'Purchase return completed' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.return.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel purchase return' })
  async cancel(@Param('id') id: string) {
    const purchaseReturn = await this.service.cancel(id);
    return { success: true, data: purchaseReturn, message: 'Purchase return cancelled' };
  }
}
