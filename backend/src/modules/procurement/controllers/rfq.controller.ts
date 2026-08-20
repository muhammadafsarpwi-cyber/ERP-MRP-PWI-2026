import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RfqService } from '../services/rfq.service';
import { CreateRfqDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/rfqs')
@Controller('procurement/rfqs')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class RfqController {
  constructor(private readonly service: RfqService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.rfq.create')
  @ApiOperation({ summary: 'Create RFQ' })
  async create(@Body() dto: CreateRfqDto) {
    const rfq = await this.service.create(dto);
    return { success: true, data: rfq, message: 'RFQ created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.rfq.view')
  @ApiOperation({ summary: 'List RFQs' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('supplierId') supplierId?: string,
    @Query('status') status?: string, @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, supplierId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.rfq.view')
  @ApiOperation({ summary: 'Get RFQ by ID' })
  async findOne(@Param('id') id: string) {
    const rfq = await this.service.findOne(id);
    return { success: true, data: rfq };
  }

  @Patch(':id/send')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.rfq.send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send RFQ' })
  async send(@Param('id') id: string) {
    const rfq = await this.service.send(id);
    return { success: true, data: rfq, message: 'RFQ sent' };
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.rfq.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel RFQ' })
  async cancel(@Param('id') id: string) {
    const rfq = await this.service.cancel(id);
    return { success: true, data: rfq, message: 'RFQ cancelled' };
  }

  @Post(':id/lines')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.rfq.create')
  @ApiOperation({ summary: 'Add line to RFQ' })
  async addLine(@Param('id') id: string, @Body() dto: any) {
    const line = await this.service.addLine(id, dto);
    return { success: true, data: line, message: 'RFQ line added' };
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.rfq.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove line from RFQ' })
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    await this.service.removeLine(id, lineId);
    return { success: true, message: 'RFQ line removed' };
  }
}
