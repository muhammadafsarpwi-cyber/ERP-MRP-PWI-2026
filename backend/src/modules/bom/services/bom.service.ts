import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BillOfMaterials, BomLine, BomStatus } from '../entities';
import { CreateBomDto, UpdateBomDto, UpdateBomStatusDto, CreateBomLineDto } from '../dto';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';

const VALID_TRANSITIONS: Record<string, string[]> = {
  [BomStatus.DRAFT]: [BomStatus.ACTIVE],
  [BomStatus.ACTIVE]: [BomStatus.OBSOLETE],
  [BomStatus.OBSOLETE]: [],
};

@Injectable()
export class BomService {
  private readonly logger = new Logger(BomService.name);

  constructor(
    @InjectRepository(BillOfMaterials)
    private readonly bomRepo: Repository<BillOfMaterials>,
    @InjectRepository(BomLine)
    private readonly lineRepo: Repository<BomLine>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
  ) {}

  async findAll(companyId: string): Promise<BillOfMaterials[]> {
    return this.bomRepo.find({
      where: { companyId, isActive: true },
      relations: ['lines', 'lines.item', 'lines.uom', 'product'],
      order: { bomCode: 'ASC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<BillOfMaterials> {
    const bom = await this.bomRepo.findOne({
      where: { id, companyId, isActive: true },
      relations: ['lines', 'lines.item', 'lines.uom', 'product'],
    });
    if (!bom) {
      throw new NotFoundException(`Bill of Materials not found with id ${id}`);
    }
    return bom;
  }

  async findByProduct(productId: string, companyId: string): Promise<BillOfMaterials | null> {
    return this.bomRepo.findOne({
      where: { productId, companyId, status: BomStatus.ACTIVE, isActive: true },
      relations: ['lines', 'lines.item', 'lines.uom', 'product'],
    });
  }

  async create(dto: CreateBomDto, userId?: string): Promise<BillOfMaterials> {
    const companyId = dto.companyId!;
    await this.validateProductExists(dto.productId, companyId);

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('A BOM must contain at least one component line');
    }

    await this.validateNoActiveBomForProduct(dto.productId, companyId);
    await this.validateComponentItems(dto.lines, companyId);
    await this.validateNoSelfReference(dto.productId, dto.lines);
    await this.validateNoCircularReference(dto.productId, dto.lines, companyId);

    const bomCode = dto.bomCode || await this.generateBomCode(companyId);

    const bom = this.bomRepo.create({
      companyId,
      bomCode,
      name: dto.name,
      description: dto.description || null,
      status: BomStatus.DRAFT,
      baseQuantity: dto.baseQuantity || 1,
      productId: dto.productId,
      effectiveFrom: dto.effectiveFrom || null,
      effectiveTo: dto.effectiveTo || null,
      estimatedCost: 0,
      createdBy: userId || null,
    });

    const savedBom = await this.bomRepo.save(bom);

    const lines = await this.createLines(savedBom.id, dto.lines, userId);
    savedBom.lines = lines;

    savedBom.estimatedCost = await this.calculateEstimatedCost(lines);
    await this.bomRepo.save(savedBom);

    return this.findOne(savedBom.id, companyId);
  }

  async update(id: string, dto: UpdateBomDto, companyId: string, userId?: string): Promise<BillOfMaterials> {
    const bom = await this.findOne(id, companyId);

    if (bom.status !== BomStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT BOMs can be edited');
    }

    if (dto.productId && dto.productId !== bom.productId) {
      await this.validateProductExists(dto.productId, companyId);
      await this.validateNoActiveBomForProduct(dto.productId, companyId);
      await this.validateNoSelfReference(dto.productId, dto.lines || []);
      await this.validateNoCircularReference(dto.productId, dto.lines || [], companyId);
    }

    if (dto.lines && dto.lines.length === 0) {
      throw new BadRequestException('A BOM must contain at least one component line');
    }

    if (dto.lines) {
      await this.validateComponentItems(dto.lines, companyId);
    }

    Object.assign(bom, {
      name: dto.name ?? bom.name,
      description: dto.description ?? bom.description,
      baseQuantity: dto.baseQuantity ?? bom.baseQuantity,
      productId: dto.productId ?? bom.productId,
      effectiveFrom: dto.effectiveFrom ?? bom.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? bom.effectiveTo,
      updatedBy: userId || null,
    });

    if (dto.lines) {
      await this.lineRepo.delete({ bomId: id });
      const lines = await this.createLines(id, dto.lines, userId);
      bom.lines = lines;
      bom.estimatedCost = await this.calculateEstimatedCost(lines);
    }

    await this.bomRepo.save(bom);
    return this.findOne(id, companyId);
  }

  async changeStatus(id: string, dto: UpdateBomStatusDto, companyId: string, userId?: string): Promise<BillOfMaterials> {
    const bom = await this.findOne(id, companyId);

    const allowed = VALID_TRANSITIONS[bom.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${bom.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    if (dto.status === BomStatus.ACTIVE) {
      const existingActive = await this.bomRepo.findOne({
        where: {
          productId: bom.productId,
          companyId,
          status: BomStatus.ACTIVE,
          isActive: true,
          id: In([bom.id]) ? undefined : undefined,
        },
      });
      if (existingActive && existingActive.id !== bom.id) {
        throw new BadRequestException(
          'Only one ACTIVE BOM may exist per product. Deactivate the current active BOM first.',
        );
      }
    }

    bom.status = dto.status;
    bom.updatedBy = userId || null;
    await this.bomRepo.save(bom);
    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const bom = await this.findOne(id, companyId);
    bom.isActive = false;
    bom.updatedBy = userId || null;
    await this.bomRepo.save(bom);
  }

  async recalculateCost(id: string, companyId: string): Promise<BillOfMaterials> {
    const bom = await this.findOne(id, companyId);
    const lines = await this.lineRepo.find({
      where: { bomId: id, isActive: true },
      relations: ['item'],
    });
    const cost = await this.calculateEstimatedCost(lines);
    bom.estimatedCost = cost;
    await this.bomRepo.save(bom);
    return this.findOne(id, companyId);
  }

  private async generateBomCode(companyId: string): Promise<string> {
    const last = await this.bomRepo.findOne({
      where: { companyId },
      order: { bomCode: 'DESC' },
    });

    if (last && last.bomCode) {
      const match = last.bomCode.match(/BOM-(\d+)/);
      if (match) {
        const next = parseInt(match[1], 10) + 1;
        return `BOM-${String(next).padStart(3, '0')}`;
      }
    }
    return 'BOM-001';
  }

  private async createLines(bomId: string, lineDtos: any[], userId?: string): Promise<BomLine[]> {
    const lines: BomLine[] = [];
    for (let i = 0; i < lineDtos.length; i++) {
      const lineDto = lineDtos[i];
      const line = this.lineRepo.create({
        bomId,
        lineNumber: i + 1,
        itemId: lineDto.itemId,
        quantity: lineDto.quantity,
        uomId: lineDto.uomId,
        scrapFactor: lineDto.scrapFactor || 0,
        yieldPercentage: lineDto.yieldPercentage ?? 100,
        alternateGroup: lineDto.alternateGroup || null,
        alternateRank: lineDto.alternateRank || null,
        remarks: lineDto.remarks || null,
        createdBy: userId || null,
      });
      const saved = await this.lineRepo.save(line);
      lines.push(saved);
    }
    return lines;
  }

  private async calculateEstimatedCost(lines: BomLine[]): Promise<number> {
    let totalCost = 0;
    for (const line of lines) {
      const item = line.item || await this.itemRepo.findOne({ where: { id: line.itemId } });
      if (item && item.costPrice) {
        const cost = this.toNumber(item.costPrice);
        const qty = this.toNumber(line.quantity);
        const yieldPct = this.toNumber(line.yieldPercentage) / 100;
        const effectiveQty = yieldPct > 0 ? qty / yieldPct : qty;
        totalCost += cost * effectiveQty;
      }
    }
    return Math.round(totalCost * 10000) / 10000;
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

  private async validateNoActiveBomForProduct(productId: string, companyId: string): Promise<void> {
    const existing = await this.bomRepo.findOne({
      where: { productId, companyId, status: BomStatus.ACTIVE, isActive: true },
    });
    if (existing) {
      throw new BadRequestException(
        `An ACTIVE BOM already exists for this product (${existing.bomCode}). Only one ACTIVE BOM per product is allowed.`,
      );
    }
  }

  private async validateComponentItems(lines: CreateBomLineDto[] | any[], companyId: string): Promise<void> {
    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const items = await this.itemRepo.find({
      where: { id: In(itemIds), companyId },
    });
    if (items.length !== itemIds.length) {
      const found = new Set(items.map((i) => i.id));
      const missing = itemIds.filter((id) => !found.has(id));
      throw new BadRequestException(`Component items not found for this company: ${missing.join(', ')}`);
    }
    const uomIds = [...new Set(lines.map((l) => l.uomId))];
    const uoms = await this.uomRepo.find({ where: { id: In(uomIds) } });
    if (uoms.length !== uomIds.length) {
      const found = new Set(uoms.map((u) => u.id));
      const missing = uomIds.filter((id) => !found.has(id));
      throw new BadRequestException(`UOMs not found: ${missing.join(', ')}`);
    }
  }

  private async validateNoSelfReference(productId: string, lines: CreateBomLineDto[] | any[]): Promise<void> {
    for (const line of lines) {
      if (line.itemId === productId) {
        throw new BadRequestException('A BOM cannot contain itself as a component');
      }
    }
  }

  private async validateNoCircularReference(
    productId: string,
    lines: CreateBomLineDto[] | any[],
    companyId: string,
  ): Promise<void> {
    const visited = new Set<string>([productId]);
    const queue = lines.map((l) => l.itemId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) {
        throw new BadRequestException(`Circular BOM reference detected involving item ${currentId}`);
      }
      visited.add(currentId);

      const existingBom = await this.bomRepo.findOne({
        where: { productId: currentId, companyId, isActive: true },
      });
      if (existingBom) {
        const childLines = await this.lineRepo.find({
          where: { bomId: existingBom.id, isActive: true },
        });
        for (const childLine of childLines) {
          if (!visited.has(childLine.itemId)) {
            queue.push(childLine.itemId);
          }
        }
      }
    }
  }
}
