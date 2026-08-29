import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  FinanceAccount, FinanceAccountGroup, FinanceFiscalYear, FinanceAccountingPeriod,
  FinanceJournal, FinanceJournalLine, JournalStatus, AccountType, NormalBalance,
} from '../entities';
import { CreateAccountDto, CreateJournalDto, CreateFiscalYearDto } from '../dto/finance.dto';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceAccount) private readonly accountRepo: Repository<FinanceAccount>,
    @InjectRepository(FinanceAccountGroup) private readonly groupRepo: Repository<FinanceAccountGroup>,
    @InjectRepository(FinanceFiscalYear) private readonly fyRepo: Repository<FinanceFiscalYear>,
    @InjectRepository(FinanceAccountingPeriod) private readonly periodRepo: Repository<FinanceAccountingPeriod>,
    @InjectRepository(FinanceJournal) private readonly journalRepo: Repository<FinanceJournal>,
    @InjectRepository(FinanceJournalLine) private readonly lineRepo: Repository<FinanceJournalLine>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------- Chart of Accounts ----------------
  async listAccounts(companyId: string, search?: string) {
    const qb = this.accountRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.group', 'g')
      .where('a.company_id = :companyId', { companyId });
    if (search) qb.andWhere('(a.account_code ILIKE :s OR a.account_name ILIKE :s)', { s: `%${search}%` });
    qb.orderBy('a.account_code', 'ASC');
    return qb.getMany();
  }

  async createAccount(dto: CreateAccountDto) {
    const existing = await this.accountRepo.findOne({ where: { companyId: dto.companyId, accountCode: dto.accountCode } });
    if (existing) throw new BadRequestException('Account code already exists for this company');
    const acct = this.accountRepo.create({
      companyId: dto.companyId, accountCode: dto.accountCode, accountName: dto.accountName,
      accountType: dto.accountType as AccountType, normalBalance: dto.normalBalance as NormalBalance,
      groupId: dto.groupId ?? null, parentAccountId: dto.parentAccountId ?? null,
      currency: dto.currency ?? 'USD', isBankCash: dto.isBankCash ?? false, isAr: dto.isAr ?? false, isAp: dto.isAp ?? false,
    });
    return this.accountRepo.save(acct);
  }

  async updateAccount(id: string, dto: Partial<CreateAccountDto>) {
    const acct = await this.accountRepo.findOne({ where: { id } });
    if (!acct) throw new NotFoundException('Account not found');
    Object.assign(acct, dto);
    return this.accountRepo.save(acct);
  }

  async removeAccount(id: string) {
    const acct = await this.accountRepo.findOne({ where: { id } });
    if (!acct) throw new NotFoundException('Account not found');
    const usage = await this.lineRepo.count({ where: { accountId: id } });
    if (usage > 0) throw new BadRequestException('Account has journal postings and cannot be deleted');
    await this.accountRepo.remove(acct);
    return { success: true };
  }

  // ---------------- Account Groups ----------------
  async listGroups(companyId: string) {
    return this.groupRepo.find({ where: { companyId }, order: { sortOrder: 'ASC' } });
  }

  async createGroup(dto: { companyId: string; groupCode: string; groupName: string; groupClass: string; parentGroupId?: string; sortOrder?: number }) {
    const group = this.groupRepo.create({
      companyId: dto.companyId, groupCode: dto.groupCode, groupName: dto.groupName,
      groupClass: dto.groupClass as any, parentGroupId: dto.parentGroupId ?? null, sortOrder: dto.sortOrder ?? 0,
    });
    return this.groupRepo.save(group);
  }

  // ---------------- Fiscal Years & Periods ----------------
  async listFiscalYears(companyId: string) {
    return this.fyRepo.find({ where: { companyId }, order: { startDate: 'DESC' } });
  }

  async createFiscalYear(dto: CreateFiscalYearDto) {
    const existing = await this.fyRepo.findOne({ where: { companyId: dto.companyId, fyName: dto.fyName } });
    if (existing) throw new BadRequestException('Fiscal year already exists');
    const fy = this.fyRepo.create({ ...dto, status: 'OPEN' });
    const saved = await this.fyRepo.save(fy);
    // auto-generate monthly periods
    const periods: Partial<FinanceAccountingPeriod>[] = [];
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    let i = 1;
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const lastDay = new Date(y, m + 1, 0);
      periods.push({
        fiscalYearId: saved.id,
        periodCode: `P${String(i).padStart(2, '0')}`,
        periodName: `${cur.toLocaleString('en', { month: 'long' })} ${y}`,
        startDate: cur,
        endDate: lastDay > end ? end : lastDay,
        status: 'OPEN',
      });
      cur = new Date(y, m + 1, 1);
      i++;
    }
    await this.periodRepo.save(this.periodRepo.create(periods));
    return saved;
  }

  async listPeriods(fiscalYearId?: string) {
    const qb = this.periodRepo.createQueryBuilder('p').leftJoinAndSelect('p.fiscalYear', 'fy');
    if (fiscalYearId) qb.where('p.fiscal_year_id = :fiscalYearId', { fiscalYearId });
    qb.orderBy('p.start_date', 'ASC');
    return qb.getMany();
  }

  async setPeriodStatus(id: string, status: string) {
    const period = await this.periodRepo.findOne({ where: { id } });
    if (!period) throw new NotFoundException('Period not found');
    if (status === 'CLOSED') {
      const open = await this.journalRepo.count({ where: { periodId: id, status: JournalStatus.DRAFT } });
      if (open > 0) throw new BadRequestException('Period has unposted draft journals; post or delete them first');
    }
    period.status = status;
    return this.periodRepo.save(period);
  }

  // ---------------- Journals ----------------
  async listJournals(companyId: string, query: { page?: number; limit?: number; search?: string; status?: string; from?: string; to?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.journalRepo.createQueryBuilder('j')
      .where('j.company_id = :companyId', { companyId });
    if (query.search) qb.andWhere('(j.journal_number ILIKE :s OR j.description ILIKE :s)', { s: `%${query.search}%` });
    if (query.status) qb.andWhere('j.status = :st', { st: query.status });
    if (query.from) qb.andWhere('j.entry_date >= :from', { from: query.from });
    if (query.to) qb.andWhere('j.entry_date <= :to', { to: query.to });
    qb.orderBy('j.entry_date', 'DESC').addOrderBy('j.created_at', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  async findJournal(id: string) {
    const j = await this.journalRepo.findOne({ where: { id }, relations: ['lines', 'lines.account', 'period', 'fiscalYear'] });
    if (!j) throw new NotFoundException('Journal not found');
    return j;
  }

  private nextJournalNumber(companyId: string, type: string): Promise<string> {
    return this.dataSource.query(
      `SELECT 'JV-' || LPAD((COUNT(*)::int + 1)::text, 6, '0') AS num FROM finance_journals WHERE company_id = $1`,
      [companyId],
    ).then((r: any[]) => r[0].num);
  }

  async createJournal(dto: CreateJournalDto, actorId?: string) {
    if (!dto.lines || dto.lines.length < 2) throw new BadRequestException('A journal must have at least two lines');
    const totalDebit = dto.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = dto.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new BadRequestException(`Journal is unbalanced: debit ${totalDebit} <> credit ${totalCredit}`);
    }
    for (const l of dto.lines) {
      if (l.debit > 0 && l.credit > 0) throw new BadRequestException('A line cannot have both debit and credit');
      const acct = await this.accountRepo.findOne({ where: { id: l.accountId } });
      if (!acct) throw new BadRequestException(`Account ${l.accountId} not found`);
    }
    // period control
    let periodId = dto.periodId ?? null;
    if (!periodId) {
      const period = await this.periodRepo
        .createQueryBuilder('p')
        .where('p.start_date <= :d AND p.end_date >= :d', { d: dto.entryDate })
        .andWhere('p.status = :st', { st: 'OPEN' })
        .getOne();
      periodId = period?.id ?? null;
    }
    const num = await this.nextJournalNumber(dto.companyId, dto.journalType);
    const journal = this.journalRepo.create({
      companyId: dto.companyId, journalNumber: num, journalType: dto.journalType as any,
      entryDate: new Date(dto.entryDate), periodId, fiscalYearId: dto.fiscalYearId ?? null,
      description: dto.description ?? null, status: JournalStatus.DRAFT,
      totalDebit, totalCredit, createdBy: actorId ?? null,
      lines: dto.lines.map((l, i) => this.lineRepo.create({
        lineNumber: i + 1, accountId: l.accountId, description: l.description ?? null,
        debit: l.debit || 0, credit: l.credit || 0, referenceType: l.referenceType ?? null, referenceId: l.referenceId ?? null,
        createdBy: actorId ?? null,
      })),
    });
    return this.journalRepo.save(journal);
  }

  async postJournal(id: string, actorId?: string) {
    const journal = await this.journalRepo.findOne({ where: { id }, relations: ['lines'] });
    if (!journal) throw new NotFoundException('Journal not found');
    if (journal.status === JournalStatus.POSTED) throw new BadRequestException('Journal is already posted');
    if (journal.status === JournalStatus.REVERSED) throw new BadRequestException('Reversed journals cannot be posted');
    if (Math.abs(journal.totalDebit - journal.totalCredit) > 0.0001) {
      throw new BadRequestException('Cannot post unbalanced journal');
    }
    // period must be open
    if (journal.periodId) {
      const period = await this.periodRepo.findOne({ where: { id: journal.periodId } });
      if (period && period.status !== 'OPEN') throw new ForbiddenException(`Accounting period ${period.periodCode} is closed`);
    }
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      journal.status = JournalStatus.POSTED;
      journal.postedAt = new Date();
      journal.postedBy = actorId ?? null;
      await runner.manager.save(journal);
      // recompute totals from lines (defense in depth)
      const totals = await runner.manager
        .createQueryBuilder(FinanceJournalLine, 'l')
        .select('COALESCE(SUM(l.debit),0)', 'd')
        .addSelect('COALESCE(SUM(l.credit),0)', 'c')
        .where('l.journal_id = :id', { id })
        .getRawOne();
      if (Math.abs(Number(totals.d) - Number(totals.c)) > 0.0001) throw new BadRequestException('Lines unbalanced');
      await runner.commitTransaction();
    } catch (e) {
      await runner.rollbackTransaction();
      throw e;
    } finally {
      await runner.release();
    }
    return this.findJournal(id);
  }

  async reverseJournal(id: string, actorId?: string) {
    const journal = await this.journalRepo.findOne({ where: { id }, relations: ['lines'] });
    if (!journal) throw new NotFoundException('Journal not found');
    if (journal.status !== JournalStatus.POSTED) throw new BadRequestException('Only posted journals can be reversed');
    const num = await this.nextJournalNumber(journal.companyId, 'GENERAL');
    const revLines = journal.lines.map((l) => this.lineRepo.create({
      lineNumber: l.lineNumber, accountId: l.accountId,
      description: `REVERSAL of ${journal.journalNumber}: ${l.description ?? ''}`,
      debit: l.credit, credit: l.debit, referenceType: 'REVERSAL', referenceId: journal.id,
      createdBy: actorId ?? null,
    }));
    const reversal = this.journalRepo.create({
      companyId: journal.companyId, journalNumber: num, journalType: 'GENERAL' as any,
      entryDate: new Date(), periodId: journal.periodId, fiscalYearId: journal.fiscalYearId,
      description: `Reversal of ${journal.journalNumber}`, status: JournalStatus.POSTED,
      totalDebit: journal.totalCredit, totalCredit: journal.totalDebit,
      postedAt: new Date(), postedBy: actorId ?? null, createdBy: actorId ?? null,
      lines: revLines,
    });
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.manager.save(reversal);
      journal.status = JournalStatus.REVERSED;
      await runner.manager.save(journal);
      await runner.commitTransaction();
    } catch (e) {
      await runner.rollbackTransaction();
      throw e;
    } finally {
      await runner.release();
    }
    return this.findJournal(id);
  }

  async deleteJournal(id: string) {
    const journal = await this.journalRepo.findOne({ where: { id } });
    if (!journal) throw new NotFoundException('Journal not found');
    if (journal.status === JournalStatus.POSTED) throw new ForbiddenException('Posted journals cannot be deleted; reverse them instead');
    await this.journalRepo.remove(journal);
    return { success: true };
  }

  // ---------------- Reports ----------------
  async trialBalance(companyId: string, from?: string, to?: string) {
    const qb = this.lineRepo.createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.account_code', 'accountCode')
      .addSelect('a.account_name', 'accountName')
      .addSelect('a.account_type', 'accountType')
      .addSelect('a.normal_balance', 'normalBalance')
      .addSelect('SUM(l.debit)', 'totalDebit')
      .addSelect('SUM(l.credit)', 'totalCredit')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'");
    if (from) qb.andWhere('j.entry_date >= :from', { from });
    if (to) qb.andWhere('j.entry_date <= :to', { to });
    qb.groupBy('a.account_code').addGroupBy('a.account_name').addGroupBy('a.account_type').addGroupBy('a.normal_balance')
      .orderBy('a.account_code', 'ASC');
    const rows = await qb.getRawMany<{
      accountCode: string; accountName: string; accountType: string; normalBalance: string; totalDebit: string; totalCredit: string;
    }>();
    const accounts = rows.map((r) => {
      const d = Number(r.totalDebit), c = Number(r.totalCredit);
      const balance = r.normalBalance === 'DEBIT' ? d - c : c - d;
      return { ...r, balance: Number(balance.toFixed(4)) };
    });
    const totalDebit = accounts.reduce((s, a) => s + Number(a.totalDebit), 0);
    const totalCredit = accounts.reduce((s, a) => s + Number(a.totalCredit), 0);
    return { data: accounts, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }

  async generalLedger(companyId: string, accountId?: string, from?: string, to?: string) {
    const qb = this.lineRepo.createQueryBuilder('l')
      .innerJoinAndSelect('l.journal', 'j')
      .innerJoinAndSelect('l.account', 'a')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'");
    if (accountId) qb.andWhere('l.account_id = :accountId', { accountId });
    if (from) qb.andWhere('j.entry_date >= :from', { from });
    if (to) qb.andWhere('j.entry_date <= :to', { to });
    qb.orderBy('j.entry_date', 'ASC').addOrderBy('j.journal_number', 'ASC');
    return qb.getMany();
  }

  async plStatement(companyId: string, from?: string, to?: string) {
    const rows = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.account_code', 'accountCode').addSelect('a.account_name', 'accountName')
      .addSelect('a.account_type', 'accountType').addSelect('a.normal_balance', 'normalBalance')
      .addSelect('SUM(l.debit)', 'totalDebit').addSelect('SUM(l.credit)', 'totalCredit')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'")
      .andWhere("a.account_type IN ('REVENUE','EXPENSE')")
      .groupBy('a.account_code').addGroupBy('a.account_name').addGroupBy('a.account_type').addGroupBy('a.normal_balance')
      .getRawMany();
    let revenue = 0, expenses = 0;
    const items = rows.map((r: any) => {
      const d = Number(r.totalDebit), c = Number(r.totalCredit);
      const bal = r.normalBalance === 'CREDIT' ? c - d : d - c;
      if (r.accountType === 'REVENUE') revenue += bal; else expenses += bal;
      return { ...r, balance: bal };
    });
    const netProfit = revenue - expenses;
    return { data: items, revenue, expenses, netProfit };
  }

  async balanceSheet(companyId: string, asOf?: string) {
    const qb = this.lineRepo.createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.account_code', 'accountCode').addSelect('a.account_name', 'accountName')
      .addSelect('a.account_type', 'accountType').addSelect('a.normal_balance', 'normalBalance')
      .addSelect('SUM(l.debit)', 'totalDebit').addSelect('SUM(l.credit)', 'totalCredit')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'")
      .andWhere("a.account_type IN ('ASSET','LIABILITY','EQUITY')");
    if (asOf) qb.andWhere('j.entry_date <= :asOf', { asOf });
    qb.groupBy('a.account_code').addGroupBy('a.account_name').addGroupBy('a.account_type').addGroupBy('a.normal_balance')
      .orderBy('a.account_code', 'ASC');
    const rows = await qb.getRawMany<{
      accountCode: string; accountName: string; accountType: string; normalBalance: string; totalDebit: string; totalCredit: string;
    }>();
    let assets = 0, liabilities = 0, equity = 0;
    const items = rows.map((r) => {
      const d = Number(r.totalDebit), c = Number(r.totalCredit);
      const bal = r.normalBalance === 'DEBIT' ? d - c : c - d;
      if (r.accountType === 'ASSET') assets += bal;
      else if (r.accountType === 'LIABILITY') liabilities += bal;
      else equity += bal;
      return { ...r, balance: bal };
    });
    return { data: items, assets, liabilities, equity, balanced: Math.abs(assets - (liabilities + equity)) < 0.01 };
  }

  async arReport(companyId: string) {
    const rows = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.account_code', 'accountCode').addSelect('a.account_name', 'accountName')
      .addSelect('SUM(l.debit - l.credit)', 'balance')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'").andWhere('a.is_ar = true')
      .groupBy('a.account_code').addGroupBy('a.account_name')
      .getRawMany();
    const data = rows.map((r: any) => ({ ...r, balance: Number(r.balance) })).filter((r) => r.balance > 0);
    return { data, total: data.reduce((s, r) => s + r.balance, 0) };
  }

  async apReport(companyId: string) {
    const rows = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.account_code', 'accountCode').addSelect('a.account_name', 'accountName')
      .addSelect('SUM(l.credit - l.debit)', 'balance')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'").andWhere('a.is_ap = true')
      .groupBy('a.account_code').addGroupBy('a.account_name')
      .getRawMany();
    const data = rows.map((r: any) => ({ ...r, balance: Number(r.balance) })).filter((r) => r.balance > 0);
    return { data, total: data.reduce((s, r) => s + r.balance, 0) };
  }
}