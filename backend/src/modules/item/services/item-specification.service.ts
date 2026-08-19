import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemSpecification, SpecificationStatus } from '../entities';
import { CreateItemSpecificationDto, UpdateItemSpecificationDto } from '../dto/item-specification.dto';

@Injectable()
export class ItemSpecificationService {
  constructor(
    @InjectRepository(ItemSpecification)
    private readonly specRepository: Repository<ItemSpecification>,
  ) {}

  async create(dto: CreateItemSpecificationDto, userId?: string): Promise<ItemSpecification> {
    const spec = this.specRepository.create({ ...dto, createdBy: userId || null, updatedBy: userId || null });
    return this.specRepository.save(spec);
  }

  async findAllByItem(itemId: string): Promise<ItemSpecification[]> {
    return this.specRepository.find({ where: { itemId }, relations: ['uom'], order: { specName: 'ASC' } });
  }

  async findOne(id: string): Promise<ItemSpecification> {
    const spec = await this.specRepository.findOne({ where: { id }, relations: ['uom', 'item'] });
    if (!spec) throw new NotFoundException(`Specification with ID '${id}' not found`);
    return spec;
  }

  async update(id: string, dto: UpdateItemSpecificationDto, userId?: string): Promise<ItemSpecification> {
    const spec = await this.findOne(id);
    Object.assign(spec, dto, { updatedBy: userId || null });
    return this.specRepository.save(spec);
  }

  async deactivate(id: string, userId?: string): Promise<ItemSpecification> {
    const spec = await this.findOne(id);
    spec.status = SpecificationStatus.INACTIVE;
    spec.updatedBy = userId || null;
    return this.specRepository.save(spec);
  }
}
