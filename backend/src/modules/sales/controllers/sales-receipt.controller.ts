import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { divisionScopeFromRequest, DivisionAccess } from '../../../common/division-scope.util';
import { CustomerReceiptService } from '../services/customer-receipt.service';
import { CustomerCreditService } from '../services/customer-credit.service';
import {
  ApplyAdvanceDto,
  BounceChequeDto,
  ClearChequeDto,
  CreateCustomerReceiptDto,
} from '../dto/customer-receipt.dto';

@ApiTags('sales/receipts')
@Controller('sales/receipts')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard, DivisionScopeGuard)
@ApiBearerAuth()
export class SalesReceiptController {
  constructor(
    private readonly service: CustomerReceiptService,
    private readonly creditService: CustomerCreditService,
  ) {}

  private divisionScope(req: any): string[] | undefined {
    return divisionScopeFromRequest(req);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.view')
  @ApiOperation({ summary: 'List customer payment receipts & advances' })
  async findAll(
    @Req() req: any,
    @Query('customerId') customerId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('paymentMode') paymentMode?: string,
    @Query('receiptType') receiptType?: string,
    @Query('clearanceStatus') clearanceStatus?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const companyId = req.erpUser?.defaultCompanyId;
    const result = await this.service.listReceipts({
      companyId,
      customerId,
      divisionId,
      paymentMode,
      receiptType,
      clearanceStatus,
      fromDate,
      toDate,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 25,
      allowedDivisionIds: this.divisionScope(req),
    });
    return { success: true, ...result };
  }

  @Get('bank-accounts')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.view')
  @ApiOperation({ summary: 'List active Cash & Bank GL accounts for customer receipts' })
  async getBankAccounts(@Req() req: any) {
    const companyId = req.erpUser?.defaultCompanyId;
    const data = await this.service.getBankCashAccounts(companyId);
    return { success: true, data };
  }

  @Get('aging-summary')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.view')
  @ApiOperation({ summary: 'Get 5-bucket customer AR aging summary across company/divisions' })
  async getAgingSummary(@Req() req: any, @Query('divisionId') divisionId?: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const data = await this.service.getCompanyAgingSummary(companyId, divisionId, this.divisionScope(req));
    return { success: true, data };
  }

  @Get('customer/:customerId/open-invoices')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.view')
  @ApiOperation({ summary: 'Get customer open invoices, available unadjusted advances, aging and credit policy' })
  async getCustomerOpenInvoices(@Req() req: any, @Param('customerId') customerId: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const data = await this.service.getCustomerOpenInvoicesAndAdvances(
      customerId,
      companyId,
      this.divisionScope(req),
    );
    return { success: true, data };
  }

  @Get('customer/:customerId/credit-status')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.orders.view')
  @ApiOperation({ summary: 'Evaluate live credit limit, hold status, and exposure for a customer' })
  async getCustomerCreditStatus(
    @Req() req: any,
    @Param('customerId') customerId: string,
    @Query('proposedAmount') proposedAmount?: number,
  ) {
    const companyId = req.erpUser?.defaultCompanyId;
    const data = await this.creditService.evaluatePolicy(
      companyId,
      customerId,
      Number(proposedAmount) || 0,
    );
    return { success: true, data };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.view')
  @ApiOperation({ summary: 'Get Customer Receipt Voucher details with allocations' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const companyId = req.erpUser?.defaultCompanyId;
    const data = await this.service.getReceipt(id, companyId, this.divisionScope(req));
    return { success: true, data };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.post')
  @ApiOperation({ summary: 'Record Customer Receipt / Advance Payment with optional bill-to-bill allocations' })
  async create(@Req() req: any, @Body() dto: CreateCustomerReceiptDto) {
    const companyId = req.erpUser?.defaultCompanyId;
    const userId = req.user?.id;
    const data = await this.service.createReceipt(dto, userId, companyId, this.divisionScope(req));
    return { success: true, data, message: `Receipt Voucher ${data.receiptNumber} recorded successfully` };
  }

  @Post('apply-advance')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Adjust customer advance payment(s) against open invoices' })
  async applyAdvance(@Req() req: any, @Body() dto: ApplyAdvanceDto) {
    const companyId = req.erpUser?.defaultCompanyId;
    const userId = req.user?.id;
    const data = await this.service.applyAdvanceToInvoices(dto, userId, companyId, this.divisionScope(req));
    return {
      success: true,
      data,
      message: `Advance of Rs ${Number(data.totalAdjusted).toLocaleString()} applied successfully`,
    };
  }

  @Patch(':id/clear-cheque')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark pending cheque receipt cleared and transfer from Cheques-in-Hand to Bank GL' })
  async clearCheque(@Req() req: any, @Param('id') id: string, @Body() dto: ClearChequeDto) {
    const companyId = req.erpUser?.defaultCompanyId;
    const userId = req.user?.id;
    const data = await this.service.clearCheque(id, dto, userId, companyId, this.divisionScope(req));
    return { success: true, data, message: `Cheque for receipt ${data.receiptNumber} cleared successfully` };
  }

  @Patch(':id/bounce-cheque')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('sales.invoices.post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark cheque bounced and reverse invoice settlements, ledger, and GL' })
  async bounceCheque(@Req() req: any, @Param('id') id: string, @Body() dto: BounceChequeDto) {
    const companyId = req.erpUser?.defaultCompanyId;
    const userId = req.user?.id;
    const data = await this.service.bounceCheque(id, dto, userId, companyId, this.divisionScope(req));
    return { success: true, data, message: `Cheque bounce reversal posted for ${data.receiptNumber}` };
  }
}
