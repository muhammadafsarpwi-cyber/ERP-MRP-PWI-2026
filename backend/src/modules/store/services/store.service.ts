import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Store } from '../entities/store.entity';
import { StoreItem } from '../entities/store-item.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialIssue } from '../entities/material-issue.entity';
import { MaterialReturn } from '../entities/material-return.entity';
import { MaterialRequestLine } from '../entities/material-request-line.entity';
import { MaterialIssueLine } from '../entities/material-issue-line.entity';
import { MaterialReturnLine } from '../entities/material-return-line.entity';
import {
  CreateStoreDto,
  UpdateStoreDto,
  CreateMaterialRequestDto,
  UpdateMaterialRequestDto,
  CreateMaterialIssueDto,
  CreateMaterialReturnDto,
} from '../dto/store.dto';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { PurchaseRequisitionService } from '../../procurement/services/purchase-requisition.service';
import { Department } from '../../organization/entities/department.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(StoreItem)
    private readonly storeItemRepo: Repository<StoreItem>,
    @InjectRepository(MaterialRequest)
    private readonly materialRequestRepo: Repository<MaterialRequest>,
    @InjectRepository(MaterialRequestLine)
    private readonly materialRequestLineRepo: Repository<MaterialRequestLine>,
    @InjectRepository(MaterialIssue)
    private readonly materialIssueRepo: Repository<MaterialIssue>,
    @InjectRepository(MaterialIssueLine)
    private readonly materialIssueLineRepo: Repository<MaterialIssueLine>,
    @InjectRepository(MaterialReturn)
    private readonly materialReturnRepo: Repository<MaterialReturn>,
    @InjectRepository(MaterialReturnLine)
    private readonly materialReturnLineRepo: Repository<MaterialReturnLine>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
    private readonly prService: PurchaseRequisitionService,
  ) {}

  // ==================== STORE MASTER ====================

  /**
   * Enforce record-level company scoping for by-ID lookups. A user can only
   * see / operate on store records belonging to the company they are scoped to.
   * When companyId is provided (server-derived, never client-supplied) a record
   * from another company is rejected outright.
   */
  private assertCompanyOwned(record: { companyId?: string | null }, companyId?: string, resource = 'Store record'): void {
    if (companyId && record.companyId && record.companyId !== companyId) {
      throw new ForbiddenException(`${resource} belongs to a different company`);
    }
  }

  async findAllStores(companyId: string, query?: { status?: string; divisionId?: string; search?: string }) {
    const qb = this.storeRepo.createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId });

    if (query?.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query?.divisionId) {
      qb.andWhere('s.division_id = :divisionId', { divisionId: query.divisionId });
    }
    if (query?.search) {
      qb.andWhere('(LOWER(s.store_code) LIKE LOWER(:search) OR LOWER(s.store_name) LIKE LOWER(:search))', { search: `%${query.search}%` });
    }

    return qb.orderBy('s.store_name', 'ASC').getMany();
  }

  async findStoreById(id: string, companyId?: string) {
    const store = await this.storeRepo.findOne({ where: { id } });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    this.assertCompanyOwned(store, companyId);
    return store;
  }

  async createStore(dto: CreateStoreDto, userId: string) {
    const existing = await this.storeRepo.findOne({ where: { companyId: dto.companyId, storeCode: dto.storeCode } });
    if (existing) throw new BadRequestException(`Store code ${dto.storeCode} already exists`);

    const store = this.storeRepo.create({ ...dto, createdBy: userId });
    return this.storeRepo.save(store);
  }

  async updateStore(id: string, dto: UpdateStoreDto, userId: string, companyId?: string) {
    const store = await this.findStoreById(id, companyId);
    Object.assign(store, dto, { updatedBy: userId });
    return this.storeRepo.save(store);
  }

  async deleteStore(id: string, companyId?: string) {
    const store = await this.findStoreById(id, companyId);
    store.status = 'INACTIVE';
    return this.storeRepo.save(store);
  }

  // ==================== STORE ITEMS ====================

  async findStoreItems(storeId: string, query?: { search?: string; status?: string }, companyId?: string) {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException(`Store ${storeId} not found`);
    this.assertCompanyOwned(store, companyId);
    const qb = this.storeItemRepo.createQueryBuilder('si')
      .leftJoinAndSelect('si.store', 's')
      .where('si.store_id = :storeId', { storeId });

    if (query?.status) {
      qb.andWhere('si.status = :status', { status: query.status });
    }

    return qb.getMany();
  }

  async findStoreItemById(id: string, companyId?: string) {
    const item = await this.storeItemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Store item ${id} not found`);
    if (companyId) {
      const store = await this.storeRepo.findOne({ where: { id: item.storeId } });
      if (!store) throw new NotFoundException(`Store ${item.storeId} not found`);
      this.assertCompanyOwned(store, companyId);
    }
    return item;
  }

  async createStoreItem(storeId: string, itemId: string, dto: Partial<StoreItem>, userId: string, companyId?: string) {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException(`Store ${storeId} not found`);
    this.assertCompanyOwned(store, companyId);
    const existing = await this.storeItemRepo.findOne({ where: { storeId, itemId } });
    if (existing) throw new BadRequestException(`Item already exists in this store`);

    const storeItem = this.storeItemRepo.create({ storeId, itemId, ...dto, createdBy: userId });
    return this.storeItemRepo.save(storeItem);
  }

  async updateStoreItem(id: string, dto: Partial<StoreItem>, userId: string, companyId?: string) {
    const item = await this.findStoreItemById(id, companyId);
    Object.assign(item, dto, { updatedBy: userId });
    return this.storeItemRepo.save(item);
  }

  // ==================== MATERIAL REQUESTS ====================

  async findAllMaterialRequests(companyId: string, query?: { status?: string; storeId?: string; departmentId?: string; mine?: boolean; userId?: string }) {
    const qb = this.materialRequestRepo.createQueryBuilder('mr')
      .where('mr.company_id = :companyId', { companyId });

    if (query?.status) {
      qb.andWhere('mr.status = :status', { status: query.status });
    }
    if (query?.storeId) {
      qb.andWhere('mr.store_id = :storeId', { storeId: query.storeId });
    }
    if (query?.departmentId) {
      qb.andWhere('mr.department_id = :departmentId', { departmentId: query.departmentId });
    }
    if (query?.mine && query.userId) {
      qb.andWhere('mr.created_by = :userId', { userId: query.userId });
    }

    qb.loadRelationCountAndMap('mr.lineCount', 'mr.lines', 'lines')
      .orderBy('mr.created_at', 'DESC');

    return qb.getMany();
  }

  async findMaterialRequestById(id: string, companyId?: string) {
    const request = await this.materialRequestRepo.findOne({
      where: { id },
      relations: ['lines'],
      order: { lines: { lineNumber: 'ASC' } },
    });
    if (!request) throw new NotFoundException(`Material request ${id} not found`);
    this.assertCompanyOwned(request, companyId, 'Material request');
    const enriched = await this.enrichRequestLines(request);
    return enriched;
  }

  private async enrichRequestLines(request: MaterialRequest) {
    if (!request.lines || request.lines.length === 0) return request;
    const store = request.storeId ? await this.storeRepo.findOne({ where: { id: request.storeId } }) : null;

    for (const line of request.lines) {
      const requestedQty = Number(line.requestedQuantity || 0);
      const prCreated = Number(line.prCreatedQty || 0);
      const issued = Number(line.issuedQuantity || 0);

      if (Number(line.availableStock || 0) <= 0 && store?.warehouseId) {
        try {
          const available = await this.inventoryBalanceService.getAvailableStock(
            request.companyId, line.itemId, store.warehouseId,
          );
          line.availableStock = available ?? 0;
        } catch {
          line.availableStock = line.availableStock || 0;
        }
      }

      line.currentShortage = Math.max(requestedQty - Number(line.availableStock || 0), 0);
      line.prRemainingQty = Math.max(requestedQty - prCreated, 0);

      if (line.prStatus === 'NONE' && prCreated > 0) {
        line.prStatus = requestedQty > prCreated ? 'PARTIALLY_CONVERTED' : 'FULLY_CONVERTED';
      }
      if (issued > 0 && line.prStatus === 'NONE') {
        line.prStatus = 'ISSUED';
      }
    }

    return request;
  }

  async createMaterialRequest(dto: CreateMaterialRequestDto, userId: string) {
    const request = this.materialRequestRepo.create({
      ...dto,
      lines: undefined,
      createdBy: userId,
    });
    const saved = await this.materialRequestRepo.save(request);

    if (dto.lines && dto.lines.length > 0) {
      await this.saveRequestLines(saved.id, dto.lines);
    }

    return this.findMaterialRequestById(saved.id);
  }

  async updateMaterialRequest(id: string, dto: UpdateMaterialRequestDto, userId: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (request.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT requests can be edited');
    }

    const { lines, ...header } = dto;
    Object.assign(request, header, { updatedBy: userId });
    await this.materialRequestRepo.save(request);

    if (lines && lines.length > 0) {
      await this.materialRequestLineRepo.delete({ requestId: id });
      await this.saveRequestLines(id, lines);
    }

    return this.findMaterialRequestById(id, companyId);
  }

  private async saveRequestLines(requestId: string, lines: CreateMaterialRequestDto['lines'], manager?: EntityManager) {
    const repo = manager ? manager.getRepository(MaterialRequestLine) : this.materialRequestLineRepo;
    const savedLines: MaterialRequestLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = repo.create({
        requestId,
        lineNumber: i + 1,
        itemId: lines[i].itemId,
        requestedQuantity: lines[i].requestedQuantity,
        uomId: lines[i].uomId,
        batchId: lines[i].batchId || null,
        requiredDate: lines[i].requiredDate || null,
        availableStock: lines[i].availableStock || 0,
        minimumStock: lines[i].minimumStock || 0,
        maximumStock: lines[i].maximumStock || 0,
        currentShortage: lines[i].currentShortage || 0,
        remarks: lines[i].remarks || null,
      });
      savedLines.push(await repo.save(line));
    }
    return savedLines;
  }

  async submitMaterialRequest(id: string, userId: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (request.status !== 'DRAFT') throw new BadRequestException('Only DRAFT requests can be submitted');
    if (!request.lines || request.lines.length === 0) {
      throw new BadRequestException('Cannot submit a request with no line items');
    }
    request.status = 'SUBMITTED';
    request.submittedBy = userId;
    request.submittedAt = new Date();
    return this.materialRequestRepo.save(request);
  }

  async approveMaterialRequest(id: string, userId: string, remarks?: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (request.status !== 'SUBMITTED') throw new BadRequestException('Only SUBMITTED requests can be approved');

    if (request.createdBy && request.createdBy === userId) {
      throw new BadRequestException('You cannot approve your own request (segregation of duties)');
    }

    request.status = 'APPROVED';
    request.approvedBy = userId;
    request.approvedAt = new Date();
    if (remarks) request.remarks = remarks;
    return this.materialRequestRepo.save(request);
  }

  async gmApproveMaterialRequest(id: string, userId: string, remarks?: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (request.status !== 'APPROVED') {
      throw new BadRequestException('Only manager-APPROVED requests can be GM approved');
    }
    if (request.createdBy && request.createdBy === userId) {
      throw new BadRequestException('You cannot GM-approve your own request (segregation of duties)');
    }
    if (request.approvedBy && request.approvedBy === userId) {
      throw new BadRequestException('Manager and GM approver cannot be the same person');
    }

    request.gmApprovedBy = userId;
    request.gmApprovedAt = new Date();
    if (remarks) request.remarks = remarks;
    return this.materialRequestRepo.save(request);
  }

  async rejectMaterialRequest(id: string, userId: string, remarks?: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (request.status !== 'SUBMITTED') throw new BadRequestException('Only SUBMITTED requests can be rejected');

    if (request.createdBy && request.createdBy === userId) {
      throw new BadRequestException('You cannot reject your own request (segregation of duties)');
    }

    request.status = 'REJECTED';
    request.rejectedBy = userId;
    request.rejectedAt = new Date();
    if (remarks) request.remarks = remarks;
    return this.materialRequestRepo.save(request);
  }

  async cancelMaterialRequest(id: string, userId: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (!['DRAFT', 'SUBMITTED'].includes(request.status)) throw new BadRequestException('Cannot cancel request in current status');
    request.status = 'CANCELLED';
    request.cancelledBy = userId;
    request.cancelledAt = new Date();
    return this.materialRequestRepo.save(request);
  }

  // ==================== MATERIAL REQUEST -> PR CONVERSION ====================

  async convertRequestToPr(
    id: string,
    userId: string,
    companyId: string,
    dto?: { lineQuantities?: { lineId: string; quantity: number; estimatedUnitPrice?: number }[] },
  ) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (!request.lines || request.lines.length === 0) {
      throw new BadRequestException('Request has no line items to convert');
    }
    if (!['APPROVED', 'PARTIALLY_CONVERTED'].includes(request.status)) {
      throw new BadRequestException('Only APPROVED (or partially converted) requests can be converted to PR');
    }
    if (!request.gmApprovedAt) {
      throw new BadRequestException('GM approval is required before converting to PR');
    }
    const isReConversion = 'PARTIALLY_CONVERTED' === request.status;

    const conversionMap = new Map<string, { quantity: number; estimatedUnitPrice?: number }>(
      (dto?.lineQuantities || []).map((l) => [l.lineId, { quantity: l.quantity, estimatedUnitPrice: l.estimatedUnitPrice }]),
    );

    const prLines: any[] = [];
    const lineUpdates: { line: MaterialRequestLine; convertQty: number }[] = [];

    for (const line of request.lines) {
      const requested = Number(line.requestedQuantity || 0);
      const already = Number(line.prCreatedQty || 0);
      const remaining = requested - already;

      let convertQty = remaining;
      const override = conversionMap.get(line.id);
      if (override) {
        convertQty = Math.min(Number(override.quantity), remaining);
        if (convertQty < 0) throw new BadRequestException('Conversion quantity cannot be negative');
      }
      if (convertQty <= 0) continue;

      prLines.push({
        lineNumber: line.lineNumber,
        itemId: line.itemId,
        uomId: line.uomId,
        quantity: convertQty,
        estimatedUnitPrice: override?.estimatedUnitPrice,
        requiredDate: line.requiredDate || request.requiredDate || undefined,
        notes: `From material request ${request.requestNumber}`,
      });
      lineUpdates.push({ line, convertQty });
    }

    if (prLines.length === 0) {
      throw new BadRequestException('No remaining quantities to convert');
    }

    const departmentName = request.departmentId
      ? (await this.departmentRepo.findOne({ where: { id: request.departmentId } }))?.name ?? null
      : null;

    const pr = await this.prService.create(
      {
        companyId,
        requisitionCode: isReConversion
          ? `PR-MR-${request.requestNumber}-${Date.now().toString(36).toUpperCase()}`
          : `PR-MR-${request.requestNumber}`,
        title: request.purpose || `Material request ${request.requestNumber}${isReConversion ? ' (re-conversion)' : ''}`,
        department: departmentName ?? undefined,
        requestedDeliveryDate: request.requiredDate || undefined,
        notes: `Created from material request ${request.requestNumber}`,
        lines: prLines,
      },
      userId,
    );

    for (const { line, convertQty } of lineUpdates) {
      const newCreated = Number(line.prCreatedQty || 0) + convertQty;
      const newRemaining = Math.max(Number(line.requestedQuantity || 0) - newCreated, 0);
      await this.materialRequestLineRepo.update(line.id, {
        prCreatedQty: newCreated,
        prRemainingQty: newRemaining,
        prStatus: newRemaining <= 0 ? 'FULLY_CONVERTED' : 'PARTIALLY_CONVERTED',
      });
    }

    const allConverted = request.lines.every((l) => {
      const upd = lineUpdates.find((u) => u.line.id === l.id);
      const finalQty = upd ? Number(l.prCreatedQty || 0) + upd.convertQty : Number(l.prCreatedQty || 0);
      return finalQty >= Number(l.requestedQuantity || 0);
    });

    await this.materialRequestRepo.update(request.id, {
      prId: pr.id,
      prNumber: pr.requisitionCode,
      convertedAt: new Date(),
      convertedBy: userId,
      status: allConverted ? 'FULLY_CONVERTED' : 'PARTIALLY_CONVERTED',
      updatedBy: userId,
    });

    return this.findMaterialRequestById(request.id);
  }

  // ==================== PROCUREMENT / ETA ====================

  async acknowledgeForProcurement(id: string, userId: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (!['PARTIALLY_CONVERTED', 'FULLY_CONVERTED'].includes(request.status)) {
      throw new BadRequestException('Request must be converted to PR before procurement acknowledgement');
    }
    request.procurementAcknowledgedBy = userId;
    request.procurementAcknowledgedAt = new Date();
    request.etaPending = true;
    return this.materialRequestRepo.save(request);
  }

  async updateEta(
    id: string,
    userId: string,
    dto: { expectedDeliveryDate?: string; supplierId?: string; supplierConfirmedDate?: string },
    companyId?: string,
  ) {
    const request = await this.findMaterialRequestById(id, companyId);
    if (!['PARTIALLY_CONVERTED', 'FULLY_CONVERTED'].includes(request.status)) {
      throw new BadRequestException('Request must be converted before ETA update');
    }

    if (dto.expectedDeliveryDate) request.expectedDeliveryDate = dto.expectedDeliveryDate;
    if (dto.supplierId) request.supplierId = dto.supplierId;
    if (dto.supplierConfirmedDate) request.supplierConfirmedDate = dto.supplierConfirmedDate;

    const hasEta = Boolean(request.expectedDeliveryDate || request.supplierConfirmedDate);
    request.etaPending = !hasEta;

    request.updatedBy = userId;
    return this.materialRequestRepo.save(request);
  }

  async getRequestTimeline(id: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    const events: { action: string; user: string | null; date: Date | null; document: string; remarks?: string | null }[] = [];

    events.push({ action: 'Material Request Created', user: request.createdBy, date: request.createdAt, document: request.requestNumber });
    if (request.submittedAt) events.push({ action: 'Material Request Submitted', user: request.submittedBy, date: request.submittedAt, document: request.requestNumber });
    if (request.approvedAt) events.push({ action: 'Manager Approved', user: request.approvedBy, date: request.approvedAt, document: request.requestNumber });
    if (request.gmApprovedAt) events.push({ action: 'GM Approved', user: request.gmApprovedBy, date: request.gmApprovedAt, document: request.requestNumber });
    if (request.rejectedAt) events.push({ action: 'Rejected', user: request.rejectedBy, date: request.rejectedAt, document: request.requestNumber });
    if (request.cancelledAt) events.push({ action: 'Cancelled', user: request.cancelledBy, date: request.cancelledAt, document: request.requestNumber });
    if (request.convertedAt) events.push({ action: 'PR Created', user: request.convertedBy, date: request.convertedAt, document: request.prNumber || '' });
    if (request.procurementAcknowledgedAt) events.push({ action: 'Procurement Acknowledged', user: request.procurementAcknowledgedBy, date: request.procurementAcknowledgedAt, document: request.requestNumber });
    if (request.supplierConfirmedDate) events.push({ action: 'Supplier Confirmed', user: null, date: new Date(`${request.supplierConfirmedDate}T00:00:00Z`), document: request.requestNumber });
    if (request.expectedDeliveryDate) events.push({ action: 'ETA Confirmed', user: null, date: new Date(`${request.expectedDeliveryDate}T00:00:00Z`), document: request.requestNumber });
    if (request.actualDeliveryDate) events.push({ action: 'Material Received', user: null, date: new Date(`${request.actualDeliveryDate}T00:00:00Z`), document: request.requestNumber });

    return events.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
  }

  async getEtaInfo(id: string, companyId?: string) {
    const request = await this.findMaterialRequestById(id, companyId);
    const now = new Date();

    const leadTimes: Record<string, number | null> = {
      approvalLeadTime: request.submittedAt && request.approvedAt
        ? Math.round((request.approvedAt.getTime() - request.submittedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      gmApprovalLeadTime: request.approvedAt && request.gmApprovedAt
        ? Math.round((request.gmApprovedAt.getTime() - request.approvedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      procurementLeadTime: request.gmApprovedAt && request.procurementAcknowledgedAt
        ? Math.round((request.procurementAcknowledgedAt.getTime() - request.gmApprovedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null,
    };

    let supplierLeadTime: number | null = null;
    if (request.supplierConfirmedDate && request.expectedDeliveryDate) {
      supplierLeadTime = Math.round(
        (new Date(`${request.expectedDeliveryDate}T00:00:00Z`).getTime() - new Date(`${request.supplierConfirmedDate}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    leadTimes.supplierLeadTime = supplierLeadTime;

    let receivingLeadTime: number | null = null;
    if (request.expectedDeliveryDate && request.actualDeliveryDate) {
      receivingLeadTime = Math.round(
        (new Date(`${request.actualDeliveryDate}T00:00:00Z`).getTime() - new Date(`${request.expectedDeliveryDate}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    leadTimes.receivingLeadTime = receivingLeadTime;

    const totalStart = request.submittedAt?.getTime() ?? request.createdAt.getTime();
    const totalEnd = request.actualDeliveryDate
      ? new Date(`${request.actualDeliveryDate}T00:00:00Z`).getTime()
      : request.procurementAcknowledgedAt?.getTime() ?? now.getTime();
    leadTimes.totalProcurementLeadTime = Math.round((totalEnd - totalStart) / (1000 * 60 * 60 * 24));

    let etaStatus = 'ETA_PENDING';
    let remainingDays: number | null = null;
    let overdue = false;
    if (request.expectedDeliveryDate) {
      const etaDate = new Date(`${request.expectedDeliveryDate}T00:00:00Z`);
      etaDate.setHours(23, 59, 59, 999);
      if (request.actualDeliveryDate) {
        etaStatus = 'RECEIVED';
      } else if (now > etaDate) {
        etaStatus = 'OVERDUE';
        overdue = true;
      } else {
        etaStatus = 'PENDING';
        remainingDays = Math.ceil((etaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      requestId: request.id,
      requestNumber: request.requestNumber,
      status: request.status,
      requestedDate: request.requestDate,
      requiredDate: request.requiredDate,
      approvedDate: request.approvedAt,
      gmApprovedDate: request.gmApprovedAt,
      orderDate: request.convertedAt,
      supplierConfirmedDate: request.supplierConfirmedDate,
      expectedDeliveryDate: request.expectedDeliveryDate,
      actualDeliveryDate: request.actualDeliveryDate,
      prNumber: request.prNumber,
      prId: request.prId,
      poNumber: request.poNumber,
      supplierId: request.supplierId,
      etaStatus,
      etaPending: request.etaPending,
      remainingDays,
      overdue,
      leadTimes,
    };
  }

  // ==================== MATERIAL ISSUES ====================

  async findAllMaterialIssues(companyId: string, query?: { status?: string; storeId?: string }) {
    const qb = this.materialIssueRepo.createQueryBuilder('mi')
      .where('mi.company_id = :companyId', { companyId });

    if (query?.status) {
      qb.andWhere('mi.status = :status', { status: query.status });
    }
    if (query?.storeId) {
      qb.andWhere('mi.store_id = :storeId', { storeId: query.storeId });
    }

    qb.loadRelationCountAndMap('mi.lineCount', 'mi.lines', 'lines')
      .orderBy('mi.created_at', 'DESC');

    return qb.getMany();
  }

  async findMaterialIssueById(id: string, companyId?: string) {
    const issue = await this.materialIssueRepo.findOne({
      where: { id },
      relations: ['lines'],
      order: { lines: { lineNumber: 'ASC' } },
    });
    if (!issue) throw new NotFoundException(`Material issue ${id} not found`);
    this.assertCompanyOwned(issue, companyId, 'Material issue');
    return issue;
  }

  async createMaterialIssue(dto: CreateMaterialIssueDto, userId: string) {
    const issue = this.materialIssueRepo.create({
      ...dto,
      lines: undefined,
      createdBy: userId,
    });
    const saved = await this.materialIssueRepo.save(issue);

    if (dto.lines && dto.lines.length > 0) {
      for (let i = 0; i < dto.lines.length; i++) {
        const line = this.materialIssueLineRepo.create({
          issueId: saved.id,
          lineNumber: i + 1,
          itemId: dto.lines[i].itemId,
          quantity: dto.lines[i].quantity,
          uomId: dto.lines[i].uomId,
          batchId: dto.lines[i].batchId || null,
          serialNumber: dto.lines[i].serialNumber || null,
          bin: dto.lines[i].bin || null,
          rack: dto.lines[i].rack || null,
          remarks: dto.lines[i].remarks || null,
        });
        await this.materialIssueLineRepo.save(line);
      }
    }

    return this.findMaterialIssueById(saved.id);
  }

  async updateMaterialIssue(id: string, lines: CreateMaterialIssueDto['lines'], userId: string, companyId?: string) {
    const issue = await this.findMaterialIssueById(id, companyId);
    if (issue.status !== 'DRAFT') throw new BadRequestException('Only DRAFT issues can be edited');

    if (lines && lines.length > 0) {
      await this.materialIssueLineRepo.delete({ issueId: id });
      for (let i = 0; i < lines.length; i++) {
        const line = this.materialIssueLineRepo.create({
          issueId: id,
          lineNumber: i + 1,
          itemId: lines[i].itemId,
          quantity: lines[i].quantity,
          uomId: lines[i].uomId,
          batchId: lines[i].batchId || null,
          serialNumber: lines[i].serialNumber || null,
          bin: lines[i].bin || null,
          rack: lines[i].rack || null,
          remarks: lines[i].remarks || null,
        });
        await this.materialIssueLineRepo.save(line);
      }
    }

    await this.materialIssueRepo.update(id, { updatedBy: userId });
    return this.findMaterialIssueById(id);
  }

  async postMaterialIssue(id: string, userId: string, companyId?: string) {
    const issue = await this.findMaterialIssueById(id, companyId);
    if (issue.status !== 'DRAFT') throw new BadRequestException('Only DRAFT issues can be posted');
    if (!issue.lines || issue.lines.length === 0) {
      throw new BadRequestException('Cannot post an issue with no line items');
    }

    const store = issue.storeId ? await this.storeRepo.findOne({ where: { id: issue.storeId } }) : null;
    if (!store || !store.warehouseId) {
      throw new BadRequestException('Issue store has no linked warehouse; cannot post inventory');
    }

    await this.materialIssueRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(MaterialIssue);
      const locked = await repo
        .createQueryBuilder('mi')
        .setLock('pessimistic_write')
        .where('mi.id = :id', { id })
        .leftJoinAndSelect('mi.lines', 'lines')
        .getOne();
      if (!locked) throw new NotFoundException(`Material issue ${id} not found`);
      if (locked.status !== 'DRAFT') throw new BadRequestException('Issue has already been posted');

      for (const line of locked.lines || []) {
        const qty = Number(line.quantity || 0);
        if (qty <= 0) continue;

        await this.stockLedgerService.create({
          companyId: locked.companyId,
          transactionType: 'MATERIAL_ISSUE',
          transactionDate: new Date(),
          itemId: line.itemId,
          warehouseId: store.warehouseId!,
          batchId: line.batchId || undefined,
          quantity: qty,
          uomId: line.uomId,
          direction: 'OUT',
          referenceType: 'MATERIAL_ISSUE',
          referenceId: locked.id,
          referenceNumber: locked.issueNumber,
          notes: `Material issue ${locked.issueNumber}`,
          createdBy: userId,
          divisionId: locked.divisionId,
          sectionId: locked.sectionId,
          departmentId: locked.departmentId || locked.issuedToDepartmentId,
        }, manager);

        await this.inventoryBalanceService.updateBalance(
          locked.companyId, line.itemId, store.warehouseId!,
          null, line.batchId, line.uomId, qty, 'OUT', manager,
        );
      }

      if (locked.requestId) {
        await this.updateRequestIssuedQuantity(locked.requestId, locked.lines || [], manager);
      }

      await repo.update(locked.id, {
        status: 'POSTED',
        postedBy: userId,
        postedAt: new Date(),
        updatedBy: userId,
      });
    });

    return this.findMaterialIssueById(id);
  }

  private async updateRequestIssuedQuantity(requestId: string, lines: MaterialIssueLine[], manager: EntityManager) {
    if (lines.length === 0) return;
    const mrLineRepo = manager.getRepository(MaterialRequestLine);
    const mrLines = await mrLineRepo.find({ where: { requestId } });

    for (const issueLine of lines) {
      const mrLine = mrLines.find((l) => l.itemId === issueLine.itemId);
      if (mrLine) {
        await mrLineRepo.update(mrLine.id, {
          issuedQuantity: Number(mrLine.issuedQuantity || 0) + Number(issueLine.quantity || 0),
        });
      }
    }
  }

  async cancelMaterialIssue(id: string, userId: string, companyId?: string) {
    const issue = await this.findMaterialIssueById(id, companyId);
    if (issue.status !== 'DRAFT') throw new BadRequestException('Only DRAFT issues can be cancelled');
    issue.status = 'CANCELLED';
    issue.cancelledBy = userId;
    issue.cancelledAt = new Date();
    return this.materialIssueRepo.save(issue);
  }

  // ==================== MATERIAL RETURNS ====================

  async findAllMaterialReturns(companyId: string, query?: { status?: string; storeId?: string }) {
    const qb = this.materialReturnRepo.createQueryBuilder('mr')
      .where('mr.company_id = :companyId', { companyId });

    if (query?.status) {
      qb.andWhere('mr.status = :status', { status: query.status });
    }
    if (query?.storeId) {
      qb.andWhere('mr.store_id = :storeId', { storeId: query.storeId });
    }

    qb.loadRelationCountAndMap('mr.lineCount', 'mr.lines', 'lines')
      .orderBy('mr.created_at', 'DESC');

    return qb.getMany();
  }

  async findMaterialReturnById(id: string, companyId?: string) {
    const returnRecord = await this.materialReturnRepo.findOne({
      where: { id },
      relations: ['lines'],
      order: { lines: { lineNumber: 'ASC' } },
    });
    if (!returnRecord) throw new NotFoundException(`Material return ${id} not found`);
    this.assertCompanyOwned(returnRecord, companyId, 'Material return');
    return returnRecord;
  }

  async createMaterialReturn(dto: CreateMaterialReturnDto, userId: string) {
    const returnRecord = this.materialReturnRepo.create({
      ...dto,
      lines: undefined,
      createdBy: userId,
    });
    const saved = await this.materialReturnRepo.save(returnRecord);

    if (dto.lines && dto.lines.length > 0) {
      for (let i = 0; i < dto.lines.length; i++) {
        const line = this.materialReturnLineRepo.create({
          returnId: saved.id,
          lineNumber: i + 1,
          itemId: dto.lines[i].itemId,
          quantity: dto.lines[i].quantity,
          uomId: dto.lines[i].uomId,
          batchId: dto.lines[i].batchId || null,
          serialNumber: dto.lines[i].serialNumber || null,
          conditionCode: dto.lines[i].conditionCode || dto.conditionCode || 'GOOD',
          remarks: dto.lines[i].remarks || null,
        });
        await this.materialReturnLineRepo.save(line);
      }
    }

    return this.findMaterialReturnById(saved.id);
  }

  async updateMaterialReturn(id: string, lines: CreateMaterialReturnDto['lines'], userId: string, companyId?: string) {
    const returnRecord = await this.findMaterialReturnById(id, companyId);
    if (returnRecord.status !== 'DRAFT') throw new BadRequestException('Only DRAFT returns can be edited');

    if (lines && lines.length > 0) {
      await this.materialReturnLineRepo.delete({ returnId: id });
      for (let i = 0; i < lines.length; i++) {
        const line = this.materialReturnLineRepo.create({
          returnId: id,
          lineNumber: i + 1,
          itemId: lines[i].itemId,
          quantity: lines[i].quantity,
          uomId: lines[i].uomId,
          batchId: lines[i].batchId || null,
          serialNumber: lines[i].serialNumber || null,
          conditionCode: lines[i].conditionCode || 'GOOD',
          remarks: lines[i].remarks || null,
        });
        await this.materialReturnLineRepo.save(line);
      }
    }

    await this.materialReturnRepo.update(id, { updatedBy: userId });
    return this.findMaterialReturnById(id);
  }

  async postMaterialReturn(id: string, userId: string, companyId?: string) {
    const returnRecord = await this.findMaterialReturnById(id, companyId);
    if (returnRecord.status !== 'DRAFT') throw new BadRequestException('Only DRAFT returns can be posted');
    if (!returnRecord.lines || returnRecord.lines.length === 0) {
      throw new BadRequestException('Cannot post a return with no line items');
    }

    const store = returnRecord.storeId ? await this.storeRepo.findOne({ where: { id: returnRecord.storeId } }) : null;
    if (!store || !store.warehouseId) {
      throw new BadRequestException('Return store has no linked warehouse; cannot post inventory');
    }

    await this.materialReturnRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(MaterialReturn);
      const locked = await repo
        .createQueryBuilder('mr')
        .setLock('pessimistic_write')
        .where('mr.id = :id', { id })
        .leftJoinAndSelect('mr.lines', 'lines')
        .getOne();
      if (!locked) throw new NotFoundException(`Material return ${id} not found`);
      if (locked.status !== 'DRAFT') throw new BadRequestException('Return has already been posted');

      for (const line of locked.lines || []) {
        const qty = Number(line.quantity || 0);
        if (qty <= 0) continue;

        await this.stockLedgerService.create({
          companyId: locked.companyId,
          transactionType: 'MATERIAL_RETURN',
          transactionDate: new Date(),
          itemId: line.itemId,
          warehouseId: store.warehouseId!,
          batchId: line.batchId || undefined,
          quantity: qty,
          uomId: line.uomId,
          direction: 'IN',
          referenceType: 'MATERIAL_RETURN',
          referenceId: locked.id,
          referenceNumber: locked.returnNumber,
          notes: `Material return ${locked.returnNumber}`,
          createdBy: userId,
          divisionId: locked.divisionId,
          sectionId: locked.sectionId,
          departmentId: locked.departmentId || locked.fromDepartmentId,
        }, manager);

        await this.inventoryBalanceService.updateBalance(
          locked.companyId, line.itemId, store.warehouseId!,
          null, line.batchId, line.uomId, qty, 'IN', manager,
        );
      }

      await repo.update(locked.id, {
        status: 'POSTED',
        postedBy: userId,
        postedAt: new Date(),
        updatedBy: userId,
      });
    });

    return this.findMaterialReturnById(id);
  }

  async cancelMaterialReturn(id: string, userId: string, companyId?: string) {
    const returnRecord = await this.findMaterialReturnById(id, companyId);
    if (returnRecord.status !== 'DRAFT') throw new BadRequestException('Only DRAFT returns can be cancelled');
    returnRecord.status = 'CANCELLED';
    returnRecord.cancelledBy = userId;
    returnRecord.cancelledAt = new Date();
    return this.materialReturnRepo.save(returnRecord);
  }

  // ==================== DASHBOARD ====================

  async getDashboard(companyId: string) {
    const totalStores = await this.storeRepo.count({ where: { companyId, status: 'ACTIVE' } });
    const totalStoreItems = await this.storeItemRepo.createQueryBuilder('si')
      .innerJoin('si.store', 's')
      .where('s.company_id = :companyId', { companyId })
      .getCount();

    const pendingRequests = await this.materialRequestRepo.count({
      where: { companyId, status: 'SUBMITTED' }
    });

    const pendingApprovals = await this.materialRequestRepo.count({
      where: { companyId, status: 'SUBMITTED' }
    });

    const pendingPrConversion = await this.materialRequestRepo.count({
      where: { companyId, status: 'APPROVED' }
    });

    const pendingEta = await this.materialRequestRepo.count({
      where: { companyId, etaPending: true }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayIssues = await this.materialIssueRepo.createQueryBuilder('mi')
      .where('mi.company_id = :companyId', { companyId })
      .andWhere('mi.issue_date >= :today', { today: today.toISOString().split('T')[0] })
      .getCount();

    const todayReturns = await this.materialReturnRepo.createQueryBuilder('mr')
      .where('mr.company_id = :companyId', { companyId })
      .andWhere('mr.return_date >= :today', { today: today.toISOString().split('T')[0] })
      .getCount();

    return {
      totalStores,
      totalStoreItems,
      pendingRequests,
      pendingApprovals,
      pendingPrConversion,
      pendingEta,
      todayIssues,
      todayReturns,
    };
  }
}