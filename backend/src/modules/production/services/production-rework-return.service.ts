import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductionReworkReturn, ReworkReturnStatus, ReworkPriority } from '../entities';

export interface CreateReworkReturnDto {
  returnDate?: string;
  divisionId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  fromMachineId?: string;
  toMachineId?: string;
  itemId: string;
  uomId: string;
  quantity: number;
  quantityPcs?: number;
  quantityGrs?: number;
  defectReason: string;
  defectDescription?: string;
  correctiveAction: string;
  priority?: ReworkPriority;
  returnedBy?: string;
  remarks?: string;
}

export interface UpdateReworkReturnStatusDto {
  status: ReworkReturnStatus;
  receivedBy?: string;
  rectifiedQuantity?: number;
  scrappedQuantity?: number;
  remarks?: string;
}

export interface ReworkReturnFilterQuery {
  page?: number;
  limit?: number;
  divisionId?: string;
  fromDepartmentId?: string;
  toDepartmentId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

@Injectable()
export class ProductionReworkReturnService {
  constructor(
    @InjectRepository(ProductionReworkReturn)
    private readonly returnRepo: Repository<ProductionReworkReturn>,
  ) {}

  private async generateReturnNumber(companyId: string): Promise<string> {
    const now = new Date();
    const prefix = `PRTN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.returnRepo
      .createQueryBuilder('r')
      .where('r.companyId = :companyId', { companyId })
      .andWhere('r.returnNumber LIKE :pattern', { pattern: `${prefix}-%` })
      .getCount();
    const nextSeq = String(count + 1).padStart(4, '0');
    return `${prefix}-${nextSeq}`;
  }

  async create(dto: CreateReworkReturnDto, companyId: string, userId?: string): Promise<ProductionReworkReturn> {
    if (!dto.divisionId || !dto.fromDepartmentId || !dto.toDepartmentId || !dto.itemId || !dto.quantity) {
      throw new BadRequestException('Division, From Department, To Department, Item and Quantity are required.');
    }

    const returnNumber = await this.generateReturnNumber(companyId);

    const record = this.returnRepo.create({
      companyId,
      returnNumber,
      returnDate: dto.returnDate || new Date().toISOString().slice(0, 10),
      divisionId: dto.divisionId,
      fromDepartmentId: dto.fromDepartmentId,
      toDepartmentId: dto.toDepartmentId,
      fromMachineId: dto.fromMachineId || null,
      toMachineId: dto.toMachineId || null,
      itemId: dto.itemId,
      uomId: dto.uomId,
      quantity: Number(dto.quantity),
      quantityPcs: dto.quantityPcs ? Number(dto.quantityPcs) : null,
      quantityGrs: dto.quantityGrs ? Number(dto.quantityGrs) : null,
      defectReason: dto.defectReason || 'QUALITY_DEFECT',
      defectDescription: dto.defectDescription || null,
      correctiveAction: dto.correctiveAction || 'REWORK',
      priority: dto.priority || 'NORMAL',
      status: 'DISPATCHED',
      returnedBy: dto.returnedBy || null,
      isRework: true,
      remarks: dto.remarks || null,
      createdBy: userId || null,
    });

    return this.returnRepo.save(record);
  }

  async findAll(query: ReworkReturnFilterQuery, companyId: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 25));
    const skip = (page - 1) * limit;

    const qb = this.returnRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.division', 'division')
      .leftJoinAndSelect('r.fromDepartment', 'fromDept')
      .leftJoinAndSelect('r.toDepartment', 'toDept')
      .leftJoinAndSelect('r.fromMachine', 'fromMach')
      .leftJoinAndSelect('r.toMachine', 'toMach')
      .leftJoinAndSelect('r.item', 'item')
      .leftJoinAndSelect('r.uom', 'uom')
      .where('r.companyId = :companyId', { companyId });

    if (query.divisionId) {
      qb.andWhere('r.divisionId = :divisionId', { divisionId: query.divisionId });
    }
    if (query.fromDepartmentId) {
      qb.andWhere('r.fromDepartmentId = :fromDeptId', { fromDeptId: query.fromDepartmentId });
    }
    if (query.toDepartmentId) {
      qb.andWhere('r.toDepartmentId = :toDeptId', { toDeptId: query.toDepartmentId });
    }
    if (query.status && query.status !== 'ALL') {
      qb.andWhere('r.status = :status', { status: query.status });
    }
    if (query.dateFrom) {
      qb.andWhere('r.returnDate >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('r.returnDate <= :dateTo', { dateTo: query.dateTo });
    }
    if (query.search) {
      qb.andWhere(
        '(r.returnNumber ILIKE :search OR item.name ILIKE :search OR item.itemCode ILIKE :search OR r.returnedBy ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('r.createdAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, companyId: string): Promise<ProductionReworkReturn> {
    const item = await this.returnRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.division', 'division')
      .leftJoinAndSelect('r.fromDepartment', 'fromDept')
      .leftJoinAndSelect('r.toDepartment', 'toDept')
      .leftJoinAndSelect('r.fromMachine', 'fromMach')
      .leftJoinAndSelect('r.toMachine', 'toMach')
      .leftJoinAndSelect('r.item', 'item')
      .leftJoinAndSelect('r.uom', 'uom')
      .where('r.id = :id AND r.companyId = :companyId', { id, companyId })
      .getOne();

    if (!item) {
      throw new NotFoundException(`Rework return with ID ${id} not found`);
    }

    return item;
  }

  async updateStatus(
    id: string,
    companyId: string,
    dto: UpdateReworkReturnStatusDto,
    userId?: string,
  ): Promise<ProductionReworkReturn> {
    const record = await this.findOne(id, companyId);

    record.status = dto.status;
    if (dto.receivedBy) record.receivedBy = dto.receivedBy;
    if (dto.rectifiedQuantity !== undefined) record.rectifiedQuantity = Number(dto.rectifiedQuantity);
    if (dto.scrappedQuantity !== undefined) record.scrappedQuantity = Number(dto.scrappedQuantity);
    if (dto.remarks) {
      record.remarks = record.remarks ? `${record.remarks} | ${dto.remarks}` : dto.remarks;
    }
    record.updatedBy = userId || null;

    return this.returnRepo.save(record);
  }

  async update(
    id: string,
    companyId: string,
    dto: Partial<CreateReworkReturnDto>,
    userId?: string,
  ): Promise<ProductionReworkReturn> {
    const record = await this.findOne(id, companyId);

    if (dto.returnDate) record.returnDate = dto.returnDate;
    if (dto.divisionId) record.divisionId = dto.divisionId;
    if (dto.fromDepartmentId) record.fromDepartmentId = dto.fromDepartmentId;
    if (dto.toDepartmentId) record.toDepartmentId = dto.toDepartmentId;
    if (dto.itemId) record.itemId = dto.itemId;
    if (dto.uomId) record.uomId = dto.uomId;
    if (dto.quantity !== undefined) {
      record.quantity = Number(dto.quantity);
      record.quantityPcs = Number(dto.quantity);
      record.quantityGrs = Number(dto.quantity) / 144;
    }
    if (dto.defectReason) record.defectReason = dto.defectReason;
    if (dto.defectDescription !== undefined) record.defectDescription = dto.defectDescription;
    if (dto.correctiveAction) record.correctiveAction = dto.correctiveAction;
    if (dto.priority) record.priority = dto.priority;
    if (dto.returnedBy !== undefined) record.returnedBy = dto.returnedBy;
    if (dto.remarks !== undefined) record.remarks = dto.remarks;

    record.updatedBy = userId || null;
    return this.returnRepo.save(record);
  }

  async delete(id: string, companyId: string): Promise<boolean> {
    const record = await this.findOne(id, companyId);
    await this.returnRepo.remove(record);
    return true;
  }

  async getSummary(companyId: string, divisionId?: string) {
    const qb = this.returnRepo.createQueryBuilder('r').where('r.companyId = :companyId', { companyId });
    if (divisionId) {
      qb.andWhere('r.divisionId = :divisionId', { divisionId });
    }

    const all = await qb.getMany();

    const totalRecords = all.length;
    const dispatched = all.filter((r) => r.status === 'DISPATCHED').length;
    const acknowledged = all.filter((r) => r.status === 'ACKNOWLEDGED').length;
    const inRework = all.filter((r) => r.status === 'IN_REWORK').length;
    const rectified = all.filter((r) => r.status === 'RECTIFIED').length;
    const closed = all.filter((r) => r.status === 'CLOSED').length;
    const scrapped = all.filter((r) => r.status === 'SCRAPPED').length;

    const totalReturnedQuantity = all.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
    const totalRectifiedQuantity = all.reduce((sum, r) => sum + Number(r.rectifiedQuantity || 0), 0);
    const totalScrappedQuantity = all.reduce((sum, r) => sum + Number(r.scrappedQuantity || 0), 0);

    // Defect breakdown
    const defectMap: Record<string, number> = {};
    all.forEach((r) => {
      const reason = r.defectReason || 'OTHER';
      defectMap[reason] = (defectMap[reason] || 0) + 1;
    });

    // 1. Daily Trend
    let dailyTrend: any[] = [];
    try {
      dailyTrend = await this.returnRepo.manager.query(`
        SELECT 
          to_char(return_date, 'YYYY-MM-DD') AS "date",
          to_char(return_date, 'DD-Mon') AS "dateLabel",
          COALESCE(SUM(quantity), 0)::numeric AS "returnedQty",
          COALESCE(SUM(rectified_quantity), 0)::numeric AS "rectifiedQty",
          COALESCE(SUM(scrapped_quantity), 0)::numeric AS "scrappedQty",
          COUNT(*)::int AS "batches"
        FROM production_rework_returns
        WHERE company_id = $1
        GROUP BY return_date
        ORDER BY return_date ASC
        LIMIT 30;
      `, [companyId]);
    } catch (e) {
      dailyTrend = [];
    }

    // 2. Monthly Trend
    let monthlyTrend: any[] = [];
    try {
      monthlyTrend = await this.returnRepo.manager.query(`
        SELECT 
          to_char(return_date, 'YYYY-MM') AS "month",
          to_char(return_date, 'Mon YYYY') AS "monthLabel",
          COALESCE(SUM(quantity), 0)::numeric AS "returnedQty",
          COALESCE(SUM(rectified_quantity), 0)::numeric AS "rectifiedQty",
          COALESCE(SUM(scrapped_quantity), 0)::numeric AS "scrappedQty",
          COUNT(*)::int AS "batches"
        FROM production_rework_returns
        WHERE company_id = $1
        GROUP BY to_char(return_date, 'YYYY-MM'), to_char(return_date, 'Mon YYYY')
        ORDER BY "month" ASC
        LIMIT 12;
      `, [companyId]);
    } catch (e) {
      monthlyTrend = [];
    }

    // 3. Plating Production vs Rework Analytics
    let platingAnalytics = {
      latestDate: '',
      latestProduction: 0,
      latestRework: 0,
      latestReworkRate: 0,
      monthProduction: 0,
      monthRework: 0,
      monthReworkRate: 0,
      totalProduction: 0,
      totalRework: 0,
      overallReworkRate: 0,
      dailyComparison: [] as any[],
    };

    try {
      const platingProdRows: any[] = await this.returnRepo.manager.query(`
        SELECT 
          to_char(entry_date, 'YYYY-MM-DD') AS "date",
          to_char(entry_date, 'DD-Mon') AS "dateLabel",
          SUM(actual_quantity)::numeric AS "producedQty"
        FROM production_entries
        WHERE department_id IN ('d3000000-0000-0000-0000-000000000006', 'd3000000-0000-0000-0000-000000000007')
        GROUP BY entry_date
        ORDER BY entry_date DESC
        LIMIT 30;
      `);

      const platingReworkRows: any[] = await this.returnRepo.manager.query(`
        SELECT 
          to_char(return_date, 'YYYY-MM-DD') AS "date",
          to_char(return_date, 'DD-Mon') AS "dateLabel",
          SUM(quantity)::numeric AS "reworkQty"
        FROM production_rework_returns
        WHERE to_department_id IN ('d3000000-0000-0000-0000-000000000006', 'd3000000-0000-0000-0000-000000000007')
        GROUP BY return_date
        ORDER BY return_date DESC
        LIMIT 30;
      `);

      const reworkByDate = new Map<string, number>();
      platingReworkRows.forEach((r: any) => reworkByDate.set(r.date, Number(r.reworkQty) || 0));

      const compMap = new Map<string, any>();
      platingProdRows.forEach((p: any) => {
        const d = p.date;
        const prod = Number(p.producedQty) || 0;
        const rew = reworkByDate.get(d) || 0;
        const rate = prod > 0 ? Number(((rew / prod) * 100).toFixed(2)) : 0;
        compMap.set(d, {
          date: d,
          dateLabel: p.dateLabel,
          producedQty: prod,
          reworkQty: rew,
          reworkRate: rate,
        });
      });

      platingReworkRows.forEach((r: any) => {
        if (!compMap.has(r.date)) {
          compMap.set(r.date, {
            date: r.date,
            dateLabel: r.dateLabel,
            producedQty: 0,
            reworkQty: Number(r.reworkQty) || 0,
            reworkRate: 100,
          });
        }
      });

      const dailyComparison = Array.from(compMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14);

      const totalProd = platingProdRows.reduce((acc: number, r: any) => acc + (Number(r.producedQty) || 0), 0);
      const totalRew = platingReworkRows.reduce((acc: number, r: any) => acc + (Number(r.reworkQty) || 0), 0);
      const latestProdRow = platingProdRows[0];
      const latestDate = latestProdRow?.date || '';
      const latestProd = Number(latestProdRow?.producedQty) || 0;
      const latestRew = reworkByDate.get(latestDate) || (platingReworkRows[0] ? Number(platingReworkRows[0].reworkQty) : 0);
      const latestRate = latestProd > 0 ? Number(((latestRew / latestProd) * 100).toFixed(2)) : 0;
      const overallRate = totalProd > 0 ? Number(((totalRew / totalProd) * 100).toFixed(2)) : 0;

      platingAnalytics = {
        latestDate,
        latestProduction: latestProd,
        latestRework: latestRew,
        latestReworkRate: latestRate,
        monthProduction: totalProd,
        monthRework: totalRew,
        monthReworkRate: overallRate,
        totalProduction: totalProd,
        totalRework: totalRew,
        overallReworkRate: overallRate,
        dailyComparison,
      };
    } catch (e) {
      console.warn('Error computing plating analytics:', e);
    }

    return {
      success: true,
      data: {
        totalRecords,
        dispatched,
        acknowledged,
        inRework,
        rectified,
        closed,
        scrapped,
        totalReturnedQuantity,
        totalRectifiedQuantity,
        totalScrappedQuantity,
        defectBreakdown: defectMap,
        dailyTrend,
        monthlyTrend,
        platingAnalytics,
      },
    };
  }

  async getLookupOptions(companyId?: string) {
    try {
      const rows: any[] = await this.returnRepo.manager.query(`
        SELECT id, category, label, value, is_default AS "isDefault"
        FROM rework_lookup_options
        ORDER BY is_default DESC, label ASC;
      `);
      return {
        success: true,
        data: {
          defectReasons: rows.filter((r: any) => r.category === 'DEFECT_REASON'),
          correctiveActions: rows.filter((r: any) => r.category === 'CORRECTIVE_ACTION'),
        },
      };
    } catch (err) {
      return {
        success: true,
        data: { defectReasons: [], correctiveActions: [] },
      };
    }
  }

  async addLookupOption(companyId: string, dto: { category: string; label: string; value?: string }) {
    const rawLabel = (dto.label || '').trim();
    if (!rawLabel) {
      throw new BadRequestException('Label cannot be empty');
    }
    const val = dto.value || rawLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const res: any[] = await this.returnRepo.manager.query(`
      INSERT INTO rework_lookup_options (company_id, category, label, value, is_default)
      VALUES ($1, $2, $3, $4, false)
      ON CONFLICT (category, value) DO UPDATE SET label = $3
      RETURNING id, category, label, value, is_default AS "isDefault";
    `, [companyId, dto.category, rawLabel, val]);
    return {
      success: true,
      data: res[0],
      message: `${dto.category === 'DEFECT_REASON' ? 'Defect Reason' : 'Corrective Action'} "${rawLabel}" saved successfully`,
    };
  }

  async getStageItems(params: {
    divisionId?: string;
    fromDepartmentId?: string;
    toDepartmentId?: string;
  }): Promise<any[]> {
    const rawItems: any[] = await this.returnRepo.manager.query(`
      SELECT 
        i.id,
        i.item_code AS "itemCode",
        i.name,
        i.item_type AS "itemType",
        i.department_id AS "departmentId",
        i.division_id AS "divisionId",
        i.base_uom_id AS "baseUomId",
        u.id AS "uomId",
        u.code AS "uomCode",
        u.name AS "uomName"
      FROM items i
      LEFT JOIN uoms u ON u.id = i.base_uom_id
      WHERE (
        i.item_code LIKE 'WIP-%' 
        OR i.item_code LIKE 'FG-NP%' 
        OR i.item_code LIKE 'SPI-FG%'
      )
      ORDER BY 
        CASE 
          WHEN i.item_code LIKE 'WIP-SPL%' THEN 1
          WHEN i.item_code LIKE 'WIP-SPK%' THEN 2
          WHEN i.item_code LIKE 'WIP-SW%' THEN 3
          WHEN i.item_code LIKE 'WIP-ST%' THEN 4
          WHEN i.item_code LIKE 'FG-NP%' THEN 5
          WHEN i.item_code LIKE 'WIP-NPL%' THEN 6
          WHEN i.item_code LIKE 'SPI-FG%' THEN 7
          ELSE 8
        END,
        i.item_code ASC
      LIMIT 500;
    `);

    let fromDeptCode = '';
    let toDeptCode = '';
    let fromDeptName = '';
    let toDeptName = '';
    if (params.fromDepartmentId || params.toDepartmentId) {
      const p1 = params.fromDepartmentId || '00000000-0000-0000-0000-000000000000';
      const p2 = params.toDepartmentId || '00000000-0000-0000-0000-000000000000';
      const depts: any[] = await this.returnRepo.manager.query(`
        SELECT id, department_code, name FROM departments 
        WHERE id = $1 OR id = $2
      `, [p1, p2]);
      const fromDept = depts.find(d => d.id === params.fromDepartmentId);
      const toDept = depts.find(d => d.id === params.toDepartmentId);
      if (fromDept) {
        fromDeptCode = fromDept.department_code || '';
        fromDeptName = (fromDept.name || '').toLowerCase();
      }
      if (toDept) {
        toDeptCode = toDept.department_code || '';
        toDeptName = (toDept.name || '').toLowerCase();
      }
    }

    return rawItems.map((item) => {
      let componentType = 'OTHER';
      let stageLabel = 'Shopfloor Material';
      let category = 'OTHER';

      const code = item.itemCode || '';
      const name = item.name || '';
      const nameLower = name.toLowerCase();

      if (code.startsWith('WIP-SPL')) {
        if (nameLower.includes('inner')) {
          componentType = 'INNER_SPOKE';
          stageLabel = 'Plated Inner Spoke';
        } else if (nameLower.includes('outer')) {
          componentType = 'OUTER_SPOKE';
          stageLabel = 'Plated Outer Spoke';
        } else {
          componentType = 'PLATED_SPOKE';
          stageLabel = 'Plated Spoke';
        }
        category = 'PLATED_COMPONENTS';
      } else if (code.startsWith('FG-NP') || code.startsWith('WIP-NPL')) {
        componentType = 'NIPPLE';
        stageLabel = 'Plated Nipple';
        category = 'PLATED_COMPONENTS';
      } else if (code.startsWith('WIP-SPK')) {
        if (nameLower.includes('inner')) {
          componentType = 'HEADING_INNER_SPOKE';
          stageLabel = 'Heading Inner Spoke (Unplated)';
        } else if (nameLower.includes('outer')) {
          componentType = 'HEADING_OUTER_SPOKE';
          stageLabel = 'Heading Outer Spoke (Unplated)';
        } else {
          componentType = 'HEADING_SPOKE';
          stageLabel = 'Heading Spoke (Unplated)';
        }
        category = 'HEADING_COMPONENTS';
      } else if (code.startsWith('WIP-SW')) {
        componentType = 'SWAGGED_WIRE';
        stageLabel = 'Swagged Wire';
        category = 'WIRE_PROCESSING';
      } else if (code.startsWith('WIP-ST')) {
        componentType = 'STRAIGHT_WIRE';
        stageLabel = 'Straightened Cut Wire';
        category = 'WIRE_PROCESSING';
      } else if (code.startsWith('SPI-FG-SPK')) {
        componentType = 'PACKED_CARTON';
        stageLabel = 'Packed Finished Good Carton';
        category = 'PACKED_CARTONS';
      } else if (code.startsWith('WIP-CS') || code.startsWith('WIP-PVC') || code.startsWith('WIP-PVS') || code.startsWith('WIP-FLAT')) {
        componentType = 'CABLE_WIP';
        stageLabel = 'Cable WIP Component';
        category = 'CABLE_WIP';
      }

      // Check recommendation based on from/to departments
      let isRecommended = false;
      const isPackingToPlating =
        (fromDeptName.includes('packing') || fromDeptCode === 'SPD-DEPT008') &&
        (toDeptName.includes('plating') || toDeptCode === 'SPD-DEPT006');
      const isPlatingToHeader =
        (fromDeptName.includes('plating') || fromDeptCode === 'SPD-DEPT006') &&
        (toDeptName.includes('spoke') || toDeptName.includes('header') || toDeptCode === 'SPD-DEPT003' || toDeptCode === 'SPD-DEPT004');
      const isHeaderToSwagOrStraight =
        (fromDeptName.includes('spoke') || fromDeptName.includes('header')) &&
        (toDeptName.includes('swag') || toDeptName.includes('straight') || toDeptCode === 'SPD-DEPT001' || toDeptCode === 'SPD-DEPT002');

      if (isPackingToPlating && category === 'PLATED_COMPONENTS') {
        isRecommended = true;
      } else if (isPlatingToHeader && category === 'HEADING_COMPONENTS') {
        isRecommended = true;
      } else if (isHeaderToSwagOrStraight && category === 'WIRE_PROCESSING') {
        isRecommended = true;
      }

      return {
        ...item,
        componentType,
        stageLabel,
        category,
        isRecommended,
      };
    });
  }
}
