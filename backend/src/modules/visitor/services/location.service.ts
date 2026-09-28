import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location, LocationStatus } from '../entities';
import { Division } from '../../organization/entities/division.entity';
import { CreateLocationDto, UpdateLocationDto } from '../dto';
import { applyDivisionScopeFilter } from '../../../common/division-scope.util';
import { UUID_SHAPE } from '../../../common/validators';

/**
 * Location master service (Company → Division → Location).
 *
 * Division authorization is enforced TWICE: `DivisionScopeGuard` rejects an
 * explicit `divisionId` on the request, and this service re-checks every row it
 * reads/writes against `allowedDivisionIds` so a guessed UUID can never reach
 * data outside the caller's divisions.
 */
@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
  ) {}

  async create(dto: CreateLocationDto, companyId: string, userId?: string): Promise<Location> {
    const division = await this.divisionRepo.findOne({ where: { id: dto.divisionId, companyId } });
    if (!division) {
      throw new BadRequestException('Selected division does not exist');
    }

    const existing = await this.locationRepo.findOne({
      where: { locationCode: dto.locationCode, companyId },
    });
    if (existing) {
      throw new ConflictException(`Location with code '${dto.locationCode}' already exists in this company`);
    }

    const location = this.locationRepo.create({
      companyId,
      divisionId: division.id,
      locationCode: dto.locationCode,
      name: dto.name,
      description: dto.description ?? null,
      createdBy: userId,
      updatedBy: userId,
    });
    return this.locationRepo.save(location);
  }

  async findAll(options: {
    companyId: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: LocationStatus;
    divisionId?: string;
    allowedDivisionIds?: string[];
  }): Promise<{ data: Location[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));

    const qb = this.locationRepo
      .createQueryBuilder('loc')
      .leftJoinAndSelect('loc.division', 'div')
      .where('loc.company_id = :companyId', { companyId: options.companyId });

    applyDivisionScopeFilter(qb, 'loc.divisionId', options.allowedDivisionIds);

    if (options.divisionId) {
      qb.andWhere('loc.divisionId = :divisionId', { divisionId: options.divisionId });
    }
    if (options.status) {
      qb.andWhere('loc.status = :status', { status: options.status });
    }
    if (options.search && options.search.trim()) {
      qb.andWhere('(loc.location_code ILIKE :q OR loc.name ILIKE :q)', { q: `%${options.search.trim()}%` });
    }

    qb.orderBy('loc.name', 'ASC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId: string, allowedDivisionIds?: string[]): Promise<Location> {
    const location = await this.findRow(id, companyId, allowedDivisionIds);
    return location;
  }

  async update(
    id: string,
    dto: UpdateLocationDto,
    companyId: string,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<Location> {
    const location = await this.findRow(id, companyId, allowedDivisionIds);

    if (dto.locationCode && dto.locationCode !== location.locationCode) {
      const existing = await this.locationRepo.findOne({
        where: { locationCode: dto.locationCode, companyId },
      });
      if (existing && existing.id !== location.id) {
        throw new ConflictException(`Location with code '${dto.locationCode}' already exists in this company`);
      }
    }

    if (dto.name !== undefined) location.name = dto.name;
    if (dto.description !== undefined) location.description = dto.description ?? null;
    if (dto.status !== undefined) location.status = dto.status;
    location.updatedBy = userId ?? null;

    return this.locationRepo.save(location);
  }

  async remove(id: string, companyId: string, allowedDivisionIds?: string[]): Promise<void> {
    const location = await this.findRow(id, companyId, allowedDivisionIds);

    const referenced = await this.locationRepo
      .createQueryBuilder('loc')
      .leftJoin('visitor_entries', 've', 've.location_id = loc.id')
      .where('loc.id = :id', { id: location.id })
      .andWhere('ve.id IS NOT NULL')
      .getOne();

    if (referenced) {
      throw new ConflictException('Location cannot be deleted because visitor entries already reference it');
    }

    await this.locationRepo.remove(location);
  }

  /** Row lookup + authorization in one place (403 for an out-of-scope division). */
  private async findRow(id: string, companyId: string, allowedDivisionIds?: string[]): Promise<Location> {
    if (!UUID_SHAPE.test(String(id))) {
      throw new NotFoundException('Location not found');
    }

    const location = await this.locationRepo.findOne({
      where: { id, companyId },
      relations: { division: true },
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    if (Array.isArray(allowedDivisionIds) && !allowedDivisionIds.includes(location.divisionId)) {
      throw new ForbiddenException('You do not have access to this location.');
    }

    return location;
  }
}
