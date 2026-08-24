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
import { ProductionEntryService } from '../services';
import { MachineTargetService } from '../../machine-target/services/machine-target.service';
import { ResolveMachineTargetQueryDto } from '../../machine-target/dto';
import {
  CreateProductionEntryDto,
  UpdateProductionEntryDto,
  CreateMachineDto,
  MachineEntryStatusQueryDto,
} from '../dto';

@ApiTags('production/entries')
@Controller('production')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class ProductionEntryController {
  constructor(
    private readonly entryService: ProductionEntryService,
    private readonly machineTargetService: MachineTargetService,
  ) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
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
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'productionOrderId', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['ASC', 'DESC'] })
  @ApiOperation({ summary: 'List daily production entries with organization/date/shift/machine/item filters' })
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
    @Query('itemId') itemId?: string,
    @Query('productionOrderId') productionOrderId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'ASC' | 'DESC',
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.entryService.findAll(companyId, {
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 50, 200),
      divisionId,
      sectionId,
      departmentId,
      dateFrom,
      dateTo,
      shiftId,
      machineNo,
      itemId,
      productionOrderId,
      sortBy,
      sortDir,
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
    @Query('itemId') itemId?: string,
    @Query('productionOrderId') productionOrderId?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.entryService.getReport(companyId, {
      divisionId, sectionId, departmentId, dateFrom, dateTo, shiftId, machineNo, itemId, productionOrderId,
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
    const result = await this.entryService.getMachineEntryStatus(companyId, query);
    return { success: true, ...result };
  }

  @Get('entries/machine-target')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({
    summary:
      'Resolve the active Machine Target (ERP-00016) for machine + shift + production date — powers the auto-filled Target Production field',
  })
  async resolveMachineTarget(@Req() req: any, @Query() query: ResolveMachineTargetQueryDto) {
    const companyId = this.getCompanyId(req);
    const resolution = await this.machineTargetService.resolve(query, companyId);
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
    const data = await this.entryService.findMachines(companyId, { departmentId, search });
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
  @ApiOperation({ summary: 'List shift master' })
  async shifts(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.entryService.findShifts(companyId);
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

  // ─── Single entry operations ────────────────────────────────────────────────

  @Get('entries/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Get a daily production entry by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const entry = await this.entryService.findOne(id, companyId);
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
    const entry = await this.entryService.create(dto, companyId, this.getUserId(req));
    return { success: true, data: entry, message: 'Production entry saved' };
  }

  @Put('entries/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.update')
  @ApiOperation({ summary: 'Update a daily production entry' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductionEntryDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const entry = await this.entryService.update(id, dto, companyId, this.getUserId(req));
    return { success: true, data: entry, message: 'Production entry updated' };
  }

  @Delete('entries/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.production.entries.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a daily production entry' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.entryService.remove(id, companyId, this.getUserId(req));
    return { success: true, message: 'Production entry deleted' };
  }
}
