import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemBarcode, BarcodeStatus } from '../entities';
import { CreateItemBarcodeDto, UpdateItemBarcodeDto } from '../dto/item-barcode.dto';

@Injectable()
export class ItemBarcodeService {
  constructor(
    @InjectRepository(ItemBarcode)
    private readonly barcodeRepository: Repository<ItemBarcode>,
  ) {}

  async create(dto: CreateItemBarcodeDto, userId?: string): Promise<ItemBarcode> {
    const existing = await this.barcodeRepository.findOne({ where: { barcode: dto.barcode } });
    if (existing) throw new ConflictException(`Barcode '${dto.barcode}' already exists`);
    if (dto.isPrimary) {
      await this.barcodeRepository.update({ itemId: dto.itemId, isPrimary: true }, { isPrimary: false });
    }
    const barcode = this.barcodeRepository.create({
      ...dto,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.barcodeRepository.save(barcode);
  }

  async findAllByItem(itemId: string): Promise<ItemBarcode[]> {
    return this.barcodeRepository.find({ where: { itemId }, order: { isPrimary: 'DESC', createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<ItemBarcode> {
    const barcode = await this.barcodeRepository.findOne({ where: { id }, relations: ['item'] });
    if (!barcode) throw new NotFoundException(`Barcode with ID '${id}' not found`);
    return barcode;
  }

  async update(id: string, dto: UpdateItemBarcodeDto, userId?: string): Promise<ItemBarcode> {
    const barcode = await this.findOne(id);
    if (dto.barcode && dto.barcode !== barcode.barcode) {
      const existing = await this.barcodeRepository.findOne({ where: { barcode: dto.barcode } });
      if (existing) throw new ConflictException(`Barcode '${dto.barcode}' already exists`);
    }
    if (dto.isPrimary) {
      await this.barcodeRepository.update({ itemId: barcode.itemId, isPrimary: true }, { isPrimary: false });
    }
    Object.assign(barcode, dto, { updatedBy: userId || null });
    return this.barcodeRepository.save(barcode);
  }

  async deactivate(id: string, userId?: string): Promise<ItemBarcode> {
    const barcode = await this.findOne(id);
    if (barcode.status === BarcodeStatus.INACTIVE) throw new NotFoundException('Already inactive');
    barcode.status = BarcodeStatus.INACTIVE;
    barcode.updatedBy = userId || null;
    return this.barcodeRepository.save(barcode);
  }
}
