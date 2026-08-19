import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Uom, UomStatus } from '../entities';
import { CreateUomDto, UpdateUomDto } from '../dto/uom.dto';

@Injectable()
export class UomService {
  constructor(
    @InjectRepository(Uom)
    private readonly uomRepository: Repository<Uom>,
  ) {}

  async create(dto: CreateUomDto, userId?: string): Promise<Uom> {
    const existing = await this.uomRepository.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`UOM with code '${dto.code}' already exists`);
    }
    const uom = this.uomRepository.create({
      ...dto,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.uomRepository.save(uom);
  }

  async findAll(options?: { page?: number; limit?: number; search?: string; status?: UomStatus; uomType?: string }): Promise<{ data: Uom[]; total: number }> {
    const { page = 1, limit = 20, search, status, uomType } = options || {};
    const qb = this.uomRepository.createQueryBuilder('uom');
    if (search) {
      qb.where('(uom.code ILIKE :search OR uom.name ILIKE :search)', { search: `%${search}%` });
    }
    if (status) qb.andWhere('uom.status = :status', { status });
    if (uomType) qb.andWhere('uom.uomType = :uomType', { uomType });
    qb.orderBy('uom.code', 'ASC');
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Uom> {
    const uom = await this.uomRepository.findOne({ where: { id } });
    if (!uom) throw new NotFoundException(`UOM with ID '${id}' not found`);
    return uom;
  }

  async update(id: string, dto: UpdateUomDto, userId?: string): Promise<Uom> {
    const uom = await this.findOne(id);
    if (dto.code && dto.code !== uom.code) {
      const existing = await this.uomRepository.findOne({ where: { code: dto.code, id: Not(id) } });
      if (existing) throw new ConflictException(`UOM with code '${dto.code}' already exists`);
    }
    Object.assign(uom, dto, { updatedBy: userId || null });
    return this.uomRepository.save(uom);
  }

  async activate(id: string, userId?: string): Promise<Uom> {
    const uom = await this.findOne(id);
    if (uom.status === UomStatus.ACTIVE) throw new BadRequestException('UOM is already active');
    uom.status = UomStatus.ACTIVE;
    uom.updatedBy = userId || null;
    return this.uomRepository.save(uom);
  }

  async deactivate(id: string, userId?: string): Promise<Uom> {
    const uom = await this.findOne(id);
    if (uom.status === UomStatus.INACTIVE) throw new BadRequestException('UOM is already inactive');
    uom.status = UomStatus.INACTIVE;
    uom.updatedBy = userId || null;
    return this.uomRepository.save(uom);
  }
}
