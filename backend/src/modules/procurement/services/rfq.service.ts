import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestForQuotation, RfqLine, RfqSupplier } from '../entities';
import { CreateRfqDto, RfqFilterDto } from '../dto';

@Injectable()
export class RfqService {
  private readonly logger = new Logger(RfqService.name);

  constructor(
    @InjectRepository(RequestForQuotation)
    private readonly repo: Repository<RequestForQuotation>,
    @InjectRepository(RfqLine)
    private readonly lineRepo: Repository<RfqLine>,
    @InjectRepository(RfqSupplier)
    private readonly rfqSupplierRepo: Repository<RfqSupplier>,
  ) {}

  async create(dto: CreateRfqDto, userId?: string): Promise<RequestForQuotation> {
    const existing = await this.repo.findOne({
      where: { rfqCode: dto.rfqCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`RFQ code '${dto.rfqCode}' already exists`);
    }

    const supplierIds = Array.from(
      new Set([
        ...(Array.isArray(dto.supplierIds) ? dto.supplierIds.filter(Boolean) : []),
        ...(dto.supplierId ? [dto.supplierId] : []),
      ]),
    );
    if (supplierIds.length === 0) {
      throw new BadRequestException('At least one supplier must be selected for the RFQ');
    }

    const { lines, purchaseType, divisionId, warehouseId, supplierIds: _sIds, ...restDto } = dto;
    const rfq = this.repo.create({
      ...restDto,
      supplierId: supplierIds[0],
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(rfq);

    for (const sId of supplierIds) {
      const rs = this.rfqSupplierRepo.create({
        rfqId: saved.id,
        supplierId: sId,
        status: 'PENDING',
        createdBy: userId || null,
        updatedBy: userId || null,
      });
      await this.rfqSupplierRepo.save(rs);
    }

    if (dto.lines && dto.lines.length > 0) {
      for (const lineDto of dto.lines) {
        const line = this.lineRepo.create({
          rfqId: saved.id,
          ...lineDto,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: RfqFilterDto): Promise<{ data: RequestForQuotation[]; total: number }> {
    const { page = 1, limit = 20, companyId, supplierId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('rfq')
      .leftJoinAndSelect('rfq.supplier', 'supplier')
      .leftJoinAndSelect('rfq.rfqSuppliers', 'rfqSuppliers')
      .leftJoinAndSelect('rfqSuppliers.supplier', 'rfqSupplierEntity');
    let hasWhere = false;
    if (companyId) { qb.where('rfq.companyId = :companyId', { companyId }); hasWhere = true; }
    if (supplierId) {
      qb[hasWhere ? 'andWhere' : 'where'](
        '(rfq.supplierId = :supplierId OR rfqSuppliers.supplierId = :supplierId)',
        { supplierId },
      );
      hasWhere = true;
    }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('rfq.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(rfq.title ILIKE :search OR rfq.rfqCode ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'rfqCode', 'title', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`rfq.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<RequestForQuotation> {
    const rfq = await this.repo.findOne({
      where: { id },
      relations: [
        'supplier',
        'rfqSuppliers',
        'rfqSuppliers.supplier',
        'requisition',
        'lines',
        'lines.item',
        'lines.uom',
      ],
    });
    if (!rfq) throw new NotFoundException(`RFQ with ID '${id}' not found`);
    return rfq;
  }

  async send(id: string, userId?: string): Promise<RequestForQuotation> {
    const rfq = await this.findOne(id);
    if (rfq.status !== 'DRAFT') {
      throw new BadRequestException('Can only send RFQs in DRAFT status');
    }
    rfq.status = 'SENT';
    rfq.updatedBy = userId || null;
    await this.repo.save(rfq);

    await this.rfqSupplierRepo
      .createQueryBuilder()
      .update(RfqSupplier)
      .set({ sentAt: new Date(), updatedBy: userId || null })
      .where('rfq_id = :rfqId AND sent_at IS NULL', { rfqId: id })
      .execute();

    return this.findOne(id);
  }

  async addSuppliers(rfqId: string, supplierIds: string[], userId?: string): Promise<RequestForQuotation> {
    const rfq = await this.findOne(rfqId);
    if (rfq.status === 'CANCELLED' || rfq.status === 'AWARDED' || rfq.status === 'CLOSED') {
      throw new BadRequestException(`Cannot add suppliers to an RFQ in '${rfq.status}' status`);
    }
    const existingIds = new Set((rfq.rfqSuppliers || []).map((rs) => rs.supplierId));
    for (const sId of Array.from(new Set(supplierIds.filter(Boolean)))) {
      if (!existingIds.has(sId)) {
        await this.rfqSupplierRepo.save(
          this.rfqSupplierRepo.create({
            rfqId,
            supplierId: sId,
            status: 'PENDING',
            sentAt: rfq.status === 'SENT' ? new Date() : null,
            createdBy: userId || null,
            updatedBy: userId || null,
          }),
        );
      }
    }
    return this.findOne(rfqId);
  }

  async cancel(id: string, userId?: string): Promise<RequestForQuotation> {
    const rfq = await this.findOne(id);
    if (rfq.status === 'CANCELLED') {
      throw new BadRequestException('RFQ is already cancelled');
    }
    rfq.status = 'CANCELLED';
    rfq.updatedBy = userId || null;
    return this.repo.save(rfq);
  }

  async addLine(rfqId: string, dto: any): Promise<RfqLine> {
    const rfq = await this.findOne(rfqId);
    if (rfq.status !== 'DRAFT') {
      throw new BadRequestException('Can only add lines to RFQs in DRAFT status');
    }
    const line = this.lineRepo.create({ rfqId, ...dto });
    return this.lineRepo.save(line) as unknown as Promise<RfqLine>;
  }

  async removeLine(rfqId: string, lineId: string): Promise<void> {
    const rfq = await this.findOne(rfqId);
    if (rfq.status !== 'DRAFT') {
      throw new BadRequestException('Can only remove lines from RFQs in DRAFT status');
    }
    const line = await this.lineRepo.findOne({ where: { id: lineId, rfqId } });
    if (!line) throw new NotFoundException(`Line with ID '${lineId}' not found`);
    await this.lineRepo.remove(line);
  }
}
