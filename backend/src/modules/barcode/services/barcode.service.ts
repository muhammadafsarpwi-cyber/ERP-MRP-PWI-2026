import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Barcode, BarcodeEntityType, BarcodeStatus } from '../entities/barcode.entity';
import { CreateBarcodeDto, UpdateBarcodeDto } from '../dto/barcode.dto';

@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);

  constructor(
    @InjectRepository(Barcode)
    private readonly barcodeRepo: Repository<Barcode>,
  ) {}

  async generateBarcodeValue(): Promise<string> {
    const result = await this.barcodeRepo.query(`
      SELECT COALESCE(
        MAX(CAST(barcode_value AS BIGINT)),
        8901000000000
      ) + 1 AS next_value
      FROM barcodes
      WHERE barcode_value IS NOT NULL AND barcode_value != '' AND barcode_value ~ '^[0-9]+$'
    `);
    const next = Number(result?.[0]?.next_value ?? 8901000000001);
    return String(next).padStart(13, '0');
  }

  async create(dto: CreateBarcodeDto, companyId: string, userId?: string): Promise<Barcode> {
    const barcodeValue = dto.barcodeValue || await this.generateBarcodeValue();

    const existing = await this.barcodeRepo.findOne({
      where: { companyId, barcodeValue, status: BarcodeStatus.ACTIVE },
    });
    if (existing) {
      throw new ConflictException(`Barcode ${barcodeValue} already exists in this company`);
    }

    const barcode = this.barcodeRepo.create({
      companyId,
      barcodeValue,
      entityType: dto.entityType,
      entityId: dto.entityId,
      barcodeLabel: dto.barcodeLabel || null,
      entityLabel: dto.entityLabel || null,
      entityCode: dto.entityCode || null,
      status: BarcodeStatus.ACTIVE,
      isPrimary: true,
      createdBy: userId || null,
    });

    return this.barcodeRepo.save(barcode);
  }

  async findAll(companyId: string, entityType?: BarcodeEntityType, page = 1, limit = 50, search?: string): Promise<{ data: Barcode[]; total: number }> {
    const where: any = { companyId, status: BarcodeStatus.ACTIVE };
    if (entityType) where.entityType = entityType;

    let data: Barcode[];
    let total: number;

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      const qb = this.barcodeRepo.createQueryBuilder('barcode')
        .where('barcode.companyId = :companyId', { companyId })
        .andWhere('barcode.status = :status', { status: BarcodeStatus.ACTIVE });
      if (entityType) {
        qb.andWhere('barcode.entityType = :entityType', { entityType });
      }
      qb.andWhere(
        '(barcode.barcodeValue ILIKE :search OR barcode.entityLabel ILIKE :search OR barcode.entityCode ILIKE :search OR barcode.barcodeLabel ILIKE :search)',
        { search: searchTerm }
      );
      qb.orderBy('barcode.createdAt', 'DESC');
      qb.skip((page - 1) * limit).take(limit);
      const result = await qb.getManyAndCount();
      data = result[0];
      total = result[1];
    } else {
      const result = await this.barcodeRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
      data = result[0];
      total = result[1];
    }

    return { data, total };
  }

  async findOne(id: string): Promise<Barcode> {
    const barcode = await this.barcodeRepo.findOne({ where: { id } });
    if (!barcode) throw new NotFoundException('Barcode not found');
    return barcode;
  }

  async findByValue(companyId: string, barcodeValue: string): Promise<Barcode> {
    const barcode = await this.barcodeRepo.findOne({
      where: { companyId, barcodeValue, status: BarcodeStatus.ACTIVE },
    });
    if (!barcode) throw new NotFoundException(`No barcode found for value: ${barcodeValue}`);
    return barcode;
  }

  async findByEntity(companyId: string, entityType: BarcodeEntityType, entityId: string): Promise<Barcode[]> {
    return this.barcodeRepo.find({
      where: { companyId, entityType, entityId, status: BarcodeStatus.ACTIVE },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async update(id: string, dto: UpdateBarcodeDto): Promise<Barcode> {
    const barcode = await this.findOne(id);
    Object.assign(barcode, dto);
    return this.barcodeRepo.save(barcode);
  }

  async deactivate(id: string): Promise<Barcode> {
    const barcode = await this.findOne(id);
    barcode.status = BarcodeStatus.INACTIVE;
    return this.barcodeRepo.save(barcode);
  }

  async getStats(companyId: string): Promise<Record<string, number>> {
    const result = await this.barcodeRepo
      .createQueryBuilder('b')
      .select('b.entity_type', 'entityType')
      .addSelect('COUNT(*)', 'count')
      .where('b.company_id = :companyId', { companyId })
      .andWhere('b.status = :status', { status: BarcodeStatus.ACTIVE })
      .groupBy('b.entity_type')
      .getRawMany();

    const stats: Record<string, number> = { total: 0 };
    for (const row of result) {
      stats[row.entityType] = Number(row.count);
      stats.total += Number(row.count);
    }
    return stats;
  }

  async ensureBarcodeForEntity(
    companyId: string,
    entityType: BarcodeEntityType,
    entityId: string,
    entityCode: string,
    entityLabel: string,
    userId?: string,
  ): Promise<Barcode> {
    const existing = await this.findByEntity(companyId, entityType, entityId);
    if (existing.length > 0) return existing[0];

    return this.create(
      { entityType, entityId, entityCode, entityLabel },
      companyId,
      userId,
    );
  }

  async backfill(
    companyId: string,
    entityType?: BarcodeEntityType,
  ): Promise<{ totalScanned: number; created: number; alreadyExisting: number; skipped: number; failed: number; errors: string[] }> {
    const result = { totalScanned: 0, created: 0, alreadyExisting: 0, skipped: 0, failed: 0, errors: [] as string[] };

    const entityTypes = entityType ? [entityType] : [
      BarcodeEntityType.ITEM,
      BarcodeEntityType.CUSTOMER,
      BarcodeEntityType.MACHINE,
      BarcodeEntityType.WAREHOUSE,
      BarcodeEntityType.EMPLOYEE,
      BarcodeEntityType.PRODUCTION_ENTRY,
      BarcodeEntityType.JOB_CARD,
    ];

    for (const et of entityTypes) {
      try {
        const entities = await this.queryEntitiesForBackfill(companyId, et);
        result.totalScanned += entities.length;

        for (const entity of entities) {
          try {
            const existing = await this.findByEntity(companyId, et, entity.id);
            if (existing.length > 0) {
              result.alreadyExisting++;
              continue;
            }

            await this.create(
              {
                entityType: et,
                entityId: entity.id,
                entityCode: entity.code,
                entityLabel: entity.label,
              },
              companyId,
            );
            result.created++;
          } catch (err: any) {
            result.failed++;
            result.errors.push(`${et}:${entity.id} - ${err.message}`);
          }
        }
      } catch (err: any) {
        result.failed++;
        result.errors.push(`${et} query failed: ${err.message}`);
      }
    }

    return result;
  }

  private async queryEntitiesForBackfill(
    companyId: string,
    entityType: BarcodeEntityType,
  ): Promise<Array<{ id: string; code: string; label: string }>> {
    let query = '';
    const params: any[] = [companyId];

    switch (entityType) {
      case BarcodeEntityType.ITEM:
        query = `SELECT id, "itemCode" as code, name as label FROM items WHERE "companyId" = $1 AND "isActive" = true`;
        break;
      case BarcodeEntityType.CUSTOMER:
        query = `SELECT id, "customerCode" as code, name as label FROM customers WHERE "companyId" = $1 AND "isActive" = true`;
        break;
      case BarcodeEntityType.MACHINE:
        query = `SELECT id, "machineCode" as code, name as label FROM machines WHERE "companyId" = $1 AND "isActive" = true`;
        break;
      case BarcodeEntityType.WAREHOUSE:
        query = `SELECT id, "warehouseCode" as code, name as label FROM warehouses WHERE "companyId" = $1 AND "isActive" = true`;
        break;
      case BarcodeEntityType.EMPLOYEE:
        query = `SELECT id, "employeeCode" as code, ("firstName" || ' ' || COALESCE("lastName", '')) as label FROM hr_employees WHERE "companyId" = $1 AND "isActive" = true`;
        break;
      case BarcodeEntityType.PRODUCTION_ENTRY:
        query = `SELECT id, 'PE-' || LEFT(id::text, 8) as code, 'Production Entry' as label FROM production_entries WHERE "companyId" = $1 AND "isActive" = true`;
        break;
      case BarcodeEntityType.JOB_CARD:
        query = `SELECT id, "jobCardNo" as code, ("jobCardNo" || ' - Job Card') as label FROM maintenance_job_cards WHERE "companyId" = $1 AND "isActive" = true`;
        break;
      default:
        return [];
    }

    const result = await this.barcodeRepo.query(query, params);
    return result.map((r: any) => ({ id: r.id, code: r.code, label: r.label }));
  }
}
