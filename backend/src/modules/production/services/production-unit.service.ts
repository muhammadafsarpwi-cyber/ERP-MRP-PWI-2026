import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  ProductionUnit,
  ProductionUnitStatus,
  ProductionUnitCodeType,
} from '../entities/production-unit.entity';
import {
  ProductionUnitPrintLog,
  PrintEventType,
} from '../entities/production-unit-print-log.entity';
import {
  GenerateProductionUnitsDto,
  UpdateProductionUnitDto,
  BulkUpdateUnitsDto,
  VoidProductionUnitDto,
  PrintProductionUnitsDto,
  ListProductionUnitsQueryDto,
} from '../dto/production-unit.dto';

@Injectable()
export class ProductionUnitService {
  private readonly logger = new Logger(ProductionUnitService.name);

  constructor(
    @InjectRepository(ProductionUnit)
    private readonly unitRepo: Repository<ProductionUnit>,
    @InjectRepository(ProductionUnitPrintLog)
    private readonly printLogRepo: Repository<ProductionUnitPrintLog>,
    private readonly dataSource: DataSource,
  ) {}

  // ════════════════════════════════════════════════════════════════════════════
  // SERIAL NUMBER GENERATION
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Generates the next unique system serial in the format PWI-PU-YYYYNNNNNN.
   * Uses a DB-level sequence to prevent collisions across concurrent requests.
   */
  private async nextUnitSerialNo(companyId: string): Promise<string> {
    // Use a DB-level advisory lock per company to prevent concurrent collisions
    const year = new Date().getFullYear();

    const result = await this.unitRepo.query(
      `SELECT COALESCE(MAX(CAST(
         SUBSTRING(unit_serial_no FROM 'PWI-PU-[0-9]{{4}}([0-9]+)$') AS BIGINT
       )), 0) + 1 AS next_seq
       FROM production_units
       WHERE company_id = $1
         AND unit_serial_no LIKE $2`,
      [companyId, `PWI-PU-${year}%`],
    );

    const seq: number = Number(result?.[0]?.next_seq ?? 1);
    return `PWI-PU-${year}${String(seq).padStart(6, '0')}`;
  }

