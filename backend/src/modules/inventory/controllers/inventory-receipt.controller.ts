import {
  Controller, Get, Post, Patch, Delete, Body, Param, Req, Query, UseGuards, HttpCode, HttpStatus, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsUUID, IsNumber, Min, IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { StockLedgerService } from '../services/stock-ledger.service';
import { InventoryBalanceService } from '../services/inventory-balance.service';
import { RawMaterialReceivingService } from '../services/raw-material-receiving.service';
import { CreateRawMaterialReceiptDto, CreateRawMaterialReturnDto, UpdateRawMaterialReceiptDto, UpdateRawMaterialReturnDto, RawMaterialReceivingReportQuery } from '../dto/raw-material-receiving.dto';
import { Division, Section, Department } from '../../organization/entities';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { StockLedger } from '../entities';

class CreateInventoryReceiptDto {
  @IsUUID('loose')
  itemId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsUUID('loose')
  uomId!: string;

  @IsUUID('loose')
  divisionId!: string;

  @IsUUID('loose')
  sectionId!: string;

  @IsUUID('loose')
  departmentId!: string;

  @IsUUID('loose')
  warehouseId!: string;

  @IsOptional()
  @IsDateString()
  receiptDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

class CreateInventoryReturnDto {
  @IsUUID('loose')
  itemId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsUUID('loose')
  uomId!: string;

  @IsUUID('loose')
  divisionId!: string;

  @IsUUID('loose')
  sectionId!: string;

  @IsUUID('loose')
  departmentId!: string;

  @IsUUID('loose')
  warehouseId!: string;

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

class UpdateInventoryReceiptDto {
  @IsUUID('loose')
  itemId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsUUID('loose')
  uomId!: string;

  @IsUUID('loose')
  divisionId!: string;

  @IsUUID('loose')
  sectionId!: string;

  @IsUUID('loose')
  departmentId!: string;

  @IsUUID('loose')
  warehouseId!: string;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * Raw Material Receiving — a thin, org-scoped stock-in that reuses the existing
 * stock ledger + inventory balance architecture (never a second inventory system).
 * Division / Section / Department are REQUIRED so the receiving is traceable by
 * organizational production area, and are validated against the org hierarchy.
 *
 * POST /api/v1/inventory/receipts
 *   → validate org hierarchy (division→section→department)
 *   → StockLedgerService.create(direction IN, transactionType RECEIPT, org ids)
 *   → InventoryBalanceService.updateBalance(direction IN)
 *
 * POST /api/v1/inventory/receipts/return
 *   → validate org hierarchy + available stock
 *   → atomic: StockLedgerService.create(direction OUT, transactionType RETURN_OUT, org ids)
 *   → InventoryBalanceService.updateBalance(direction OUT) inside the same transaction
 */
@ApiTags('inventory receipt')
@Controller('inventory/receipts')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class InventoryReceiptController {
  constructor(
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    private readonly rawMaterialService: RawMaterialReceivingService,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    @InjectRepository(StockLedger)
    private readonly ledgerRepo: Repository<StockLedger>,
  ) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  private async validateOrg(divisionId: string, sectionId: string, departmentId: string, companyId: string): Promise<void> {
    const division = await this.divisionRepo.findOne({ where: { id: divisionId, companyId } });
    if (!division) throw new NotFoundException(`Division '${divisionId}' not found in this company.`);
    if (division.status !== 'ACTIVE') throw new BadRequestException('Division is not ACTIVE.');

    const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
    if (!section) throw new NotFoundException(`Section '${sectionId}' not found.`);
    if (section.divisionId !== divisionId) {
      throw new BadRequestException(`Section does not belong to the selected Division.`);
    }

    const department = await this.departmentRepo.findOne({ where: { id: departmentId } });
    if (!department) throw new NotFoundException(`Department '${departmentId}' not found.`);
    if (department.sectionId && department.sectionId !== sectionId) {
      throw new BadRequestException(`Department does not belong to the selected Section.`);
    }
    if (department.divisionId && department.divisionId !== divisionId) {
      throw new BadRequestException(`Department does not belong to the selected Division.`);
    }
  }

  /**
   * Raw Material classification enforcement for the Receiving / Return workflow.
   * The Item Master record is the authoritative source: the item must exist,
   * be ACTIVE, be classified as RAW_MATERIAL, belong to the company, and —
   * when the item carries an organizational assignment — match the selected
   * Division → Section → Department hierarchy.
   */
  private async validateRawMaterialItem(
    itemId: string,
    companyId: string,
    divisionId: string,
    sectionId: string,
    departmentId: string,
  ): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, companyId } });
    if (!item) throw new NotFoundException(`Item '${itemId}' not found in this company.`);
    if (item.status !== 'ACTIVE') throw new BadRequestException('Item is not ACTIVE.');
    if (item.itemType !== 'RAW_MATERIAL') {
      throw new BadRequestException(
        `Item '${item.itemCode}' is classified as ${item.itemType} and is not a Raw Material. Only RAW MATERIAL items can be received or returned.`,
      );
    }
    if (item.divisionId && item.divisionId !== divisionId) {
      throw new BadRequestException(`Item '${item.itemCode}' does not belong to the selected Division.`);
    }
    if (item.sectionId && item.sectionId !== sectionId) {
      throw new BadRequestException(`Item '${item.itemCode}' does not belong to the selected Section.`);
    }
    if (item.departmentId && item.departmentId !== departmentId) {
      throw new BadRequestException(`Item '${item.itemCode}' does not belong to the selected Department.`);
    }
    return item;
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Raw material receiving — posts a real inventory stock IN' })
  async create(@Body() dto: CreateInventoryReceiptDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.validateOrg(dto.divisionId, dto.sectionId, dto.departmentId, companyId);
    await this.validateRawMaterialItem(dto.itemId, companyId, dto.divisionId, dto.sectionId, dto.departmentId);
    const ledger = await this.ledgerService.create({
      companyId,
      transactionType: 'RECEIPT',
      transactionDate: dto.receiptDate ? new Date(dto.receiptDate) : new Date(),
      itemId: dto.itemId,
      warehouseId: dto.warehouseId,
      quantity: dto.quantity,
      uomId: dto.uomId,
      direction: 'IN',
      referenceType: 'RECEIPT',
      referenceNumber: dto.reference ?? undefined,
      notes: dto.notes ?? 'Raw material receiving',
      createdBy: req.erpUser?.id ?? undefined,
      divisionId: dto.divisionId,
      sectionId: dto.sectionId,
      departmentId: dto.departmentId,
    });
    await this.balanceService.updateBalance(
      companyId, dto.itemId, dto.warehouseId, null, null, dto.uomId, dto.quantity, 'IN',
    );
    return { success: true, data: ledger };
  }

  @Post('return')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.adjustment.create')
  @ApiOperation({ summary: 'Raw material return — posts a real inventory stock OUT (atomic)' })
  async createReturn(@Body() dto: CreateInventoryReturnDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.validateOrg(dto.divisionId, dto.sectionId, dto.departmentId, companyId);
    await this.validateRawMaterialItem(dto.itemId, companyId, dto.divisionId, dto.sectionId, dto.departmentId);

    const warehouse = await this.warehouseRepo.findOne({ where: { id: dto.warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException(`Warehouse '${dto.warehouseId}' not found in this company.`);
    if (warehouse.status !== 'ACTIVE') throw new BadRequestException('Warehouse is not ACTIVE.');

    const uom = await this.uomRepo.findOne({ where: { id: dto.uomId } });
    if (!uom) throw new NotFoundException(`UOM '${dto.uomId}' not found.`);

    const available = await this.balanceService.getAvailableStock(
      companyId, dto.itemId, dto.warehouseId, undefined, undefined,
    );
    if (Number(dto.quantity) > available) {
      throw new BadRequestException(
        `Insufficient available stock for this raw material in the selected warehouse. Available: ${available}, requested: ${dto.quantity}.`,
      );
    }

    const result = await this.ledgerRepo.manager.transaction(async (manager) => {
      const ledger = await this.ledgerService.create({
        companyId,
        transactionType: 'RETURN_OUT',
        transactionDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
        itemId: dto.itemId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        uomId: dto.uomId,
        direction: 'OUT',
        referenceType: 'RETURN_OUT',
        referenceNumber: dto.reference ?? undefined,
        notes: dto.reason ?? 'Raw material return',
        createdBy: req.erpUser?.id ?? undefined,
        divisionId: dto.divisionId,
        sectionId: dto.sectionId,
        departmentId: dto.departmentId,
      }, manager);
      await this.balanceService.updateBalance(
        companyId, dto.itemId, dto.warehouseId, null, null, dto.uomId, dto.quantity, 'OUT', manager,
      );
      return ledger;
    });

    return { success: true, data: result };
  }

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * Multi-item Raw Material Receiving / Return (Production workflow)
   * Header + lines model with Gate Pass Weight vs Received Weight tracking.
   * Stock movements post to the SAME stock ledger / inventory balances.
   * ─────────────────────────────────────────────────────────────────────────
   */

  @Get('gate-pass/form-data')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_receiving.create')
  @ApiOperation({ summary: 'Form reference data for the multi-item receiving/return form' })
  async getGatePassFormData(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.rawMaterialService.getFormReferenceData(companyId);
    return { success: true, data };
  }

  @Post('gate-pass')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_receiving.create')
  @ApiOperation({ summary: 'Create a multi-item raw material receipt (Gate Pass). Posts stock IN for received quantities only.' })
  async createMultiReceipt(@Body() dto: CreateRawMaterialReceiptDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.rawMaterialService.createReceipt(companyId, dto, req.erpUser?.id);
    return { success: true, data };
  }

  @Get('gate-pass')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_receiving.view')
  @ApiOperation({ summary: 'List multi-item raw material receipts' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'gatePassNo', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async listMultiReceipts(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('gatePassNo') gatePassNo?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.rawMaterialService.findAllReceipts(companyId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      status,
      divisionId,
      sectionId,
      departmentId,
      warehouseId,
      gatePassNo,
      dateFrom,
      dateTo,
    });
    return { success: true, ...result };
  }

  @Get('gate-pass/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_receiving.view')
  @ApiOperation({ summary: 'Receipt detail with lines + ledger entries' })
  async getMultiReceipt(@Param('id') id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.rawMaterialService.findReceiptById(companyId, id);
    return { success: true, data };
  }

  @Patch('gate-pass/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_receiving.update')
  @ApiOperation({ summary: 'Update a multi-item receipt (delta-based stock handling)' })
  async updateMultiReceipt(@Param('id') id: string, @Body() dto: UpdateRawMaterialReceiptDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.rawMaterialService.updateReceipt(id, companyId, dto, req.erpUser?.id);
    return { success: true, data, message: 'Receipt updated successfully.' };
  }

  @Delete('gate-pass/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_receiving.delete')
  @ApiOperation({ summary: 'Delete a multi-item receipt — reverses posted stock atomically' })
  async removeMultiReceipt(@Param('id') id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.rawMaterialService.removeReceipt(id, companyId);
    return { success: true, message: 'Receipt deleted and inventory balance reversed.' };
  }

  @Post('return-multi')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_return.create')
  @ApiOperation({ summary: 'Create a multi-item raw material return. Posts stock OUT (atomic).' })
  async createMultiReturn(@Body() dto: CreateRawMaterialReturnDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.rawMaterialService.createReturn(companyId, dto, req.erpUser?.id);
    return { success: true, data };
  }

  @Get('returns')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_return.view')
  @ApiOperation({ summary: 'List raw material returns' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'sourceNo', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async listMultiReturns(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('sourceNo') sourceNo?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.rawMaterialService.findAllReturns(companyId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      status,
      divisionId,
      sectionId,
      departmentId,
      warehouseId,
      sourceNo,
      dateFrom,
      dateTo,
    });
    return { success: true, ...result };
  }

  @Get('returns/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_return.view')
  @ApiOperation({ summary: 'Return detail with lines + ledger entries' })
  async getMultiReturn(@Param('id') id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.rawMaterialService.findReturnById(companyId, id);
    return { success: true, data };
  }

  @Patch('returns/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_return.update')
  @ApiOperation({ summary: 'Update a raw material return (delta-based stock handling)' })
  async updateMultiReturn(@Param('id') id: string, @Body() dto: UpdateRawMaterialReturnDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.rawMaterialService.updateReturn(id, companyId, dto, req.erpUser?.id);
    return { success: true, data, message: 'Return updated successfully.' };
  }

  @Delete('returns/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_return.delete')
  @ApiOperation({ summary: 'Delete a raw material return — reverses posted stock atomically' })
  async removeMultiReturn(@Param('id') id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.rawMaterialService.removeReturn(id, companyId);
    return { success: true, message: 'Return deleted and inventory balance reversed.' };
  }

  @Get('report')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.material_receiving.report')
  @ApiOperation({ summary: 'Raw material receiving/return report (Gate Pass vs Received vs Difference) + legacy ledger' })
  @ApiQuery({ type: RawMaterialReceivingReportQuery })
  async getReport(@Req() req: any, @Query() query: RawMaterialReceivingReportQuery) {
    const companyId = this.getCompanyId(req);
    const data = await this.rawMaterialService.getReport(companyId, query);
    return { success: true, data };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'List raw material receiving / return history (real ledger entries)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'transactionType', required: false })
  @ApiQuery({ name: 'direction', required: false })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('transactionType') transactionType?: string,
    @Query('direction') direction?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const result = await this.ledgerService.findAll({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      companyId,
      transactionType: transactionType || undefined,
      direction: direction || undefined,
      divisionId,
      sectionId,
      departmentId,
    });
    return { success: true, ...result };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.adjustment.create')
  @ApiOperation({ summary: 'Edit a receiving/return transaction — reverses original balance, applies new values (atomic)' })
  async update(@Param('id') id: string, @Body() dto: UpdateInventoryReceiptDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const entry = await this.ledgerService.findOneByCompany(id, companyId);
    if (entry.transactionType !== 'RECEIPT' && entry.transactionType !== 'RETURN_OUT') {
      throw new BadRequestException(`Transaction type '${entry.transactionType}' cannot be edited through this endpoint.`);
    }

    await this.validateOrg(dto.divisionId, dto.sectionId, dto.departmentId, companyId);
    await this.validateRawMaterialItem(dto.itemId, companyId, dto.divisionId, dto.sectionId, dto.departmentId);

    const warehouse = await this.warehouseRepo.findOne({ where: { id: dto.warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException(`Warehouse '${dto.warehouseId}' not found in this company.`);
    if (warehouse.status !== 'ACTIVE') throw new BadRequestException('Warehouse is not ACTIVE.');

    const uom = await this.uomRepo.findOne({ where: { id: dto.uomId } });
    if (!uom) throw new NotFoundException(`UOM '${dto.uomId}' not found.`);

    const originalDir = entry.direction as 'IN' | 'OUT'; // 'IN' for RECEIPT, 'OUT' for RETURN_OUT
    const result = await this.ledgerRepo.manager.transaction(async (manager) => {
      // Reverse the original balance effect
      const reverseDir = originalDir === 'IN' ? 'OUT' : 'IN';
      await this.balanceService.updateBalance(
        companyId, entry.itemId, entry.warehouseId, null, null, entry.uomId, entry.quantity, reverseDir, manager,
      );

      // Update the ledger row (keep id, transactionType, direction, audit fields)
      const updated = await this.ledgerService.update(id, {
        transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
        itemId: dto.itemId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        uomId: dto.uomId,
        referenceNumber: dto.reference ?? null,
        notes: dto.notes ?? null,
        divisionId: dto.divisionId,
        sectionId: dto.sectionId,
        departmentId: dto.departmentId,
      }, manager);

      // Apply the new balance effect (same direction as original type)
      await this.balanceService.updateBalance(
        companyId, dto.itemId, dto.warehouseId, null, null, dto.uomId, dto.quantity, originalDir, manager,
      );

      return updated;
    });

    return { success: true, data: result, message: 'Transaction updated successfully.' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.adjustment.create')
  @ApiOperation({ summary: 'Delete a receiving/return transaction — reverses the original balance effect atomically' })
  async remove(@Param('id') id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const entry = await this.ledgerService.findOneByCompany(id, companyId);
    if (entry.transactionType !== 'RECEIPT' && entry.transactionType !== 'RETURN_OUT') {
      throw new BadRequestException(`Transaction type '${entry.transactionType}' cannot be deleted through this endpoint.`);
    }

    await this.ledgerRepo.manager.transaction(async (manager) => {
      const reverseDir = entry.direction === 'IN' ? 'OUT' : 'IN';
      await this.balanceService.updateBalance(
        companyId, entry.itemId, entry.warehouseId, null, null, entry.uomId, entry.quantity, reverseDir, manager,
      );
      await this.ledgerService.remove(entry.id, manager);
    });

    return { success: true, message: 'Transaction deleted and inventory balance reversed.' };
  }

  @Get('organization/divisions')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Divisions for the user company scope' })
  async getDivisions(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const data = await this.divisionRepo.find({
      where: { companyId, status: 'ACTIVE' as any },
      order: { name: 'ASC' },
    });
    return { success: true, data };
  }

  @Get('organization/sections')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Sections for a division' })
  @ApiQuery({ name: 'divisionId', required: false })
  async getSections(@Query('divisionId') divisionId?: string) {
    const where: any = { status: 'ACTIVE' };
    if (divisionId) where.divisionId = divisionId;
    const data = await this.sectionRepo.find({
      where,
      order: { name: 'ASC' },
    });
    return { success: true, data };
  }

  @Get('organization/departments')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Departments for a division and section' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  async getDepartments(
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
  ) {
    const where: any = { status: 'ACTIVE' };
    if (divisionId) where.divisionId = divisionId;
    if (sectionId) where.sectionId = sectionId;
    const data = await this.departmentRepo.find({
      where,
      order: { name: 'ASC' },
    });
    return { success: true, data };
  }

  @Get('reference-data')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'Warehouses, items, and UOMs for the receiving form' })
  async getReferenceData(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const [warehouses, items, uoms] = await Promise.all([
      this.warehouseRepo.find({
        where: { companyId, status: 'ACTIVE' as any },
        order: { name: 'ASC' },
      }),
      this.itemRepo.find({
        where: { companyId, status: 'ACTIVE' as any },
        order: { itemCode: 'ASC' },
        take: 200,
      }),
      this.uomRepo.find({
        where: { status: 'ACTIVE' as any },
        order: { code: 'ASC' },
      }),
    ]);
    return { success: true, data: { warehouses, items, uoms } };
  }

  @Get('raw-materials')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('inventory.opening_stock.create')
  @ApiOperation({ summary: 'RAW MATERIAL items for the receiving/return item selectors (org + type filtered)' })
  @ApiQuery({ name: 'divisionId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getRawMaterials(
    @Req() req: any,
    @Query('divisionId') divisionId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('limit') limit?: number,
  ) {
    const companyId = this.getCompanyId(req);
    const where: any = { companyId, status: 'ACTIVE', itemType: 'RAW_MATERIAL' };
    if (divisionId) where.divisionId = divisionId;
    if (sectionId) where.sectionId = sectionId;
    if (departmentId) where.departmentId = departmentId;
    const data = await this.itemRepo.find({
      where,
      order: { itemCode: 'ASC' },
      take: Number(limit) || 200,
    });
    return { success: true, data };
  }
}
