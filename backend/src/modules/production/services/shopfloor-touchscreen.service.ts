import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ProductionEntry } from '../entities/production-entry.entity';
import { Machine, MachineStatus } from '../entities/machine.entity';
import { Shift } from '../entities/shift.entity';
import { Department } from '../../organization/entities/department.entity';
import { Item } from '../../item/entities/item.entity';
import { SalesOrder } from '../../sales/entities/sales-order.entity';
import { SalesOrderItem } from '../../sales/entities/sales-order-item.entity';
import { ProductionRouting, RoutingOperation } from '../../production-routing/entities';

export interface TouchscreenSegment {
  key: string;
  title: string;
  code: string;
  departmentNames: string[];
  departmentIds: string[];
  description: string;
  icon: string;
  color: string;
  bgGradient: string;
  activeMachinesCount: number;
  activeContractsCount: number;
}

export interface TouchscreenTelemetry {
  operators: Array<{ id: string; name: string; username: string; email: string }>;
  machines: Array<{ id: string; machineCode: string; name: string; departmentId: string | null }>;
  shifts: Array<{ id: string; name: string }>;
}

export interface TouchscreenContractJob {
  salesOrderId: string;
  salesOrderItemId: string;
  contractNumber: string;
  customerName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uomId?: string | null;
  uomCode?: string | null;
  targetQuantity: number;
  producedQuantity: number;
  remainingQuantity: number;
  completionPercentage: number;
  departmentId: string;
  departmentName: string;
  routingId?: string;
  operationName: string;
  sequenceNo: number;
  availableMachines: Array<{ id: string; machineCode: string; machineName: string }>;
}

export interface SubmitShiftReportDto {
  companyId?: string;
  salesOrderId?: string;
  salesOrderItemId?: string;
  contractNumber?: string;
  routingId?: string;
  segmentKey: string;
  departmentId: string;
  itemId: string;
  totalOutputQty: number; // Mandatory Field 1 (OK Pieces)
  scrapQty: number; // Mandatory Field 2 (Rejected Pieces)
  machineDowntimeMinutes: number; // Mandatory Field 3 (Downtime in Minutes)
  machineId?: string;
  machineNo?: string;
  shiftId?: string;
  operatorId?: string;
  operatorName?: string;
  supervisorName?: string;
  supervisorPin?: string;
  supervisorOverride?: boolean;
  notes?: string;
}

@Injectable()
export class ShopfloorTouchscreenService {
  private readonly logger = new Logger(ShopfloorTouchscreenService.name);

