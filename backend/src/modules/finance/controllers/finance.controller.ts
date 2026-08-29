import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from '../services/finance.service';
import { CreateAccountDto, CreateJournalDto, CreateFiscalYearDto, ClosePeriodDto } from '../dto/finance.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('finance')
@Controller('finance')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ---- Chart of Accounts ----
  @Get('accounts')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.account.view')
  async listAccounts(@Query('companyId') companyId: string, @Query('search') search?: string) {
    const data = await this.financeService.listAccounts(companyId, search);
    return { success: true, data };
  }

  @Post('accounts')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.account.create')
  async createAccount(@Body() dto: CreateAccountDto) {
    const data = await this.financeService.createAccount(dto);
    return { success: true, data, message: 'Account created' };
  }

  @Patch('accounts/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.account.update')
  async updateAccount(@Param('id') id: string, @Body() dto: Partial<CreateAccountDto>) {
    const data = await this.financeService.updateAccount(id, dto);
    return { success: true, data };
  }

  @Delete('accounts/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.account.delete')
  @HttpCode(HttpStatus.OK)
  async removeAccount(@Param('id') id: string) {
    await this.financeService.removeAccount(id);
    return { success: true, message: 'Account deleted' };
  }

  // ---- Account Groups ----
  @Get('account-groups')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.account.view')
  async listGroups(@Query('companyId') companyId: string) {
    const data = await this.financeService.listGroups(companyId);
    return { success: true, data };
  }

  @Post('account-groups')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.account.create')
  async createGroup(@Body() dto: any) {
    const data = await this.financeService.createGroup(dto);
    return { success: true, data };
  }

  // ---- Fiscal Years & Periods ----
  @Get('fiscal-years')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.fiscal_year.manage')
  async listFiscalYears(@Query('companyId') companyId: string) {
    const data = await this.financeService.listFiscalYears(companyId);
    return { success: true, data };
  }

  @Post('fiscal-years')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.fiscal_year.manage')
  async createFiscalYear(@Body() dto: CreateFiscalYearDto) {
    const data = await this.financeService.createFiscalYear(dto);
    return { success: true, data };
  }

  @Get('periods')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.period.manage')
  async listPeriods(@Query('fiscalYearId') fiscalYearId?: string) {
    const data = await this.financeService.listPeriods(fiscalYearId);
    return { success: true, data };
  }

  @Patch('periods/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.period.manage')
  async setPeriodStatus(@Param('id') id: string, @Body() dto: ClosePeriodDto) {
    const data = await this.financeService.setPeriodStatus(id, dto.status);
    return { success: true, data };
  }

  // ---- Journals ----
  @Get('journals')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.journal.view')
  async listJournals(
    @Query('companyId') companyId: string, @Query('page') page?: number, @Query('limit') limit?: number,
    @Query('search') search?: string, @Query('status') status?: string, @Query('from') from?: string, @Query('to') to?: string,
  ) {
    const result = await this.financeService.listJournals(companyId, { page, limit, search, status, from, to });
    return { success: true, ...result };
  }

  @Get('journals/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.journal.view')
  async findJournal(@Param('id') id: string) {
    const data = await this.financeService.findJournal(id);
    return { success: true, data };
  }

  @Post('journals')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.journal.create')
  async createJournal(@Body() dto: CreateJournalDto, @Request() req: any) {
    const data = await this.financeService.createJournal(dto, req.user?.id);
    return { success: true, data, message: 'Journal created' };
  }

  @Post('journals/:id/post')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.journal.post')
  @HttpCode(HttpStatus.OK)
  async postJournal(@Param('id') id: string, @Request() req: any) {
    const data = await this.financeService.postJournal(id, req.user?.id);
    return { success: true, data, message: 'Journal posted' };
  }

  @Post('journals/:id/reverse')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.journal.reverse')
  @HttpCode(HttpStatus.OK)
  async reverseJournal(@Param('id') id: string, @Request() req: any) {
    const data = await this.financeService.reverseJournal(id, req.user?.id);
    return { success: true, data, message: 'Journal reversed' };
  }

  @Delete('journals/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.journal.create')
  @HttpCode(HttpStatus.OK)
  async deleteJournal(@Param('id') id: string) {
    await this.financeService.deleteJournal(id);
    return { success: true, message: 'Journal deleted' };
  }

  // ---- Reports ----
  @Get('reports/trial-balance')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.report.trial_balance')
  async trialBalance(@Query('companyId') companyId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.financeService.trialBalance(companyId, from, to);
    return { success: true, ...data };
  }

  @Get('reports/general-ledger')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.report.general_ledger')
  async generalLedger(@Query('companyId') companyId: string, @Query('accountId') accountId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.financeService.generalLedger(companyId, accountId, from, to);
    return { success: true, data };
  }

  @Get('reports/pl')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.report.pl')
  async plStatement(@Query('companyId') companyId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.financeService.plStatement(companyId, from, to);
    return { success: true, ...data };
  }

  @Get('reports/balance-sheet')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.report.balance_sheet')
  async balanceSheet(@Query('companyId') companyId: string, @Query('asOf') asOf?: string) {
    const data = await this.financeService.balanceSheet(companyId, asOf);
    return { success: true, ...data };
  }

  @Get('reports/ar')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.report.ar')
  async arReport(@Query('companyId') companyId: string) {
    const data = await this.financeService.arReport(companyId);
    return { success: true, ...data };
  }

  @Get('reports/ap')
  @UseGuards(PermissionGuard)
  @RequirePermission('finance.report.ap')
  async apReport(@Query('companyId') companyId: string) {
    const data = await this.financeService.apReport(companyId);
    return { success: true, ...data };
  }
}