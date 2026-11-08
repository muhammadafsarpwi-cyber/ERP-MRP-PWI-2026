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
      },
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
        OR i.division_id = 'd1000000-0000-0000-0000-000000000001'
      )
      ORDER BY i.item_code ASC
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
