import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, TreeRepository } from 'typeorm';
import { WarehouseLocation, WarehouseLocationStatus } from '../entities';
import { CreateWarehouseLocationDto, UpdateWarehouseLocationDto } from '../dto';

@Injectable()
export class WarehouseLocationService {
  constructor(
    @InjectRepository(WarehouseLocation)
    private readonly locationRepository: TreeRepository<WarehouseLocation>,
  ) {}

  async create(createLocationDto: CreateWarehouseLocationDto, userId?: string): Promise<WarehouseLocation> {
    // Check for duplicate location code within warehouse
    const existingLocation = await this.locationRepository.findOne({
      where: {
        locationCode: createLocationDto.locationCode,
        warehouseId: createLocationDto.warehouseId,
      },
    });

    if (existingLocation) {
      throw new ConflictException(`Location with code '${createLocationDto.locationCode}' already exists in this warehouse`);
    }

    // Validate parent location if provided
    if (createLocationDto.parentLocationId) {
      const parentLocation = await this.locationRepository.findOne({
        where: { id: createLocationDto.parentLocationId },
      });

      if (!parentLocation) {
        throw new NotFoundException(`Parent location with ID '${createLocationDto.parentLocationId}' not found`);
      }

      // Ensure parent location belongs to the same warehouse
      if (parentLocation.warehouseId !== createLocationDto.warehouseId) {
        throw new BadRequestException('Parent location must belong to the same warehouse');
      }
    }

    const location = this.locationRepository.create({
      ...createLocationDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.locationRepository.save(location);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: WarehouseLocationStatus;
    warehouseId?: string;
    parentLocationId?: string;
  }): Promise<{ data: WarehouseLocation[]; total: number }> {
    const { page = 1, limit = 20, search, status, warehouseId, parentLocationId } = options || {};

    const queryBuilder = this.locationRepository.createQueryBuilder('loc');
    queryBuilder.leftJoinAndSelect('loc.warehouse', 'warehouse');
    queryBuilder.leftJoinAndSelect('loc.parentLocation', 'parentLocation');

    if (search) {
      queryBuilder.where(
        '(loc.name ILIKE :search OR loc.locationCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('loc.status = :status', { status });
    }

    if (warehouseId) {
      queryBuilder.andWhere('loc.warehouseId = :warehouseId', { warehouseId });
    }

    if (parentLocationId) {
      queryBuilder.andWhere('loc.parentLocationId = :parentLocationId', { parentLocationId });
    }

    queryBuilder.orderBy('loc.createdAt', 'DESC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<WarehouseLocation> {
    const location = await this.locationRepository.findOne({
      where: { id },
      relations: ['warehouse', 'parentLocation', 'children'],
    });

    if (!location) {
      throw new NotFoundException(`Location with ID '${id}' not found`);
    }

    return location;
  }

  async getHierarchy(warehouseId: string): Promise<WarehouseLocation[]> {
    const queryBuilder = this.locationRepository.createQueryBuilder('loc');
    queryBuilder.leftJoinAndSelect('loc.children', 'children');
    queryBuilder.leftJoinAndSelect('children.children', 'grandChildren');

    queryBuilder.where('loc.warehouseId = :warehouseId', { warehouseId });
    queryBuilder.andWhere('loc.parentLocationId IS NULL');
    queryBuilder.orderBy('loc.name', 'ASC');

    return queryBuilder.getMany();
  }

  async update(id: string, updateLocationDto: UpdateWarehouseLocationDto, userId?: string): Promise<WarehouseLocation> {
    const location = await this.findOne(id);

    // Check for duplicate code within warehouse if code is being updated
    if (updateLocationDto.locationCode) {
      const existingLocation = await this.locationRepository.findOne({
        where: {
          locationCode: updateLocationDto.locationCode,
          warehouseId: location.warehouseId,
          id: Not(id),
        },
      });

      if (existingLocation) {
        throw new ConflictException(`Location with code '${updateLocationDto.locationCode}' already exists in this warehouse`);
      }
    }

    // Validate parent location if being updated
    if (updateLocationDto.parentLocationId) {
      // Check for self-reference
      if (updateLocationDto.parentLocationId === id) {
        throw new BadRequestException('Location cannot be its own parent');
      }

      // Check for circular reference
      const isCircular = await this.checkCircularReference(id, updateLocationDto.parentLocationId);
      if (isCircular) {
        throw new BadRequestException('Cannot set parent location as it would create a circular reference');
      }

      // Ensure parent location belongs to the same warehouse
      const parentLocation = await this.locationRepository.findOne({
        where: { id: updateLocationDto.parentLocationId },
      });

      if (parentLocation && parentLocation.warehouseId !== location.warehouseId) {
        throw new BadRequestException('Parent location must belong to the same warehouse');
      }
    }

    Object.assign(location, updateLocationDto, { updatedBy: userId });

    return this.locationRepository.save(location);
  }

  private async checkCircularReference(locationId: string, potentialParentId: string): Promise<boolean> {
    let currentId = potentialParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === locationId) {
        return true;
      }

      if (visited.has(currentId)) {
        return true;
      }

      visited.add(currentId);

      const parent = await this.locationRepository.findOne({
        where: { id: currentId },
      });

      if (!parent || !parent.parentLocationId) {
        break;
      }

      currentId = parent.parentLocationId;
    }

    return false;
  }

  async activate(id: string, userId?: string): Promise<WarehouseLocation> {
    const location = await this.findOne(id);

    if (location.status === WarehouseLocationStatus.ACTIVE) {
      throw new BadRequestException('Location is already active');
    }

    // Check if parent warehouse is active
    if (location.warehouse?.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot activate location when parent warehouse is inactive');
    }

    location.status = WarehouseLocationStatus.ACTIVE;
    location.updatedBy = userId || null;

    return this.locationRepository.save(location);
  }

  async deactivate(id: string, userId?: string): Promise<WarehouseLocation> {
    const location = await this.findOne(id);

    if (location.status === WarehouseLocationStatus.INACTIVE) {
      throw new BadRequestException('Location is already inactive');
    }

    // Check if location has active children
    if (location.children && location.children.length > 0) {
      const activeChildren = location.children.filter(c => c.status === WarehouseLocationStatus.ACTIVE);
      if (activeChildren.length > 0) {
        throw new BadRequestException('Cannot deactivate location with active child locations');
      }
    }

    location.status = WarehouseLocationStatus.INACTIVE;
    location.updatedBy = userId || null;

    return this.locationRepository.save(location);
  }

  async remove(id: string): Promise<void> {
    const location = await this.findOne(id);

    // Check if location has children
    if (location.children && location.children.length > 0) {
      throw new BadRequestException('Cannot delete location with child locations');
    }

    await this.locationRepository.remove(location);
  }
}
