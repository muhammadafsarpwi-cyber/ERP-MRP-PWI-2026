import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard, divisionFilterFromRequest } from '../../auth/guards/division-scope.guard';
import { ProductionEntryService } from '../services';
import { ResolveMachineTargetQueryDto } from '../../machine-target/dto';
import {
  CreateProductionEntryDto,
  UpdateProductionEntryDto,
  CreateMachineDto,
  CreateDowntimeReasonDto,
  MachineEntryStatusQueryDto,
} from '../dto';

@ApiTags('production/entries')
@Controller('production')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class ProductionEntryController {
  constructor(
    private readonly entryService: ProductionEntryService,
  ) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    return companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  /** Division list a service may filter with; `undefined` = unrestricted. */
  private divisions(req: any): string[] | undefined {
    return divisionFilterFromRequest(req.allowedDivisionIds);
  }

  // ─── Daily Production Entries ───────────────────────────────────────────────

  @Get('entries')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'shiftId', required: false })
  @ApiQuery({ name: 'machineNo', required: false })
  @ApiQuery({ name: 'machineId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'uomId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'productionOrderId', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['ASC', 'DESC'] })
  @ApiOperation({ summary: 'List daily production entries with organization/date/shift/machine/item/UOM/search filters' })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('shiftId') shiftId?: string,
    @Query('machineNo') machineNo?: string,
    @Query('machineId') machineId?: string,
    @Query('itemId') itemId?: string,
    @Query('uomId') uomId?: string,
    @Query('search') search?: string,
    @Query('productionOrderId') productionOrderId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'ASC' | 'DESC',
    @Query('status') status?: string,
    @Query('chevronKey') chevronKey?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.entryService.findAll(companyId, {
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 50, 1000),
      divisionId,
      sectionId,
      departmentId,
      dateFrom,
      dateTo,
      shiftId,
      machineNo,
      machineId,
      itemId,
      uomId,
      search,
      productionOrderId,
      sortBy,
      sortDir,
      status,
      chevronKey,
      warehouseId,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, ...result };
  }

  @Get('entries/report')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.report')
  @ApiOperation({ summary: 'Department-wise production report (target vs actual vs scrap, grouped by UOM)' })
  async report(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('shiftId') shiftId?: string,
    @Query('machineNo') machineNo?: string,
    @Query('machineId') machineId?: string,
    @Query('itemId') itemId?: string,
    @Query('uomId') uomId?: string,
    @Query('productionOrderId') productionOrderId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.entryService.getReport(companyId, {
      divisionId, sectionId, departmentId, dateFrom, dateTo, shiftId, machineNo, machineId, itemId, uomId, productionOrderId,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, ...result };
  }

  @Get('entries/operator-summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiQuery({ name: 'entryDate', required: false, description: 'Single date filter (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'shiftId', required: false })
  @ApiOperation({ summary: 'Get de-duplicated operator daily overtime and active operator metrics' })
  async getOperatorDailySummary(
    @Req() req: any,
    @Query('entryDate') entryDate?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('departmentId') departmentId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('shiftId') shiftId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.entryService.getOperatorDailySummary(companyId, {
      entryDate,
      dateFrom,
      dateTo,
      departmentId,
      divisionId,
      shiftId,
    });
    return { success: true, ...result };
  }

  @Get('entries/machine-status')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiQuery({ name: 'entryDate', required: true, description: 'Production date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'shiftId', required: true })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiOperation({
    summary:
      'Per-machine entry availability for a date + shift (duplicate pre-check: ENTERED vs ENTRY_REQUIRED)',
  })
  async machineStatus(@Req() req: any, @Query() query: MachineEntryStatusQueryDto) {
    const companyId = this.getCompanyId(req);
    const result = await this.entryService.getMachineEntryStatus(companyId, {
      ...(query as MachineEntryStatusQueryDto & { allowedDivisionIds?: string[] }),
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, ...result };
  }

  @Get('entries/machine-target')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({
    summary:
      'Resolve the active Machine Target (ERP-00016/ERP-00018) for machine + shift + production date, enriched with shift planned hours and the item\'s effective production route — powers the auto-filled Target Production field',
  })
  async resolveMachineTarget(@Req() req: any, @Query() query: ResolveMachineTargetQueryDto) {
    const companyId = this.getCompanyId(req);
    const resolution = await this.entryService.resolveEntryContext(companyId, query);
    return { success: true, data: resolution };
  }

  // ─── Masters (machine / shift / downtime reason) ──────────────────────────

  @Get('machines')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'List machine master (optionally filtered by department)' })
  async machines(@Req() req: any, @Query('departmentId') departmentId?: string, @Query('search') search?: string) {
    const companyId = this.getCompanyId(req);
    const data = await this.entryService.findMachines(companyId, {
      departmentId,
      search,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, data };
  }

  @Post('machines')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a machine in the machine master' })
  async createMachine(@Body() dto: CreateMachineDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const machine = await this.entryService.createMachine(dto, companyId, this.getUserId(req));
    return { success: true, data: machine, message: `Machine ${machine.machineCode} created` };
  }

  @Get('shifts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiQuery({ name: 'departmentId', required: false, description: 'Optional department ID to filter shifts configured in machine targets' })
  @ApiOperation({ summary: 'List shift master' })
  async shifts(@Req() req: any, @Query('departmentId') departmentId?: string) {
    const companyId = this.getCompanyId(req);
    const data = await this.entryService.findShifts(companyId, departmentId);
    return { success: true, data };
  }

  @Get('downtime-reasons')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'List standardized downtime reasons' })
  async downtimeReasons(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.entryService.findDowntimeReasons(companyId);
    return { success: true, data };
  }

  @Post('downtime-reasons')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a dynamic custom downtime reason' })
  async createDowntimeReason(@Body() dto: CreateDowntimeReasonDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const data = await this.entryService.createDowntimeReason(companyId, dto, userId);
    return { success: true, data, message: `Downtime reason "${data.name}" created` };
  }

  @Get('entries/packing')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Ultra-fast hand packing entries for Packing Department Hub' })
  async packingEntries(@Req() req: any, @Query('limit') limit?: number, @Query('search') search?: string) {
    const companyId = this.getCompanyId(req);
    const data = await this.entryService.findPackingEntries(companyId, limit ? Number(limit) : 1000, search);
    return { success: true, data };
  }

  // ─── Single entry operations ────────────────────────────────────────────────

  @Get('entries/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Get a daily production entry by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const entry = await this.entryService.findOne(id, companyId, this.divisions(req));
    return { success: true, data: entry };
  }

  @Post('entries')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a daily production entry' })
  async create(@Body() dto: CreateProductionEntryDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const entry = await this.entryService.create(dto, companyId, this.getUserId(req), this.divisions(req));
    return { success: true, data: entry, message: 'Production entry saved' };
  }

  @Put('entries/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.update')
  @ApiOperation({ summary: 'Update a daily production entry' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductionEntryDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const entry = await this.entryService.update(id, dto, companyId, this.getUserId(req), this.divisions(req));
    return { success: true, data: entry, message: 'Production entry updated' };
  }

  @Post('entries/:id/complete-nipple')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.update')
  @ApiOperation({ summary: 'Deduct pending nipple stock from warehouse (WH-002) and complete batch' })
  async completeNipple(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { warehouseId?: string; completionDate?: string },
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    return this.entryService.completePendingNippleBatch(id, dto, companyId, this.getUserId(req));
  }

  @Delete('entries/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a daily production entry' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.entryService.remove(id, companyId, this.getUserId(req), this.divisions(req));
    return { success: true, message: 'Production entry deleted' };
  }
}
