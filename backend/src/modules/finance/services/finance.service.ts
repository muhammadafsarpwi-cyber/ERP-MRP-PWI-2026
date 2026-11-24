import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { withTransaction } from '../../../common/transaction.util';
import {
  FinanceAccount,
  FinanceAccountGroup,
  FinanceFiscalYear,
  FinanceAccountingPeriod,
  FinanceJournal,
  FinanceJournalLine,
  JournalStatus,
  JournalType,
  AccountType,
  NormalBalance,
} from '../entities';
import {
  CreateAccountDto,
  CreateJournalDto,
  CreateFiscalYearDto,
  CreateContraTransferDto,
} from '../dto/finance.dto';
import { FinanceAutoPostingService } from './finance-auto-posting.service';

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

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
    private readonly autoPosting: FinanceAutoPostingService,
  ) {}

  // ---------------- Chart of Accounts ----------------
  async listAccounts(companyId: string, search?: string) {
    const qb = this.accountRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.group', 'g')
      .leftJoinAndSelect('a.parentAccount', 'p')
      .where('a.company_id = :companyId', { companyId });
    if (search) {
      qb.andWhere('(a.account_code ILIKE :s OR a.account_name ILIKE :s)', {
        s: `%${search}%`,
      });
    }
    qb.orderBy('a.account_code', 'ASC');
    const accounts = await qb.getMany();

    const sums: Array<{ account_id: string; dr: string; cr: string }> =
      typeof this.dataSource?.query === 'function'
        ? await this.dataSource
            .query(
              `SELECT l.account_id,
                      COALESCE(SUM(l.debit), 0) AS dr,
                      COALESCE(SUM(l.credit), 0) AS cr
               FROM public.finance_journal_lines l
               INNER JOIN public.finance_journals j ON j.id = l.journal_id
               WHERE j.company_id = $1 AND j.status = 'POSTED'
               GROUP BY l.account_id`,
              [companyId],
            )
            .catch(() => [])
        : [];

    const sumMap = new Map(
      (sums || []).map((s) => [s.account_id, { dr: Number(s.dr || 0), cr: Number(s.cr || 0) }]),
    );

    return accounts.map((a) => {
      const agg = sumMap.get(a.id) || { dr: 0, cr: 0 };
      const rawBal = a.normalBalance === NormalBalance.DEBIT ? agg.dr - agg.cr : agg.cr - agg.dr;
      return {
        ...a,
        totalDebit: round2(agg.dr),
        totalCredit: round2(agg.cr),
        balance: round2(rawBal),
      };
    });
  }

  async listBankCashAccounts(companyId: string) {
    await this.autoPosting.ensureSystemArAccounts(companyId);
    const all = await this.listAccounts(companyId);
    return all.filter(
      (a) =>
        a.status === 'ACTIVE' &&
        (a.isBankCash || ['1000', '1010', '1011', '1012', '1020'].includes(a.accountCode)),
    );
  }

  async seedStandardCoa(companyId: string) {
    const res = await this.autoPosting.ensureSystemArAccounts(companyId, undefined, true);
    return res;
  }

  async createAccount(dto: CreateAccountDto, companyId?: string) {
    const effectiveCompanyId = companyId || dto.companyId;
    const existing = await this.accountRepo.findOne({
      where: { companyId: effectiveCompanyId, accountCode: dto.accountCode.trim() },
    });
    if (existing) {
      throw new BadRequestException('Account code already exists for this company');
    }

    let groupId = dto.groupId ?? null;
    if (!groupId && typeof this.groupRepo?.find === 'function') {
      const groups = await this.groupRepo.find({ where: { companyId: effectiveCompanyId } }).catch(() => []);
      groupId =
        groups.find((g) => String(g.groupClass).toUpperCase() === String(dto.accountType).toUpperCase())
          ?.id ?? null;
    }

    const acct = this.accountRepo.create({
      companyId: effectiveCompanyId,
      accountCode: dto.accountCode.trim(),
      accountName: dto.accountName.trim(),
      accountType: dto.accountType as AccountType,
      normalBalance: dto.normalBalance as NormalBalance,
      groupId,
      parentAccountId: dto.parentAccountId ?? null,
      currency: dto.currency ?? 'PKR',
      isBankCash: dto.isBankCash ?? false,
      isAr: dto.isAr ?? false,
      isAp: dto.isAp ?? false,
      bankName: dto.bankName?.trim() || null,
      bankAccountNumber: dto.bankAccountNumber?.trim() || null,
      notes: dto.notes?.trim() || null,
      status: dto.status || 'ACTIVE',
    });
    return this.accountRepo.save(acct);
  }

  async updateAccount(id: string, dto: Partial<CreateAccountDto>, companyId?: string) {
    const acct = await this.accountRepo.findOne({ where: { id } });
    if (!acct) throw new NotFoundException('Account not found');
    if (companyId && acct.companyId !== companyId) {
      throw new ForbiddenException('Account belongs to another company');
    }
    if (dto.accountCode && dto.accountCode.trim() !== acct.accountCode) {
      const dup = await this.accountRepo.findOne({
        where: { companyId: acct.companyId, accountCode: dto.accountCode.trim() },
      });
      if (dup && dup.id !== id) {
        throw new BadRequestException(`Account code '${dto.accountCode}' already exists`);
      }
    }
    Object.assign(acct, {
      ...dto,
      accountCode: dto.accountCode ? dto.accountCode.trim() : acct.accountCode,
      accountName: dto.accountName ? dto.accountName.trim() : acct.accountName,
      bankName: dto.bankName !== undefined ? dto.bankName?.trim() || null : acct.bankName,
      bankAccountNumber:
        dto.bankAccountNumber !== undefined
          ? dto.bankAccountNumber?.trim() || null
          : acct.bankAccountNumber,
      notes: dto.notes !== undefined ? dto.notes?.trim() || null : acct.notes,
    });
    return this.accountRepo.save(acct);
  }

  async removeAccount(id: string, companyId?: string) {
    const acct = await this.accountRepo.findOne({ where: { id } });
    if (!acct) throw new NotFoundException('Account not found');
    if (companyId && acct.companyId !== companyId) {
      throw new ForbiddenException('Account belongs to another company');
    }
    const usage = await this.lineRepo.count({ where: { accountId: id } });
    if (usage > 0) {
      throw new BadRequestException('Account has journal postings and cannot be deleted');
    }
    const children = await this.accountRepo.count({ where: { parentAccountId: id } });
    if (children > 0) {
      throw new BadRequestException('Account has child sub-accounts; remove or reassign children first');
    }
    await this.accountRepo.remove(acct);
    return { success: true };
  }

  // ---------------- Account Groups ----------------
  async listGroups(companyId: string) {
    return this.groupRepo.find({ where: { companyId }, order: { sortOrder: 'ASC' } });
  }

  async createGroup(dto: {
    companyId: string;
    groupCode: string;
    groupName: string;
    groupClass: string;
    parentGroupId?: string;
    sortOrder?: number;
  }) {
    const group = this.groupRepo.create({
      companyId: dto.companyId,
      groupCode: dto.groupCode,
      groupName: dto.groupName,
      groupClass: dto.groupClass as any,
      parentGroupId: dto.parentGroupId ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.groupRepo.save(group);
  }

  // ---------------- Fiscal Years & Periods ----------------
  async listFiscalYears(companyId: string) {
    return this.fyRepo.find({ where: { companyId }, order: { startDate: 'DESC' } });
  }

  async createFiscalYear(dto: CreateFiscalYearDto) {
    const existing = await this.fyRepo.findOne({
      where: { companyId: dto.companyId, fyName: dto.fyName },
    });
    if (existing) throw new BadRequestException('Fiscal year already exists');
    const fy = this.fyRepo.create({ ...dto, status: 'OPEN' });
    const saved = await this.fyRepo.save(fy);
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

  async listPeriods(fiscalYearId?: string, companyId?: string) {
    const qb = this.periodRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.fiscalYear', 'fy');
    if (fiscalYearId) {
      qb.where('p.fiscal_year_id = :fiscalYearId', { fiscalYearId });
    } else if (companyId) {
      qb.where('fy.company_id = :companyId', { companyId });
    }
    qb.orderBy('p.start_date', 'ASC');
    return qb.getMany();
  }

  async setPeriodStatus(id: string, status: string, companyId?: string) {
    const period = await this.periodRepo.findOne({ where: { id }, relations: ['fiscalYear'] });
    if (!period) throw new NotFoundException('Period not found');
    if (companyId && period.fiscalYear && period.fiscalYear.companyId !== companyId) {
      throw new ForbiddenException('Accounting period belongs to another company');
    }
    if (status === 'CLOSED') {
      const open = await this.journalRepo.count({
        where: { periodId: id, status: JournalStatus.DRAFT },
      });
      if (open > 0) {
        throw new BadRequestException(
          'Period has unposted draft journals; post or delete them first',
        );
      }
    }
    period.status = status;
    return this.periodRepo.save(period);
  }

  // ---------------- Journals & Vouchers ----------------
  async listJournals(
    companyId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      journalType?: string;
      voucherType?: string;
      divisionId?: string;
      from?: string;
      to?: string;
      includeArchived?: string;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.journalRepo
      .createQueryBuilder('j')
      .leftJoinAndSelect('j.period', 'p')
      .where('j.companyId = :companyId', { companyId });

    if (query.search) {
      qb.andWhere(
        '(j.journalNumber ILIKE :s OR j.description ILIKE :s OR COALESCE(j.chequeNumber, \'\') ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    if (query.status && query.status !== 'ALL') {
      qb.andWhere('j.status = :st', { st: query.status });
    } else if (query.includeArchived !== 'true') {
      qb.andWhere("j.status <> 'ARCHIVED'");
    }

    if (query.journalType) qb.andWhere('j.journalType = :jt', { jt: query.journalType });
    if (query.voucherType) qb.andWhere('j.voucherType = :vt', { vt: query.voucherType });
    if (query.divisionId) qb.andWhere('j.divisionId = :divisionId', { divisionId: query.divisionId });
    if (query.from) qb.andWhere('j.entryDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('j.entryDate <= :to', { to: query.to });

    qb.orderBy('j.entryDate', 'DESC').addOrderBy('j.createdAt', 'DESC');

    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    if (data.length > 0) {
      const ids = data.map((j) => j.id);
      const lines = await this.lineRepo.find({
        where: { journalId: In(ids) },
        relations: ['account'],
        order: { lineNumber: 'ASC' },
      });
      const linesByJournal = new Map<string, FinanceJournalLine[]>();
      for (const l of lines) {
        const list = linesByJournal.get(l.journalId) || [];
        list.push(l);
        linesByJournal.set(l.journalId, list);
      }
      for (const j of data) {
        j.lines = linesByJournal.get(j.id) || [];
      }
    }
    const enriched = await this.enrichJournalsMetadata(data, companyId);
    return { data: enriched, total, page, limit };
  }

  private async enrichJournalsMetadata(journals: FinanceJournal[], companyId: string) {
    if (!journals.length || typeof this.dataSource?.query !== 'function') return journals;

    const divIds = Array.from(
      new Set(journals.map((j) => j.divisionId).filter((v): v is string => Boolean(v))),
    );
    const custIds = Array.from(
      new Set(
        journals
          .filter((j) => j.partyType === 'CUSTOMER' && j.partyId)
          .map((j) => j.partyId as string),
      ),
    );
    const suppIds = Array.from(
      new Set(
        journals
          .filter((j) => j.partyType === 'SUPPLIER' && j.partyId)
          .map((j) => j.partyId as string),
      ),
    );

    const [divRows, custRows, suppRows] = await Promise.all([
      divIds.length
        ? this.dataSource
            .query(`SELECT id, division_code, name FROM public.divisions WHERE id = ANY($1::uuid[])`, [divIds])
            .catch(() => [])
        : Promise.resolve([]),
      custIds.length
        ? this.dataSource
            .query(
              `SELECT id, name FROM public.customers WHERE id = ANY($1::uuid[])
               UNION
               SELECT id, company_name AS name FROM erp_sales.customers WHERE id = ANY($1::uuid[])`,
              [custIds],
            )
            .catch(() => [])
        : Promise.resolve([]),
      suppIds.length
        ? this.dataSource
            .query(
              `SELECT id, name FROM public.suppliers WHERE company_id = $1 AND id = ANY($2::uuid[])`,
              [companyId, suppIds],
            )
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const divMap = new Map((divRows || []).map((d: any) => [d.id, d.name]));
    const partyMap = new Map<string, string>();
    for (const c of custRows || []) partyMap.set(c.id, c.name);
    for (const s of suppRows || []) partyMap.set(s.id, s.name);

    return journals.map((j) => ({
      ...j,
      divisionName: j.divisionId ? divMap.get(j.divisionId) || null : null,
      partyName: j.partyId ? partyMap.get(j.partyId) || null : null,
    }));
  }

  async findJournal(id: string, companyId?: string) {
    const j = await this.journalRepo.findOne({
      where: { id },
      relations: ['lines', 'lines.account', 'period', 'fiscalYear'],
      order: { lines: { lineNumber: 'ASC' } } as any,
    });
    if (!j) throw new NotFoundException('Journal not found');
    if (companyId && j.companyId !== companyId) {
      throw new ForbiddenException('Journal belongs to another company');
    }
    const [enriched] = await this.enrichJournalsMetadata([j], j.companyId);
    return enriched || j;
  }

  private getVoucherPrefix(journalType: string, voucherType?: string): string {
    if (voucherType) return voucherType;
    const t = String(journalType || 'GENERAL').toUpperCase();
    if (t === JournalType.PAYMENT) return 'PV';
    if (t === JournalType.RECEIPT) return 'RV';
    if (t === JournalType.CONTRA) return 'CV';
    return 'JV';
  }

  private async nextJournalNumber(
    companyId: string,
    type: string,
    voucherType?: string,
  ): Promise<string> {
    const prefix = this.getVoucherPrefix(type, voucherType);
    const rows = await this.dataSource.query(
      `SELECT COALESCE(MAX(CAST(NULLIF(SUBSTRING(journal_number FROM '([0-9]+)$'), '') AS INT)), 0) AS max_num
       FROM public.finance_journals
       WHERE company_id = $1 AND journal_number ~ ('^' || $2 || '-[0-9]+$')`,
      [companyId, prefix],
    );
    const nextNum = (Number(rows?.[0]?.max_num) || 0) + 1;
    return `${prefix}-${String(nextNum).padStart(6, '0')}`;
  }

  async createJournal(dto: CreateJournalDto, actorId?: string, companyId?: string) {
    const effectiveCompanyId = companyId || dto.companyId;
    if (!effectiveCompanyId) throw new BadRequestException('companyId is required');
    if (!dto.lines || dto.lines.length < 2) {
      throw new BadRequestException('A journal must have at least two lines');
    }
    const totalDebit = dto.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = dto.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.0001 || totalDebit <= 0) {
      throw new BadRequestException(
        `Journal must balance and exceed zero: debit ${totalDebit} <> credit ${totalCredit}`,
      );
    }
    for (const l of dto.lines) {
      if (l.debit > 0 && l.credit > 0) {
        throw new BadRequestException('A line cannot have both debit and credit');
      }
      if ((l.debit || 0) <= 0 && (l.credit || 0) <= 0) {
        throw new BadRequestException('Every journal line must have a non-zero debit or credit');
      }
      const acct = await this.accountRepo.findOne({
        where: { id: l.accountId, companyId: effectiveCompanyId },
      });
      if (!acct) throw new BadRequestException(`Account ${l.accountId} not found in company`);
    }

    let periodId = dto.periodId ?? null;
    let fiscalYearId = dto.fiscalYearId ?? null;
    if (!periodId) {
      const period = await this.periodRepo
        .createQueryBuilder('p')
        .innerJoinAndSelect('p.fiscalYear', 'fy')
        .where('fy.company_id = :companyId', { companyId: effectiveCompanyId })
        .andWhere('p.start_date <= :d AND p.end_date >= :d', { d: dto.entryDate })
        .andWhere('p.status = :st', { st: 'OPEN' })
        .getOne()
        .catch(() => null);
      if (period) {
        periodId = period.id;
        fiscalYearId = fiscalYearId || period.fiscalYearId;
      } else if (!fiscalYearId) {
        const fy = await this.fyRepo.findOne({
          where: { companyId: effectiveCompanyId, status: 'OPEN' },
        });
        fiscalYearId = fy?.id ?? null;
      }
    }

    const voucherType = this.getVoucherPrefix(dto.journalType, dto.voucherType);
    const num = await this.nextJournalNumber(effectiveCompanyId, dto.journalType, voucherType);
    const journal = this.journalRepo.create({
      companyId: effectiveCompanyId,
      journalNumber: num,
      journalType: dto.journalType as any,
      voucherType,
      entryDate: new Date(dto.entryDate),
      periodId,
      fiscalYearId,
      divisionId: dto.divisionId ?? null,
      partyType: dto.partyType ?? null,
      partyId: dto.partyId ?? null,
      paymentMode: dto.paymentMode ?? null,
      chequeNumber: dto.chequeNumber ?? null,
      chequeDate: dto.chequeDate ? new Date(dto.chequeDate) : null,
      bankAccountId: dto.bankAccountId ?? null,
      description: dto.description ?? null,
      status: JournalStatus.DRAFT,
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      createdBy: actorId ?? null,
      lines: dto.lines.map((l, i) =>
        this.lineRepo.create({
          lineNumber: i + 1,
          accountId: l.accountId,
          description: l.description ?? dto.description ?? null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          referenceType: l.referenceType ?? null,
          referenceId: l.referenceId ?? null,
          divisionId: l.divisionId ?? dto.divisionId ?? null,
          partyType: l.partyType ?? dto.partyType ?? null,
          partyId: l.partyId ?? dto.partyId ?? null,
          createdBy: actorId ?? null,
        }),
      ),
    });

    const saved = await this.journalRepo.save(journal);
    if (dto.postImmediately) {
      return this.postJournal(saved.id, actorId, effectiveCompanyId);
    }
    return this.findJournal(saved.id, effectiveCompanyId);
  }

  async createContraTransfer(
    dto: CreateContraTransferDto,
    actorId?: string,
    companyId?: string,
  ) {
    const effectiveCompanyId = companyId || dto.companyId;
    if (!effectiveCompanyId) throw new BadRequestException('companyId is required');
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Source and destination accounts cannot be identical');
    }
    const [fromAcct, toAcct] = await Promise.all([
      this.accountRepo.findOne({ where: { id: dto.fromAccountId, companyId: effectiveCompanyId } }),
      this.accountRepo.findOne({ where: { id: dto.toAccountId, companyId: effectiveCompanyId } }),
    ]);
    if (!fromAcct || !toAcct) {
      throw new NotFoundException('Selected source or destination cash/bank account not found');
    }

    const narration =
      dto.description?.trim() ||
      `Contra transfer from ${fromAcct.accountCode} ${fromAcct.accountName} to ${toAcct.accountCode} ${toAcct.accountName}`;

    return this.createJournal(
      {
        companyId: effectiveCompanyId,
        journalType: JournalType.CONTRA,
        voucherType: 'CV',
        entryDate: dto.entryDate,
        divisionId: dto.divisionId ?? null,
        paymentMode: dto.paymentMode || 'BANK_TRANSFER',
        chequeNumber: dto.chequeNumber ?? null,
        bankAccountId: toAcct.id,
        description: narration,
        postImmediately: dto.postImmediately !== false,
        lines: [
          {
            accountId: toAcct.id,
            debit: Number(dto.amount),
            credit: 0,
            description: `Deposit / Transfer In (${toAcct.accountName})`,
          },
          {
            accountId: fromAcct.id,
            debit: 0,
            credit: Number(dto.amount),
            description: `Withdrawal / Transfer Out (${fromAcct.accountName})`,
          },
        ],
      },
      actorId,
      effectiveCompanyId,
    );
  }

  async postJournal(id: string, actorId?: string, companyId?: string) {
    const journal = await this.journalRepo.findOne({ where: { id }, relations: ['lines'] });
    if (!journal) throw new NotFoundException('Journal not found');
    if (companyId && journal.companyId !== companyId) {
      throw new ForbiddenException('Journal belongs to another company');
    }
    if (journal.status === JournalStatus.POSTED) {
      throw new BadRequestException('Journal is already posted');
    }
    if (journal.status === JournalStatus.REVERSED || journal.status === JournalStatus.ARCHIVED) {
      throw new BadRequestException('Reversed or archived journals cannot be posted');
    }
    if (Math.abs(Number(journal.totalDebit) - Number(journal.totalCredit)) > 0.0001) {
      throw new BadRequestException('Cannot post unbalanced journal');
    }
    if (journal.periodId) {
      const period = await this.periodRepo.findOne({ where: { id: journal.periodId } });
      if (period && period.status !== 'OPEN') {
        throw new ForbiddenException(`Accounting period ${period.periodCode} is closed`);
      }
    }
    await withTransaction(this.dataSource, async (manager) => {
      journal.status = JournalStatus.POSTED;
      journal.postedAt = new Date();
      journal.postedBy = actorId ?? null;
      await manager.save(journal);
      const totals = await manager
        .createQueryBuilder(FinanceJournalLine, 'l')
        .select('COALESCE(SUM(l.debit),0)', 'd')
        .addSelect('COALESCE(SUM(l.credit),0)', 'c')
        .where('l.journal_id = :id', { id })
        .getRawOne();
      if (Math.abs(Number(totals.d) - Number(totals.c)) > 0.0001) {
        throw new BadRequestException('Lines unbalanced');
      }
    });
    return this.findJournal(id, journal.companyId);
  }

  async reverseJournal(id: string, actorId?: string, companyId?: string) {
    const journal = await this.journalRepo.findOne({ where: { id }, relations: ['lines'] });
    if (!journal) throw new NotFoundException('Journal not found');
    if (companyId && journal.companyId !== companyId) {
      throw new ForbiddenException('Journal belongs to another company');
    }
    if (journal.status !== JournalStatus.POSTED) {
      throw new BadRequestException('Only posted journals can be reversed');
    }
    const num = await this.nextJournalNumber(journal.companyId, 'GENERAL', 'JV');
    const revLines = journal.lines.map((l) =>
      this.lineRepo.create({
        lineNumber: l.lineNumber,
        accountId: l.accountId,
        description: `REVERSAL of ${journal.journalNumber}: ${l.description ?? ''}`,
        debit: l.credit,
        credit: l.debit,
        referenceType: 'REVERSAL',
        referenceId: journal.id,
        divisionId: l.divisionId ?? journal.divisionId ?? null,
        partyType: l.partyType ?? journal.partyType ?? null,
        partyId: l.partyId ?? journal.partyId ?? null,
        createdBy: actorId ?? null,
      }),
    );
    const reversal = this.journalRepo.create({
      companyId: journal.companyId,
      journalNumber: num,
      journalType: JournalType.GENERAL,
      voucherType: 'JV',
      entryDate: new Date(),
      periodId: journal.periodId,
      fiscalYearId: journal.fiscalYearId,
      divisionId: journal.divisionId ?? null,
      partyType: journal.partyType ?? null,
      partyId: journal.partyId ?? null,
      description: `Reversal of ${journal.journalNumber}`,
      status: JournalStatus.POSTED,
      totalDebit: journal.totalCredit,
      totalCredit: journal.totalDebit,
      postedAt: new Date(),
      postedBy: actorId ?? null,
      createdBy: actorId ?? null,
      lines: revLines,
    });
    await withTransaction(this.dataSource, async (manager) => {
      await manager.save(reversal);
      journal.status = JournalStatus.REVERSED;
      await manager.save(journal);
    });
    return this.findJournal(id, journal.companyId);
  }

  async deleteJournal(id: string, companyId?: string) {
    const journal = await this.journalRepo.findOne({ where: { id } });
    if (!journal) throw new NotFoundException('Journal not found');
    if (companyId && journal.companyId !== companyId) {
      throw new ForbiddenException('Journal belongs to another company');
    }
    if (journal.status === JournalStatus.POSTED) {
      throw new ForbiddenException('Posted journals cannot be deleted; reverse them instead');
    }
    await this.journalRepo.remove(journal);
    return { success: true };
  }

  // ---------------- Enterprise Reports ----------------
  async trialBalance(companyId: string, from?: string, to?: string, divisionId?: string) {
    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.id', 'accountId')
      .addSelect('a.account_code', 'accountCode')
      .addSelect('a.account_name', 'accountName')
      .addSelect('a.account_type', 'accountType')
      .addSelect('a.normal_balance', 'normalBalance')
      .addSelect('a.currency', 'currency');

    if (from) {
      qb.addSelect(
        `COALESCE(SUM(CASE WHEN j.entry_date < :fromDate THEN l.debit ELSE 0 END), 0)`,
        'openingDebitRaw',
      )
        .addSelect(
          `COALESCE(SUM(CASE WHEN j.entry_date < :fromDate THEN l.credit ELSE 0 END), 0)`,
          'openingCreditRaw',
        )
        .addSelect(
          `COALESCE(SUM(CASE WHEN j.entry_date >= :fromDate ${to ? 'AND j.entry_date <= :toDate' : ''} THEN l.debit ELSE 0 END), 0)`,
          'periodDebit',
        )
        .addSelect(
          `COALESCE(SUM(CASE WHEN j.entry_date >= :fromDate ${to ? 'AND j.entry_date <= :toDate' : ''} THEN l.credit ELSE 0 END), 0)`,
          'periodCredit',
        )
        .setParameter('fromDate', from);
    } else {
      qb.addSelect('0', 'openingDebitRaw')
        .addSelect('0', 'openingCreditRaw')
        .addSelect(
          `COALESCE(SUM(${to ? 'CASE WHEN j.entry_date <= :toDate THEN l.debit ELSE 0 END' : 'l.debit'}), 0)`,
          'periodDebit',
        )
        .addSelect(
          `COALESCE(SUM(${to ? 'CASE WHEN j.entry_date <= :toDate THEN l.credit ELSE 0 END' : 'l.credit'}), 0)`,
          'periodCredit',
        );
    }
    if (to) qb.setParameter('toDate', to);

    qb.where('j.company_id = :companyId', { companyId }).andWhere("j.status = 'POSTED'");
    if (to) qb.andWhere('j.entry_date <= :toDate', { toDate: to });
    if (divisionId) qb.andWhere('COALESCE(l.division_id, j.division_id) = :divisionId', { divisionId });

    qb.groupBy('a.id')
      .addGroupBy('a.account_code')
      .addGroupBy('a.account_name')
      .addGroupBy('a.account_type')
      .addGroupBy('a.normal_balance')
      .addGroupBy('a.currency')
      .orderBy('a.account_code', 'ASC');

    const rows = await qb.getRawMany<any>();
    const accounts = rows
      .map((r) => {
        const opNet = Number(r.openingDebitRaw || 0) - Number(r.openingCreditRaw || 0);
        const openingDebit = opNet > 0 ? round2(opNet) : 0;
        const openingCredit = opNet < 0 ? round2(Math.abs(opNet)) : 0;
        const periodDebit = round2(Number(r.periodDebit || 0));
        const periodCredit = round2(Number(r.periodCredit || 0));
        const totalDr = round2(openingDebit + periodDebit);
        const totalCr = round2(openingCredit + periodCredit);
        const closingNet = totalDr - totalCr;
        const closingDebit = closingNet > 0 ? round2(closingNet) : 0;
        const closingCredit = closingNet < 0 ? round2(Math.abs(closingNet)) : 0;
        const balance = r.normalBalance === 'DEBIT' ? round2(totalDr - totalCr) : round2(totalCr - totalDr);

        return {
          accountId: r.accountId,
          accountCode: r.accountCode,
          accountName: r.accountName,
          accountType: r.accountType,
          normalBalance: r.normalBalance,
          currency: r.currency || 'PKR',
          openingDebit,
          openingCredit,
          periodDebit,
          periodCredit,
          closingDebit,
          closingCredit,
          totalDebit: periodDebit,
          totalCredit: periodCredit,
          balance,
        };
      })
      .filter(
        (a) =>
          Math.abs(a.openingDebit) > 0.001 ||
          Math.abs(a.openingCredit) > 0.001 ||
          Math.abs(a.periodDebit) > 0.001 ||
          Math.abs(a.periodCredit) > 0.001,
      );

    const totalOpeningDebit = round2(accounts.reduce((s, a) => s + a.openingDebit, 0));
    const totalOpeningCredit = round2(accounts.reduce((s, a) => s + a.openingCredit, 0));
    const totalPeriodDebit = round2(accounts.reduce((s, a) => s + a.periodDebit, 0));
    const totalPeriodCredit = round2(accounts.reduce((s, a) => s + a.periodCredit, 0));
    const totalClosingDebit = round2(accounts.reduce((s, a) => s + a.closingDebit, 0));
    const totalClosingCredit = round2(accounts.reduce((s, a) => s + a.closingCredit, 0));

    return {
      data: accounts,
      totalOpeningDebit,
      totalOpeningCredit,
      totalDebit: totalPeriodDebit,
      totalCredit: totalPeriodCredit,
      totalClosingDebit,
      totalClosingCredit,
      balanced: Math.abs(totalClosingDebit - totalClosingCredit) < 0.01,
    };
  }

  async generalLedger(
    companyId: string,
    accountId?: string,
    from?: string,
    to?: string,
    divisionId?: string,
  ) {
    let selectedAccount: FinanceAccount | null = null;
    if (accountId) {
      selectedAccount = await this.accountRepo.findOne({ where: { id: accountId, companyId } });
      if (!selectedAccount) throw new NotFoundException('Account not found in this company');
    }

    let openingBalance = 0;
    if (accountId && from) {
      const opQb = this.lineRepo
        .createQueryBuilder('l')
        .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
        .select('COALESCE(SUM(l.debit), 0)', 'dr')
        .addSelect('COALESCE(SUM(l.credit), 0)', 'cr')
        .where('j.company_id = :companyId', { companyId })
        .andWhere("j.status = 'POSTED'")
        .andWhere('l.account_id = :accountId', { accountId })
        .andWhere('j.entry_date < :from', { from });
      if (divisionId) opQb.andWhere('COALESCE(l.division_id, j.division_id) = :divisionId', { divisionId });
      const op = await opQb.getRawOne();
      const dr = Number(op?.dr || 0);
      const cr = Number(op?.cr || 0);
      openingBalance = round2(
        selectedAccount?.normalBalance === NormalBalance.CREDIT ? cr - dr : dr - cr,
      );
    }

    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoinAndSelect('l.journal', 'j')
      .innerJoinAndSelect('l.account', 'a')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'");
    if (accountId) qb.andWhere('l.account_id = :accountId', { accountId });
    if (from) qb.andWhere('j.entry_date >= :from', { from });
    if (to) qb.andWhere('j.entry_date <= :to', { to });
    if (divisionId) qb.andWhere('COALESCE(l.division_id, j.division_id) = :divisionId', { divisionId });

    qb.orderBy('j.entryDate', 'ASC')
      .addOrderBy('j.createdAt', 'ASC')
      .addOrderBy('j.journalNumber', 'ASC')
      .addOrderBy('l.lineNumber', 'ASC');

    const lines = await qb.getMany();

    // Enrich division names & running balances
    const divIds = Array.from(
      new Set(
        lines
          .map((l) => l.divisionId || l.journal?.divisionId)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const divRows: any[] =
      divIds.length && typeof this.dataSource?.query === 'function'
        ? await this.dataSource
            .query(`SELECT id, name FROM public.divisions WHERE id = ANY($1::uuid[])`, [divIds])
            .catch(() => [])
        : [];
    const divMap = new Map((divRows || []).map((d: any) => [d.id, d.name]));

    let running = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const enriched = lines.map((l) => {
      const dr = Number(l.debit || 0);
      const cr = Number(l.credit || 0);
      totalDebit = round2(totalDebit + dr);
      totalCredit = round2(totalCredit + cr);
      const isCreditNormal =
        (selectedAccount?.normalBalance || l.account?.normalBalance) === NormalBalance.CREDIT;
      if (accountId) {
        running = round2(running + (isCreditNormal ? cr - dr : dr - cr));
      } else {
        running = round2(running + dr - cr);
      }
      const divId = l.divisionId || l.journal?.divisionId || null;
      return {
        ...l,
        debit: dr,
        credit: cr,
        runningBalance: running,
        balanceSide:
          selectedAccount?.normalBalance === NormalBalance.CREDIT
            ? running >= 0
              ? 'CR'
              : 'DR'
            : running >= 0
              ? 'DR'
              : 'CR',
        divisionId: divId,
        divisionName: divId ? divMap.get(divId) || null : null,
      };
    });

    return {
      data: enriched,
      account: selectedAccount,
      openingBalance,
      closingBalance: accountId ? running : round2(totalDebit - totalCredit),
      totalDebit,
      totalCredit,
    };
  }

  async cashBankBook(
    companyId: string,
    accountId?: string,
    from?: string,
    to?: string,
    divisionId?: string,
  ) {
    await this.autoPosting.ensureSystemArAccounts(companyId);
    const cashBankAccounts = await this.listBankCashAccounts(companyId);
    const allowedIds = cashBankAccounts.map((a) => a.id);

    if (accountId && !allowedIds.includes(accountId)) {
      throw new NotFoundException('Selected Cash/Bank account not found');
    }

    const targetIds = accountId ? [accountId] : allowedIds;

    // Build per-account opening/period/closing summaries
    const accountSummaries = await Promise.all(
      cashBankAccounts.map(async (acct) => {
        const opRow = from
          ? await this.lineRepo
              .createQueryBuilder('l')
              .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
              .select('COALESCE(SUM(l.debit - l.credit), 0)', 'bal')
              .where('j.company_id = :companyId', { companyId })
              .andWhere("j.status = 'POSTED'")
              .andWhere('l.account_id = :aid', { aid: acct.id })
              .andWhere('j.entry_date < :from', { from })
              .getRawOne()
          : null;

        const periodQb = this.lineRepo
          .createQueryBuilder('l')
          .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
          .select('COALESCE(SUM(l.debit), 0)', 'inflow')
          .addSelect('COALESCE(SUM(l.credit), 0)', 'outflow')
          .where('j.company_id = :companyId', { companyId })
          .andWhere("j.status = 'POSTED'")
          .andWhere('l.account_id = :aid', { aid: acct.id });
        if (from) periodQb.andWhere('j.entry_date >= :from', { from });
        if (to) periodQb.andWhere('j.entry_date <= :to', { to });
        if (divisionId) {
          periodQb.andWhere('COALESCE(l.division_id, j.division_id) = :divisionId', { divisionId });
        }
        const pRow = await periodQb.getRawOne();

        const openingBalance = round2(Number(opRow?.bal || 0));
        const totalInflow = round2(Number(pRow?.inflow || 0));
        const totalOutflow = round2(Number(pRow?.outflow || 0));
        const closingBalance = round2(openingBalance + totalInflow - totalOutflow);

        return {
          id: acct.id,
          accountCode: acct.accountCode,
          accountName: acct.accountName,
          bankName: acct.bankName,
          bankAccountNumber: acct.bankAccountNumber,
          currency: acct.currency || 'PKR',
          openingBalance,
          totalInflow,
          totalOutflow,
          closingBalance,
        };
      }),
    );

    const qb = targetIds.length
      ? this.lineRepo
          .createQueryBuilder('l')
          .innerJoinAndSelect('l.journal', 'j')
          .innerJoinAndSelect('l.account', 'a')
          .where('j.company_id = :companyId', { companyId })
          .andWhere("j.status = 'POSTED'")
          .andWhere('l.account_id IN (:...targetIds)', { targetIds })
      : null;

    let transactions: any[] = [];
    const totalOpening = round2(
      accountSummaries
        .filter((s) => targetIds.includes(s.id))
        .reduce((sum, s) => sum + s.openingBalance, 0),
    );

    if (qb) {
      if (from) qb.andWhere('j.entry_date >= :from', { from });
      if (to) qb.andWhere('j.entry_date <= :to', { to });
      if (divisionId) qb.andWhere('COALESCE(l.division_id, j.division_id) = :divisionId', { divisionId });
      qb.orderBy('j.entryDate', 'ASC')
        .addOrderBy('j.createdAt', 'ASC')
        .addOrderBy('j.journalNumber', 'ASC');
      const rawLines = await qb.getMany();

      let running = totalOpening;
      transactions = rawLines.map((l) => {
        const inflow = round2(Number(l.debit || 0));
        const outflow = round2(Number(l.credit || 0));
        running = round2(running + inflow - outflow);
        return {
          id: l.id,
          journalId: l.journalId,
          journalNumber: l.journal?.journalNumber,
          voucherType: l.journal?.voucherType || 'JV',
          journalType: l.journal?.journalType,
          entryDate: l.journal?.entryDate,
          accountId: l.accountId,
          accountCode: l.account?.accountCode,
          accountName: l.account?.accountName,
          description: l.description || l.journal?.description,
          paymentMode: l.journal?.paymentMode,
          chequeNumber: l.journal?.chequeNumber,
          inflow,
          outflow,
          runningBalance: running,
        };
      });
    }

    const totalCash = round2(
      accountSummaries
        .filter((a) => a.accountCode === '1000')
        .reduce((s, a) => s + a.closingBalance, 0),
    );
    const totalChequesInHand = round2(
      accountSummaries
        .filter((a) => a.accountCode === '1020')
        .reduce((s, a) => s + a.closingBalance, 0),
    );
    const totalBank = round2(
      accountSummaries
        .filter((a) => a.accountCode !== '1000' && a.accountCode !== '1020')
        .reduce((s, a) => s + a.closingBalance, 0),
    );

    return {
      accounts: accountSummaries,
      summary: {
        totalCash,
        totalBank,
        totalChequesInHand,
        grandTotal: round2(totalCash + totalBank + totalChequesInHand),
      },
      openingBalance: totalOpening,
      closingBalance: transactions.length
        ? transactions[transactions.length - 1].runningBalance
        : totalOpening,
      totalInflow: round2(transactions.reduce((s, t) => s + t.inflow, 0)),
      totalOutflow: round2(transactions.reduce((s, t) => s + t.outflow, 0)),
      transactions,
    };
  }

  async plStatement(companyId: string, from?: string, to?: string, divisionId?: string) {
    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.id', 'accountId')
      .addSelect('a.account_code', 'accountCode')
      .addSelect('a.account_name', 'accountName')
      .addSelect('a.account_type', 'accountType')
      .addSelect('a.normal_balance', 'normalBalance')
      .addSelect('COALESCE(SUM(l.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'totalCredit')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'")
      .andWhere("a.account_type IN ('REVENUE','EXPENSE')");

    if (from) qb.andWhere('j.entry_date >= :from', { from });
    if (to) qb.andWhere('j.entry_date <= :to', { to });
    if (divisionId) qb.andWhere('COALESCE(l.division_id, j.division_id) = :divisionId', { divisionId });

    qb.groupBy('a.id')
      .addGroupBy('a.account_code')
      .addGroupBy('a.account_name')
      .addGroupBy('a.account_type')
      .addGroupBy('a.normal_balance')
      .orderBy('a.account_code', 'ASC');

    const rows = await qb.getRawMany<any>();

    let revenue = 0;
    let directCosts = 0;
    let operatingExpenses = 0;
    let otherIncome = 0;

    const items = rows.map((r: any) => {
      const d = Number(r.totalDebit || 0);
      const c = Number(r.totalCredit || 0);
      const codeNum = parseInt(String(r.accountCode || '0').replace(/\D/g, ''), 10) || 0;

      // For REVENUE type: normal_balance CREDIT => positive when credit > debit (returns 4090 become negative contra-revenue)
      const balance = round2(r.accountType === 'REVENUE' ? c - d : d - c);

      let section: 'OPERATING_REVENUE' | 'OTHER_INCOME' | 'COGS' | 'OPERATING_EXPENSE' = 'OPERATING_EXPENSE';
      if (r.accountType === 'REVENUE') {
        if (codeNum >= 4200) {
          section = 'OTHER_INCOME';
          otherIncome = round2(otherIncome + balance);
        } else {
          section = 'OPERATING_REVENUE';
          revenue = round2(revenue + balance);
        }
      } else {
        if (codeNum >= 5000 && codeNum <= 5299) {
          section = 'COGS';
          directCosts = round2(directCosts + balance);
        } else {
          section = 'OPERATING_EXPENSE';
          operatingExpenses = round2(operatingExpenses + balance);
        }
      }

      return {
        ...r,
        totalDebit: round2(d),
        totalCredit: round2(c),
        balance,
        section,
      };
    });

    const grossProfit = round2(revenue - directCosts);
    const totalRevenue = round2(revenue + otherIncome);
    const totalExpenses = round2(directCosts + operatingExpenses);
    const netProfit = round2(totalRevenue - totalExpenses);

    // Division breakdown
    const divisionRows: any[] =
      typeof this.dataSource?.query === 'function'
        ? await this.dataSource
            .query(
              `SELECT COALESCE(d.name, 'Head Office / Shared') AS division_name,
                      COALESCE(l.division_id, j.division_id) AS division_id,
                      COALESCE(SUM(CASE WHEN a.account_type = 'REVENUE' THEN (l.credit - l.debit) ELSE 0 END), 0) AS revenue,
                      COALESCE(SUM(CASE WHEN a.account_type = 'EXPENSE' THEN (l.debit - l.credit) ELSE 0 END), 0) AS expenses
               FROM public.finance_journal_lines l
               INNER JOIN public.finance_journals j ON j.id = l.journal_id
               INNER JOIN public.finance_accounts a ON a.id = l.account_id
               LEFT JOIN public.divisions d ON d.id = COALESCE(l.division_id, j.division_id)
               WHERE j.company_id = $1
                 AND j.status = 'POSTED'
                 AND a.account_type IN ('REVENUE', 'EXPENSE')
                 ${from ? 'AND j.entry_date >= $2' : ''}
                 ${to ? `AND j.entry_date <= $${from ? 3 : 2}` : ''}
               GROUP BY COALESCE(d.name, 'Head Office / Shared'), COALESCE(l.division_id, j.division_id)
               ORDER BY revenue DESC`,
              [companyId, ...(from ? [from] : []), ...(to ? [to] : [])],
            )
            .catch(() => [])
        : [];

    const divisionBreakdown = (divisionRows || []).map((r) => {
      const divRev = round2(Number(r.revenue || 0));
      const divExp = round2(Number(r.expenses || 0));
      return {
        divisionId: r.division_id,
        divisionName: r.division_name,
        revenue: divRev,
        expenses: divExp,
        netProfit: round2(divRev - divExp),
      };
    });

    return {
      data: items,
      operatingRevenue: revenue,
      otherIncome,
      directCosts,
      grossProfit,
      operatingExpenses,
      revenue: totalRevenue,
      expenses: totalExpenses,
      netProfit,
      divisionBreakdown,
    };
  }

  async balanceSheet(companyId: string, asOf?: string, divisionId?: string) {
    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.id', 'accountId')
      .addSelect('a.account_code', 'accountCode')
      .addSelect('a.account_name', 'accountName')
      .addSelect('a.account_type', 'accountType')
      .addSelect('a.normal_balance', 'normalBalance')
      .addSelect('COALESCE(SUM(l.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'totalCredit')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'")
      .andWhere("a.account_type IN ('ASSET','LIABILITY','EQUITY')");
    if (asOf) qb.andWhere('j.entry_date <= :asOf', { asOf });
    if (divisionId) qb.andWhere('COALESCE(l.division_id, j.division_id) = :divisionId', { divisionId });

    qb.groupBy('a.id')
      .addGroupBy('a.account_code')
      .addGroupBy('a.account_name')
      .addGroupBy('a.account_type')
      .addGroupBy('a.normal_balance')
      .orderBy('a.account_code', 'ASC');

    const rows = await qb.getRawMany<any>();
    let assets = 0;
    let liabilities = 0;
    let baseEquity = 0;

    const items = rows.map((r) => {
      const d = Number(r.totalDebit || 0);
      const c = Number(r.totalCredit || 0);
      const bal = round2(r.normalBalance === 'DEBIT' ? d - c : c - d);
      if (r.accountType === 'ASSET') assets = round2(assets + bal);
      else if (r.accountType === 'LIABILITY') liabilities = round2(liabilities + bal);
      else baseEquity = round2(baseEquity + bal);
      return { ...r, balance: bal };
    });

    // Include cumulative unclosed Revenue - Expense (Current Period Profit/Loss) in Equity
    const pl = await this.plStatement(companyId, undefined, asOf, divisionId).catch(() => ({
      netProfit: 0,
    }));
    const currentYearNetProfit = round2(Number(pl?.netProfit || 0));
    if (Math.abs(currentYearNetProfit) > 0.001) {
      items.push({
        accountId: null,
        accountCode: '3999',
        accountName: 'Current Period Net Profit / (Loss)',
        accountType: 'EQUITY',
        normalBalance: 'CREDIT',
        totalDebit: 0,
        totalCredit: currentYearNetProfit,
        balance: currentYearNetProfit,
        isComputed: true,
      });
    }

    const equity = round2(baseEquity + currentYearNetProfit);
    const totalLiabilitiesAndEquity = round2(liabilities + equity);

    return {
      data: items,
      assets,
      liabilities,
      baseEquity,
      currentYearNetProfit,
      equity,
      totalLiabilitiesAndEquity,
      balanced: Math.abs(assets - totalLiabilitiesAndEquity) < 0.01,
    };
  }

  async arReport(companyId: string, asOf?: string, divisionId?: string) {
    const asOfDate = asOf ? new Date(`${asOf}T00:00:00Z`) : new Date();
    const asOfStr = asOfDate.toISOString().slice(0, 10);

    // GL 1100 Control Account balance
    const glRows = await this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.account_code', 'accountCode')
      .addSelect('a.account_name', 'accountName')
      .addSelect('COALESCE(SUM(l.debit - l.credit), 0)', 'balance')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'")
      .andWhere('a.is_ar = true')
      .andWhere('j.entry_date <= :asOfStr', { asOfStr })
      .groupBy('a.account_code')
      .addGroupBy('a.account_name')
      .getRawMany();
    const glAccounts = (glRows || []).map((r: any) => ({
      ...r,
      balance: round2(Number(r.balance || 0)),
    }));
    const glControlBalance = round2(glAccounts.reduce((s, r) => s + r.balance, 0));

    // Customer-wise invoice aging + advances from erp_sales
    if (typeof this.dataSource?.query !== 'function') {
      return { data: glAccounts, total: glControlBalance, glAccounts, summary: { glControlBalance } };
    }

    const invRows: Array<any> = await this.dataSource
      .query(
        `SELECT si.id, si.invoice_no, si.invoice_date, si.due_date, si.total_amount,
                COALESCE(si.paid_amount, 0) AS paid_amount, si.status,
                COALESCE(si.division_id, so.division_id) AS division_id,
                d.name AS division_name,
                si.customer_id,
                COALESCE(mc.name, sc.company_name, 'Customer') AS customer_name,
                COALESCE(mc.customer_code, sc.customer_code, '-') AS customer_code
         FROM erp_sales.sales_invoices si
         LEFT JOIN erp_sales.sales_orders so ON so.id = si.sales_order_id
         LEFT JOIN public.divisions d ON d.id = COALESCE(si.division_id, so.division_id)
         LEFT JOIN erp_sales.customers sc ON sc.id = si.customer_id
         LEFT JOIN public.customers mc ON mc.id = si.customer_id
           OR LOWER(mc.customer_code) = LOWER(sc.customer_code)
         WHERE si.company_id = $1
           AND si.deleted_at IS NULL
           AND LOWER(COALESCE(si.status, 'pending')) IN ('posted', 'partial', 'paid', 'settled')
           AND si.invoice_date <= $2::date
           ${divisionId ? 'AND COALESCE(si.division_id, so.division_id) = $3::uuid' : ''}
         ORDER BY si.invoice_date ASC`,
        divisionId ? [companyId, asOfStr, divisionId] : [companyId, asOfStr],
      )
      .catch(() => []);

    const advRows: Array<any> = await this.dataSource
      .query(
        `SELECT cr.customer_id, COALESCE(SUM(cr.unallocated_advance_amount), 0) AS adv_amt
         FROM erp_sales.customer_receipts cr
         WHERE cr.company_id = $1
           AND cr.deleted_at IS NULL
           AND cr.status = 'POSTED'
           AND COALESCE(cr.clearance_status, 'CLEARED') <> 'BOUNCED'
           AND cr.receipt_date <= $2::date
           ${divisionId ? 'AND cr.division_id = $3::uuid' : ''}
         GROUP BY cr.customer_id`,
        divisionId ? [companyId, asOfStr, divisionId] : [companyId, asOfStr],
      )
      .catch(() => []);

    const advMap = new Map<string, number>(
      (advRows || []).map((a) => [a.customer_id, round2(Number(a.adv_amt || 0))]),
    );

    const byCustomer = new Map<
      string,
      {
        customerId: string;
        customerCode: string;
        customerName: string;
        divisionName: string;
        invoiceCount: number;
        totalBilled: number;
        totalPaid: number;
        outstanding: number;
        unallocatedAdvance: number;
        netReceivable: number;
        current: number;
        days1to30: number;
        days31to60: number;
        days61to90: number;
        days90plus: number;
        invoices: any[];
      }
    >();

    for (const inv of invRows || []) {
      const billed = round2(Number(inv.total_amount || 0));
      const paid = round2(Number(inv.paid_amount || 0));
      const bal = round2(Math.max(0, billed - paid));
      if (bal <= 0.01 && !byCustomer.has(inv.customer_id)) {
        continue;
      }

      if (!byCustomer.has(inv.customer_id)) {
        const adv = advMap.get(inv.customer_id) || 0;
        byCustomer.set(inv.customer_id, {
          customerId: inv.customer_id,
          customerCode: inv.customer_code,
          customerName: inv.customer_name,
          divisionName: inv.division_name || 'All Divisions',
          invoiceCount: 0,
          totalBilled: 0,
          totalPaid: 0,
          outstanding: 0,
          unallocatedAdvance: adv,
          netReceivable: round2(0 - adv),
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          days90plus: 0,
          invoices: [],
        });
      }

      const bucket = byCustomer.get(inv.customer_id)!;
      bucket.invoiceCount += 1;
      bucket.totalBilled = round2(bucket.totalBilled + billed);
      bucket.totalPaid = round2(bucket.totalPaid + paid);

      if (bal > 0.01) {
        const refDate = new Date(inv.due_date || inv.invoice_date || asOfStr);
        const daysPast = Math.floor((asOfDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysPast <= 0) bucket.current = round2(bucket.current + bal);
        else if (daysPast <= 30) bucket.days1to30 = round2(bucket.days1to30 + bal);
        else if (daysPast <= 60) bucket.days31to60 = round2(bucket.days31to60 + bal);
        else if (daysPast <= 90) bucket.days61to90 = round2(bucket.days61to90 + bal);
        else bucket.days90plus = round2(bucket.days90plus + bal);

        bucket.outstanding = round2(bucket.outstanding + bal);
        bucket.netReceivable = round2(bucket.outstanding - bucket.unallocatedAdvance);
        bucket.invoices.push({
          id: inv.id,
          invoiceNo: inv.invoice_no,
          invoiceDate: inv.invoice_date,
          dueDate: inv.due_date,
          totalAmount: billed,
          paidAmount: paid,
          balance: bal,
          daysOverdue: Math.max(0, daysPast),
        });
      }
    }

    const data = Array.from(byCustomer.values())
      .filter((c) => c.outstanding > 0.01 || c.unallocatedAdvance > 0.01)
      .sort((a, b) => b.outstanding - a.outstanding);

    const totalOutstanding = round2(data.reduce((s, r) => s + r.outstanding, 0));
    const totalAdvances = round2(data.reduce((s, r) => s + r.unallocatedAdvance, 0));

    return {
      data,
      total: totalOutstanding,
      glAccounts,
      summary: {
        totalOutstanding,
        totalAdvances,
        netReceivable: round2(totalOutstanding - totalAdvances),
        glControlBalance,
        reconciliationDiff: round2(totalOutstanding - glControlBalance),
        current: round2(data.reduce((s, r) => s + r.current, 0)),
        days1to30: round2(data.reduce((s, r) => s + r.days1to30, 0)),
        days31to60: round2(data.reduce((s, r) => s + r.days31to60, 0)),
        days61to90: round2(data.reduce((s, r) => s + r.days61to90, 0)),
        days90plus: round2(data.reduce((s, r) => s + r.days90plus, 0)),
      },
    };
  }

  async apReport(companyId: string, asOf?: string, divisionId?: string) {
    const asOfDate = asOf ? new Date(`${asOf}T00:00:00Z`) : new Date();
    const asOfStr = asOfDate.toISOString().slice(0, 10);

    const glApRows = await this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('finance_journals', 'j', 'j.id = l.journal_id')
      .innerJoin('finance_accounts', 'a', 'a.id = l.account_id')
      .select('a.account_code', 'accountCode')
      .addSelect('a.account_name', 'accountName')
      .addSelect('COALESCE(SUM(l.credit - l.debit), 0)', 'balance')
      .where('j.company_id = :companyId', { companyId })
      .andWhere("j.status = 'POSTED'")
      .andWhere("a.is_ap = true OR a.account_code = '2010'")
      .andWhere('j.entry_date <= :asOfStr', { asOfStr })
      .groupBy('a.account_code')
      .addGroupBy('a.account_name')
      .getRawMany();

    const glAccounts = (glApRows || []).map((r: any) => ({
      ...r,
      balance: round2(Number(r.balance || 0)),
    }));
    const glApBalance = round2(
      glAccounts.filter((a) => a.accountCode !== '2010').reduce((s, a) => s + a.balance, 0),
    );
    const glGrnClearingBalance = round2(
      glAccounts.filter((a) => a.accountCode === '2010').reduce((s, a) => s + a.balance, 0),
    );

    if (typeof this.dataSource?.query !== 'function') {
      return { data: glAccounts, total: glApBalance, glAccounts };
    }

    const piRows: Array<any> = await this.dataSource
      .query(
        `SELECT pi.id, pi.invoice_code, pi.invoice_date, pi.due_date, pi.total_amount,
                COALESCE(pi.paid_amount, 0) AS paid_amount, pi.supplier_id,
                s.supplier_code, s.name AS supplier_name
         FROM public.purchase_invoices pi
         LEFT JOIN public.suppliers s ON s.id = pi.supplier_id
         WHERE pi.company_id = $1
           AND pi.status = 'POSTED'
           AND pi.invoice_date <= $2::date
           AND (pi.total_amount - COALESCE(pi.paid_amount, 0)) > 0.01`,
        [companyId, asOfStr],
      )
      .catch(() => []);

    const grnRows: Array<any> = await this.dataSource
      .query(
        `SELECT gr.id, gr.receipt_code, gr.grn_number, gr.receipt_date, gr.supplier_id,
                s.supplier_code, s.name AS supplier_name, gr.division_id, d.name AS division_name,
                SUM(COALESCE(grl.quantity_accepted, 0) * COALESCE(grl.unit_price, 0)) AS accepted_value
         FROM public.goods_receipts gr
         LEFT JOIN public.suppliers s ON s.id = gr.supplier_id
         LEFT JOIN public.divisions d ON d.id = gr.division_id
         JOIN public.goods_receipt_lines grl ON grl.receipt_id = gr.id
         WHERE gr.company_id = $1
           AND gr.status = 'POSTED'
           AND COALESCE(gr.receipt_date::date, gr.created_at::date) <= $2::date
           ${divisionId ? 'AND gr.division_id = $3::uuid' : ''}
         GROUP BY gr.id, gr.receipt_code, gr.grn_number, gr.receipt_date, gr.supplier_id,
                  s.supplier_code, s.name, gr.division_id, d.name
         HAVING SUM(COALESCE(grl.quantity_accepted, 0) * COALESCE(grl.unit_price, 0)) > 0.01
         ORDER BY gr.receipt_date ASC`,
        divisionId ? [companyId, asOfStr, divisionId] : [companyId, asOfStr],
      )
      .catch(() => []);

    const bySupplier = new Map<
      string,
      {
        supplierId: string;
        supplierCode: string;
        supplierName: string;
        billedPayable: number;
        unbilledGrnAmount: number;
        totalLiability: number;
        current: number;
        days1to30: number;
        days31to60: number;
        days61to90: number;
        days90plus: number;
        documents: any[];
      }
    >();

    const ensureSupp = (id: string, code?: string, name?: string) => {
      if (!bySupplier.has(id)) {
        bySupplier.set(id, {
          supplierId: id,
          supplierCode: code || '-',
          supplierName: name || 'Supplier',
          billedPayable: 0,
          unbilledGrnAmount: 0,
          totalLiability: 0,
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          days90plus: 0,
          documents: [],
        });
      }
      return bySupplier.get(id)!;
    };

    const assignBucket = (s: any, dateVal: any, amount: number) => {
      const refDate = new Date(dateVal || asOfStr);
      const days = Math.floor((asOfDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 0) s.current = round2(s.current + amount);
      else if (days <= 30) s.days1to30 = round2(s.days1to30 + amount);
      else if (days <= 60) s.days31to60 = round2(s.days31to60 + amount);
      else if (days <= 90) s.days61to90 = round2(s.days61to90 + amount);
      else s.days90plus = round2(s.days90plus + amount);
      return Math.max(0, days);
    };

    for (const inv of piRows || []) {
      const bal = round2(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
      if (bal <= 0.01) continue;
      const entry = ensureSupp(inv.supplier_id, inv.supplier_code, inv.supplier_name);
      entry.billedPayable = round2(entry.billedPayable + bal);
      entry.totalLiability = round2(entry.totalLiability + bal);
      const ageDays = assignBucket(entry, inv.due_date || inv.invoice_date, bal);
      entry.documents.push({
        type: 'PURCHASE_INVOICE',
        docNo: inv.invoice_code,
        date: inv.invoice_date,
        amount: bal,
        ageDays,
      });
    }

    for (const grn of grnRows || []) {
      const val = round2(Number(grn.accepted_value || 0));
      if (val <= 0.01) continue;
      const entry = ensureSupp(grn.supplier_id || 'UNASSIGNED', grn.supplier_code, grn.supplier_name);
      entry.unbilledGrnAmount = round2(entry.unbilledGrnAmount + val);
      entry.totalLiability = round2(entry.totalLiability + val);
      const ageDays = assignBucket(entry, grn.receipt_date, val);
      entry.documents.push({
        type: 'UNBILLED_GRN',
        docNo: grn.grn_number || grn.receipt_code,
        date: grn.receipt_date,
        amount: val,
        ageDays,
      });
    }

    const data = Array.from(bySupplier.values()).sort((a, b) => b.totalLiability - a.totalLiability);
    const totalPayables = round2(data.reduce((s, r) => s + r.billedPayable, 0));
    const totalUnbilledGrn = round2(data.reduce((s, r) => s + r.unbilledGrnAmount, 0));

    return {
      data,
      total: round2(totalPayables + totalUnbilledGrn),
      glAccounts,
      summary: {
        totalPayables,
        totalUnbilledGrn,
        totalLiability: round2(totalPayables + totalUnbilledGrn),
        glApBalance,
        glGrnClearingBalance,
        current: round2(data.reduce((s, r) => s + r.current, 0)),
        days1to30: round2(data.reduce((s, r) => s + r.days1to30, 0)),
        days31to60: round2(data.reduce((s, r) => s + r.days31to60, 0)),
        days61to90: round2(data.reduce((s, r) => s + r.days61to90, 0)),
        days90plus: round2(data.reduce((s, r) => s + r.days90plus, 0)),
      },
    };
  }
}