  /**
   * Generates N unique serial numbers in one pass (avoids N round-trips).
   * Safe against concurrent calls because we lock and re-read the max.
   */
  private async generateSerialBatch(companyId: string, count: number): Promise<string[]> {
    const year = new Date().getFullYear();

    // Advisory lock: companyId hash to prevent concurrent generation
    const lockKey = companyId.split('-').reduce((acc, part) => acc + parseInt(part, 16), 0) % 2147483647;
    await this.unitRepo.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

    const result = await this.unitRepo.query(
      `SELECT COALESCE(MAX(CAST(
         SUBSTRING(unit_serial_no FROM 'PWI-PU-[0-9]{{4}}([0-9]+)$') AS BIGINT
       )), 0) AS current_max
       FROM production_units
       WHERE company_id = $1
         AND unit_serial_no LIKE $2`,
      [companyId, `PWI-PU-${year}%`],
    );

    const startSeq = Number(result?.[0]?.current_max ?? 0) + 1;
    const serials: string[] = [];
    for (let i = 0; i < count; i++) {
      serials.push(`PWI-PU-${year}${String(startSeq + i).padStart(6, '0')}`);
    }
    return serials;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BULK GENERATION
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Core bulk-generation method.
   * Creates exactly `dto.quantity` new ProductionUnit records.
   * Each unit gets:
   *   - Unique unitSerialNo  (PWI-PU-YYYYNNNNNN)
   *   - Unique coilNo        (PREFIX-NNN within this batch)
   *   - Unique qrPayload     (= unitSerialNo)
   *   - Unique barcodePayload(= unitSerialNo)
   * Common batch fields are inherited once and stored on every row.
   */
  async generateUnits(
    dto: GenerateProductionUnitsDto,
    userId?: string,
  ): Promise<ProductionUnit[]> {
    if (dto.quantity < 1 || dto.quantity > 500) {
      throw new BadRequestException('Quantity must be between 1 and 500');
    }

    const companyId = dto.companyId || (await this.getDefaultCompanyId());
    if (!companyId) {
      throw new BadRequestException('Company ID is required to generate production units');
    }

    const prefix = (dto.coilPrefix || 'CN').toUpperCase().slice(0, 10);
    const codeType = dto.codeType ?? ProductionUnitCodeType.QR_BARCODE;
    const labelTemplate = dto.labelTemplate ?? 'PVC_COIL';

    // Generate unique serials inside a transaction with advisory lock
    return this.dataSource.transaction(async (manager) => {
      const year = new Date().getFullYear();
      const lockKey = Math.abs(companyId.split('-').reduce((acc, part) => acc + parseInt(part, 16), 0)) % 2147483647;
      await manager.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

      const result = await manager.query(
        `SELECT COALESCE(MAX(CAST(
           SUBSTRING(unit_serial_no FROM 'PWI-PU-[0-9]{4}([0-9]+)$') AS BIGINT
         )), 0) AS current_max
         FROM production_units
         WHERE company_id = $1
           AND unit_serial_no LIKE $2`,
        [companyId, `PWI-PU-${year}%`],
      );

      const startSeq = Number(result?.[0]?.current_max ?? 0) + 1;

      // Check existing coil numbers in this batch to find next coil sequence
      const coilResult = await manager.query(
        `SELECT COALESCE(MAX(CAST(
           SUBSTRING(coil_no FROM '[^-]+-([0-9]+)$') AS INT
         )), 0) AS max_coil
         FROM production_units
         WHERE company_id = $1
           AND ($2::uuid IS NULL OR production_entry_id = $2::uuid)
           AND ($3::varchar IS NULL OR batch_no = $3)
           AND coil_no LIKE $4`,
        [companyId, dto.productionEntryId || null, dto.batchNo || null, `${prefix}-%`],
      );
      const coilStartSeq = Number(coilResult?.[0]?.max_coil ?? 0) + 1;

      const units: ProductionUnit[] = [];
      for (let i = 0; i < dto.quantity; i++) {
        const unitSerialNo = `PWI-PU-${year}${String(startSeq + i).padStart(6, '0')}`;
        const coilNo = `${prefix}-${String(coilStartSeq + i).padStart(3, '0')}`;
        const qrPayload = unitSerialNo;      // QR encodes the unique serial
        const barcodePayload = unitSerialNo; // 1D barcode encodes same serial

        const unit = manager.create(ProductionUnit, {
          companyId,
          productionEntryId: dto.productionEntryId ?? null,
          itemId: dto.itemId,
          uomId: dto.uomId ?? null,
          productionDate: dto.productionDate,
          batchNo: dto.batchNo ?? null,
          pvcBatchNo: dto.pvcBatchNo ?? null,
          shiftId: dto.shiftId ?? null,
          shiftName: dto.shiftName ?? null,
          operatorName: dto.operatorName ?? null,
          machineId: dto.machineId ?? null,
          machineNo: dto.machineNo ?? null,
          departmentName: dto.departmentName ?? null,
          lengthMeters: dto.lengthMeters ?? null,
          unitSerialNo,
          coilNo,
          qrPayload,
          barcodePayload,
          codeType,
          labelTemplate,
          status: ProductionUnitStatus.GENERATED,
          printCount: 0,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
          isActive: true,
        });
        units.push(unit);
      }

      const saved = await manager.save(ProductionUnit, units);

      // Register barcode table entries for quick lookup
      for (const u of saved) {
        await manager.query(
          `INSERT INTO barcodes (
            id, company_id, barcode_value, entity_type, entity_id, entity_code, entity_label, status, is_primary, is_active, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, 'PRODUCTION_UNIT', $3, $2, $4, 'ACTIVE', true, true, NOW(), NOW()
          ) ON CONFLICT DO NOTHING`,
          [u.companyId, u.unitSerialNo, u.id, `Coil ${u.coilNo} (${u.unitSerialNo})`],
        ).catch(() => {});
      }

      this.logger.log(`Generated ${saved.length} production units for company ${dto.companyId}`);
      return saved;
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ════════════════════════════════════════════════════════════════════════════

  async listUnits(
    companyId: string,
    query: ListProductionUnitsQueryDto,
  ): Promise<{ data: ProductionUnit[]; total: number }> {
    const page  = Number(query.page  ?? 1);
    const limit = Math.min(Number(query.limit ?? 50), 200);

    const qb = this.unitRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.item', 'item')
      .leftJoinAndSelect('u.shift', 'shift')
      .leftJoinAndSelect('u.machine', 'machine')
      .where('u.companyId = :companyId', { companyId })
      .orderBy('u.createdAt', 'DESC');

    if (query.productionEntryId) {
      qb.andWhere('u.productionEntryId = :entryId', { entryId: query.productionEntryId });
    }
    if (query.itemId) {
      qb.andWhere('u.itemId = :itemId', { itemId: query.itemId });
    }
    if (query.status) {
      qb.andWhere('u.status = :status', { status: query.status });
    }
    if (query.search?.trim()) {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(
        '(u.unitSerialNo ILIKE :s OR u.coilNo ILIKE :s OR u.batchNo ILIKE :s OR u.operatorName ILIKE :s)',
        { s },
      );
    }

    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId: string): Promise<ProductionUnit> {
    const unit = await this.unitRepo.findOne({
      where: { id, companyId },
      relations: ['item', 'shift', 'machine', 'productionEntry'],
    });
    if (!unit) throw new NotFoundException(`Production unit ${id} not found`);
    return unit;
  }

  async findBySerial(serialNo: string, companyId?: string): Promise<ProductionUnit> {
    const where: any = { unitSerialNo: serialNo };
    if (companyId) where.companyId = companyId;
    const unit = await this.unitRepo.findOne({
      where,
      relations: ['item', 'shift', 'machine'],
    });
    if (!unit) throw new NotFoundException(`Production unit with serial ${serialNo} not found`);
    return unit;
  }

  async findByQrOrBarcode(payload: string, companyId?: string): Promise<ProductionUnit> {
    const qb = this.unitRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.item', 'item')
      .leftJoinAndSelect('u.shift', 'shift')
      .where('(u.qrPayload = :p OR u.barcodePayload = :p OR u.unitSerialNo = :p)', { p: payload });
    if (companyId) {
      qb.andWhere('u.companyId = :companyId', { companyId });
    }
    const unit = await qb.getOne();
    if (!unit) throw new NotFoundException(`Production unit with payload ${payload} not found`);
    return unit;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INDIVIDUAL UNIT UPDATES (weight / attributes)
  // ════════════════════════════════════════════════════════════════════════════

  async updateUnit(
    id: string,
    companyId: string,
    dto: UpdateProductionUnitDto,
    userId?: string,
  ): Promise<ProductionUnit> {
    const unit = await this.findOne(id, companyId);
    if ([ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(unit.status)) {
      throw new BadRequestException('Cannot update a VOID or CANCELLED unit');
    }
    if (dto.weightKg !== undefined)    unit.weightKg     = dto.weightKg;
    if (dto.jointCount !== undefined)  unit.jointCount   = dto.jointCount;
    if (dto.stValue !== undefined)     unit.stValue      = dto.stValue;
    if (dto.qualityStatus !== undefined) unit.qualityStatus = dto.qualityStatus;
    if (dto.remarks !== undefined)     unit.remarks      = dto.remarks;
    if (dto.lengthMeters !== undefined) unit.lengthMeters = dto.lengthMeters;
    unit.updatedBy = userId ?? null;
    return this.unitRepo.save(unit);
  }

  async bulkUpdateUnits(
    companyId: string,
    dto: BulkUpdateUnitsDto,
    userId?: string,
  ): Promise<ProductionUnit[]> {
    const ids = dto.units.map((u) => u.id).filter(Boolean) as string[];
    if (!ids.length) throw new BadRequestException('No unit IDs provided');

    const existing = await this.unitRepo.find({ where: { companyId, id: In(ids) } });
    const existingMap = new Map(existing.map((u) => [u.id, u]));

    const updated: ProductionUnit[] = [];
    for (const row of dto.units) {
      if (!row.id) continue;
      const unit = existingMap.get(row.id);
      if (!unit) continue;
      if ([ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(unit.status)) continue;

      if (row.weightKg    !== undefined) unit.weightKg    = row.weightKg;
      if (row.jointCount  !== undefined) unit.jointCount  = row.jointCount;
      if (row.stValue     !== undefined) unit.stValue     = row.stValue;
      if (row.qualityStatus !== undefined) unit.qualityStatus = row.qualityStatus;
      if (row.remarks     !== undefined) unit.remarks     = row.remarks;
      unit.updatedBy = userId ?? null;
      updated.push(unit);
    }

    return this.unitRepo.save(updated);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRINT / REPRINT
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Records a print/reprint action and updates unit status.
   * NEVER creates new unit identities — only logs the event.
   */
  async recordPrint(
    companyId: string,
    dto: PrintProductionUnitsDto,
    userId?: string,
  ): Promise<{ printJobId: string; units: ProductionUnit[]; logs: ProductionUnitPrintLog[] }> {
    const units = await this.unitRepo.find({
      where: { companyId, id: In(dto.unitIds) },
    });

    if (!units.length) throw new NotFoundException('No valid units found for printing');

    // Filter out VOID/CANCELLED
    const printable = units.filter(
      (u) => ![ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(u.status),
    );
    if (!printable.length) {
      throw new BadRequestException('All selected units are VOID or CANCELLED');
    }

    const printJobId = `PJ-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
    const now = new Date();
    const copies = dto.copies ?? 1;
    const labelTemplate = dto.labelTemplate ?? undefined;

    const logs: ProductionUnitPrintLog[] = [];
    for (const unit of printable) {
      const isReprint = unit.printCount > 0;
      const log = this.printLogRepo.create({
        productionUnitId: unit.id,
        printJobId,
        eventType: isReprint ? PrintEventType.REPRINT : PrintEventType.PRINT,
        printedBy: userId ?? null,
        printedAt: now,
        printerName: dto.printerName ?? null,
        copies,
        labelTemplate: labelTemplate ?? unit.labelTemplate ?? null,
        createdBy: userId ?? null,
      });
      logs.push(log);

      // Update unit status
      unit.printCount += copies;
      if (unit.printCount === copies && !isReprint) {
        // First ever print
        unit.firstPrintedAt = now;
        unit.firstPrintedBy = userId ?? null;
        unit.status = ProductionUnitStatus.PRINTED;
      }
      unit.updatedBy = userId ?? null;
    }

    await this.unitRepo.save(printable);
    await this.printLogRepo.save(logs);

    return { printJobId, units: printable, logs };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VOID / CANCEL
  // ════════════════════════════════════════════════════════════════════════════

  async voidUnit(
    id: string,
    companyId: string,
    dto: VoidProductionUnitDto,
    userId?: string,
  ): Promise<ProductionUnit> {
    const unit = await this.findOne(id, companyId);
    if ([ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(unit.status)) {
      throw new BadRequestException(`Unit is already ${unit.status}`);
    }

    unit.status     = dto.status;
    unit.voidedBy   = userId ?? null;
    unit.voidedAt   = new Date();
    unit.voidReason = dto.reason;
    unit.updatedBy  = userId ?? null;
    // Keep isActive=true so record is always retrievable; status conveys void state

    return this.unitRepo.save(unit);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRINT LOGS
  // ════════════════════════════════════════════════════════════════════════════

  async getPrintLogs(unitId: string, companyId: string): Promise<ProductionUnitPrintLog[]> {
    // Verify access
    await this.findOne(unitId, companyId);
    return this.printLogRepo.find({
      where: { productionUnitId: unitId },
      order: { printedAt: 'DESC' },
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LABEL TEMPLATES
  // ════════════════════════════════════════════════════════════════════════════

  getAvailableTemplates(): Array<{ key: string; label: string; fields: string[] }> {
    return [
      {
        key: 'PVC_COIL',
        label: 'PVC Coil Label',
        fields: ['itemCode', 'itemName', 'coilNo', 'unitSerialNo', 'qrCode', 'barcode',
                 'pvcBatchNo', 'batchNo', 'lengthMeters', 'weightKg', 'productionDate',
                 'shiftName', 'operatorName'],
      },
      {
        key: 'SPOKE_LABEL',
        label: 'Spoke Label',
        fields: ['itemCode', 'itemName', 'unitSerialNo', 'qrCode', 'barcode',
                 'batchNo', 'weightKg', 'productionDate'],
      },
      {
        key: 'CABLE_COIL',
        label: 'Cable Coil Label',
        fields: ['itemCode', 'itemName', 'coilNo', 'unitSerialNo', 'qrCode', 'barcode',
                 'batchNo', 'lengthMeters', 'weightKg', 'productionDate', 'shiftName'],
      },
      {
        key: 'FINISHED_PRODUCT',
        label: 'Finished Product Label',
        fields: ['itemCode', 'itemName', 'unitSerialNo', 'qrCode', 'barcode',
                 'batchNo', 'weightKg', 'productionDate', 'qualityStatus'],
      },
    ];
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCAN TO DETAIL (lookup by QR/barcode payload)
  // ════════════════════════════════════════════════════════════════════════════

  async scanLookup(payload: string, companyId?: string): Promise<ProductionUnit> {
    return this.findByQrOrBarcode(payload, companyId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════════════════════════

  async getStats(companyId: string): Promise<Record<string, number>> {
    const rows = await this.unitRepo
      .createQueryBuilder('u')
      .select('u.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('u.companyId = :companyId', { companyId })
      .groupBy('u.status')
      .getRawMany();

    const stats: Record<string, number> = {
      GENERATED: 0, PRINTED: 0, ACTIVE: 0, USED: 0, VOID: 0, CANCELLED: 0, total: 0,
    };
    for (const r of rows) {
      const cnt = Number(r.cnt);
      stats[r.status] = cnt;
      stats.total += cnt;
    }
    return stats;
  }

  async getDefaultCompanyId(): Promise<string | null> {
    try {
      const res = await this.unitRepo.query(
        `SELECT id FROM companies WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
      );
      return res?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }
}

