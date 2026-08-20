import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoodsReceipt, GoodsReceiptLine } from '../entities';
import { CreateGoodsReceiptDto, GoodsReceiptFilterDto } from '../dto';

@Injectable()
export class GoodsReceiptService {
  private readonly logger = new Logger(GoodsReceiptService.name);

  constructor(
    @InjectRepository(GoodsReceipt)
    private readonly repo: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptLine)
    private readonly lineRepo: Repository<GoodsReceiptLine>,
  ) {}

  async create(dto: CreateGoodsReceiptDto, userId?: string): Promise<GoodsReceipt> {
    const existing = await this.repo.findOne({
      where: { receiptCode: dto.receiptCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Receipt code '${dto.receiptCode}' already exists`);
    }

    const receipt = this.repo.create({
      ...dto,
      lines: undefined,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(receipt);

    if (dto.lines && dto.lines.length > 0) {
      for (const lineDto of dto.lines) {
        const line = this.lineRepo.create({
          receiptId: saved.id,
          ...lineDto,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: GoodsReceiptFilterDto): Promise<{ data: GoodsReceipt[]; total: number }> {
    const { page = 1, limit = 20, companyId, poId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('gr')
      .leftJoinAndSelect('gr.supplier', 'supplier')
      .leftJoinAndSelect('gr.po', 'po');
    let hasWhere = false;
    if (companyId) { qb.where('gr.companyId = :companyId', { companyId }); hasWhere = true; }
    if (poId) { qb[hasWhere ? 'andWhere' : 'where']('gr.poId = :poId', { poId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('gr.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(gr.receiptCode ILIKE :search OR gr.grnNumber ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'receiptCode', 'receiptDate', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`gr.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<GoodsReceipt> {
    const receipt = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'po', 'warehouse', 'lines', 'lines.item', 'lines.uom', 'lines.poLine', 'lines.location', 'lines.batch'],
    });
    if (!receipt) throw new NotFoundException(`Goods receipt with ID '${id}' not found`);
    return receipt;
  }

  async receive(id: string, userId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    if (receipt.status !== 'DRAFT') throw new BadRequestException('Can only receive receipts in DRAFT status');
    receipt.status = 'RECEIVED';
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }

  async inspect(id: string, userId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    if (receipt.status !== 'RECEIVED') throw new BadRequestException('Can only inspect receipts in RECEIVED status');
    receipt.status = 'INSPECTION';
    receipt.inspectedBy = userId || null;
    receipt.inspectedAt = new Date();
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }

  async accept(id: string, userId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    if (receipt.status !== 'INSPECTION') throw new BadRequestException('Can only accept receipts in INSPECTION status');
    receipt.status = 'ACCEPTED';
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }

  async reject(id: string, userId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    if (receipt.status !== 'INSPECTION') throw new BadRequestException('Can only reject receipts in INSPECTION status');
    receipt.status = 'REJECTED';
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }

  async post(id: string, userId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    if (receipt.status !== 'ACCEPTED' && receipt.status !== 'PARTIALLY_ACCEPTED') {
      throw new BadRequestException('Can only post receipts in ACCEPTED or PARTIALLY_ACCEPTED status');
    }
    receipt.status = 'POSTED';
    receipt.postedBy = userId || null;
    receipt.postedAt = new Date();
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }
}
