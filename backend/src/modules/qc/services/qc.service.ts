import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { QcInspectionPlan } from '../entities/qc-inspection-plan.entity';
import {
  QcInspection, QcInspectionResult, QcQualityCharacteristic,
  QcDefectClassification, QcNcr, QcCapa,
} from '../entities/qc-entities';

@Injectable()
export class QcService {
  constructor(
    @InjectRepository(QcInspectionPlan) private readonly planRepo: Repository<QcInspectionPlan>,
    @InjectRepository(QcInspection) private readonly inspectionRepo: Repository<QcInspection>,
    @InjectRepository(QcInspectionResult) private readonly resultRepo: Repository<QcInspectionResult>,
    @InjectRepository(QcQualityCharacteristic) private readonly charRepo: Repository<QcQualityCharacteristic>,
    @InjectRepository(QcDefectClassification) private readonly defectRepo: Repository<QcDefectClassification>,
    @InjectRepository(QcNcr) private readonly ncrRepo: Repository<QcNcr>,
    @InjectRepository(QcCapa) private readonly capaRepo: Repository<QcCapa>,
    private readonly dataSource: DataSource,
  ) {}

  // ---- Inspection Plans ----
  async listPlans(companyId: string, search?: string) {
    const qb = this.planRepo.createQueryBuilder('p').where('p.company_id = :companyId', { companyId });
    if (search) qb.andWhere('(p.plan_code ILIKE :s OR p.plan_name ILIKE :s)', { s: `%${search}%` });
    qb.orderBy('p.plan_code', 'ASC');
    return qb.getMany();
  }

  async createPlan(dto: any) {
    const exists = await this.planRepo.findOne({ where: { companyId: dto.companyId, planCode: dto.planCode } });
    if (exists) throw new BadRequestException('Plan code already exists');
    return this.planRepo.save(this.planRepo.create(dto));
  }

  async findPlan(id: string) {
    const plan = await this.planRepo.findOne({ where: { id }, relations: ['characteristics'] });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async addCharacteristic(planId: string, dto: any) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    return this.charRepo.save(this.charRepo.create({ ...dto, planId, companyId: plan.companyId }));
  }

  async listCharacteristics(planId: string) {
    return this.charRepo.find({ where: { planId }, order: { sortOrder: 'ASC' } });
  }

  // ---- Defect classifications ----
  async listDefects(companyId: string) {
    return this.defectRepo.find({ where: { companyId }, order: { defectCode: 'ASC' } });
  }

  async createDefect(dto: any) {
    const exists = await this.defectRepo.findOne({ where: { companyId: dto.companyId, defectCode: dto.defectCode } });
    if (exists) throw new BadRequestException('Defect code already exists');
    return this.defectRepo.save(this.defectRepo.create(dto));
  }

  // ---- Inspections ----
  private nextInspectionNo(companyId: string): Promise<string> {
    return this.dataSource.query(
      `SELECT 'INS-' || LPAD((COUNT(*)::int + 1)::text, 6, '0') AS num FROM qc_inspections WHERE company_id = $1`,
      [companyId],
    ).then((r: any[]) => r[0].num);
  }

