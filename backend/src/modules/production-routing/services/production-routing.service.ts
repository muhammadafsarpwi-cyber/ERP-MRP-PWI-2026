import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ProductionRouting, RoutingStatus, RoutingOperation } from '../entities';
import { RoutingOperationInput, RoutingInputScrapBasis } from '../entities/routing-operation-input.entity';
import { RoutingOperationOutput, RoutingOutputType } from '../entities/routing-operation-output.entity';
import {
  CreateRoutingDto,
  UpdateRoutingDto,
  UpdateRoutingStatusDto,
  CreateRoutingOperationDto,
  UpdateRoutingOperationDto,
  RoutingOperationInputDto,
  RoutingOperationOutputDto,
} from '../dto';
import { Item } from '../../item/entities/item.entity';
import { ItemRouteType, RouteTypeStatus } from '../../item/entities/route-type.entity';
import { BillOfMaterials } from '../../bom/entities/bill-of-materials.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Operation } from '../../operation/entities/operation.entity';

const VALID_TRANSITIONS: Record<string, string[]> = {
  [RoutingStatus.DRAFT]: [RoutingStatus.ACTIVE],
  [RoutingStatus.ACTIVE]: [RoutingStatus.OBSOLETE],
  [RoutingStatus.OBSOLETE]: [],
};

const RELATIONS = [
  'routeType',
  'product',
  'bom',
  'operations',
  'operations.division',
  'operations.section',
  'operations.department',
  'operations.inputItem',
  'operations.outputItem',
  'operations.uom',
  'operations.operation',
  'operations.machine',
  'operations.inputs',
  'operations.inputs.item',
  'operations.inputs.uom',
  'operations.inputs.sourceWarehouse',
  'operations.outputs',
  'operations.outputs.item',
  'operations.outputs.uom',
];

@Injectable()
export class ProductionRoutingService {
  private readonly logger = new Logger(ProductionRoutingService.name);

  constructor(
    @InjectRepository(ProductionRouting)
    private readonly routingRepo: Repository<ProductionRouting>,
    @InjectRepository(RoutingOperation)
    private readonly operationRepo: Repository<RoutingOperation>,
    @InjectRepository(RoutingOperationInput)
    private readonly inputRepo: Repository<RoutingOperationInput>,
    @InjectRepository(RoutingOperationOutput)
    private readonly outputRepo: Repository<RoutingOperationOutput>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(ItemRouteType)
    private readonly routeTypeRepo: Repository<ItemRouteType>,
    @InjectRepository(BillOfMaterials)
    private readonly bomRepo: Repository<BillOfMaterials>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(Operation)
    private readonly operationMasterRepo: Repository<Operation>,
  ) {}

  async findAll(companyId: string): Promise<ProductionRouting[]> {
    const routings = await this.routingRepo.find({
      where: { companyId, isActive: true },
      relations: RELATIONS,
      order: { routingCode: 'ASC' },
    });
    routings.forEach((r) => this.sortOperations(r));
    return routings;
  }

  async findOne(id: string, companyId: string): Promise<ProductionRouting> {
    const routing = await this.routingRepo.findOne({
      where: { id, companyId, isActive: true },
      relations: RELATIONS,
    });
    if (!routing) {
      throw new NotFoundException(`Production Routing not found with id ${id}`);
    }
    this.sortOperations(routing);
    return routing;
  }

  async findByProduct(productId: string, companyId: string): Promise<ProductionRouting | null> {
    const routing = await this.routingRepo.findOne({
      where: { productId, companyId, status: RoutingStatus.ACTIVE, isActive: true },
      relations: RELATIONS,
    });
    if (routing) this.sortOperations(routing);
    return routing;
  }

