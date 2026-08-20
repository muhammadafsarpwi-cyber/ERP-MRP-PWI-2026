import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QuotationService } from '../services/quotation.service';
import { CreateQuotationDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('procurement/quotations')
@Controller('procurement/quotations')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class QuotationController {
  constructor(private readonly service: QuotationService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.quotation.create')
  @ApiOperation({ summary: 'Create quotation' })
  async create(@Body() dto: CreateQuotationDto) {
    const quotation = await this.service.create(dto);
    return { success: true, data: quotation, message: 'Quotation created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.quotation.view')
  @ApiOperation({ summary: 'List quotations' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('supplierId') supplierId?: string,
    @Query('rfqId') rfqId?: string, @Query('status') status?: string,
    @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.service.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, supplierId, rfqId, status, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.quotation.view')
  @ApiOperation({ summary: 'Get quotation by ID' })
  async findOne(@Param('id') id: string) {
    const quotation = await this.service.findOne(id);
    return { success: true, data: quotation };
  }

  @Patch(':id/evaluate')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.quotation.evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate quotation' })
  async evaluate(@Param('id') id: string, @Body('evaluationNotes') evaluationNotes: string) {
    const quotation = await this.service.evaluate(id, evaluationNotes);
    return { success: true, data: quotation, message: 'Quotation evaluated' };
  }

  @Patch(':id/select')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.quotation.select')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select quotation as winning' })
  async select(@Param('id') id: string) {
    const quotation = await this.service.select(id);
    return { success: true, data: quotation, message: 'Quotation selected' };
  }

  @Patch(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('procurement.quotation.evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject quotation' })
  async reject(@Param('id') id: string) {
    const quotation = await this.service.reject(id);
    return { success: true, data: quotation, message: 'Quotation rejected' };
  }
}
