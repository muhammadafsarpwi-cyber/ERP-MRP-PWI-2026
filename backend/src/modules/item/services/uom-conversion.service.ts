import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UomConversion, UomConversionStatus } from '../entities';
import { CreateUomConversionDto, UpdateUomConversionDto } from '../dto/uom-conversion.dto';

@Injectable()
export class UomConversionService {
  constructor(
    @InjectRepository(UomConversion)
    private readonly conversionRepository: Repository<UomConversion>,
  ) {}

  async create(dto: CreateUomConversionDto, userId?: string): Promise<UomConversion> {
    if (dto.fromUomId === dto.toUomId) {
      throw new BadRequestException('Cannot create conversion between same UOMs');
    }
    if (dto.conversionFactor <= 0) {
      throw new BadRequestException('Conversion factor must be positive');
    }
    const existing = await this.conversionRepository.findOne({
      where: { fromUomId: dto.fromUomId, toUomId: dto.toUomId },
    });
    if (existing) throw new ConflictException('Conversion between these UOMs already exists');
    const conversion = this.conversionRepository.create({
      ...dto,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.conversionRepository.save(conversion);
  }

  async findAll(options?: { page?: number; limit?: number; fromUomId?: string; toUomId?: string }): Promise<{ data: UomConversion[]; total: number }> {
    const { page = 1, limit = 20, fromUomId, toUomId } = options || {};
    const qb = this.conversionRepository.createQueryBuilder('conv')
      .leftJoinAndSelect('conv.fromUom', 'fromUom')
      .leftJoinAndSelect('conv.toUom', 'toUom');
    if (fromUomId) qb.andWhere('conv.fromUomId = :fromUomId', { fromUomId });
    if (toUomId) qb.andWhere('conv.toUomId = :toUomId', { toUomId });
    qb.orderBy('conv.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<UomConversion> {
    const conv = await this.conversionRepository.findOne({ where: { id }, relations: ['fromUom', 'toUom'] });
    if (!conv) throw new NotFoundException(`UOM Conversion with ID '${id}' not found`);
    return conv;
  }

  async update(id: string, dto: UpdateUomConversionDto, userId?: string): Promise<UomConversion> {
    const conv = await this.findOne(id);
    if (dto.conversionFactor !== undefined && dto.conversionFactor <= 0) {
      throw new BadRequestException('Conversion factor must be positive');
    }
    Object.assign(conv, dto, { updatedBy: userId || null });
    return this.conversionRepository.save(conv);
  }

  async activate(id: string, userId?: string): Promise<UomConversion> {
    const conv = await this.findOne(id);
    if (conv.status === UomConversionStatus.ACTIVE) throw new BadRequestException('Already active');
    conv.status = UomConversionStatus.ACTIVE;
    conv.updatedBy = userId || null;
    return this.conversionRepository.save(conv);
  }

  async deactivate(id: string, userId?: string): Promise<UomConversion> {
    const conv = await this.findOne(id);
    if (conv.status === UomConversionStatus.INACTIVE) throw new BadRequestException('Already inactive');
    conv.status = UomConversionStatus.INACTIVE;
    conv.updatedBy = userId || null;
    return this.conversionRepository.save(conv);
  }
}
