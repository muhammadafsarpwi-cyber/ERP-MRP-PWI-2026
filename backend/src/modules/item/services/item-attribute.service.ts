import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemAttributeDefinition, ItemAttributeValue } from '../entities';
import { CreateAttributeDefinitionDto, CreateAttributeValueDto, UpdateAttributeValueDto } from '../dto/item-attribute.dto';

@Injectable()
export class ItemAttributeService {
  constructor(
    @InjectRepository(ItemAttributeDefinition)
    private readonly definitionRepository: Repository<ItemAttributeDefinition>,
    @InjectRepository(ItemAttributeValue)
    private readonly valueRepository: Repository<ItemAttributeValue>,
  ) {}

  async createDefinition(dto: CreateAttributeDefinitionDto, userId?: string): Promise<ItemAttributeDefinition> {
    const existing = await this.definitionRepository.findOne({ where: { attributeCode: dto.attributeCode } });
    if (existing) throw new ConflictException(`Attribute with code '${dto.attributeCode}' already exists`);
    const def = this.definitionRepository.create({ ...dto, createdBy: userId || null, updatedBy: userId || null });
    return this.definitionRepository.save(def);
  }

  async findAllDefinitions(): Promise<ItemAttributeDefinition[]> {
    return this.definitionRepository.find({ order: { name: 'ASC' } });
  }

  async findDefinition(id: string): Promise<ItemAttributeDefinition> {
    const def = await this.definitionRepository.findOne({ where: { id } });
    if (!def) throw new NotFoundException(`Attribute definition with ID '${id}' not found`);
    return def;
  }

  async addAttributeValue(dto: CreateAttributeValueDto, userId?: string): Promise<ItemAttributeValue> {
    const value = this.valueRepository.create({ ...dto, createdBy: userId || null, updatedBy: userId || null });
    return this.valueRepository.save(value);
  }

  async findAttributeValues(itemId: string): Promise<ItemAttributeValue[]> {
    return this.valueRepository.find({ where: { itemId }, relations: ['attributeDefinition'] });
  }

  async updateAttributeValue(id: string, dto: UpdateAttributeValueDto, userId?: string): Promise<ItemAttributeValue> {
    const value = await this.valueRepository.findOne({ where: { id } });
    if (!value) throw new NotFoundException(`Attribute value with ID '${id}' not found`);
    Object.assign(value, dto, { updatedBy: userId || null });
    return this.valueRepository.save(value);
  }

  async removeAttributeValue(id: string): Promise<void> {
    const value = await this.valueRepository.findOne({ where: { id } });
    if (!value) throw new NotFoundException(`Attribute value with ID '${id}' not found`);
    await this.valueRepository.remove(value);
  }
}
