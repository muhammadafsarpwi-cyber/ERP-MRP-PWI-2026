import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ProductionRouting, RoutingStatus, RoutingOperation } from '../entities';
import { CreateRoutingDto, UpdateRoutingDto, UpdateRoutingStatusDto, CreateRoutingOperationDto, UpdateRoutingOperationDto } from '../dto';
import { Item } from '../../item/entities/item.entity';
import { BillOfMaterials } from '../../bom/entities/bill-of-materials.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { Uom } from '../../item/entities/uom.entity';

const VALID_TRANSITIONS: Record<string, string[]> = {
  [RoutingStatus.DRAFT]: [RoutingStatus.ACTIVE],
  [RoutingStatus.ACTIVE]: [RoutingStatus.OBSOLETE],
  [RoutingStatus.OBSOLETE]: [],
};

@Injectable()
export class ProductionRoutingService {
  private readonly logger = new Logger(ProductionRoutingService.name);

  constructor(
    @InjectRepository(ProductionRouting)
    private readonly routingRepo: Repository<ProductionRouting>,
    @InjectRepository(RoutingOperation)
    private readonly operationRepo: Repository<RoutingOperation>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
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
  ) {}

  async findAll(companyId: string): Promise<ProductionRouting[]> {
    return this.routingRepo.find({
      where: { companyId, isActive: true },
      relations: [
        'product',
        'bom',
        'operations',
        'operations.division',
        'operations.section',
        'operations.department',
        'operations.inputItem',
        'operations.outputItem',
        'operations.uom',
      ],
      order: { routingCode: 'ASC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<ProductionRouting> {
    const routing = await this.routingRepo.findOne({
      where: { id, companyId, isActive: true },
      relations: [
        'product',
        'bom',
        'operations',
        'operations.division',
        'operations.section',
        'operations.department',
        'operations.inputItem',
        'operations.outputItem',
        'operations.uom',
      ],
    });
    if (!routing) {
      throw new NotFoundException(`Production Routing not found with id ${id}`);
    }
    return routing;
  }

  async findByProduct(productId: string, companyId: string): Promise<ProductionRouting | null> {
    return this.routingRepo.findOne({
      where: { productId, companyId, status: RoutingStatus.ACTIVE, isActive: true },
      relations: [
        'product',
        'bom',
        'operations',
        'operations.division',
        'operations.section',
        'operations.department',
        'operations.inputItem',
        'operations.outputItem',
        'operations.uom',
      ],
    });
  }

  async create(dto: CreateRoutingDto, userId?: string): Promise<ProductionRouting> {
    const companyId = dto.companyId!;
    await this.validateProductExists(dto.productId, companyId);
    if (dto.bomId) {
      await this.validateBomExists(dto.bomId, companyId);
      await this.validateBomBelongsToProduct(dto.bomId, dto.productId);
    }

    if (dto.operations && dto.operations.length > 0) {
      await this.validateOrgHierarchy(dto.operations, companyId);
      await this.validateOperationReferences(dto.operations, companyId);
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

    if (dto.productId || dto.bomId) {
      const targetBom = dto.bomId ?? routing.bomId;
      const targetProduct = dto.productId ?? routing.productId;
      if (targetBom) {
        await this.validateBomBelongsToProduct(targetBom, targetProduct);
      }
    }

    if (dto.operations) {
      await this.validateOrgHierarchy(dto.operations, companyId);
      await this.validateOperationReferences(dto.operations, companyId);
    }

    if (dto.isDefault) {
      await this.clearDefaultRouting(dto.productId ?? routing.productId, companyId, id);
    }

    Object.assign(routing, {
      name: dto.name ?? routing.name,
      description: dto.description ?? routing.description,
      productId: dto.productId ?? routing.productId,
      bomId: dto.bomId ?? routing.bomId,
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
      const operationCount = await this.operationRepo.count({
        where: { routingId: id, isActive: true },
      });
      if (operationCount === 0) {
        throw new BadRequestException('Cannot activate a routing without at least one operation');
      }
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
    await this.validateOperationReferences([dto], companyId);

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

    Object.assign(operation, {
      sequenceNo: dto.sequenceNo ?? operation.sequenceNo,
      operationCode: dto.operationCode ?? operation.operationCode,
      operationName: dto.operationName ?? operation.operationName,
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
      inputItemId: dto.inputItemId ?? operation.inputItemId,
      outputItemId: dto.outputItemId ?? operation.outputItemId,
      inputQuantity: dto.inputQuantity ?? operation.inputQuantity,
      outputQuantity: dto.outputQuantity ?? operation.outputQuantity,
      uomId: dto.uomId ?? operation.uomId,
      scrapPercentage: dto.scrapPercentage ?? operation.scrapPercentage,
      setupScrapPercentage: dto.setupScrapPercentage ?? operation.setupScrapPercentage,
      status: dto.status ?? operation.status,
      remarks: dto.remarks ?? operation.remarks,
    });

    await this.operationRepo.save(operation);

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

  private async createOperations(
    routingId: string,
    companyId: string,
    operationDtos: CreateRoutingOperationDto[] | any[],
    userId?: string,
  ): Promise<RoutingOperation[]> {
    const operations: RoutingOperation[] = [];
    for (const opDto of operationDtos) {
      const operation = this.operationRepo.create({
        companyId,
        routingId,
        sequenceNo: opDto.sequenceNo,
        operationCode: opDto.operationCode,
        operationName: opDto.operationName,
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
        inputItemId: opDto.inputItemId || null,
        outputItemId: opDto.outputItemId || null,
        inputQuantity: opDto.inputQuantity || 0,
        outputQuantity: opDto.outputQuantity || 0,
        uomId: opDto.uomId || null,
        scrapPercentage: opDto.scrapPercentage || 0,
        setupScrapPercentage: opDto.setupScrapPercentage || 0,
        status: opDto.status || 'ACTIVE',
        remarks: opDto.remarks || null,
        createdBy: userId || null,
      });
      const saved = await this.operationRepo.save(operation);
      operations.push(saved);
    }
    return operations;
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

  private toNumber(val: any): number {
    return this.toNum(val);
  }

  private async validateProductExists(productId: string, companyId: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id: productId, companyId } });
    if (!item) {
      throw new BadRequestException(`Product item not found with id ${productId} for this company`);
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

  private async validateOperationReferences(
    operations: CreateRoutingOperationDto[] | any[],
    companyId: string,
  ): Promise<void> {
    const itemIds = [
      ...new Set(
        operations
          .flatMap((op) => [op.inputItemId, op.outputItemId])
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

    const uomIds = [...new Set(operations.map((op) => op.uomId).filter((id): id is string => !!id))];
    if (uomIds.length > 0) {
      const uoms = await this.uomRepo.find({ where: { id: In(uomIds) } });
      if (uoms.length !== uomIds.length) {
        const found = new Set(uoms.map((u) => u.id));
        const missing = uomIds.filter((id) => !found.has(id));
        throw new BadRequestException(`UOMs not found: ${missing.join(', ')}`);
      }
    }
  }
}
