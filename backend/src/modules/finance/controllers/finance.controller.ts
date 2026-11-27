import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FinanceService } from '../services/finance.service';
import {
  CreateAccountDto,
  CreateJournalDto,
  CreateFiscalYearDto,
  ClosePeriodDto,
  CreateContraTransferDto,
} from '../dto/finance.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('finance')
@Controller('finance')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  private resolveCompany(req: any, requestedCompanyId?: string): string {
    const scopes = req?.orgScopes || [];
    if (!scopes.length) {
      const fallback = req?.erpUser?.defaultCompanyId || requestedCompanyId;
      if (fallback) return fallback;
      throw new ForbiddenException('No organizational access scope assigned');
    }
    if (requestedCompanyId) {
      if (!scopes.some((s: any) => s.companyId === requestedCompanyId)) {
        throw new ForbiddenException('Company ID is outside your organization scope');
      }
      return requestedCompanyId;
    }
    const defaultCompanyId = req.erpUser?.defaultCompanyId;
    if (defaultCompanyId && scopes.some((s: any) => s.companyId === defaultCompanyId)) {
      return defaultCompanyId;
    }
    return scopes[0].companyId;
  }

  // ---- Chart of Accounts ----
  @Get('accounts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.account.view')
  async listAccounts(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('search') search?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.listAccounts(resolvedCompanyId, search);
    return { success: true, data };
  }

  @Get('accounts/bank-cash')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.account.view')
  @ApiOperation({ summary: 'List active Cash, Bank & Uncleared Cheque accounts with live PKR balances' })
  async listBankCashAccounts(@Request() req: any, @Query('companyId') companyId?: string) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.listBankCashAccounts(resolvedCompanyId);
    return { success: true, data };
  }

  @Post('accounts/seed-standard')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.account.create')
  @ApiOperation({ summary: 'Seed missing Pakistani corporate Chart of Accounts in PKR (idempotent)' })
  async seedStandardCoa(@Request() req: any, @Query('companyId') companyId?: string) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.seedStandardCoa(resolvedCompanyId);
    return { success: true, data, message: 'Corporate Chart of Accounts verified' };
  }

  @Post('accounts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.account.create')
  async createAccount(@Request() req: any, @Body() dto: CreateAccountDto) {
    const resolvedCompanyId = this.resolveCompany(req, dto.companyId);
    const data = await this.financeService.createAccount(dto, resolvedCompanyId);
    return { success: true, data, message: 'Account created' };
  }

  @Patch('accounts/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.account.update')
  async updateAccount(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<CreateAccountDto>,
  ) {
    const resolvedCompanyId = this.resolveCompany(req);
    const data = await this.financeService.updateAccount(id, dto, resolvedCompanyId);
    return { success: true, data, message: 'Account updated' };
  }

  @Delete('accounts/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.account.delete')
  @HttpCode(HttpStatus.OK)
  async removeAccount(@Request() req: any, @Param('id') id: string) {
    const resolvedCompanyId = this.resolveCompany(req);
    await this.financeService.removeAccount(id, resolvedCompanyId);
    return { success: true, message: 'Account deleted' };
  }

  // ---- Account Groups ----
  @Get('account-groups')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.account.view')
  async listGroups(@Request() req: any, @Query('companyId') companyId?: string) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.listGroups(resolvedCompanyId);
    return { success: true, data };
  }

  @Post('account-groups')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.account.create')
  async createGroup(@Request() req: any, @Body() dto: any) {
    const resolvedCompanyId = this.resolveCompany(req, dto.companyId);
    const data = await this.financeService.createGroup({ ...dto, companyId: resolvedCompanyId });
    return { success: true, data };
  }

  // ---- Fiscal Years & Periods ----
  @Get('fiscal-years')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.fiscal_year.view')
  async listFiscalYears(@Request() req: any, @Query('companyId') companyId?: string) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.listFiscalYears(resolvedCompanyId);
    return { success: true, data };
  }

  @Post('fiscal-years')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.fiscal_year.manage')
  async createFiscalYear(@Request() req: any, @Body() dto: CreateFiscalYearDto) {
    const resolvedCompanyId = this.resolveCompany(req, dto.companyId);
    const data = await this.financeService.createFiscalYear({ ...dto, companyId: resolvedCompanyId });
    return { success: true, data };
  }

  @Get('periods')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.period.view')
  async listPeriods(
    @Request() req: any,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('companyId') companyId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.listPeriods(fiscalYearId, resolvedCompanyId);
    return { success: true, data };
  }

  @Patch('periods/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.period.manage')
  async setPeriodStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ClosePeriodDto,
  ) {
    const resolvedCompanyId = this.resolveCompany(req);
    const data = await this.financeService.setPeriodStatus(id, dto.status, resolvedCompanyId);
    return { success: true, data };
  }

  // ---- Journals & Vouchers ----
  @Get('journals')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.journal.view')
  async listJournals(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('journalType') journalType?: string,
    @Query('voucherType') voucherType?: string,
    @Query('divisionId') divisionId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const result = await this.financeService.listJournals(resolvedCompanyId, {
      page,
      limit,
      search,
      status,
      journalType,
      voucherType,
      divisionId,
      from,
      to,
      includeArchived,
    });
    return { success: true, ...result };
  }

  @Get('journals/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.journal.view')
  async findJournal(@Request() req: any, @Param('id') id: string) {
    const resolvedCompanyId = this.resolveCompany(req);
    const data = await this.financeService.findJournal(id, resolvedCompanyId);
    return { success: true, data };
  }

  @Post('journals')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.journal.create')
  async createJournal(@Body() dto: CreateJournalDto, @Request() req: any) {
    const resolvedCompanyId = this.resolveCompany(req, dto.companyId);
    const data = await this.financeService.createJournal(dto, req.user?.id, resolvedCompanyId);
    return { success: true, data, message: 'Voucher saved successfully' };
  }

  @Post('vouchers/contra')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.journal.create')
  @ApiOperation({ summary: 'Create and post a Cash / Bank Contra Transfer Voucher (CV)' })
  async createContraTransfer(@Body() dto: CreateContraTransferDto, @Request() req: any) {
    const resolvedCompanyId = this.resolveCompany(req, dto.companyId);
    const data = await this.financeService.createContraTransfer(dto, req.user?.id, resolvedCompanyId);
    return { success: true, data, message: 'Contra transfer recorded successfully' };
  }

  @Post('journals/:id/post')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.journal.post')
  @HttpCode(HttpStatus.OK)
  async postJournal(@Param('id') id: string, @Request() req: any) {
    const resolvedCompanyId = this.resolveCompany(req);
    const data = await this.financeService.postJournal(id, req.user?.id, resolvedCompanyId);
    return { success: true, data, message: 'Voucher posted successfully' };
  }

  @Post('journals/:id/reverse')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.journal.reverse')
  @HttpCode(HttpStatus.OK)
  async reverseJournal(@Param('id') id: string, @Request() req: any) {
    const resolvedCompanyId = this.resolveCompany(req);
    const data = await this.financeService.reverseJournal(id, req.user?.id, resolvedCompanyId);
    return { success: true, data, message: 'Voucher reversed successfully' };
  }

  @Delete('journals/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.journal.delete')
  @HttpCode(HttpStatus.OK)
  async deleteJournal(@Request() req: any, @Param('id') id: string) {
    const resolvedCompanyId = this.resolveCompany(req);
    await this.financeService.deleteJournal(id, resolvedCompanyId);
    return { success: true, message: 'Draft voucher deleted' };
  }

  // ---- Reports ----
  @Get('reports/trial-balance')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.report.trial_balance')
  async trialBalance(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.trialBalance(resolvedCompanyId, from, to, divisionId);
    return { success: true, ...data };
  }

  @Get('reports/general-ledger')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.report.general_ledger')
  async generalLedger(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const result = await this.financeService.generalLedger(
      resolvedCompanyId,
      accountId,
      from,
      to,
      divisionId,
    );
    return { success: true, ...result };
  }

  @Get('reports/cash-bank-book')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.report.cash_bank_book')
  async cashBankBook(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const result = await this.financeService.cashBankBook(
      resolvedCompanyId,
      accountId,
      from,
      to,
      divisionId,
    );
    return { success: true, ...result };
  }

  @Get('reports/pl')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.report.pl')
  async plStatement(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.plStatement(resolvedCompanyId, from, to, divisionId);
    return { success: true, ...data };
  }

  @Get('reports/balance-sheet')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.report.balance_sheet')
  async balanceSheet(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('asOf') asOf?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.balanceSheet(resolvedCompanyId, asOf, divisionId);
    return { success: true, ...data };
  }

  @Get('reports/ar')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.report.ar')
  async arReport(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('asOf') asOf?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.arReport(resolvedCompanyId, asOf, divisionId);
    return { success: true, ...data };
  }

  @Get('reports/ap')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('finance.report.ap')
  async apReport(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('asOf') asOf?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    const resolvedCompanyId = this.resolveCompany(req, companyId);
    const data = await this.financeService.apReport(resolvedCompanyId, asOf, divisionId);
    return { success: true, ...data };
  }
}
