import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { InventoryPolicy } from '../entities';
import { InventoryBalance } from '../entities/inventory-balance.entity';
import { CreateInventoryPolicyDto, UpdateInventoryPolicyDto, InventoryPolicyFilterDto } from '../dto';

@Injectable()
export class InventoryPolicyService {
  private readonly logger = new Logger(InventoryPolicyService.name);

  constructor(
    @InjectRepository(InventoryPolicy)
    private readonly repo: Repository<InventoryPolicy>,
    @InjectRepository(InventoryBalance)
    private readonly balanceRepo: Repository<InventoryBalance>,
  ) {}

  async create(dto: CreateInventoryPolicyDto, userId?: string): Promise<InventoryPolicy> {
    const existing = await this.repo.findOne({
      where: { itemId: dto.itemId, warehouseId: dto.warehouseId, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(
        `Inventory policy already exists for this item in this warehouse`,
      );
    }

    const policy = this.repo.create({
      ...dto,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.repo.save(policy);
  }

  async findAll(filter: InventoryPolicyFilterDto): Promise<{ data: any[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      search,
      companyId,
      warehouseId,
      itemId,
      status,
      trackingType,
      division,
      section,
      department,
      stockStatus,
      locationId,
      sortField = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const qb = this.repo
      .createQueryBuilder('policy')
      .leftJoinAndSelect('policy.item', 'item')
      .leftJoinAndSelect('policy.warehouse', 'warehouse')
      .leftJoinAndSelect('policy.preferredLocation', 'preferredLocation')
      .leftJoinAndSelect('policy.company', 'company')
      .leftJoinAndSelect('item.division', 'itemDivision')
      .leftJoinAndSelect('item.section', 'itemSection')
      .leftJoinAndSelect('item.department', 'itemDepartment');

    if (search) {
      qb.where(
        '(item.itemCode ILIKE :search OR item.name ILIKE :search OR company.legalName ILIKE :search OR warehouse.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (companyId) {
      qb[search ? 'andWhere' : 'where']('policy.companyId = :companyId', { companyId });
    }
    if (warehouseId) qb.andWhere('policy.warehouseId = :warehouseId', { warehouseId });
    if (itemId) qb.andWhere('policy.itemId = :itemId', { itemId });
    if (status) qb.andWhere('policy.status = :status', { status });
    if (trackingType) qb.andWhere('policy.trackingType = :trackingType', { trackingType });
    if (division) {
      qb.andWhere('(itemDivision.name = :division OR itemDivision.id::text = :division)', { division });
    }
    if (section) {
      qb.andWhere('(itemSection.name = :section OR itemSection.id::text = :section)', { section });
    }
    if (department) {
      qb.andWhere('(itemDepartment.name = :department OR itemDepartment.id::text = :department)', { department });
    }
    if (locationId) {
      qb.andWhere('policy.preferredLocationId = :locationId', { locationId });
    }

    const validSortFields = ['createdAt', 'trackingType', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`policy.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [policies, total] = await qb.getManyAndCount();

    // Batch-load inventory balances for all policies
    const policyItemWarehousePairs = policies.map(p => ({ itemId: p.itemId, warehouseId: p.warehouseId }));
    let balances: any[] = [];
    if (policyItemWarehousePairs.length > 0) {
      const conditions: string[] = [];
      const params: Record<string, string> = {};
      policyItemWarehousePairs.forEach((pair, i) => {
        const itemKey = `itemId${i}`;
        const whKey = `whId${i}`;
        conditions.push(`(bal.item_id = :${itemKey} AND bal.warehouse_id = :${whKey})`);
        params[itemKey] = pair.itemId;
        params[whKey] = pair.warehouseId;
      });

      const balanceQb = this.balanceRepo.createQueryBuilder('bal')
        .select('bal.item_id', 'itemId')
        .addSelect('bal.warehouse_id', 'warehouseId')
        .addSelect('SUM(bal.on_hand)', 'onHand')
        .addSelect('SUM(bal.reserved)', 'reserved')
        .addSelect('SUM(bal.available)', 'available')
        .where('bal.status = :status', { status: 'ACTIVE' })
        .andWhere(conditions.join(' OR '), params)
        .groupBy('bal.item_id')
        .addGroupBy('bal.warehouse_id');

      balances = await balanceQb.getRawMany();
    }

    const balanceMap = new Map<string, any>();
    for (const b of balances) {
      balanceMap.set(`${b.itemId}:${b.warehouseId}`, {
        onHand: Number(b.onHand) || 0,
        reserved: Number(b.reserved) || 0,
        available: Number(b.available) || 0,
      });
    }

    const data = policies.map(p => {
      const bal = balanceMap.get(`${p.itemId}:${p.warehouseId}`) || { onHand: 0, reserved: 0, available: 0 };
      const minStock = Number(p.minimumStock) || 0;
      const reorderLevel = Number(p.reorderLevel) || 0;
      const maxStock = Number(p.maximumStock) || 0;
      const available = bal.available;

      let stockStatus = 'NO_DATA';
      if (available <= 0) stockStatus = 'OUT_OF_STOCK';
      else if (available < minStock) stockStatus = 'CRITICAL';
      else if (available <= reorderLevel) stockStatus = 'REORDER';
      else if (maxStock > 0 && available > maxStock) stockStatus = 'OVERSTOCK';
      else stockStatus = 'HEALTHY';

      return {
        ...p,
        companyName: p.company?.legalName || null,
        divisionName: p.item?.division?.name || null,
        sectionName: p.item?.section?.name || null,
        departmentName: p.item?.department?.name || null,
        itemName: p.item?.itemCode || null,
        itemCode: p.item?.itemCode || null,
        itemFullName: p.item?.name || null,
        warehouseName: p.warehouse?.name || null,
        preferredLocationName: p.preferredLocation?.name || null,
        stockOnHand: bal.onHand,
        stockReserved: bal.reserved,
        stockAvailable: bal.available,
        stockStatus,
      };
    });

    let finalData = data;
    if (stockStatus) {
      finalData = finalData.filter(item => item.stockStatus === stockStatus);
    }

    return { data: finalData, total: stockStatus ? finalData.length : total };
  }

  async findOne(id: string): Promise<any> {
    const policy = await this.repo.findOne({
      where: { id },
      relations: [
        'item', 'warehouse', 'preferredLocation', 'company',
        'item.division', 'item.section', 'item.department',
      ],
    });
    if (!policy) throw new NotFoundException(`Inventory policy with ID '${id}' not found`);

    // Get current stock
    const balance = await this.balanceRepo.findOne({
      where: { itemId: policy.itemId, warehouseId: policy.warehouseId, status: 'ACTIVE' },
    });

    const onHand = balance ? Number(balance.onHand) : 0;
    const reserved = balance ? Number(balance.reserved) : 0;
    const available = balance ? Number(balance.available) : 0;
    const minStock = Number(policy.minimumStock) || 0;
    const reorderLevel = Number(policy.reorderLevel) || 0;
    const maxStock = Number(policy.maximumStock) || 0;

    let stockStatus = 'NO_DATA';
    if (onHand === 0 && reserved === 0) stockStatus = 'NO_DATA';
    else if (available <= 0) stockStatus = 'OUT_OF_STOCK';
    else if (available < minStock) stockStatus = 'CRITICAL';
    else if (available <= reorderLevel) stockStatus = 'REORDER';
    else if (maxStock > 0 && available > maxStock) stockStatus = 'OVERSTOCK';
    else stockStatus = 'HEALTHY';

    return {
      ...policy,
      companyName: policy.company?.legalName || null,
      divisionName: policy.item?.division?.name || null,
      sectionName: policy.item?.section?.name || null,
      departmentName: policy.item?.department?.name || null,
      itemName: policy.item?.itemCode || null,
      itemCode: policy.item?.itemCode || null,
      itemFullName: policy.item?.name || null,
      warehouseName: policy.warehouse?.name || null,
      preferredLocationName: policy.preferredLocation?.name || null,
      stockOnHand: onHand,
      stockReserved: reserved,
      stockAvailable: available,
      stockStatus,
    };
  }

  async update(id: string, dto: UpdateInventoryPolicyDto, userId?: string): Promise<InventoryPolicy> {
    const policyEntity = await this.repo.findOne({
      where: { id },
    });
    if (!policyEntity) throw new NotFoundException(`Inventory policy with ID '${id}' not found`);

    const targetCompanyId = dto.companyId || policyEntity.companyId;
    const targetItemId = dto.itemId || policyEntity.itemId;
    const targetWarehouseId = dto.warehouseId || policyEntity.warehouseId;

    if (
      (dto.itemId && dto.itemId !== policyEntity.itemId) ||
      (dto.warehouseId && dto.warehouseId !== policyEntity.warehouseId) ||
      (dto.companyId && dto.companyId !== policyEntity.companyId)
    ) {
      const existing = await this.repo.findOne({
        where: {
          itemId: targetItemId,
          warehouseId: targetWarehouseId,
          companyId: targetCompanyId,
          id: Not(id),
        },
      });
      if (existing) {
        throw new ConflictException(
          `Inventory policy already exists for this item in this warehouse`,
        );
      }
    }

    Object.assign(policyEntity, dto, { updatedBy: userId || null });
    await this.repo.save(policyEntity);
    return this.findOne(id);
  }

  async getSummary(companyId?: string): Promise<any> {
    const qb = this.repo.createQueryBuilder('policy')
      .leftJoinAndSelect('policy.item', 'item')
      .leftJoinAndSelect('policy.warehouse', 'warehouse')
      .leftJoinAndSelect('policy.company', 'company');

    if (companyId) {
      qb.where('policy.companyId = :companyId', { companyId });
    }

    const policies = await qb.getMany();

    let totalPolicies = policies.length;
    let activePolicies = 0;
    let criticalPolicies = 0;
    let reorderPolicies = 0;
    let outOfStockPolicies = 0;
    let overstockPolicies = 0;
    let healthyPolicies = 0;

    // Batch load balances
    const pairs = policies.map(p => ({ itemId: p.itemId, warehouseId: p.warehouseId }));
    let balances: any[] = [];
    if (pairs.length > 0) {
      const conds: string[] = [];
      const prms: Record<string, string> = {};
      pairs.forEach((pair, i) => {
        const itemKey = `itemId${i}`;
        const whKey = `whId${i}`;
        conds.push(`(bal.item_id = :${itemKey} AND bal.warehouse_id = :${whKey})`);
        prms[itemKey] = pair.itemId;
        prms[whKey] = pair.warehouseId;
      });

      balances = await this.balanceRepo.createQueryBuilder('bal')
        .select('bal.item_id', 'itemId')
        .addSelect('bal.warehouse_id', 'warehouseId')
        .addSelect('SUM(bal.available)', 'available')
        .where('bal.status = :status', { status: 'ACTIVE' })
        .andWhere(conds.join(' OR '), prms)
        .groupBy('bal.item_id')
        .addGroupBy('bal.warehouse_id')
        .getRawMany();
    }

    const balanceMap = new Map<string, number>();
    for (const b of balances) {
      balanceMap.set(`${b.itemId}:${b.warehouseId}`, Number(b.available) || 0);
    }

    for (const p of policies) {
      if (p.status === 'ACTIVE') activePolicies++;
      const available = balanceMap.get(`${p.itemId}:${p.warehouseId}`) ?? null;
      if (available === null) continue;
      const minStock = Number(p.minimumStock) || 0;
      const reorderLevel = Number(p.reorderLevel) || 0;
      const maxStock = Number(p.maximumStock) || 0;

      if (available <= 0) outOfStockPolicies++;
      else if (available < minStock) criticalPolicies++;
      else if (available <= reorderLevel) reorderPolicies++;
      else if (maxStock > 0 && available > maxStock) overstockPolicies++;
      else healthyPolicies++;
    }

    return {
      totalPolicies,
      activePolicies,
      inactivePolicies: totalPolicies - activePolicies,
      criticalPolicies,
      reorderPolicies,
      outOfStockPolicies,
      overstockPolicies,
      healthyPolicies,
      requiringAttention: criticalPolicies + reorderPolicies + outOfStockPolicies,
    };
  }

  async activate(id: string, userId?: string): Promise<InventoryPolicy> {
    const policy = await this.repo.findOne({ where: { id } });
    if (!policy) throw new NotFoundException(`Inventory policy with ID '${id}' not found`);
    if (policy.status === 'ACTIVE') {
      throw new BadRequestException('Inventory policy is already active');
    }
    policy.status = 'ACTIVE';
    policy.updatedBy = userId || null;
    return this.repo.save(policy);
  }

  async deactivate(id: string, userId?: string): Promise<InventoryPolicy> {
    const policy = await this.repo.findOne({ where: { id } });
    if (!policy) throw new NotFoundException(`Inventory policy with ID '${id}' not found`);
    if (policy.status === 'INACTIVE') {
      throw new BadRequestException('Inventory policy is already inactive');
    }
    policy.status = 'INACTIVE';
    policy.updatedBy = userId || null;
    return this.repo.save(policy);
  }

  async remove(id: string): Promise<void> {
    const policy = await this.repo.findOne({ where: { id } });
    if (!policy) throw new NotFoundException(`Inventory policy with ID '${id}' not found`);
    await this.repo.remove(policy);
  }
}