  async listInspections(companyId: string, query: { page?: number; limit?: number; status?: string; result?: string; referenceType?: string; from?: string; to?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.inspectionRepo.createQueryBuilder('i')
      .where('i.company_id = :companyId', { companyId });
    if (query.status) qb.andWhere('i.status = :st', { st: query.status });
    if (query.result) qb.andWhere('i.result = :res', { res: query.result });
    if (query.referenceType) qb.andWhere('i.reference_type = :rt', { rt: query.referenceType });
    if (query.from) qb.andWhere('i.inspection_date >= :from', { from: query.from });
    if (query.to) qb.andWhere('i.inspection_date <= :to', { to: query.to });
    qb.orderBy('i.created_at', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  async findInspection(id: string) {
    const insp = await this.inspectionRepo.findOne({ where: { id }, relations: ['results', 'results.characteristic'] });
    if (!insp) throw new NotFoundException('Inspection not found');
    return insp;
  }

  async createInspection(dto: any) {
    const no = await this.nextInspectionNo(dto.companyId);
    const insp = this.inspectionRepo.create({
      ...dto, inspectionNo: no, inspectionDate: dto.inspectionDate ? new Date(dto.inspectionDate) : new Date(),
      result: 'PENDING', status: 'PENDING',
    });
    const saved = await this.inspectionRepo.save(insp) as unknown as QcInspection;
    // pre-create result rows from plan characteristics
    if (dto.planId) {
      const chars = await this.charRepo.find({ where: { planId: dto.planId } });
      const results = chars.map((c) => this.resultRepo.create({
        inspectionId: saved.id, characteristicId: c.id, result: 'PENDING',
      }));
      if (results.length) await this.resultRepo.save(results);
    }
    return this.findInspection(saved.id);
  }

  async recordResults(id: string, dto: { results: { id: string; measuredValue?: number; result: string; remarks?: string }[] }) {
    const insp = await this.inspectionRepo.findOne({ where: { id } });
    if (!insp) throw new NotFoundException('Inspection not found');
    if (insp.status !== 'PENDING') throw new BadRequestException('Inspection already completed');
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      let passed = 0, failed = 0;
      for (const r of dto.results) {
        const res = await runner.manager.findOne(QcInspectionResult, { where: { id: r.id } });
        if (!res) throw new NotFoundException('Result not found');
        res.measuredValue = r.measuredValue ?? null;
        res.result = r.result;
        res.remarks = r.remarks ?? null;
        await runner.manager.save(res);
        if (r.result === 'PASS') passed++;
        else if (r.result === 'FAIL') failed++;
      }
      const overall = failed > 0 ? 'FAIL' : passed > 0 ? 'PASS' : 'PENDING';
      insp.result = overall;
      insp.status = 'COMPLETED';
      insp.remarks = `Passed ${passed}, failed ${failed} characteristic(s)`;
      await runner.manager.save(insp);
      await runner.commitTransaction();
    } catch (e) {
      await runner.rollbackTransaction();
      throw e;
    } finally {
      await runner.release();
    }
    return this.findInspection(id);
  }

  // ---- NCR ----
  private nextNcrNo(companyId: string): Promise<string> {
    return this.dataSource.query(
      `SELECT 'NCR-' || LPAD((COUNT(*)::int + 1)::text, 6, '0') AS num FROM qc_ncr WHERE company_id = $1`,
      [companyId],
    ).then((r: any[]) => r[0].num);
  }

  async listNcr(companyId: string, query: { page?: number; limit?: number; status?: string; disposition?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.ncrRepo.createQueryBuilder('n').where('n.company_id = :companyId', { companyId });
    if (query.status) qb.andWhere('n.status = :st', { st: query.status });
    if (query.disposition) qb.andWhere('n.disposition = :d', { d: query.disposition });
    qb.orderBy('n.created_at', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  async createNcr(dto: any) {
    const no = await this.nextNcrNo(dto.companyId);
    return this.ncrRepo.save(this.ncrRepo.create({
      ...dto, ncrNo: no, status: 'OPEN', disposition: 'PENDING', openedDate: new Date(),
    }));
  }

  async setNcrDisposition(id: string, dto: { disposition: string; remarks?: string }) {
    const ncr = await this.ncrRepo.findOne({ where: { id } });
    if (!ncr) throw new NotFoundException('NCR not found');
    ncr.disposition = dto.disposition;
    ncr.remarks = dto.remarks ?? ncr.remarks;
    if (dto.disposition !== 'PENDING') { ncr.status = 'IN_REVIEW'; ncr.closedDate = new Date(); }
    return this.ncrRepo.save(ncr);
  }

  // ---- CAPA ----
  private nextCapaNo(companyId: string): Promise<string> {
    return this.dataSource.query(
      `SELECT 'CAPA-' || LPAD((COUNT(*)::int + 1)::text, 6, '0') AS num FROM qc_capa WHERE company_id = $1`,
      [companyId],
    ).then((r: any[]) => r[0].num);
  }

  async listCapa(companyId: string, query: { page?: number; limit?: number; status?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.capaRepo.createQueryBuilder('c').where('c.company_id = :companyId', { companyId });
    if (query.status) qb.andWhere('c.status = :st', { st: query.status });
    qb.orderBy('c.created_at', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  async createCapa(dto: any) {
    const no = await this.nextCapaNo(dto.companyId);
    return this.capaRepo.save(this.capaRepo.create({ ...dto, capaNo: no, status: 'OPEN' }));
  }

  async updateCapa(id: string, dto: Partial<any>) {
    const capa = await this.capaRepo.findOne({ where: { id } });
    if (!capa) throw new NotFoundException('CAPA not found');
    Object.assign(capa, dto);
    return this.capaRepo.save(capa);
  }
}