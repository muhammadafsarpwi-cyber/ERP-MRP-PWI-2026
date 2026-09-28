import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { DivisionScopeGuard, divisionFilterFromRequest } from '../../auth/guards/division-scope.guard';
import { ProductionUnitService } from '../services/production-unit.service';
import {
  GenerateProductionUnitsDto,
  UpdateProductionUnitDto,
  BulkUpdateUnitsDto,
  VoidProductionUnitDto,
  PrintProductionUnitsDto,
  ListProductionUnitsQueryDto,
} from '../dto/production-unit.dto';

@ApiTags('production/units')
@Controller('production/units')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class ProductionUnitController {

  constructor(private readonly unitService: ProductionUnitService) {}

  private async getCompanyId(req: any): Promise<string> {
    const id =
      req.query?.companyId ||
      req.body?.companyId ||
      req.headers?.['x-company-id'] ||
      req.erpUser?.defaultCompanyId ||
      req.orgScopes?.[0]?.companyId;
    if (id) return id;

    const fallback = await this.unitService.getDefaultCompanyId();
    if (fallback) return fallback;

    throw new BadRequestException('No company scope found. Assign a company to this user or specify companyId.');
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id || req.user?.id;
  }

  /** Division list a service may filter with; `undefined` = unrestricted. */
  private divisions(req: any): string[] | undefined {
    return divisionFilterFromRequest(req.allowedDivisionIds);
  }

  // ─── Label templates ─────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'List available label templates' })
  async getTemplates() {
    return { success: true, data: this.unitService.getAvailableTemplates() };
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  @Get('stats')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Production unit status statistics' })
  async getStats(@Req() req: any) {
    const companyId = await this.getCompanyId(req);
    const stats = await this.unitService.getStats(companyId, this.divisions(req));
    return { success: true, data: stats };
  }

  // ─── Scan lookup ─────────────────────────────────────────────────────────────

  @Get('scan/:payload')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Resolve QR / barcode payload to production unit' })
  async scanLookup(@Param('payload') payload: string, @Req() req: any) {
    const companyId = await this.getCompanyId(req);
    const unit = await this.unitService.scanLookup(payload, companyId, this.divisions(req));
    return { success: true, data: unit };
  }

  // ─── Serial lookup ───────────────────────────────────────────────────────────

  @Get('serial/:serialNo')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Find production unit by serial number' })
  async findBySerial(@Param('serialNo') serialNo: string, @Req() req: any) {
    const companyId = await this.getCompanyId(req);
    const unit = await this.unitService.findBySerial(serialNo, companyId, this.divisions(req));
    return { success: true, data: unit };
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'List production units (filterable)' })
  @ApiQuery({ name: 'productionEntryId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(@Req() req: any, @Query() query: ListProductionUnitsQueryDto) {
    const companyId = await this.getCompanyId(req);
    const result = await this.unitService.listUnits(companyId, query, this.divisions(req));
    return { success: true, ...result };
  }

  // ─── Get one ─────────────────────────────────────────────────────────────────

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Get a single production unit' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = await this.getCompanyId(req);
    const unit = await this.unitService.findOne(id, companyId, this.divisions(req));
    return { success: true, data: unit };
  }

  // ─── Bulk generate ───────────────────────────────────────────────────────────

  @Post('generate')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk-generate production unit records with unique serials/QR/barcode' })
  async generate(@Body() dto: GenerateProductionUnitsDto, @Req() req: any) {
    const companyId = await this.getCompanyId(req);
    dto.companyId = companyId; // always use authenticated company
    const units = await this.unitService.generateUnits(dto, this.getUserId(req), this.divisions(req));
    return { success: true, data: units, count: units.length };
  }

  // ─── Bulk update weights / attributes ────────────────────────────────────────

  @Patch('bulk-update')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @ApiOperation({ summary: 'Bulk update individual unit weights / attributes' })
  async bulkUpdate(@Body() dto: BulkUpdateUnitsDto, @Req() req: any) {
    const companyId = await this.getCompanyId(req);
    const units = await this.unitService.bulkUpdateUnits(companyId, dto, this.getUserId(req), this.divisions(req));
    return { success: true, data: units, count: units.length };
  }

  // ─── Update single unit ──────────────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @ApiOperation({ summary: 'Update a single production unit attributes' })
  async updateOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductionUnitDto,
    @Req() req: any,
  ) {
    const companyId = await this.getCompanyId(req);
    const unit = await this.unitService.updateUnit(id, companyId, dto, this.getUserId(req), this.divisions(req));
    return { success: true, data: unit };
  }

  // ─── Print / Reprint ─────────────────────────────────────────────────────────

  @Post('print')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a print / reprint action for selected units' })
  async print(@Body() dto: PrintProductionUnitsDto, @Req() req: any) {
    const companyId = await this.getCompanyId(req);
    const result = await this.unitService.recordPrint(companyId, dto, this.getUserId(req), this.divisions(req));
    return {
      success: true,
      printJobId: result.printJobId,
      printed: result.units.length,
      data: result.units,
    };
  }

  // ─── Void / Cancel ───────────────────────────────────────────────────────────

  @Patch(':id/void')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.create')
  @ApiOperation({ summary: 'Void or cancel a production unit (audit-safe, no delete)' })
  async voidUnit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidProductionUnitDto,
    @Req() req: any,
  ) {
    const companyId = await this.getCompanyId(req);
    const unit = await this.unitService.voidUnit(id, companyId, dto, this.getUserId(req), this.divisions(req));
    return { success: true, data: unit };
  }

  // ─── Print logs ──────────────────────────────────────────────────────────────

  @Get(':id/print-logs')
  @UseGuards(PermissionGuard)
  @RequirePermission('manufacturing.production.entries.view')
  @ApiOperation({ summary: 'Get print history for a production unit' })
  async getPrintLogs(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = await this.getCompanyId(req);
    const logs = await this.unitService.getPrintLogs(id, companyId, this.divisions(req));
    return { success: true, data: logs };
  }
}