  /**
   * Returns the item's effective production route in correct sequence order.
   * Falls back to Item Master production flow when no explicit row exists in
   * production_routings table. Operation names are derived dynamically from the
   * department / Operation Master — no hard-coded department-to-operation names.
   */
  async getEffectiveRouteForItem(itemId: string, companyId: string): Promise<ProductionRouting> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, companyId },
      relations: ['department', 'baseUom'],
    });
    if (!item) {
      throw new NotFoundException(`Item not found with id ${itemId} for this company`);
    }
    const routing = await this.findByProduct(itemId, companyId);
    if (routing) return routing;

    // Synthesize effective single-stage routing from Item Master configuration
    if (item.productionInItemId) {
      const deptName = item.department?.name || 'Manufacturing';
      const opName = deptName;
      const syntheticOp: any = {
        id: `op-syn-${item.id}`,
        companyId,
        sequenceNo: 10,
        operationCode: `OP-${(item.department?.departmentCode || 'MFG').toUpperCase()}`,
        operationName: opName,
        departmentId: item.departmentId,
        department: item.department,
        inputItemId: item.productionInItemId,
        outputItemId: item.id,
        inputQuantity: 1,
        outputQuantity: 1,
        setupTimeMinutes: 0,
        runTimeMinutes: 0,
        queueTimeMinutes: 0,
        scrapPercentage: 0,
        machineRequired: false,
        status: 'ACTIVE',
        inputs: [
          {
            id: `opin-syn-${item.id}`,
            itemId: item.productionInItemId,
            item: item.productionInItem ?? null,
            quantity: 1,
            uomId: item.productionInItem?.baseUomId ?? null,
            scrapBasis: RoutingInputScrapBasis.WITH_SCRAP,
            isPrimary: true,
            lineNumber: 10,
          },
        ],
        outputs: [
          {
            id: `opout-syn-${item.id}`,
            itemId: item.id,
            item,
            quantity: 1,
            uomId: item.baseUomId ?? null,
            outputType: RoutingOutputType.MAIN,
            yieldPercentage: 100,
            isPrimary: true,
            lineNumber: 10,
          },
        ],
      };
      const syntheticRoute: any = {
        id: `rtg-syn-${item.id}`,
        companyId,
        routingCode: `RTG-${item.itemCode}`,
        name: `${opName} — ${item.name}`,
        productId: item.id,
        product: item,
        status: RoutingStatus.ACTIVE,
        baseQuantity: 1,
        estimatedTotalTime: 0,
        isDefault: true,
        operations: [syntheticOp],
      };
      return syntheticRoute as ProductionRouting;
    }

    throw new NotFoundException(`No active production routing found for item '${item.itemCode}'`);
  }

  async create(dto: CreateRoutingDto, userId?: string): Promise<ProductionRouting> {
    const companyId = dto.companyId!;
    await this.validateProductExists(dto.productId, companyId);
    if (dto.bomId) {
      await this.validateBomExists(dto.bomId, companyId);
      await this.validateBomBelongsToProduct(dto.bomId, dto.productId);
    }
    if (dto.routeTypeId) {
      await this.validateRouteTypeExists(dto.routeTypeId, companyId);
    }

    if (dto.operations && dto.operations.length > 0) {
      await this.validateOrgHierarchy(dto.operations, companyId);
      await this.validateOperationIO(dto.operations);
      await this.validateOperationReferences(dto.operations, companyId);
      this.validateOperationDependencies(dto.operations);
    }

    if (dto.isDefault) {
      await this.clearDefaultRouting(dto.productId, companyId);
    }

    const routingCode = dto.routingCode || (await this.generateRoutingCode(companyId));

    const routing = this.routingRepo.create({
      companyId,
      routingCode,
      name: dto.name,
      description: dto.description || null,
      productId: dto.productId,
      bomId: dto.bomId,
      routeTypeId: dto.routeTypeId ?? null,
      status: RoutingStatus.DRAFT,
      baseQuantity: dto.baseQuantity || 1,
      isDefault: dto.isDefault || false,
      effectiveFrom: dto.effectiveFrom || null,
      effectiveTo: dto.effectiveTo || null,
      estimatedTotalTime: 0,
      createdBy: userId || null,
    });

    const savedRouting = await this.routingRepo.save(routing);

    const operations = dto.operations
      ? await this.createOperations(savedRouting.id, savedRouting.companyId, dto.operations, userId)
      : [];
    savedRouting.operations = operations;
    savedRouting.estimatedTotalTime = this.calculateTotalTime(operations);
    await this.routingRepo.save(savedRouting);

    return this.findOne(savedRouting.id, companyId);
  }

  async update(id: string, dto: UpdateRoutingDto, companyId: string, userId?: string): Promise<ProductionRouting> {
    const routing = await this.findOne(id, companyId);

    if (routing.status !== RoutingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT routings can be edited');
    }

    if (dto.productId && dto.productId !== routing.productId) {
      await this.validateProductExists(dto.productId, companyId);
    }

    if (dto.bomId && dto.bomId !== routing.bomId) {
      await this.validateBomExists(dto.bomId, companyId);
    }

    const nextRouteTypeId = dto.routeTypeId !== undefined ? dto.routeTypeId : routing.routeTypeId;
    if (nextRouteTypeId) {
      await this.validateRouteTypeExists(nextRouteTypeId, companyId);
    }

    if (dto.productId || dto.bomId) {
      const targetBom = dto.bomId ?? routing.bomId;
      const targetProduct = dto.productId ?? routing.productId;
      if (targetBom) {
        await this.validateBomBelongsToProduct(targetBom, targetProduct);
      }
    }

    if (dto.operations) {
      await this.validateOrgHierarchy(dto.operations, companyId);
      await this.validateOperationIO(dto.operations);
      await this.validateOperationReferences(dto.operations, companyId);
      this.validateOperationDependencies(dto.operations);
    }

    if (dto.isDefault) {
      await this.clearDefaultRouting(dto.productId ?? routing.productId, companyId, id);
    }

    Object.assign(routing, {
      name: dto.name ?? routing.name,
      description: dto.description ?? routing.description,
      productId: dto.productId ?? routing.productId,
      bomId: dto.bomId ?? routing.bomId,
      routeTypeId: nextRouteTypeId,
      baseQuantity: dto.baseQuantity ?? routing.baseQuantity,
      isDefault: dto.isDefault ?? routing.isDefault,
      effectiveFrom: dto.effectiveFrom ?? routing.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? routing.effectiveTo,
      updatedBy: userId || null,
    });

    if (dto.operations) {
      await this.operationRepo.delete({ routingId: id });
      const operations = await this.createOperations(id, companyId, dto.operations, userId);
      routing.operations = operations;
      routing.estimatedTotalTime = this.calculateTotalTime(operations);
    }

    await this.routingRepo.save(routing);
    return this.findOne(id, companyId);
  }

  async changeStatus(
    id: string,
    dto: UpdateRoutingStatusDto,
    companyId: string,
    userId?: string,
  ): Promise<ProductionRouting> {
    const routing = await this.findOne(id, companyId);

    const allowed = VALID_TRANSITIONS[routing.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${routing.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    if (dto.status === RoutingStatus.ACTIVE) {
      const activeOps = await this.operationRepo.find({
        where: { routingId: id, isActive: true },
      });
      if (activeOps.length === 0) {
        throw new BadRequestException('Cannot activate a routing without at least one operation');
      }
      await this.validateStoredOperationIO(activeOps, companyId);
      const withDeps = await this.loadOperationIO(activeOps, companyId);
      this.validateOperationDependencies(withDeps);
    }

    routing.status = dto.status;
    routing.updatedBy = userId || null;
    await this.routingRepo.save(routing);
    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const routing = await this.findOne(id, companyId);
    routing.isActive = false;
    routing.updatedBy = userId || null;
    await this.routingRepo.save(routing);
  }

  async addOperation(
    routingId: string,
    dto: CreateRoutingOperationDto,
    companyId: string,
    userId?: string,
  ): Promise<ProductionRouting> {
    const routing = await this.findOne(routingId, companyId);

    if (routing.status !== RoutingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT routings can be edited');
    }

    await this.validateOrgHierarchy([dto], companyId);
    await this.validateOperationIO([dto]);
    await this.validateOperationReferences([dto], companyId);

    const ops = [...(routing.operations || []), this.normalizeOperationIO(dto)];
    this.validateOperationDependencies(ops);

    await this.createOperations(routingId, companyId, [dto], userId);
    routing.estimatedTotalTime = await this.recalculateTotalTime(routingId, companyId);

    return this.findOne(routingId, companyId);
  }

  async updateOperation(
    operationId: string,
    dto: UpdateRoutingOperationDto | Partial<CreateRoutingOperationDto>,
    companyId: string,
    userId?: string,
  ): Promise<ProductionRouting> {
    const operation = await this.operationRepo.findOne({
      where: { id: operationId, isActive: true },
    });
    if (!operation) {
      throw new NotFoundException(`Routing Operation not found with id ${operationId}`);
    }

    const routing = await this.findOne(operation.routingId, companyId);

    if (routing.status !== RoutingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT routings can be edited');
    }

    const merged = {
      departmentId: dto.departmentId ?? operation.departmentId,
      sectionId: dto.sectionId ?? operation.sectionId,
      divisionId: dto.divisionId ?? operation.divisionId,
    };
    await this.validateOrgHierarchy([merged as CreateRoutingOperationDto], companyId);

    if (Array.isArray(dto.inputs) || Array.isArray(dto.outputs)) {
      await this.validateOperationIO([dto as CreateRoutingOperationDto]);
      await this.validateOperationReferences([dto as CreateRoutingOperationDto], companyId);
    }

    const nextOperationId = dto.operationId !== undefined ? dto.operationId : operation.operationId;
    if (nextOperationId) {
      const master = await this.operationMasterRepo.findOne({
        where: { id: nextOperationId, companyId, isActive: true },
      });
      if (!master) {
        throw new BadRequestException(`Operation not found with id ${nextOperationId} for this company`);
      }
    }
    const nextMachineId = dto.machineId !== undefined ? dto.machineId : operation.machineId;
    if (nextMachineId) {
      const machine = await this.machineRepo.findOne({
        where: { id: nextMachineId, companyId, isActive: true },
      });
      if (!machine) {
        throw new BadRequestException(`Machine not found with id ${nextMachineId} for this company`);
      }
    }

    let opCode = dto.operationCode ?? operation.operationCode;
    let opName = dto.operationName ?? operation.operationName;
    const operationMasterChanged = nextOperationId !== operation.operationId;
    if (nextOperationId && (operationMasterChanged || !opCode || !opName)) {
      const master = await this.operationMasterRepo.findOne({
        where: { id: nextOperationId, companyId, isActive: true },
      });
      if (master) {
        opCode = opCode || master.operationCode;
        opName = opName || master.operationName;
      }
    }

    Object.assign(operation, {
      sequenceNo: dto.sequenceNo ?? operation.sequenceNo,
      operationId: nextOperationId,
      operationCode: opCode,
      operationName: opName,
      description: dto.description ?? operation.description,
      divisionId: dto.divisionId ?? operation.divisionId,
      sectionId: dto.sectionId ?? operation.sectionId,
      departmentId: dto.departmentId ?? operation.departmentId,
      setupTimeMinutes: dto.setupTimeMinutes ?? operation.setupTimeMinutes,
      runTimeMinutes: dto.runTimeMinutes ?? operation.runTimeMinutes,
      queueTimeMinutes: dto.queueTimeMinutes ?? operation.queueTimeMinutes,
      waitTimeMinutes: dto.waitTimeMinutes ?? operation.waitTimeMinutes,
      laborRequired: dto.laborRequired ?? operation.laborRequired,
      machineRequired: dto.machineRequired ?? operation.machineRequired,
      machineId: nextMachineId,
      scrapPercentage: dto.scrapPercentage ?? operation.scrapPercentage,
      setupScrapPercentage: dto.setupScrapPercentage ?? operation.setupScrapPercentage,
      status: dto.status ?? operation.status,
      remarks: dto.remarks ?? operation.remarks,
    });

    if (Array.isArray(dto.inputs) || Array.isArray(dto.outputs)) {
      await this.replaceOperationIO(operation, dto as CreateRoutingOperationDto, companyId, userId);
    } else if (dto.inputItemId !== undefined || dto.inputQuantity !== undefined || dto.outputItemId !== undefined || dto.outputQuantity !== undefined || dto.uomId !== undefined) {
      const primaryIn = operation.inputs?.find((i) => i.isPrimary) ?? operation.inputs?.[0];
      const primaryOut = operation.outputs?.find((o) => o.isPrimary) ?? operation.outputs?.[0];
      if (primaryIn) {
        if (dto.inputItemId !== undefined) primaryIn.itemId = dto.inputItemId;
        if (dto.inputQuantity !== undefined) primaryIn.quantity = dto.inputQuantity;
        if (dto.uomId !== undefined) primaryIn.uomId = dto.uomId ?? null;
      }
      if (primaryOut) {
        if (dto.outputItemId !== undefined) primaryOut.itemId = dto.outputItemId;
        if (dto.outputQuantity !== undefined) primaryOut.quantity = dto.outputQuantity;
        if (dto.uomId !== undefined) primaryOut.uomId = dto.uomId ?? null;
      }
      if (primaryIn) await this.inputRepo.save(primaryIn);
      if (primaryOut) await this.outputRepo.save(primaryOut);
    }

    await this.operationRepo.save(operation);
    await this.syncLegacyIO(operation.id);

    routing.estimatedTotalTime = await this.recalculateTotalTime(routing.id, companyId);
    return this.findOne(routing.id, companyId);
  }

  async removeOperation(operationId: string, companyId: string, userId?: string): Promise<ProductionRouting> {
    const operation = await this.operationRepo.findOne({
      where: { id: operationId, isActive: true },
    });
    if (!operation) {
      throw new NotFoundException(`Routing Operation not found with id ${operationId}`);
    }

    const routing = await this.findOne(operation.routingId, companyId);

    operation.isActive = false;
    operation.updatedBy = userId || null;
    await this.operationRepo.save(operation);

    routing.estimatedTotalTime = await this.recalculateTotalTime(routing.id, companyId);
    return this.findOne(routing.id, companyId);
  }

  /**
   * Reorders an operation to the given sequence position and renumbers all
   * operations of the routing compactly (10, 20, 30...).
   */
  async reorderOperation(
    routingId: string,
    operationId: string,
    newSequenceNo: number,
    companyId: string,
    userId?: string,
  ): Promise<ProductionRouting> {
    const routing = await this.findOne(routingId, companyId);

    if (routing.status !== RoutingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT routings can be edited');
    }

    const operations = await this.operationRepo.find({
      where: { routingId, isActive: true },
      order: { sequenceNo: 'ASC' },
    });
    const target = operations.find((o) => o.id === operationId);
    if (!target) {
      throw new NotFoundException(`Routing Operation not found with id ${operationId}`);
    }
    // Stable sort: remove the target, insert it at the position determined by
    // newSequenceNo (as an ordinal index 0..n).
    const ordered = operations.filter((o) => o.id !== operationId);
    const normalized = Math.max(0, Math.min(ordered.length, Math.round(newSequenceNo / 10)));
    ordered.splice(normalized, 0, target);

    for (let idx = 0; idx < ordered.length; idx++) {
      const seq = (idx + 1) * 10;
      if (ordered[idx].sequenceNo !== seq) {
        ordered[idx].sequenceNo = seq;
        ordered[idx].updatedBy = userId || null;
        await this.operationRepo.save(ordered[idx]);
      }
    }

    await this.recalculateTotalTime(routingId, companyId);
    return this.findOne(routingId, companyId);
  }

  /**
   * Duplicates an operation (including its configured inputs/outputs) and
   * inserts the clone immediately after the source. New sequence numbers are
   * renumbered compactly.
   */
  async duplicateOperation(
    routingId: string,
    operationId: string,
    companyId: string,
    userId?: string,
  ): Promise<ProductionRouting> {
    const routing = await this.findOne(routingId, companyId);

    if (routing.status !== RoutingStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT routings can be edited');
    }

    const source = await this.operationRepo.findOne({
      where: { id: operationId, routingId, isActive: true },
      relations: ['inputs', 'outputs'],
    });
    if (!source) {
      throw new NotFoundException(`Routing Operation not found with id ${operationId}`);
    }

    // The clone must carry a unique operation_code: routing_operations has a
    // partial unique index on (routing_id, operation_code) WHERE is_active = true.
    const existingCodes = new Set(
      (await this.operationRepo.find({ select: ['operationCode'], where: { routingId, isActive: true } })).map((o) => o.operationCode),
    );
    const codeBase = (source.operationCode || 'OP').trim();
    let cloneOperationCode = codeBase;
    if (existingCodes.has(cloneOperationCode)) {
      for (let n = 2; n < 10000; n++) {
        const suffix = `-${n}`;
        const candidate = (codeBase.slice(0, 50 - suffix.length).trim() + suffix).toUpperCase();
        if (!existingCodes.has(candidate)) {
          cloneOperationCode = candidate;
          break;
        }
      }
    }

    const clone = this.operationRepo.create({
      companyId,
      routingId,
      sequenceNo: source.sequenceNo + 10,
      operationId: source.operationId,
      operationCode: cloneOperationCode,
      operationName: source.operationName,
      description: source.description,
      divisionId: source.divisionId,
      sectionId: source.sectionId,
      departmentId: source.departmentId,
      setupTimeMinutes: source.setupTimeMinutes,
      runTimeMinutes: source.runTimeMinutes,
      queueTimeMinutes: source.queueTimeMinutes,
      waitTimeMinutes: source.waitTimeMinutes,
      laborRequired: source.laborRequired,
      machineRequired: source.machineRequired,
      machineId: source.machineId,
      inputItemId: source.inputItemId,
      outputItemId: source.outputItemId,
      inputQuantity: source.inputQuantity,
      outputQuantity: source.outputQuantity,
      uomId: source.uomId,
      scrapPercentage: source.scrapPercentage,
      setupScrapPercentage: source.setupScrapPercentage,
      status: source.status,
      remarks: source.remarks,
      createdBy: userId || null,
    });
    const saved = await this.operationRepo.save(clone);

    const inputs = (source.inputs || [])
      .sort((a, b) => Number(a.lineNumber) - Number(b.lineNumber))
      .map((i) => ({
        companyId,
        routingOperationId: saved.id,
        itemId: i.itemId,
        quantity: i.quantity,
        uomId: i.uomId,
        sourceWarehouseId: i.sourceWarehouseId,
        scrapBasis: i.scrapBasis,
        isPrimary: i.isPrimary,
        lineNumber: i.lineNumber,
        createdBy: userId || null,
      }));
    if (inputs.length) {
      await this.inputRepo.save(this.inputRepo.create(inputs as RoutingOperationInput[]));
    }
    const outputs = (source.outputs || [])
      .sort((a, b) => Number(a.lineNumber) - Number(b.lineNumber))
      .map((o) => ({
        companyId,
        routingOperationId: saved.id,
        itemId: o.itemId,
        quantity: o.quantity,
        uomId: o.uomId,
        outputType: o.outputType,
        yieldPercentage: o.yieldPercentage,
        isPrimary: o.isPrimary,
        lineNumber: o.lineNumber,
        createdBy: userId || null,
      }));
    if (outputs.length) {
      await this.outputRepo.save(this.outputRepo.create(outputs as RoutingOperationOutput[]));
    }

    await this.syncLegacyIO(saved.id);
    await this.recalculateTotalTime(routingId, companyId);
    return this.findOne(routingId, companyId);
  }

  async recalculateTotalTime(routingId: string, companyId: string): Promise<number> {
    const routing = await this.findOne(routingId, companyId);
    const operations = await this.operationRepo.find({
      where: { routingId, isActive: true },
    });
    const totalTime = this.calculateTotalTime(operations);
    routing.estimatedTotalTime = totalTime;
    await this.routingRepo.save(routing);
    return totalTime;
  }

  private async generateRoutingCode(companyId: string): Promise<string> {
    const last = await this.routingRepo.findOne({
      where: { companyId },
      order: { routingCode: 'DESC' },
    });

    if (last && last.routingCode) {
      const match = last.routingCode.match(/RTG-(\d+)/);
      if (match) {
        const next = parseInt(match[1], 10) + 1;
        return `RTG-${String(next).padStart(3, '0')}`;
      }
    }
    return 'RTG-001';
  }

  /**
   * Normalizes an operation DTO so that at least one input and one output always
   * exist. When junction arrays are absent the legacy inputItemId/outputItemId
   * single fields become the primary input/output rows.
   */
  private normalizeOperationIO(op: any): any {
    let inputs: RoutingOperationInputDto[] = Array.isArray(op.inputs) ? [...op.inputs] : [];
    let outputs: RoutingOperationOutputDto[] = Array.isArray(op.outputs) ? [...op.outputs] : [];

    const hasLegacyInput = !!op.inputItemId;
    const hasLegacyOutput = !!op.outputItemId;

    if (inputs.length === 0 && hasLegacyInput) {
      inputs = [
        {
          itemId: op.inputItemId,
          quantity: op.inputQuantity ?? 1,
          uomId: op.uomId ?? undefined,
          scrapBasis: RoutingInputScrapBasis.WITH_SCRAP,
          isPrimary: true,
          lineNumber: 10,
        },
      ];
    }
    if (outputs.length === 0 && hasLegacyOutput) {
      outputs = [
        {
          itemId: op.outputItemId,
          quantity: op.outputQuantity ?? 1,
          uomId: op.uomId ?? undefined,
          outputType: RoutingOutputType.MAIN,
          yieldPercentage: 100,
          isPrimary: true,
          lineNumber: 10,
        },
      ];
    }

    if (!inputs.some((i) => i.isPrimary)) {
      inputs[0] = { ...inputs[0], isPrimary: true };
    }
    if (!outputs.some((o) => o.isPrimary)) {
      outputs[0] = { ...outputs[0], isPrimary: true };
    }

    return { ...op, inputs, outputs };
  }

  private async createOperations(
    routingId: string,
    companyId: string,
    operationDtos: CreateRoutingOperationDto[] | any[],
    userId?: string,
  ): Promise<RoutingOperation[]> {
    const operations: RoutingOperation[] = [];
    for (const rawOpDto of operationDtos) {
      const opDto = this.normalizeOperationIO(rawOpDto);
      const resolved = await this.resolveOperationIdentity(opDto, companyId);
      const operation = this.operationRepo.create({
        companyId,
        routingId,
        sequenceNo: opDto.sequenceNo,
        operationId: resolved.operationId,
        operationCode: resolved.operationCode,
        operationName: resolved.operationName,
        description: opDto.description || null,
        divisionId: opDto.divisionId || null,
        sectionId: opDto.sectionId || null,
        departmentId: opDto.departmentId || null,
        setupTimeMinutes: opDto.setupTimeMinutes || 0,
        runTimeMinutes: opDto.runTimeMinutes || 0,
        queueTimeMinutes: opDto.queueTimeMinutes || 0,
        waitTimeMinutes: opDto.waitTimeMinutes || 0,
        laborRequired: opDto.laborRequired ?? true,
        machineRequired: opDto.machineRequired ?? false,
        machineId: opDto.machineId || null,
        inputItemId: opDto.inputs[0].itemId,
        outputItemId: opDto.outputs[0].itemId,
        inputQuantity: opDto.inputs[0].quantity ?? 0,
        outputQuantity: opDto.outputs[0].quantity ?? 0,
        uomId: opDto.inputs[0].uomId ?? opDto.outputs[0].uomId ?? null,
        scrapPercentage: opDto.scrapPercentage || 0,
        setupScrapPercentage: opDto.setupScrapPercentage || 0,
        status: opDto.status || 'ACTIVE',
        remarks: opDto.remarks || null,
        createdBy: userId || null,
      });
      const saved = await this.operationRepo.save(operation);

      const inputs = opDto.inputs.map((i: RoutingOperationInputDto, idx: number) =>
        this.inputRepo.create({
          companyId: saved.companyId,
          routingOperationId: saved.id,
          itemId: i.itemId,
          quantity: i.quantity ?? 0,
          uomId: i.uomId ?? null,
          sourceWarehouseId: i.sourceWarehouseId ?? null,
          scrapBasis: i.scrapBasis ?? RoutingInputScrapBasis.WITH_SCRAP,
          isPrimary: i.isPrimary ?? (idx === 0),
          lineNumber: i.lineNumber ?? (idx + 1) * 10,
          createdBy: userId || null,
        }),
      );
      const outputs = opDto.outputs.map((o: RoutingOperationOutputDto, idx: number) =>
        this.outputRepo.create({
          companyId: saved.companyId,
          routingOperationId: saved.id,
          itemId: o.itemId,
          quantity: o.quantity ?? 0,
          uomId: o.uomId ?? null,
          outputType: o.outputType ?? RoutingOutputType.MAIN,
          yieldPercentage: o.yieldPercentage ?? 100,
          isPrimary: o.isPrimary ?? (idx === 0),
          lineNumber: o.lineNumber ?? (idx + 1) * 10,
          createdBy: userId || null,
        }),
      );
      if (inputs.length) await this.inputRepo.save(inputs);
      if (outputs.length) await this.outputRepo.save(outputs);

      await this.syncLegacyIO(saved.id);
      operations.push(await this.operationRepo.findOne({ where: { id: saved.id } }) as RoutingOperation);
    }
    return operations;
  }

  /**
   * Replaces an operation's junction rows and resyncs the legacy single-item
   * columns to the primary input/output (backward compatibility).
   */
  private async replaceOperationIO(
    operation: RoutingOperation,
    opDto: CreateRoutingOperationDto,
    companyId: string,
    userId?: string,
  ): Promise<void> {
    const normalized = this.normalizeOperationIO(opDto);

    if (Array.isArray(opDto.inputs)) {
      await this.inputRepo.delete({ routingOperationId: operation.id });
      const inputs = normalized.inputs.map((i: RoutingOperationInputDto, idx: number) =>
        this.inputRepo.create({
          companyId,
          routingOperationId: operation.id,
          itemId: i.itemId,
          quantity: i.quantity ?? 0,
          uomId: i.uomId ?? null,
          sourceWarehouseId: i.sourceWarehouseId ?? null,
          scrapBasis: i.scrapBasis ?? RoutingInputScrapBasis.WITH_SCRAP,
          isPrimary: i.isPrimary ?? (idx === 0),
          lineNumber: i.lineNumber ?? (idx + 1) * 10,
          createdBy: userId || null,
        }),
      );
      if (inputs.length) await this.inputRepo.save(inputs);
    }

    if (Array.isArray(opDto.outputs)) {
      await this.outputRepo.delete({ routingOperationId: operation.id });
      const outputs = normalized.outputs.map((o: RoutingOperationOutputDto, idx: number) =>
        this.outputRepo.create({
          companyId,
          routingOperationId: operation.id,
          itemId: o.itemId,
          quantity: o.quantity ?? 0,
          uomId: o.uomId ?? null,
          outputType: o.outputType ?? RoutingOutputType.MAIN,
          yieldPercentage: o.yieldPercentage ?? 100,
          isPrimary: o.isPrimary ?? (idx === 0),
          lineNumber: o.lineNumber ?? (idx + 1) * 10,
          createdBy: userId || null,
        }),
      );
      if (outputs.length) await this.outputRepo.save(outputs);
    }

    await this.syncLegacyIO(operation.id);
  }

  /**
   * Syncs legacy input_item_id/output_item_id + quantity/uom columns from the
   * primary junction rows so older clients and reports keep working.
   */
  private async syncLegacyIO(operationId: string): Promise<void> {
    const op = await this.operationRepo.findOne({
      where: { id: operationId },
      relations: ['inputs', 'outputs'],
    });
    if (!op) return;

    const primaryIn = (op.inputs || []).find((i) => i.isPrimary) ?? (op.inputs || [])[0];
    const primaryOut = (op.outputs || []).find((o) => o.isPrimary) ?? (op.outputs || [])[0];

    const patch: any = {};
    if (primaryIn) {
      patch.inputItemId = primaryIn.itemId;
      patch.inputQuantity = primaryIn.quantity;
    }
    if (primaryOut) {
      patch.outputItemId = primaryOut.itemId;
      patch.outputQuantity = primaryOut.quantity;
    }
    if (primaryIn || primaryOut) {
      patch.uomId = primaryIn?.uomId ?? primaryOut?.uomId ?? op.uomId;
      await this.operationRepo.update(operationId, patch);
    }
  }

  private calculateTotalTime(operations: RoutingOperation[]): number {
    let totalTime = 0;
    for (const operation of operations) {
      totalTime +=
        this.toNum(operation.setupTimeMinutes) +
        this.toNum(operation.runTimeMinutes) +
        this.toNum(operation.queueTimeMinutes) +
        this.toNum(operation.waitTimeMinutes);
    }
    return Math.round(totalTime * 10000) / 10000;
  }

  private toNum(val: any): number {
    if (val === null || val === undefined) return 0;
    const n = typeof val === 'string' ? parseFloat(val) : Number(val);
    return isNaN(n) ? 0 : n;
  }

  private async validateProductExists(productId: string, companyId: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id: productId, companyId } });
    if (!item) {
      throw new BadRequestException(`Product item not found with id ${productId} for this company`);
    }
  }

  private async validateRouteTypeExists(routeTypeId: string, companyId: string): Promise<void> {
    const rt = await this.routeTypeRepo.findOne({
      where: { id: routeTypeId, companyId, status: RouteTypeStatus.ACTIVE },
    });
    if (!rt) {
      throw new BadRequestException(`Route type not found or inactive with id ${routeTypeId} for this company`);
    }
  }

  private async validateBomExists(bomId: string, companyId: string): Promise<void> {
    const bom = await this.bomRepo.findOne({ where: { id: bomId, companyId, isActive: true } });
    if (!bom) {
      throw new BadRequestException(`Bill of Materials not found with id ${bomId} for this company`);
    }
  }

  private async validateBomBelongsToProduct(bomId: string, productId: string): Promise<void> {
    const bom = await this.bomRepo.findOne({ where: { id: bomId, isActive: true } });
    if (bom && bom.productId !== productId) {
      throw new BadRequestException(
        `BOM ${bom.bomCode} does not belong to product ${productId}. The BOM must be defined for the same product.`,
      );
    }
  }

  private async clearDefaultRouting(productId: string, companyId: string, excludeRoutingId?: string): Promise<void> {
    const defaults = await this.routingRepo.find({
      where: { productId, companyId, isDefault: true, isActive: true },
    });
    for (const routing of defaults) {
      if (routing.id !== excludeRoutingId) {
        routing.isDefault = false;
        await this.routingRepo.save(routing);
      }
    }
  }

  private async validateOrgHierarchy(
    operations: CreateRoutingOperationDto[] | any[],
    companyId: string,
  ): Promise<void> {
    for (const op of operations) {
      if (!op.departmentId) {
        continue;
      }

      const department = await this.departmentRepo.findOne({
        where: { id: op.departmentId, companyId },
      });
      if (!department) {
        throw new BadRequestException(`Department not found with id ${op.departmentId} for this company`);
      }

      if (department.sectionId) {
        if (op.sectionId && op.sectionId !== department.sectionId) {
          throw new BadRequestException(
            `Section ${op.sectionId} does not match the section of department ${department.departmentCode}`,
          );
        }

        const section = await this.sectionRepo.findOne({
          where: { id: department.sectionId, companyId },
        });
        if (!section) {
          throw new BadRequestException(`Section not found with id ${department.sectionId} for this company`);
        }

        if (section.divisionId) {
          if (op.divisionId && op.divisionId !== section.divisionId) {
            throw new BadRequestException(
              `Division ${op.divisionId} does not match the division of section ${section.sectionCode}`,
            );
          }
        }
      }
    }
  }

  /**
   * Requires every operation to have at least one configured input and one
   * configured output (exact item IDs). Prevents routes without a defined
   * material transformation.
   */
  private async validateOperationIO(operations: CreateRoutingOperationDto[] | any[]): Promise<void> {
    for (const op of operations) {
      const hasInput = Array.isArray(op.inputs)
        ? op.inputs.some((i: any) => i?.itemId)
        : !!op.inputItemId;
      const hasOutput = Array.isArray(op.outputs)
        ? op.outputs.some((o: any) => o?.itemId)
        : !!op.outputItemId;
      if (!hasInput) {
        throw new BadRequestException(
          `Operation '${op.operationCode || op.sequenceNo}' requires at least one input item`,
        );
      }
      if (!hasOutput) {
        throw new BadRequestException(
          `Operation '${op.operationCode || op.sequenceNo}' requires at least one output item`,
        );
      }
    }
  }

  /** Same as validateOperationIO but for stored operations (activation check). */
  private async validateStoredOperationIO(operations: RoutingOperation[], companyId: string): Promise<void> {
    for (const op of operations) {
      const inputCount = await this.inputRepo.count({ where: { routingOperationId: op.id, isActive: true } });
      const outputCount = await this.outputRepo.count({ where: { routingOperationId: op.id, isActive: true } });
      const hasLegacyInput = !!op.inputItemId;
      const hasLegacyOutput = !!op.outputItemId;
      if (inputCount === 0 && !hasLegacyInput) {
        throw new BadRequestException(`Operation '${op.operationCode}' requires at least one input item`);
      }
      if (outputCount === 0 && !hasLegacyOutput) {
        throw new BadRequestException(`Operation '${op.operationCode}' requires at least one output item`);
      }
    }
  }

  /**
   * Loads junction rows for stored operations so dependency (cycle) checking can
   * run during activation.
   */
  private async loadOperationIO(operations: RoutingOperation[], companyId: string): Promise<RoutingOperation[]> {
    const withIO: RoutingOperation[] = [];
    for (const op of operations) {
      const inputs = await this.inputRepo.find({
        where: { routingOperationId: op.id, isActive: true },
        relations: ['item'],
      });
      const outputs = await this.outputRepo.find({
        where: { routingOperationId: op.id, isActive: true },
        relations: ['item'],
      });
      withIO.push({ ...op,
        inputs: inputs as any,
        outputs: outputs as any,
      } as RoutingOperation);
    }
    return withIO;
  }

  /**
   * Validates the routing graph: an ordered route must never consume an item
   * that is produced by a LATER operation (forward reference → circular flow).
   */
  private validateOperationDependencies(operations: any[]): void {
    const ops = [...operations].sort((a, b) => {
      const seq = (o: any) => (typeof o.sequenceNo === 'number' ? o.sequenceNo : parseInt(o.sequenceNo, 10) || 0);
      return seq(a) - seq(b);
    });
    const producingByItem = new Map<string, any>();
    for (const op of ops) {
      for (const out of op.outputs || []) {
        if (out?.itemId && !producingByItem.has(out.itemId)) {
          producingByItem.set(out.itemId, op);
        }
      }
    }
    const seq = (o: any) => (typeof o.sequenceNo === 'number' ? o.sequenceNo : parseInt(o.sequenceNo, 10) || 0);
    for (const op of ops) {
      for (const inp of op.inputs || []) {
        if (!inp?.itemId) continue;
        const producer = producingByItem.get(inp.itemId);
        if (producer && seq(producer) > seq(op)) {
          throw new BadRequestException(
            `Operation '${op.operationCode}' consumes item that is only produced by a later operation '${producer.operationCode}' — this would create a circular flow.`,
          );
        }
      }
    }
  }

  private async validateOperationReferences(
    operations: CreateRoutingOperationDto[] | any[],
    companyId: string,
  ): Promise<void> {
    const normalized = operations.map((op) => this.normalizeOperationIO(op));

    const itemIds = [
      ...new Set(
        normalized
          .flatMap((op) => [
            ...(op.inputs || []).map((i: any) => i.itemId),
            ...(op.outputs || []).map((o: any) => o.itemId),
          ])
          .filter((id): id is string => !!id),
      ),
    ];
    if (itemIds.length > 0) {
      const items = await this.itemRepo.find({ where: { id: In(itemIds), companyId } });
      if (items.length !== itemIds.length) {
        const found = new Set(items.map((i) => i.id));
        const missing = itemIds.filter((id) => !found.has(id));
        throw new BadRequestException(`Operation items not found for this company: ${missing.join(', ')}`);
      }
    }

    const uomIds = [
      ...new Set(normalized.flatMap((op) => [
        ...(op.inputs || []).map((i: any) => i.uomId),
        ...(op.outputs || []).map((o: any) => o.uomId),
      ]).filter((id): id is string => !!id)),
    ];
    if (uomIds.length > 0) {
      const uoms = await this.uomRepo.find({ where: { id: In(uomIds) } });
      if (uoms.length !== uomIds.length) {
        const found = new Set(uoms.map((u) => u.id));
        const missing = uomIds.filter((id) => !found.has(id));
        throw new BadRequestException(`UOMs not found: ${missing.join(', ')}`);
      }
    }

    const warehouseIds = [
      ...new Set(normalized.flatMap((op: any) => (op.inputs || []).map((i: any) => i.sourceWarehouseId).filter((id: any): id is string => !!id))),
    ];
    if (warehouseIds.length > 0) {
      const warehouses = await this.warehouseRepo.find({ where: { id: In(warehouseIds), companyId, isActive: true } });
      if (warehouses.length !== warehouseIds.length) {
        const found = new Set(warehouses.map((w) => w.id));
        const missing = warehouseIds.filter((id) => !found.has(id));
        throw new BadRequestException(`Source warehouses not found for this company: ${missing.join(', ')}`);
      }
    }

    const operationIds = [...new Set(normalized.map((op) => op.operationId).filter((id): id is string => !!id))];
    if (operationIds.length > 0) {
      const ops = await this.operationMasterRepo.find({ where: { id: In(operationIds), companyId, isActive: true } });
      if (ops.length !== operationIds.length) {
        const found = new Set(ops.map((o) => o.id));
        const missing = operationIds.filter((id) => !found.has(id));
        throw new BadRequestException(`Operations not found for this company: ${missing.join(', ')}`);
      }
    }

    const machineIds = [...new Set(normalized.map((op) => op.machineId).filter((id): id is string => !!id))];
    if (machineIds.length > 0) {
      const machines = await this.machineRepo.find({ where: { id: In(machineIds), companyId, isActive: true } });
      if (machines.length !== machineIds.length) {
        const found = new Set(machines.map((m) => m.id));
        const missing = machineIds.filter((id) => !found.has(id));
        throw new BadRequestException(`Machines not found for this company: ${missing.join(', ')}`);
      }
    }
  }

  /**
   * Returns the effective Operation Master identity for a routing step.
   */
  private async resolveOperationIdentity(
    op: CreateRoutingOperationDto | any,
    companyId: string,
  ): Promise<{ operationId: string | null; operationCode: string; operationName: string }> {
    const operationId = op.operationId || null;
    let operationCode = op.operationCode || '';
    let operationName = op.operationName || '';

    if (operationId && !operationCode && !operationName) {
      const master = await this.operationMasterRepo.findOne({
        where: { id: operationId, companyId, isActive: true },
      });
      if (master) {
        operationCode = master.operationCode;
        operationName = master.operationName;
      }
    }

    return { operationId, operationCode, operationName };
  }

  private sortOperations(routing: ProductionRouting): void {
    if (routing.operations) {
      routing.operations.sort((a, b) => a.sequenceNo - b.sequenceNo);
    }
  }

  // ── Production Flow graph (derived from DB routing/operation/item relations) ──

  /**
   * Builds a production-flow graph for an item purely from the ACTIVE routing's
   * configured inputs/outputs (no hard-coded names or item relationships).
   *
   * Returns the ordered operation stages plus branching information so the
   * frontend can render one-to-many (divergent), many-to-one (convergent) and
   * purchased/raw-material intake flows.
   */
  async getRouteFlowGraph(itemId: string, companyId: string): Promise<{
    routing: ProductionRouting | null;
    stages: Array<{
      sequenceNo: number;
      operationCode: string;
      operationName: string;
      departmentName: string | null;
      inputs: Array<{
        itemId: string;
        quantity: number;
        uomId: string | null;
        sourceWarehouseId: string | null;
        scrapBasis: RoutingInputScrapBasis;
        isPrimary: boolean;
        lineNumber: number;
        itemCode: string;
        itemName: string;
        sourceStore: string | null;
      }>;
      outputs: Array<{
        itemId: string;
        quantity: number;
        uomId: string | null;
        outputType: RoutingOutputType;
        yieldPercentage: number;
        isPrimary: boolean;
        lineNumber: number;
        itemCode: string;
        itemName: string;
      }>;
      isLeafStep: boolean;
      isFinalStep: boolean;
    }>;
    sourceNodeIds: string[];
    branchNodeIds: string[];
    convergenceNodeIds: string[];
  }> {
    const routing = await this.findByProduct(itemId, companyId);
    if (!routing) {
      return { routing: null, stages: [], sourceNodeIds: [], branchNodeIds: [], convergenceNodeIds: [] };
    }

    const ops = [...(routing.operations || [])].sort((a, b) => a.sequenceNo - b.sequenceNo);
    const stages = ops.map((op, idx) => {
      const inputs = (op.inputs || []).map((i) => ({
        itemId: i.itemId,
        quantity: Number(i.quantity || 0),
        uomId: i.uomId,
        sourceWarehouseId: i.sourceWarehouseId,
        scrapBasis: i.scrapBasis,
        isPrimary: i.isPrimary,
        lineNumber: i.lineNumber,
        itemCode: i.item?.itemCode ?? '',
        itemName: i.item?.name ?? '',
        sourceStore: i.sourceWarehouse?.name ?? null,
      }));
      const outputs = (op.outputs || []).map((o) => ({
        itemId: o.itemId,
        quantity: Number(o.quantity || 0),
        uomId: o.uomId,
        outputType: o.outputType,
        yieldPercentage: Number(o.yieldPercentage ?? 100),
        isPrimary: o.isPrimary,
        lineNumber: o.lineNumber,
        itemCode: o.item?.itemCode ?? '',
        itemName: o.item?.name ?? '',
      }));
      return {
        sequenceNo: op.sequenceNo,
        operationCode: op.operationCode,
        operationName: op.operationName,
        departmentName: op.department?.name ?? null,
        inputs,
        outputs,
        isLeafStep: idx === 0,
        isFinalStep: idx === ops.length - 1,
      };
    });

    // Nodes that are never produced by any operation in this routing – they
    // enter from outside (raw material, purchased item, or prior routing).
    const produced = new Set<string>();
    for (const op of ops) for (const o of op.outputs || []) produced.add(o.itemId);
    const sourceNodeIds = [
      ...new Set(
        ops.flatMap((op) => (op.inputs || []).map((i) => i.itemId)).filter((id) => !produced.has(id)),
      ),
    ];

    // Branches: an operation produces multiple outputs (one-to-many).
    const branchNodeIds = [
      ...new Set(ops.filter((op) => (op.outputs || []).length > 1).flatMap((op) => (op.outputs || []).map((o) => o.itemId))),
    ];
    // Convergence: an operation consumes multiple inputs (many-to-one).
    const convergenceNodeIds = ops
      .filter((op) => (op.inputs || []).length > 1)
      .map((op) => (op.outputs || [])[0]?.itemId)
      .filter((id): id is string => !!id);

    return { routing, stages, sourceNodeIds, branchNodeIds, convergenceNodeIds };
  }
}