import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Not, TreeRepository, DataSource, In } from 'typeorm';
import { WarehouseLocation, WarehouseLocationStatus } from '../entities';
import { CreateWarehouseLocationDto, UpdateWarehouseLocationDto } from '../dto';
import { populateAuditNames } from '../helpers/audit-names';

@Injectable()
export class WarehouseLocationService {
  constructor(
    @InjectRepository(WarehouseLocation)
    private readonly locationRepository: TreeRepository<WarehouseLocation>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
    await populateAuditNames(this.dataSource, data);

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

    await populateAuditNames(this.dataSource, [location]);
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
    const requestedParentId = updateLocationDto.parentLocationId;

    // The row itself (together with the requested parent, in a single round trip)
    // is only needed for the duplicate-code and parent validations. Plain field
    // updates go straight to one UPDATE, whose affected-row count proves existence.
    const needsRow = !!updateLocationDto.locationCode || !!requestedParentId;
    let location: WarehouseLocation | undefined;
    let directParent: WarehouseLocation | undefined;

    if (needsRow) {
      const ids = requestedParentId && requestedParentId !== id ? [id, requestedParentId] : [id];
      const rows = await this.locationRepository.find({ where: { id: In(ids) } });
      location = rows.find((row) => row.id === id);
      directParent = rows.find((row) => row.id === requestedParentId);

      if (!location) {
        throw new NotFoundException(`Location with ID '${id}' not found`);
      }
    }

    // Check for duplicate code within warehouse if code is being updated
    if (updateLocationDto.locationCode) {
      if (!location) {
        throw new NotFoundException(`Location with ID '${id}' not found`);
      }

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
    if (requestedParentId) {
      // Check for self-reference
      if (requestedParentId === id) {
        throw new BadRequestException('Location cannot be its own parent');
      }

      if (!location || !directParent) {
        throw new NotFoundException(`Parent location with ID '${requestedParentId}' not found`);
      }

      // Walk up from the direct parent to rule out a circular reference —
      // one query per extra ancestor level (none for root ancestors).
      const visited = new Set<string>([directParent.id]);
      let ancestorId: string | undefined = directParent.parentLocationId ?? undefined;

      while (ancestorId) {
        if (ancestorId === id || visited.has(ancestorId)) {
          throw new BadRequestException('Cannot set parent location as it would create a circular reference');
        }
        visited.add(ancestorId);

        const ancestor = await this.locationRepository.findOne({ where: { id: ancestorId } });
        if (!ancestor) {
          break; // broken ancestor chain — stop walking, same as before
        }
        ancestorId = ancestor.parentLocationId ?? undefined;
      }

      // Ensure parent location belongs to the same warehouse
      if (directParent.warehouseId !== location.warehouseId) {
        throw new BadRequestException('Parent location must belong to the same warehouse');
      }
    }

    // Persist with a single authoritative UPDATE. The entity maps parent_location_id
    // twice (@Column + @ManyToOne/@JoinColumn), which makes TypeORM save() skip the
    // UPDATE entirely when the loaded parentLocation relation still points at the old
    // parent (so an explicit NULL never persists) and return a stale parentLocationId
    // after a successful set — a direct UPDATE writes exactly what the DTO says,
    // including null for "No Parent".
    const updateSet: Record<string, any> = { updatedAt: () => 'CURRENT_TIMESTAMP' };
    if (updateLocationDto.locationCode !== undefined) updateSet.locationCode = updateLocationDto.locationCode;
    if (updateLocationDto.name !== undefined) updateSet.name = updateLocationDto.name;
    if (updateLocationDto.description !== undefined) updateSet.description = updateLocationDto.description;
    if (requestedParentId !== undefined) updateSet.parentLocationId = requestedParentId ?? null;
    if (userId !== undefined) updateSet.updatedBy = userId;

    const result = await this.locationRepository
      .createQueryBuilder()
      .update(WarehouseLocation)
      .set(updateSet)
      .where('id = :id', { id })
      .execute();

    if (!result.affected) {
      throw new NotFoundException(`Location with ID '${id}' not found`);
    }

    // Re-read the row so the response reflects the actual saved database state.
    const saved = await this.locationRepository.findOne({
      where: { id },
      relations: ['warehouse', 'parentLocation', 'children'],
    });

    if (!saved) {
      throw new NotFoundException(`Location with ID '${id}' not found`);
    }

    return saved;
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

    try {
      await this.locationRepository.remove(location);
    } catch (error: any) {
      if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
        throw new BadRequestException(
          'Cannot delete location because it is referenced by existing inventory or store transactions. Please deactivate it instead.',
        );
      }
      throw error;
    }
  }
}
