import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemDocument, DocumentStatus } from '../entities';
import { CreateItemDocumentDto, UpdateItemDocumentDto } from '../dto/item-document.dto';

@Injectable()
export class ItemDocumentService {
  constructor(
    @InjectRepository(ItemDocument)
    private readonly docRepository: Repository<ItemDocument>,
  ) {}

  async create(dto: CreateItemDocumentDto, userId?: string): Promise<ItemDocument> {
    const doc = this.docRepository.create({ ...dto, createdBy: userId || null, updatedBy: userId || null });
    return this.docRepository.save(doc);
  }

  async findAllByItem(itemId: string): Promise<ItemDocument[]> {
    return this.docRepository.find({ where: { itemId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<ItemDocument> {
    const doc = await this.docRepository.findOne({ where: { id }, relations: ['item'] });
    if (!doc) throw new NotFoundException(`Document with ID '${id}' not found`);
    return doc;
  }

  async update(id: string, dto: UpdateItemDocumentDto, userId?: string): Promise<ItemDocument> {
    const doc = await this.findOne(id);
    Object.assign(doc, dto, { updatedBy: userId || null });
    return this.docRepository.save(doc);
  }

  async deactivate(id: string, userId?: string): Promise<ItemDocument> {
    const doc = await this.findOne(id);
    doc.status = DocumentStatus.INACTIVE;
    doc.updatedBy = userId || null;
    return this.docRepository.save(doc);
  }
}