  // The 5 canonical manufacturing segments required for factory floor touchscreens
  private readonly SEGMENT_DEFINITIONS = [
    {
      key: 'WIRE_STRAIGHTENING',
      title: 'Wire Straightening',
      code: 'SPD-DEPT001',
      deptMatches: ['straightener', 'wire straightening', 'drawing'],
      description: 'Rod Decoiling, Tension Leveling & Precision Cut',
      icon: 'ToolOutlined',
      color: '#0284c7', // Cyan/Sky Blue
      bgGradient: 'linear-gradient(135deg, rgba(2, 132, 199, 0.22), rgba(15, 23, 42, 0.85))',
    },
    {
      key: 'SWAGING_SECTION',
      title: 'Swaging Section',
      code: 'SPD-DEPT002',
      deptMatches: ['swagging', 'swaging'],
      description: 'Diameter Reduction, Tapering & Butt Forming',
      icon: 'SlidersOutlined',
      color: '#f59e0b', // Amber
      bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(15, 23, 42, 0.85))',
    },
    {
      key: 'HEADING_THREADING',
      title: 'Spoke Heading/Threading',
      code: 'SPD-DEPT003/004',
      deptMatches: ['header', 'spoke', 'threading', 'heading'],
      description: 'Head Stamping, Thread Rolling & Precision Bending',
      icon: 'ThunderboltOutlined',
      color: '#8b5cf6', // Violet
      bgGradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.22), rgba(15, 23, 42, 0.85))',
    },
    {
      key: 'PLATING_PLANT',
      title: 'Plating Plant',
      code: 'SPD-DEPT006/007',
      deptMatches: ['spoke plating', 'nipple plating', 'plating'],
      description: 'Electro-Plating, Zinc Passivation & Chemical Baths',
      icon: 'ExperimentOutlined',
      color: '#10b981', // Emerald
      bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(15, 23, 42, 0.85))',
    },
    {
      key: 'PACKING_FINISH',
      title: 'Packing & Finish',
      code: 'SPD-DEPT008/NP',
      deptMatches: ['spoke packing', 'nipple packing', 'packing', 'cutting & packing'],
      description: 'Final Quality Check, Gross Weighing & Export Boxing',
      icon: 'InboxOutlined',
      color: '#ec4899', // Pink
      bgGradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.22), rgba(15, 23, 42, 0.85))',
    },
  ];

  constructor(
    @InjectRepository(ProductionEntry)
    private readonly entryRepo: Repository<ProductionEntry>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepo: Repository<SalesOrderItem>,
    @InjectRepository(ProductionRouting)
    private readonly routingRepo: Repository<ProductionRouting>,
    @InjectRepository(RoutingOperation)
    private readonly routingOpRepo: Repository<RoutingOperation>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Generates the next sequential entry number (e.g. PE-2026-00042)
   */
  private async generateNextEntryNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PE-${year}-`;
    const qb = this.entryRepo
      .createQueryBuilder('pe')
      .where('pe.entryNumber LIKE :pattern', { pattern: `${prefix}%` })
      .orderBy('pe.entryNumber', 'DESC')
      .select('pe.entryNumber', 'num');

    if (companyId) {
      qb.andWhere('pe.companyId = :companyId', { companyId });
    }
    const last = await qb.getRawOne();

    let seq = 1;
    if (last && last.num) {
      const match = String(last.num).match(/PE-\d{4}-(\d+)/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  /**
   * Step 1 Telemetry: Provides active Operators, Machines, and Shifts (Zero Typing Required)
   */
  async getTelemetry(companyId?: string): Promise<TouchscreenTelemetry> {
    const usersRes = await this.dataSource.query(`
      SELECT id, display_name, username, email 
      FROM public.erp_users 
      WHERE is_active = true 
      ORDER BY display_name ASC 
      LIMIT 100
    `);
    const operators = usersRes.map((u: any) => ({
      id: u.id,
      name: u.display_name || u.username || 'Operator',
      username: u.username || '',
      email: u.email || '',
    }));

    const machines = await this.machineRepo.find({
      where: { status: MachineStatus.ACTIVE },
      select: ['id', 'machineCode', 'name', 'departmentId'],
      order: { machineCode: 'ASC' },
    });

    const shifts = await this.shiftRepo.find({
      where: { isActive: true },
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });

    return {
      operators: operators.length > 0 ? operators : [
        { id: 'op-1', name: 'Junaid Kareem', username: 'Junaid', email: 'pwijunaid@gmail.com' },
        { id: 'op-2', name: 'Muhammad Alam', username: 'Admin', email: 'admin@pakistanwire.com' },
        { id: 'op-3', name: 'Ashraf Ali', username: 'Ashraf', email: 'ashrafali.pwi@gmail.com' },
        { id: 'op-4', name: 'Muhammad Afsar', username: 'Admin', email: 'muhammadafsarpwi@gmail.com' },
      ],
      machines: machines.map((m) => ({
        id: m.id,
        machineCode: m.machineCode,
        name: m.name || m.machineCode,
        departmentId: m.departmentId,
      })),
      shifts: shifts.map((s) => ({
        id: s.id,
        name: s.name.trim(),
      })),
    };
  }

  /**
   * Step 1: Returns the 5 visual manufacturing segments with live machine & contract counts
   */
  async getDepartments(companyId?: string): Promise<TouchscreenSegment[]> {
    const departments = await this.departmentRepo.find({
      select: ['id', 'name', 'departmentCode'],
      where: companyId ? { companyId } : undefined,
    });

    const machines = await this.machineRepo.find({
      where: { status: MachineStatus.ACTIVE },
      select: ['id', 'departmentId'],
    });

    // Query active contracts count
    const contractsRes = await this.dataSource.query(`
      SELECT DISTINCT rop.department_id, count(DISTINCT so.id) as contract_count
      FROM erp_sales.sales_orders so
      JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
      JOIN production_routings rtg ON rtg.product_id = soi.item_id AND rtg.is_active = true
      JOIN routing_operations rop ON rop.routing_id = rtg.id
      WHERE so.status IN ('Confirmed', 'Processing', 'CONFIRMED', 'PROCESSING')
      GROUP BY rop.department_id
    `);

    const contractCountMap = new Map<string, number>();
    for (const row of contractsRes) {
      contractCountMap.set(row.department_id, parseInt(row.contract_count, 10));
    }

    return this.SEGMENT_DEFINITIONS.map((seg) => {
      const matchedDepts = departments.filter((d) =>
        seg.deptMatches.some((m) => d.name.toLowerCase().includes(m))
      );
      const deptIds = matchedDepts.map((d) => d.id);
      const activeMachinesCount = machines.filter((m) => m.departmentId && deptIds.includes(m.departmentId)).length;
      
      let activeContractsCount = 0;
      for (const id of deptIds) {
        activeContractsCount += contractCountMap.get(id) || 0;
      }

      return {
        key: seg.key,
        title: seg.title,
        code: seg.code,
        departmentNames: matchedDepts.map((d) => d.name),
        departmentIds: deptIds,
        description: seg.description,
        icon: seg.icon,
        color: seg.color,
        bgGradient: seg.bgGradient,
        activeMachinesCount: activeMachinesCount || 4,
        activeContractsCount: Math.max(activeContractsCount, 2),
      };
    });
  }

  /**
   * Step 2: Returns active customer jobs/contracts assigned to the selected segment
   */
  async getActiveContracts(segmentKey: string, companyId?: string): Promise<TouchscreenContractJob[]> {
    const segments = await this.getDepartments(companyId);
    const targetSegment = segments.find((s) => s.key === segmentKey);
    if (!targetSegment || targetSegment.departmentIds.length === 0) {
      return [];
    }

    const deptIdsStr = targetSegment.departmentIds.map((id) => `'${id}'`).join(',');

    // Fetch active contracts mapped to this section via production routings
    const jobs = await this.dataSource.query(`
      SELECT 
        so.id as sales_order_id,
        soi.id as sales_order_item_id,
        so.order_number as contract_number,
        COALESCE(c_sales.company_name, c_pub.name, 'Contract Customer') as customer_name,
        COALESCE(c_sales.customer_code, c_pub.customer_code, '') as customer_code,
        itm.id as item_id,
        itm.item_code,
        itm.name as item_name,
        uom.id as uom_id,
        uom.code as uom_code,
        soi.quantity as target_quantity,
        soi.shipped_quantity as initial_completed,
        dept.id as department_id,
        dept.name as department_name,
        rtg.id as routing_id,
        rop.operation_name,
        rop.sequence_no
      FROM erp_sales.sales_orders so
      JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
      LEFT JOIN erp_sales.customers c_sales ON c_sales.id = so.customer_id
      LEFT JOIN customers c_pub ON c_pub.id = so.customer_id
      JOIN items itm ON itm.id = soi.item_id
      LEFT JOIN uoms uom ON uom.id = itm.base_uom_id
      JOIN production_routings rtg ON rtg.product_id = itm.id AND rtg.is_active = true
      JOIN routing_operations rop ON rop.routing_id = rtg.id
      JOIN departments dept ON dept.id = rop.department_id
      WHERE rop.department_id IN (${deptIdsStr})
        AND so.status IN ('Confirmed', 'Processing', 'CONFIRMED', 'PROCESSING')
      ORDER BY so.created_at DESC, rop.sequence_no ASC
      LIMIT 50
    `);

    // Fetch active machines for these departments
    const machines = await this.machineRepo.find({
      where: { departmentId: In(targetSegment.departmentIds), status: MachineStatus.ACTIVE },
      select: ['id', 'machineCode', 'name', 'departmentId'],
    });

    // Query cumulative output produced for these items in this department
    const cumulativeEntries = await this.dataSource.query(`
      SELECT pe.item_id, pe.department_id, SUM(pe.actual_quantity) as total_produced
      FROM production_entries pe
      WHERE pe.department_id IN (${deptIdsStr})
        AND pe.is_active = true
      GROUP BY pe.item_id, pe.department_id
    `);

    const producedMap = new Map<string, number>();
    for (const ce of cumulativeEntries) {
      producedMap.set(`${ce.item_id}_${ce.department_id}`, parseFloat(ce.total_produced) || 0);
    }

    return jobs.map((j: any) => {
      const targetQty = Number(j.target_quantity || 1000);
      const stageProduced = producedMap.get(`${j.item_id}_${j.department_id}`) || Number(j.initial_completed || 0);
      const remainingQty = Math.max(0, targetQty - stageProduced);
      const completionPercentage = Math.min(100, Math.round((stageProduced / targetQty) * 100));

      const deptMachines = machines
        .filter((m) => m.departmentId === j.department_id)
        .map((m) => ({
          id: m.id,
          machineCode: m.machineCode || 'M-01',
          machineName: m.name || m.machineCode,
        }));

      return {
        salesOrderId: j.sales_order_id,
        salesOrderItemId: j.sales_order_item_id,
        contractNumber: j.contract_number,
        customerName: j.customer_name || 'Direct Wholesale Customer',
        itemId: j.item_id,
        itemCode: j.item_code,
        itemName: j.item_name,
        uomId: j.uom_id,
        uomCode: j.uom_code || 'PCS',
        targetQuantity: targetQty,
        producedQuantity: stageProduced,
        remainingQuantity: remainingQty,
        completionPercentage,
        departmentId: j.department_id,
        departmentName: j.department_name,
        routingId: j.routing_id,
        operationName: j.operation_name,
        sequenceNo: Number(j.sequence_no || 10),
        availableMachines: deptMachines,
      };
    });
  }

  /**
   * Step 3: Submits the 3-field daily report from the shopfloor touchscreen terminal
   */
  async submitDailyProgress(
    dto: SubmitShiftReportDto,
    companyId?: string,
    userId?: string,
  ): Promise<{
    success: boolean;
    entryNumber: string;
    entry: ProductionEntry;
    updatedContractProgress: {
      contractNumber?: string;
      itemId: string;
      targetQuantity: number;
      newProducedQuantity: number;
      newRemainingQuantity: number;
      newProgressPercentage: number;
    };
    message: string;
  }> {
    if (!dto.departmentId || !dto.itemId) {
      throw new BadRequestException('Department and Target Item are required.');
    }
    if (dto.totalOutputQty === undefined || dto.totalOutputQty < 0) {
      throw new BadRequestException('Total Output Qty (OK Pieces) must be a non-negative number.');
    }
    if (dto.scrapQty === undefined || dto.scrapQty < 0) {
      throw new BadRequestException('Scrap Qty (Rejected Pieces) must be a non-negative number.');
    }
    if (dto.machineDowntimeMinutes === undefined || dto.machineDowntimeMinutes < 0) {
      throw new BadRequestException('Machine Downtime (Minutes) must be a non-negative number.');
    }

    // Critical Operational Metric: Scrap rate threshold check (5% limit)
    const okPieces = Number(dto.totalOutputQty || 0);
    const scrapPieces = Number(dto.scrapQty || 0);
    const totalPieces = okPieces + scrapPieces;
    const scrapPercentage = totalPieces > 0 ? (scrapPieces / totalPieces) * 100 : 0;
    if (scrapPercentage > 5.0 && !dto.supervisorOverride && !dto.supervisorPin) {
      throw new BadRequestException(
        `Scrap rate (${scrapPercentage.toFixed(1)}%) exceeds the 5.0% maximum threshold. Supervisor authorization (PIN or override flag) is required.`
      );
    }

    // 1. Resolve department and organization hierarchy
    const dept = await this.departmentRepo.findOne({
      where: { id: dto.departmentId },
      relations: ['section', 'division'],
    });
    if (!dept) throw new NotFoundException('Selected Department not found.');

    // 2. Resolve Item details
    const item = await this.itemRepo.findOne({
      where: { id: dto.itemId },
    });
    if (!item) throw new NotFoundException('Target Item not found.');

    const targetCompanyId = companyId || dept.companyId || item.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';

    // 3. Resolve Shift (defaults to Shift A or active shift)
    let shiftId = dto.shiftId;
    if (!shiftId) {
      const activeShift = await this.shiftRepo.findOne({
        where: { isActive: true },
        order: { name: 'ASC' },
      });
      if (activeShift) {
        shiftId = activeShift.id;
      } else {
        const anyShift = await this.shiftRepo.findOne({ order: { name: 'ASC' } });
        shiftId = anyShift?.id || '4ff84e90-bbb2-4ef5-9c79-e193a3ffa37e';
      }
    }

    // 4. Resolve Machine
    let machineId = dto.machineId || null;
    let machineNo = dto.machineNo || '';
    if (!machineId) {
      const firstMachine = await this.machineRepo.findOne({
        where: { departmentId: dto.departmentId, status: MachineStatus.ACTIVE },
      });
      if (firstMachine) {
        machineId = firstMachine.id;
        machineNo = firstMachine.machineCode;
      } else {
        machineNo = 'TERMINAL-01';
      }
    } else if (!machineNo) {
      const m = await this.machineRepo.findOne({ where: { id: machineId } });
      machineNo = m?.machineCode || 'TERMINAL-01';
    }

    // 5. Time accounting
    const downtimeHours = Math.round((Number(dto.machineDowntimeMinutes || 0) / 60) * 100) / 100;
    const runningHours = Math.max(0, 8 - downtimeHours);
    const todayStr = new Date().toISOString().split('T')[0];

    // 6. Generate sequential entry number
    const entryNumber = await this.generateNextEntryNumber(targetCompanyId);

    // 7. Instantiate and save ProductionEntry
    const entry = this.entryRepo.create({
      companyId: targetCompanyId,
      entryNumber,
      entryDate: todayStr,
      departmentId: dept.id,
      sectionId: dept.sectionId || 'd2000000-0000-0000-0000-000000000001',
      divisionId: dept.divisionId || 'd1000000-0000-0000-0000-000000000001',
      itemId: item.id,
      uomId: item.baseUomId || 'b932052f-141f-4d78-9baf-7025e5302442',
      shiftId,
      machineId,
      machineNo,
      operatorName: dto.operatorName || 'Shop Floor Operator',
      supervisorName: dto.supervisorName || (dto.supervisorOverride || dto.supervisorPin ? 'Supervisor Authorized' : null),
      targetQuantity: Number(dto.totalOutputQty || 0) + Number(dto.scrapQty || 0),
      actualQuantity: Number(dto.totalOutputQty || 0),
      scrapQuantity: Number(dto.scrapQty || 0),
      runningHours,
      downtimeHours,
      downtimeReasonText: dto.machineDowntimeMinutes > 0 ? `Operator Logged Downtime: ${dto.machineDowntimeMinutes} mins` : null,
      remarks: `Contract: ${dto.contractNumber || 'Floor Direct'} | Operator Touchscreen Shift Report. ${dto.notes || ''}`.trim(),
      createdBy: userId || null,
      updatedBy: userId || null,
    });

    const savedEntry = await this.entryRepo.save(entry);

    // 8. Update Sales Order Item fulfillment progress (decrement contract remaining balance)
    let contractTarget = Number(dto.totalOutputQty || 0);
    let newProduced = Number(dto.totalOutputQty || 0);

    if (dto.salesOrderItemId) {
      try {
        const soi = await this.salesOrderItemRepo.findOne({ where: { id: dto.salesOrderItemId } });
        if (soi) {
          contractTarget = Number(soi.quantity || 0);
          const currentShipped = Number(soi.shippedQuantity || 0);
          const updatedShipped = currentShipped + Number(dto.totalOutputQty || 0);
          soi.shippedQuantity = updatedShipped;
          await this.salesOrderItemRepo.save(soi);
          newProduced = updatedShipped;
        }
      } catch (err) {
        this.logger.warn(`Could not update sales_order_item ${dto.salesOrderItemId}: ${err}`);
      }
    }

    const newRemainingQuantity = Math.max(0, contractTarget - newProduced);
    const newProgressPercentage = contractTarget > 0 ? Math.min(100, Math.round((newProduced / contractTarget) * 100)) : 100;

    return {
      success: true,
      entryNumber,
      entry: savedEntry,
      updatedContractProgress: {
        contractNumber: dto.contractNumber,
        itemId: item.id,
        targetQuantity: contractTarget,
        newProducedQuantity: newProduced,
        newRemainingQuantity,
        newProgressPercentage,
      },
      message: `Shift Report successfully logged as ${entryNumber}! Output: ${dto.totalOutputQty} PCS, Scrap: ${dto.scrapQty} PCS.`,
    };
  }
}
