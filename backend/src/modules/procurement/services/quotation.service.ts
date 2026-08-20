import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quotation, QuotationLine } from '../entities';
import { CreateQuotationDto, QuotationFilterDto } from '../dto';

@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    @InjectRepository(Quotation)
    private readonly repo: Repository<Quotation>,
    @InjectRepository(QuotationLine)
    private readonly lineRepo: Repository<QuotationLine>,
  ) {}

  async create(dto: CreateQuotationDto, userId?: string): Promise<Quotation> {
    const existing = await this.repo.findOne({
      where: { quotationCode: dto.quotationCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Quotation code '${dto.quotationCode}' already exists`);
    }

    const quotation = this.repo.create({
      ...dto,
      lines: undefined,
      status: 'RECEIVED',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(quotation);

    if (dto.lines && dto.lines.length > 0) {
      for (const lineDto of dto.lines) {
        const line = this.lineRepo.create({
          quotationId: saved.id,
          ...lineDto,
          totalPrice: lineDto.quantity * lineDto.unitPrice * (1 - (lineDto.discountPercent || 0) / 100),
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: QuotationFilterDto): Promise<{ data: Quotation[]; total: number }> {
    const { page = 1, limit = 20, companyId, supplierId, rfqId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('q')
      .leftJoinAndSelect('q.supplier', 'supplier')
      .leftJoinAndSelect('q.rfq', 'rfq');
    let hasWhere = false;
    if (companyId) { qb.where('q.companyId = :companyId', { companyId }); hasWhere = true; }
    if (supplierId) { qb[hasWhere ? 'andWhere' : 'where']('q.supplierId = :supplierId', { supplierId }); hasWhere = true; }
    if (rfqId) { qb[hasWhere ? 'andWhere' : 'where']('q.rfqId = :rfqId', { rfqId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('q.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(q.quotationCode ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'quotationCode', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`q.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Quotation> {
    const quotation = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'rfq', 'lines', 'lines.item', 'lines.uom'],
    });
    if (!quotation) throw new NotFoundException(`Quotation with ID '${id}' not found`);
    return quotation;
  }

  async evaluate(id: string, evaluationNotes: string, userId?: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    if (quotation.status !== 'RECEIVED') {
      throw new BadRequestException('Can only evaluate quotations in RECEIVED status');
    }
    quotation.status = 'EVALUATED';
    quotation.evaluationNotes = evaluationNotes;
    quotation.evaluatedBy = userId || null;
    quotation.evaluatedAt = new Date();
    quotation.updatedBy = userId || null;
    return this.repo.save(quotation);
  }

  async select(id: string, userId?: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    if (quotation.status !== 'EVALUATED') {
      throw new BadRequestException('Can only select quotations in EVALUATED status');
    }
    quotation.status = 'SELECTED';
    quotation.updatedBy = userId || null;
    return this.repo.save(quotation);
  }

  async reject(id: string, userId?: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    if (quotation.status !== 'RECEIVED' && quotation.status !== 'EVALUATED') {
      throw new BadRequestException('Can only reject quotations in RECEIVED or EVALUATED status');
    }
    quotation.status = 'REJECTED';
    quotation.updatedBy = userId || null;
    return this.repo.save(quotation);
  }
}
