import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
  UseGuards, Request, Inject, Optional, forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerService } from '../services/customer.service';
import { CustomerLedgerService } from '../services/customer-ledger.service';
import { CreateCustomerDto, CreateCustomerContactDto, CreateCustomerAddressDto } from '../dto';
import { CustomerDocumentType } from '../entities';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { CustomerReceiptService } from '../../sales/services/customer-receipt.service';
import { CustomerCreditService } from '../../sales/services/customer-credit.service';

@ApiTags('customer/customers')
@Controller('customer/customers')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly ledgerService: CustomerLedgerService,
    @Optional()
    @Inject(forwardRef(() => CustomerReceiptService))
    private readonly receiptService?: CustomerReceiptService,
    @Optional()
    @Inject(forwardRef(() => CustomerCreditService))
    private readonly creditService?: CustomerCreditService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.create')
  @ApiOperation({ summary: 'Create a customer' })
  async create(@Body() dto: CreateCustomerDto, @Request() req: any) {
    const companyId = req.erpUser?.defaultCompanyId || req.user?.defaultCompanyId || dto.companyId;
    const userId = req.erpUser?.id || req.user?.id;
    const customer = await this.customerService.create({ ...dto, companyId }, userId);
    return { success: true, data: customer, message: 'Customer created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'List customers' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('divisionId') divisionId?: string,
    @Query('status') status?: string,
    @Query('customerType') customerType?: string,
    @Query('customerCategory') customerCategory?: string,
    @Query('customerTier') customerTier?: string,
    @Query('state') state?: string,
    @Query('city') city?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
    @Request() req?: any,
  ) {
    const activeCompanyId = companyId || req?.user?.defaultCompanyId;
    const result = await this.customerService.findAll({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
      companyId: activeCompanyId,
      divisionId,
      status,
      customerType,
      customerCategory,
      customerTier,
      state,
      city,
      sortField,
      sortOrder,
    });
    return { success: true, ...result };
  }

  @Post('demo/seed')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.create')
  @ApiOperation({ summary: 'Seed safe DEMO customer records' })
  async seedDemo(@Body('companyId') companyId?: string, @Request() req?: any) {
    const activeCompanyId = companyId || req?.user?.defaultCompanyId || '00000000-0000-0000-0000-000000000001';
    const seeded = await this.customerService.seedDemo(activeCompanyId, req?.user?.id);
    return { success: true, data: seeded, message: `Seeded ${seeded.length} demo customers` };
  }

  // --- Analytics & Top Customers ---
  @Get('analytics/top-customers')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get top customers by sales and ledger volume' })
  async getTopCustomers(@Query('limit') limit?: number, @Request() req?: any) {
    const companyId = req?.user?.defaultCompanyId;
    const top = await this.ledgerService.getTopCustomers(companyId, Number(limit) || 5);
    return { success: true, data: top };
  }

  @Get('analytics/item-analysis')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get product/item sales analysis across customers' })
  async getItemAnalysis(@Request() req?: any) {
    const companyId = req?.user?.defaultCompanyId;
    const analysis = await this.ledgerService.getItemAnalysis(companyId);
    return { success: true, data: analysis };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get customer by ID' })
  async findOne(@Param('id') id: string) {
    const customer = await this.customerService.findOne(id);
    return { success: true, data: customer };
  }

  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.update')
  @ApiOperation({ summary: 'Activate customer' })
  async activate(@Param('id') id: string, @Request() req: any) {
    const customer = await this.customerService.activate(id, req.user?.id);
    return { success: true, data: customer, message: 'Customer activated successfully' };
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.update')
  @ApiOperation({ summary: 'Deactivate customer' })
  async deactivate(@Param('id') id: string, @Request() req: any) {
    const customer = await this.customerService.deactivate(id, req.user?.id);
    return { success: true, data: customer, message: 'Customer deactivated successfully' };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.update')
  @ApiOperation({ summary: 'Update customer' })
  async update(@Param('id') id: string, @Body() dto: Partial<CreateCustomerDto>, @Request() req: any) {
    const customer = await this.customerService.update(id, dto, req.user?.id);
    return { success: true, data: customer, message: 'Customer updated successfully' };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a customer to the Recycle Bin (recoverable soft-delete)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.customerService.remove(id, req?.erpUser?.id || req?.user?.id);
    return { success: true, message: 'Customer moved to Recycle Bin' };
  }

  // --- Customer 360 & Commercial Summary Endpoints ---
  @Get(':id/sales-summary')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get Customer 360 commercial and sales metrics' })
  async getSalesSummary(@Param('id') id: string, @Request() req: any) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    const summary = await this.ledgerService.getSalesSummary(id, companyId);
    return { success: true, data: summary };
  }

  @Get(':id/items')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get customer product/item purchase history' })
  async getCustomerItems(@Param('id') id: string, @Request() req: any) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    const items = await this.ledgerService.getCustomerItems(id, companyId);
    return { success: true, data: items };
  }

  @Get(':id/statement')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get official Customer Statement with period opening balance' })
  async getStatement(
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('documentType') documentType?: any,
    @Query('divisionId') divisionId?: string,
    @Request() req?: any,
  ) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    const statement = await this.ledgerService.getStatement(id, companyId, {
      fromDate,
      toDate,
      documentType,
      divisionId,
    });
    return { success: true, data: statement };
  }

  // --- Authoritative Customer Ledger Endpoints ---
  @Get(':id/ledger')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get authoritative customer ledger' })
  async getLedger(
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('documentType') documentType?: any,
    @Query('divisionId') divisionId?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    const ledger = await this.ledgerService.getLedger(id, companyId, {
      fromDate,
      toDate,
      documentType,
      divisionId,
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 100,
    });
    return { success: true, ...ledger };
  }

  @Get(':id/aging')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get customer 5-bucket AR aging breakdown' })
  async getAging(@Param('id') id: string, @Request() req?: any) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    const aging = await this.ledgerService.getAgingAnalysis(id, companyId);
    return { success: true, data: aging };
  }

  @Get(':id/credit-status')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Evaluate live customer credit policy & exposure' })
  async getCreditStatus(
    @Param('id') id: string,
    @Query('proposedAmount') proposedAmount?: number,
    @Request() req?: any,
  ) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    if (this.creditService) {
      const data = await this.creditService.evaluatePolicy(companyId, id, Number(proposedAmount) || 0);
      return { success: true, data };
    }
    const summary = await this.ledgerService.getSummary(id, companyId);
    return {
      success: true,
      data: {
        customerId: id,
        customerCode: customer.customerCode,
        customerName: customer.name,
        creditHold: Boolean(customer.creditHold),
        creditHoldReason: customer.creditHoldReason || null,
        creditLimit: Number(customer.creditLimit) || 0,
        creditDays: Number(customer.creditDays) || 0,
        paymentTerms: summary.paymentTerms,
        currentBalance: summary.netReceivableBalance,
        allowedWithoutOverride: !customer.creditHold,
      },
    };
  }

  @Get(':id/ledger/summary')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get customer ledger summary' })
  async getLedgerSummary(@Param('id') id: string, @Request() req?: any) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    const summary = await this.ledgerService.getSummary(id, companyId);
    return { success: true, data: summary };
  }

  @Post(':id/ledger/opening-balance')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.update')
  @ApiOperation({ summary: 'Record or update customer opening balance' })
  async recordOpeningBalance(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('type') type: 'DEBIT' | 'CREDIT',
    @Request() req: any,
  ) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    const entry = await this.ledgerService.recordOpeningBalance(
      companyId,
      id,
      amount,
      type || 'DEBIT',
      req.user?.id,
    );
    return { success: true, data: entry, message: 'Opening balance recorded in ledger' };
  }

  @Post(':id/ledger/payment')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.update')
  @ApiOperation({ summary: 'Record customer payment / advance via unified Receipt & Allocation engine' })
  async recordPayment(
    @Param('id') id: string,
    @Body() body: {
      amount: number;
      paymentDate?: string;
      receiptDate?: string;
      paymentMethod?: string;
      paymentMode?: string;
      receiptType?: string;
      bankAccountId?: string;
      bankName?: string;
      chequeNumber?: string;
      chequeDate?: string;
      clearanceStatus?: string;
      divisionId?: string;
      salesOrderId?: string;
      socNumber?: string;
      poReference?: string;
      autoAllocate?: boolean;
      allocations?: Array<{ salesInvoiceId: string; allocatedAmount: number }>;
      reference?: string;
      referenceNo?: string;
      notes?: string;
      remarks?: string;
    },
    @Request() req: any,
  ) {
    const customer = await this.customerService.findOne(id);
    const companyId = customer.companyId || req?.user?.defaultCompanyId;
    const userId = req.user?.id;

    if (this.receiptService) {
      const rawMode = String(body.paymentMode || body.paymentMethod || 'BANK_TRANSFER').toUpperCase();
      const normalizedMode = rawMode.includes('CASH')
        ? 'CASH'
        : rawMode.includes('CHEQUE') || rawMode.includes('CHQ')
        ? 'CHEQUE'
        : rawMode.includes('ONLINE') || rawMode.includes('PAYORDER')
        ? 'ONLINE'
        : rawMode.includes('BANK')
        ? 'BANK_TRANSFER'
        : 'OTHER';

      const receipt = await this.receiptService.createReceipt(
        {
          companyId,
          customerId: id,
          divisionId: body.divisionId || customer.divisionId || undefined,
          receiptDate: body.receiptDate || (body.paymentDate ? String(body.paymentDate).slice(0, 10) : undefined),
          salesOrderId: body.salesOrderId,
          socNumber: body.socNumber,
          poReference: body.poReference,
          receiptType: body.receiptType,
          paymentMode: normalizedMode,
          bankAccountId: body.bankAccountId,
          bankName: body.bankName,
          chequeNumber: body.chequeNumber,
          chequeDate: body.chequeDate,
          clearanceStatus: body.clearanceStatus,
          amount: Number(body.amount) || 0,
          referenceNo: body.referenceNo || body.reference,
          remarks: body.remarks || body.notes,
          autoAllocate: body.autoAllocate,
          allocations: body.allocations,
        },
        userId,
        companyId,
      );
      return { success: true, data: receipt, message: `Receipt ${receipt.receiptNumber} recorded successfully` };
    }

    const docNum = `PAY-${Date.now().toString().slice(-6)}`;
    const entry = await this.ledgerService.recordEntry(
      companyId,
      id,
      {
        transactionDate: body.paymentDate || new Date().toISOString(),
        documentType: CustomerDocumentType.CUSTOMER_PAYMENT,
        documentNumber: body.reference ? `PAY-${body.reference}` : docNum,
        reference: body.paymentMethod ? `${body.paymentMethod} - ${body.reference || 'Direct'}` : body.reference || 'Customer Payment',
        credit: Number(body.amount) || 0,
        debit: 0,
        currency: customer.currencyCode || 'PKR',
        notes: body.notes || 'Recorded from Customer 360 View',
        status: 'POSTED',
      },
      userId,
    );
    return { success: true, data: entry, message: 'Payment recorded successfully' };
  }

  // --- Contacts ---
  @Post(':id/contacts')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.contact.create')
  @ApiOperation({ summary: 'Add contact to customer' })
  async addContact(@Param('id') id: string, @Body() dto: CreateCustomerContactDto, @Request() req: any) {
    const contact = await this.customerService.addContact(id, dto, req.user?.id);
    return { success: true, data: contact, message: 'Contact added successfully' };
  }

  @Patch(':id/contacts/:contactId')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.contact.update')
  @ApiOperation({ summary: 'Update customer contact' })
  async updateContact(@Param('contactId') contactId: string, @Body() dto: Partial<CreateCustomerContactDto>, @Request() req: any) {
    const contact = await this.customerService.updateContact(contactId, dto, req.user?.id);
    return { success: true, data: contact, message: 'Contact updated successfully' };
  }

  @Delete(':id/contacts/:contactId')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.contact.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove customer contact' })
  async removeContact(@Param('contactId') contactId: string) {
    await this.customerService.removeContact(contactId);
    return { success: true, message: 'Contact removed successfully' };
  }

  // --- Addresses ---
  @Post(':id/addresses')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.address.create')
  @ApiOperation({ summary: 'Add address to customer' })
  async addAddress(@Param('id') id: string, @Body() dto: CreateCustomerAddressDto, @Request() req: any) {
    const address = await this.customerService.addAddress(id, dto, req.user?.id);
    return { success: true, data: address, message: 'Address added successfully' };
  }

  @Patch(':id/addresses/:addressId')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.address.update')
  @ApiOperation({ summary: 'Update customer address' })
  async updateAddress(@Param('addressId') addressId: string, @Body() dto: Partial<CreateCustomerAddressDto>, @Request() req: any) {
    const address = await this.customerService.updateAddress(addressId, dto, req.user?.id);
    return { success: true, data: address, message: 'Address updated successfully' };
  }

  @Delete(':id/addresses/:addressId')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.address.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove customer address' })
  async removeAddress(@Param('addressId') addressId: string) {
    await this.customerService.removeAddress(addressId);
    return { success: true, message: 'Address removed successfully' };
  }
}