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

  async create(dto: CreateBarcodeDto, companyId?: string, userId?: string): Promise<Barcode> {
    const effectiveCompanyId = companyId || '00000000-0000-0000-0000-000000000001';
    const barcodeValue = dto.barcodeValue || await this.generateBarcodeValue();

    const existing = await this.barcodeRepo.findOne({
      where: { companyId: effectiveCompanyId, barcodeValue, status: BarcodeStatus.ACTIVE },
    });
    if (existing) {
      throw new ConflictException(`Barcode ${barcodeValue} already exists in this company`);
    }

    const barcode = this.barcodeRepo.create({
      companyId: effectiveCompanyId,
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

  async findAll(companyId?: string, entityType?: BarcodeEntityType, page = 1, limit = 50, search?: string): Promise<{ data: Barcode[]; total: number }> {
    const where: any = { status: BarcodeStatus.ACTIVE };
    if (companyId) where.companyId = companyId;
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

  async findByValue(companyId: string | undefined, barcodeValue: string): Promise<Barcode> {
    let cleanValue = (barcodeValue || '').trim();
    if (!cleanValue) throw new NotFoundException('Barcode value cannot be empty');

    // Remove quotes if present
    cleanValue = cleanValue.replace(/^['"]+|['"]+$/g, '').trim();

    // 0. Extract URL parameters or paths if scanned as full URL / path
    let extractedEntityId: string | null = null;
    let extractedCode: string = cleanValue;

    // Check if it's a URL or contains query parameters
    try {
      if (cleanValue.includes('://')) {
        const parsedUrl = new URL(cleanValue);
        const qEntityId = parsedUrl.searchParams.get('entityId') || parsedUrl.searchParams.get('id');
        const qCode = parsedUrl.searchParams.get('code') || parsedUrl.searchParams.get('barcode') || parsedUrl.searchParams.get('gatePass');
        if (qEntityId) extractedEntityId = qEntityId;
        if (qCode) extractedCode = qCode;
      } else if (cleanValue.includes('?')) {
        const queryPart = cleanValue.split('?')[1];
        const searchParams = new URLSearchParams(queryPart);
        const qEntityId = searchParams.get('entityId') || searchParams.get('id');
        const qCode = searchParams.get('code') || searchParams.get('barcode') || searchParams.get('gatePass');
        if (qEntityId) extractedEntityId = qEntityId;
        if (qCode) extractedCode = qCode;
      }
    } catch {
      // Ignore URL parse error
    }

    // Check for UUID anywhere in the string (e.g. /production/machines/f61bc882-412e-4779-b76e-91b8687c361e)
    const uuidMatch = cleanValue.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch && !extractedEntityId) {
      extractedEntityId = uuidMatch[1].toLowerCase();
    }

    // Extract path end if like /production/machines/XYZ
    if (cleanValue.startsWith('/') && !extractedEntityId) {
      const parts = cleanValue.split('/');
      const lastPart = parts[parts.length - 1].split('?')[0].trim();
      if (lastPart) extractedCode = lastPart;
    }

    // 1. Direct match in barcodes table (by barcode_value, or if extractedCode, or by entity_id)
    let barcode = await this.barcodeRepo.findOne({
      where: { barcodeValue: cleanValue, status: BarcodeStatus.ACTIVE },
    });
    if (barcode) return barcode;

    if (extractedCode && extractedCode !== cleanValue) {
      barcode = await this.barcodeRepo.findOne({
        where: { barcodeValue: extractedCode, status: BarcodeStatus.ACTIVE },
      });
      if (barcode) return barcode;
    }

    if (extractedEntityId) {
      barcode = await this.barcodeRepo.findOne({
        where: { entityId: extractedEntityId, status: BarcodeStatus.ACTIVE },
        order: { isPrimary: 'DESC', createdAt: 'DESC' },
      });
      if (barcode) return barcode;
    }

    // 2. Case-insensitive search in barcodes table
    barcode = await this.barcodeRepo
      .createQueryBuilder('b')
      .where('(LOWER(b.barcode_value) = LOWER(:val) OR LOWER(b.entity_code) = LOWER(:val) OR LOWER(b.barcode_value) = LOWER(:extCode) OR LOWER(b.entity_code) = LOWER(:extCode) OR (b.entity_id = :entId))', {
        val: cleanValue,
        extCode: extractedCode,
        entId: extractedEntityId || '00000000-0000-0000-0000-000000000000',
      })
      .andWhere('b.status = :status', { status: BarcodeStatus.ACTIVE })
      .getOne();
    if (barcode) return barcode;

    // 3. Fallback: Search directly across core entities (Machine, Item, Job Card, Customer, Warehouse, Employee, Gate Pass)
    try {
      const validUuid = extractedEntityId || '00000000-0000-0000-0000-000000000000';

      // Check Machine
      const machineRows = await this.barcodeRepo.query(
        `SELECT id, machine_code, name, company_id FROM machines 
         WHERE (machine_code ILIKE $1 OR name ILIKE $1 OR id::text = $1 OR id::text = $2 OR machine_code ILIKE $3 OR qr_code ILIKE $4) 
           AND is_active = true LIMIT 1`,
        [cleanValue, validUuid, extractedCode, `%${cleanValue}%`],
      );
      if (machineRows && machineRows.length > 0) {
        const machine = machineRows[0];
        return this.ensureBarcodeForEntity(
          machine.company_id || companyId || '00000000-0000-0000-0000-000000000001',
          BarcodeEntityType.MACHINE,
          machine.id,
          machine.machine_code,
          machine.name,
        );
      }

      // Check Item
      const itemRows = await this.barcodeRepo.query(
        `SELECT id, item_code, name, company_id FROM items 
         WHERE (item_code ILIKE $1 OR barcode ILIKE $1 OR sku ILIKE $1 OR name ILIKE $1 OR id::text = $1 OR id::text = $2 OR item_code ILIKE $3) 
           AND is_active = true LIMIT 1`,
        [cleanValue, validUuid, extractedCode],
      );
      if (itemRows && itemRows.length > 0) {
        const item = itemRows[0];
        return this.ensureBarcodeForEntity(
          item.company_id || companyId || '00000000-0000-0000-0000-000000000001',
          BarcodeEntityType.ITEM,
          item.id,
          item.item_code,
          item.name,
        );
      }

      // Check Production Unit (Coil / Serial)
      const unitRows = await this.barcodeRepo.query(
        `SELECT id, unit_serial_no, coil_no, company_id FROM production_units
         WHERE (unit_serial_no ILIKE $1 OR coil_no ILIKE $1 OR qr_payload ILIKE $1 OR barcode_payload ILIKE $1 OR id::text = $1 OR id::text = $2 OR unit_serial_no ILIKE $3)
           AND is_active = true LIMIT 1`,
        [cleanValue, validUuid, extractedCode],
      );
      if (unitRows && unitRows.length > 0) {
        const unit = unitRows[0];
        return this.ensureBarcodeForEntity(
          unit.company_id || companyId || '00000000-0000-0000-0000-000000000001',
          BarcodeEntityType.PRODUCTION_UNIT,
          unit.id,
          unit.unit_serial_no,
          `Coil ${unit.coil_no} (${unit.unit_serial_no})`,
        );
      }

      // Check Maintenance Job Card
      const jcRows = await this.barcodeRepo.query(
        `SELECT id, job_card_no, company_id FROM maintenance_job_cards 
         WHERE (job_card_no ILIKE $1 OR id::text = $1 OR id::text = $2 OR job_card_no ILIKE $3) 
           AND is_active = true LIMIT 1`,
        [cleanValue, validUuid, extractedCode],
      );
      if (jcRows && jcRows.length > 0) {
        const jc = jcRows[0];
        return this.ensureBarcodeForEntity(
          jc.company_id || companyId || '00000000-0000-0000-0000-000000000001',
          BarcodeEntityType.JOB_CARD,
          jc.id,
          jc.job_card_no,
          `${jc.job_card_no} - Maintenance Job Card`,
        );
      }

      // Check Delivery Note / Outward Gate Pass
      const cleanRef = cleanValue.replace(/^GP-OUT-|^GP-IN-|^DN-/, '');
      const delRows = await this.barcodeRepo.query(
        `SELECT id, delivery_number, company_id FROM sales_deliveries 
         WHERE (delivery_number ILIKE $1 OR delivery_number ILIKE $2 OR id::text = $1 OR id::text = $3) 
           AND is_active = true LIMIT 1`,
        [cleanValue, `%${cleanRef}%`, validUuid],
      );
      if (delRows && delRows.length > 0) {
        const del = delRows[0];
        return this.ensureBarcodeForEntity(
          del.company_id || companyId || '00000000-0000-0000-0000-000000000001',
          BarcodeEntityType.GATE_PASS,
          del.id,
          del.delivery_number,
          `Outward Gate Pass: ${del.delivery_number}`,
        );
      }

      // Check Customer
      const custRows = await this.barcodeRepo.query(
        `SELECT id, customer_code, name, company_id FROM customers 
         WHERE (customer_code ILIKE $1 OR name ILIKE $1 OR id::text = $1 OR id::text = $2 OR customer_code ILIKE $3) 
           AND is_active = true LIMIT 1`,
        [cleanValue, validUuid, extractedCode],
      );
      if (custRows && custRows.length > 0) {
        const cust = custRows[0];
        return this.ensureBarcodeForEntity(
          cust.company_id || companyId || '00000000-0000-0000-0000-000000000001',
          BarcodeEntityType.CUSTOMER,
          cust.id,
          cust.customer_code,
          cust.name,
        );
      }

      // Check Warehouse
      const whRows = await this.barcodeRepo.query(
        `SELECT id, warehouse_code, name, company_id FROM warehouses 
         WHERE (warehouse_code ILIKE $1 OR name ILIKE $1 OR id::text = $1 OR id::text = $2 OR warehouse_code ILIKE $3) 
           AND is_active = true LIMIT 1`,
        [cleanValue, validUuid, extractedCode],
      );
      if (whRows && whRows.length > 0) {
        const wh = whRows[0];
        return this.ensureBarcodeForEntity(
          wh.company_id || companyId || '00000000-0000-0000-0000-000000000001',
          BarcodeEntityType.WAREHOUSE,
          wh.id,
          wh.warehouse_code,
          wh.name,
        );
      }

      // Check Employee
      const empRows = await this.barcodeRepo.query(
        `SELECT id, employee_code, (first_name || ' ' || COALESCE(last_name, '')) as name, company_id FROM hr_employees 
         WHERE (employee_code ILIKE $1 OR id::text = $1 OR id::text = $2 OR employee_code ILIKE $3) 
           AND is_active = true LIMIT 1`,
        [cleanValue, validUuid, extractedCode],
      );
      if (empRows && empRows.length > 0) {
        const emp = empRows[0];
        return this.ensureBarcodeForEntity(
          emp.company_id || companyId || '00000000-0000-0000-0000-000000000001',
          BarcodeEntityType.EMPLOYEE,
          emp.id,
          emp.employee_code,
          emp.name,
        );
      }
    } catch (searchErr) {
      // Continue to throw NotFoundException below
    }

    throw new NotFoundException(`No barcode or entity found for value: ${barcodeValue}`);
  }

  async findByEntity(companyId: string, entityType: BarcodeEntityType, entityId: string): Promise<Barcode[]> {
    return this.barcodeRepo.find({
      where: [
        { companyId, entityType, entityId, status: BarcodeStatus.ACTIVE },
        { entityType, entityId, status: BarcodeStatus.ACTIVE },
      ],
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

  async getStats(companyId?: string): Promise<Record<string, number>> {
    const qb = this.barcodeRepo
      .createQueryBuilder('b')
      .select('b.entity_type', 'entityType')
      .addSelect('COUNT(*)', 'count')
      .where('b.status = :status', { status: BarcodeStatus.ACTIVE });

    if (companyId) {
      qb.andWhere('b.company_id = :companyId', { companyId });
    }

    const result = await qb.groupBy('b.entity_type').getRawMany();

    const stats: Record<string, number> = {
      ITEM: 0,
      CUSTOMER: 0,
      MACHINE: 0,
      WAREHOUSE: 0,
      EMPLOYEE: 0,
      PRODUCTION_ENTRY: 0,
      JOB_CARD: 0,
      GATE_PASS: 0,
      total: 0,
    };
    for (const row of result) {
      const cnt = Number(row.count);
      stats[row.entityType] = cnt;
      stats.total += cnt;
    }

    // If barcodes are not yet generated, query live entities count as fallback so dashboard reflects real ERP records
    try {
      if (stats.ITEM === 0) {
        const [r] = await this.barcodeRepo.query(`SELECT COUNT(*)::int as cnt FROM items WHERE is_active = true`);
        if (r?.cnt > 0) stats.ITEM = r.cnt;
      }
      if (stats.CUSTOMER === 0) {
        const [r] = await this.barcodeRepo.query(`SELECT COUNT(*)::int as cnt FROM customers WHERE is_active = true`);
        if (r?.cnt > 0) stats.CUSTOMER = r.cnt;
      }
      if (stats.MACHINE === 0) {
        const [r] = await this.barcodeRepo.query(`SELECT COUNT(*)::int as cnt FROM machines WHERE is_active = true`);
        if (r?.cnt > 0) stats.MACHINE = r.cnt;
      }
      if (stats.WAREHOUSE === 0) {
        const [r] = await this.barcodeRepo.query(`SELECT COUNT(*)::int as cnt FROM warehouses WHERE is_active = true`);
        if (r?.cnt > 0) stats.WAREHOUSE = r.cnt;
      }
      if (stats.EMPLOYEE === 0) {
        const [r] = await this.barcodeRepo.query(`SELECT COUNT(*)::int as cnt FROM hr_employees WHERE is_active = true`);
        if (r?.cnt > 0) stats.EMPLOYEE = r.cnt;
      }
      if (stats.PRODUCTION_ENTRY === 0) {
        const [r] = await this.barcodeRepo.query(`SELECT COUNT(*)::int as cnt FROM production_entries WHERE is_active = true`);
        if (r?.cnt > 0) stats.PRODUCTION_ENTRY = r.cnt;
      }
      if (stats.JOB_CARD === 0) {
        const [r] = await this.barcodeRepo.query(`SELECT COUNT(*)::int as cnt FROM maintenance_job_cards WHERE is_active = true`);
        if (r?.cnt > 0) stats.JOB_CARD = r.cnt;
      }
      if (stats.GATE_PASS === 0) {
        try {
          const [r] = await this.barcodeRepo.query(`SELECT COUNT(*)::int as cnt FROM sales_deliveries WHERE is_active = true OR is_active IS NULL`);
          if (r?.cnt > 0) stats.GATE_PASS = r.cnt;
        } catch {
          // Ignore if table does not exist
        }
      }
      stats.total = stats.ITEM + stats.CUSTOMER + stats.MACHINE + stats.WAREHOUSE + stats.EMPLOYEE + stats.PRODUCTION_ENTRY + stats.JOB_CARD + (stats.GATE_PASS || 0);
    } catch {
      // Graceful fallback
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
    companyId: string | undefined,
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
      BarcodeEntityType.GATE_PASS,
    ];

    for (const et of entityTypes) {
      try {
        const entities = await this.queryEntitiesForBackfill(companyId, et);
        result.totalScanned += entities.length;

        for (const entity of entities) {
          try {
            const targetCompany = entity.companyId || companyId || '00000000-0000-0000-0000-000000000001';
            const existing = await this.findByEntity(targetCompany, et, entity.id);
            if (existing.length > 0) {
              result.alreadyExisting++;
              continue;
            }

            const created = await this.create(
              {
                entityType: et,
                entityId: entity.id,
                entityCode: entity.code,
                entityLabel: entity.label,
              },
              targetCompany,
            );
            result.created++;

            // Sync with source entity table so physical columns also have the barcode
            if (et === BarcodeEntityType.ITEM) {
              await this.barcodeRepo.query(
                `UPDATE items SET barcode = $1 WHERE id = $2 AND (barcode IS NULL OR barcode = '')`,
                [created.barcodeValue, entity.id],
              ).catch(() => {});
            } else if (et === BarcodeEntityType.MACHINE) {
              await this.barcodeRepo.query(
                `UPDATE machines SET qr_code = $1 WHERE id = $2 AND (qr_code IS NULL OR qr_code = '')`,
                [`/production/machines/${entity.id}`, entity.id],
              ).catch(() => {});
            }
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
    companyId: string | undefined,
    entityType: BarcodeEntityType,
  ): Promise<Array<{ id: string; code: string; label: string; companyId?: string }>> {
    let query = '';
    const params: any[] = [];

    switch (entityType) {
      case BarcodeEntityType.ITEM:
        query = `SELECT id, item_code as code, name as label, company_id as "companyId" FROM items WHERE is_active = true`;
        if (companyId) { query += ` AND (company_id = $1 OR company_id IS NULL)`; params.push(companyId); }
        break;
      case BarcodeEntityType.CUSTOMER:
        query = `SELECT id, customer_code as code, name as label, company_id as "companyId" FROM customers WHERE is_active = true`;
        if (companyId) { query += ` AND (company_id = $1 OR company_id IS NULL)`; params.push(companyId); }
        break;
      case BarcodeEntityType.MACHINE:
        query = `SELECT id, machine_code as code, name as label, company_id as "companyId" FROM machines WHERE is_active = true`;
        if (companyId) { query += ` AND (company_id = $1 OR company_id IS NULL)`; params.push(companyId); }
        break;
      case BarcodeEntityType.WAREHOUSE:
        query = `SELECT id, warehouse_code as code, name as label, company_id as "companyId" FROM warehouses WHERE is_active = true`;
        if (companyId) { query += ` AND (company_id = $1 OR company_id IS NULL)`; params.push(companyId); }
        break;
      case BarcodeEntityType.EMPLOYEE:
        query = `SELECT id, employee_code as code, (first_name || ' ' || COALESCE(last_name, '')) as label, company_id as "companyId" FROM hr_employees WHERE is_active = true`;
        if (companyId) { query += ` AND (company_id = $1 OR company_id IS NULL)`; params.push(companyId); }
        break;
      case BarcodeEntityType.PRODUCTION_ENTRY:
        query = `SELECT id, COALESCE(entry_number, 'PE-' || LEFT(id::text, 8)) as code, ('Production: ' || COALESCE(machine_no, '') || ' (' || entry_date || ')') as label, company_id as "companyId" FROM production_entries WHERE is_active = true`;
        if (companyId) { query += ` AND (company_id = $1 OR company_id IS NULL)`; params.push(companyId); }
        break;
      case BarcodeEntityType.JOB_CARD:
        query = `SELECT id, job_card_no as code, (job_card_no || ' - Job Card') as label, company_id as "companyId" FROM maintenance_job_cards WHERE is_active = true`;
        if (companyId) { query += ` AND (company_id = $1 OR company_id IS NULL)`; params.push(companyId); }
        break;
      case BarcodeEntityType.GATE_PASS:
        query = `SELECT id, delivery_number as code, ('Gate Pass: ' || delivery_number) as label, company_id as "companyId" FROM sales_deliveries WHERE is_active = true`;
        if (companyId) { query += ` AND (company_id = $1 OR company_id IS NULL)`; params.push(companyId); }
        break;
      default:
        return [];
    }

    const result = await this.barcodeRepo.query(query, params);
    return result.map((r: any) => ({
      id: r.id,
      code: r.code || r.id,
      label: r.label || r.code || 'Record',
      companyId: r.companyId,
    }));
  }
}
