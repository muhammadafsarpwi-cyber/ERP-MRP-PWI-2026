import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Warehouse, WarehouseStatus } from '../entities';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../dto';
import { BarcodeService } from '../../barcode/services/barcode.service';
import { BarcodeEntityType } from '../../barcode/entities/barcode.entity';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    private readonly barcodeService: BarcodeService,
  ) {}
  private readonly logger = new Logger(WarehouseService.name);

  async create(createWarehouseDto: CreateWarehouseDto, userId?: string): Promise<Warehouse> {
    // Check for duplicate warehouse code within company
    const existingWarehouse = await this.warehouseRepository.findOne({
      where: {
        warehouseCode: createWarehouseDto.warehouseCode,
        companyId: createWarehouseDto.companyId,
      },
    });

    if (existingWarehouse) {
      throw new ConflictException(`Warehouse with code '${createWarehouseDto.warehouseCode}' already exists in this company`);
    }

    const warehouse = this.warehouseRepository.create({
      ...createWarehouseDto,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.warehouseRepository.save(warehouse);

    // Auto-create centralized barcode registry entry
    try {
      await this.barcodeService.ensureBarcodeForEntity(
        saved.companyId,
        BarcodeEntityType.WAREHOUSE,
        saved.id,
        saved.warehouseCode,
        saved.name,
        userId,
      );
    } catch (err) {
      this.logger.warn(`Failed to create centralized barcode for warehouse ${saved.id}: ${err}`);
    }

    return saved;
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: WarehouseStatus;
    companyId?: string;
    branchId?: string;
    businessUnitId?: string;
    warehouseType?: string;
  }): Promise<{ data: Warehouse[]; total: number }> {
    const { page = 1, limit = 20, search, status, companyId, branchId, businessUnitId, warehouseType } = options || {};

    const queryBuilder = this.warehouseRepository.createQueryBuilder('wh');
    queryBuilder.leftJoinAndSelect('wh.company', 'company');
    queryBuilder.leftJoinAndSelect('wh.branch', 'branch');
    queryBuilder.leftJoinAndSelect('wh.businessUnit', 'businessUnit');

    if (search) {
      queryBuilder.where(
        '(wh.name ILIKE :search OR wh.warehouseCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('wh.status = :status', { status });
    }

    if (companyId) {
      queryBuilder.andWhere('wh.companyId = :companyId', { companyId });
    }

    if (branchId) {
      queryBuilder.andWhere('wh.branchId = :branchId', { branchId });
    }

    if (businessUnitId) {
      queryBuilder.andWhere('wh.businessUnitId = :businessUnitId', { businessUnitId });
    }

    if (warehouseType) {
      queryBuilder.andWhere('wh.warehouseType = :warehouseType', { warehouseType });
    }

    queryBuilder.orderBy('wh.createdAt', 'DESC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id },
      relations: ['company', 'branch', 'businessUnit', 'locations'],
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID '${id}' not found`);
    }

    return warehouse;
  }

  async update(id: string, updateWarehouseDto: UpdateWarehouseDto, userId?: string): Promise<Warehouse> {
    const warehouse = await this.findOne(id);

    // Check for duplicate code within company if code is being updated
    if (updateWarehouseDto.warehouseCode) {
      const existingWarehouse = await this.warehouseRepository.findOne({
        where: {
          warehouseCode: updateWarehouseDto.warehouseCode,
          companyId: warehouse.companyId,
          id: Not(id),
        },
      });

      if (existingWarehouse) {
        throw new ConflictException(`Warehouse with code '${updateWarehouseDto.warehouseCode}' already exists in this company`);
      }
    }

    Object.assign(warehouse, updateWarehouseDto, { updatedBy: userId });

    return this.warehouseRepository.save(warehouse);
  }

  async activate(id: string, userId?: string): Promise<Warehouse> {
    const warehouse = await this.findOne(id);

    if (warehouse.status === WarehouseStatus.ACTIVE) {
      throw new BadRequestException('Warehouse is already active');
    }

    // Check if parent company is active
    if (warehouse.company?.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot activate warehouse when parent company is inactive');
    }

    warehouse.status = WarehouseStatus.ACTIVE;
    warehouse.updatedBy = userId || null;

    return this.warehouseRepository.save(warehouse);
  }

  async deactivate(id: string, userId?: string): Promise<Warehouse> {
    const warehouse = await this.findOne(id);

    if (warehouse.status === WarehouseStatus.INACTIVE) {
      throw new BadRequestException('Warehouse is already inactive');
    }

    warehouse.status = WarehouseStatus.INACTIVE;
    warehouse.updatedBy = userId || null;

    return this.warehouseRepository.save(warehouse);
  }

  async remove(id: string): Promise<void> {
    const warehouse = await this.findOne(id);

    // Check if warehouse has locations
    if (warehouse.locations && warehouse.locations.length > 0) {
      throw new BadRequestException('Cannot delete warehouse with existing locations');
    }

    await this.warehouseRepository.remove(warehouse);
  }
}
