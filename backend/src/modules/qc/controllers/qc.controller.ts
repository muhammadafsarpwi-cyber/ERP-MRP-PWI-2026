import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QcService } from '../services/qc.service';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('qc')
@Controller('qc')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class QcController {
  constructor(private readonly qcService: QcService) {}

  // ---- Inspection Plans ----
  @Get('plans')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.plan.view')
  async listPlans(@Query('companyId') companyId: string, @Query('search') search?: string) {
    const data = await this.qcService.listPlans(companyId, search);
    return { success: true, data };
  }

  @Post('plans')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.plan.manage')
  async createPlan(@Body() dto: any) {
    const data = await this.qcService.createPlan(dto);
    return { success: true, data, message: 'Inspection plan created' };
  }

  @Get('plans/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.plan.view')
  async findPlan(@Param('id') id: string) {
    const data = await this.qcService.findPlan(id);
    return { success: true, data };
  }

  @Post('plans/:id/characteristics')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.plan.manage')
  async addCharacteristic(@Param('id') id: string, @Body() dto: any) {
    const data = await this.qcService.addCharacteristic(id, dto);
    return { success: true, data, message: 'Characteristic added' };
  }

  @Get('plans/:id/characteristics')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.plan.view')
  async listCharacteristics(@Param('id') id: string) {
    const data = await this.qcService.listCharacteristics(id);
    return { success: true, data };
  }

  // ---- Defect classifications ----
  @Get('defects')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.inspection.view')
  async listDefects(@Query('companyId') companyId: string) {
    const data = await this.qcService.listDefects(companyId);
    return { success: true, data };
  }

  @Post('defects')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.inspection.create')
  async createDefect(@Body() dto: any) {
    const data = await this.qcService.createDefect(dto);
    return { success: true, data, message: 'Defect classification created' };
  }

  // ---- Inspections ----
  @Get('inspections')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.inspection.view')
  async listInspections(
    @Query('companyId') companyId: string, @Query('page') page?: number, @Query('limit') limit?: number,
    @Query('status') status?: string, @Query('result') result?: string, @Query('referenceType') referenceType?: string,
  ) {
    const result2 = await this.qcService.listInspections(companyId, { page, limit, status, result, referenceType });
    return { success: true, ...result2 };
  }

  @Get('inspections/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.inspection.view')
  async findInspection(@Param('id') id: string) {
    const data = await this.qcService.findInspection(id);
    return { success: true, data };
  }

  @Post('inspections')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.inspection.create')
  async createInspection(@Body() dto: any) {
    const data = await this.qcService.createInspection(dto);
    return { success: true, data, message: 'Inspection created' };
  }

  @Post('inspections/:id/results')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.inspection.record')
  @HttpCode(HttpStatus.OK)
  async recordResults(@Param('id') id: string, @Body() dto: any) {
    const data = await this.qcService.recordResults(id, dto);
    return { success: true, data, message: 'Inspection results recorded' };
  }

  // ---- NCR ----
  @Get('ncr')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.ncr.view')
  async listNcr(
    @Query('companyId') companyId: string, @Query('page') page?: number, @Query('limit') limit?: number,
    @Query('status') status?: string, @Query('disposition') disposition?: string,
  ) {
    const result = await this.qcService.listNcr(companyId, { page, limit, status, disposition });
    return { success: true, ...result };
  }

  @Post('ncr')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.ncr.manage')
  async createNcr(@Body() dto: any) {
    const data = await this.qcService.createNcr(dto);
    return { success: true, data, message: 'NCR created' };
  }

  @Patch('ncr/:id/disposition')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.ncr.manage')
  @HttpCode(HttpStatus.OK)
  async setNcrDisposition(@Param('id') id: string, @Body() dto: any) {
    const data = await this.qcService.setNcrDisposition(id, dto);
    return { success: true, data, message: 'NCR disposition updated' };
  }

  // ---- CAPA ----
  @Get('capa')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.capa.view')
  async listCapa(
    @Query('companyId') companyId: string, @Query('page') page?: number, @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    const result = await this.qcService.listCapa(companyId, { page, limit, status });
    return { success: true, ...result };
  }

  @Post('capa')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.capa.manage')
  async createCapa(@Body() dto: any) {
    const data = await this.qcService.createCapa(dto);
    return { success: true, data, message: 'CAPA created' };
  }

  @Patch('capa/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('qc.capa.manage')
  async updateCapa(@Param('id') id: string, @Body() dto: any) {
    const data = await this.qcService.updateCapa(id, dto);
    return { success: true, data, message: 'CAPA updated' };
  }
}