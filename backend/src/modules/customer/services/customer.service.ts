import { Injectable, NotFoundException, ConflictException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerContact, CustomerAddress, CustomerLedgerEntry } from '../entities';
import { CreateCustomerDto, CreateCustomerContactDto, CreateCustomerAddressDto, CustomerFilterDto } from '../dto';
import { NotificationsService } from '../../notification/notifications.service';
import { BarcodeService } from '../../barcode/services/barcode.service';
import { BarcodeEntityType } from '../../barcode/entities/barcode.entity';
import { CustomerLedgerService } from './customer-ledger.service';
import { CustomerDemoSeederService } from './customer-demo-seeder.service';

@Injectable()
export class CustomerService implements OnModuleInit {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    @InjectRepository(CustomerContact)
    private readonly contactRepo: Repository<CustomerContact>,
    @InjectRepository(CustomerAddress)
    private readonly addressRepo: Repository<CustomerAddress>,
    @InjectRepository(CustomerLedgerEntry)
    private readonly ledgerRepo: Repository<CustomerLedgerEntry>,
    private readonly notificationsService: NotificationsService,
    private readonly barcodeService: BarcodeService,
    private readonly ledgerService: CustomerLedgerService,
    private readonly demoSeederService: CustomerDemoSeederService,
  ) {}

  async onModuleInit() {
    try {
      await this.repo.query(`
        ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_customer_type_check";
        ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_customer_tier_check";
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "legal_name" varchar(255);
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_category" varchar(50) DEFAULT 'STANDARD';
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_group" varchar(50) DEFAULT 'GENERAL';
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_since" date;
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tax_status" varchar(50) DEFAULT 'REGISTERED';
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "classification" varchar(50);
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "sales_tax_number" varchar(100);
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "opening_balance" decimal(15,4) DEFAULT 0;
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "opening_balance_type" varchar(10) DEFAULT 'DEBIT';
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "price_list" varchar(100) DEFAULT 'STANDARD';
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_hold" boolean DEFAULT false;
        ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_hold_reason" text;

        ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "area" varchar(100);
        ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "contact_person" varchar(150);
        ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "phone" varchar(50);

        ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "designation" varchar(100);
        ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "alternate_contact" varchar(150);
        ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "alternate_phone" varchar(50);

        CREATE TABLE IF NOT EXISTS "customer_ledger" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "created_by" uuid,
          "updated_by" uuid,
          "is_active" boolean NOT NULL DEFAULT true,
          "company_id" uuid NOT NULL,
          "customer_id" uuid NOT NULL,
          "transaction_date" date NOT NULL,
          "document_type" varchar(50) NOT NULL DEFAULT 'OPENING_BALANCE',
          "document_number" varchar(100) NOT NULL,
          "reference" varchar(255),
          "debit" decimal(15,4) NOT NULL DEFAULT 0,
          "credit" decimal(15,4) NOT NULL DEFAULT 0,
          "running_balance" decimal(15,4) NOT NULL DEFAULT 0,
          "currency" varchar(3) NOT NULL DEFAULT 'PKR',
          "due_date" date,
          "payment_terms" varchar(50),
          "status" varchar(20) NOT NULL DEFAULT 'POSTED',
          "notes" text,
          CONSTRAINT "fk_customer_ledger_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS "idx_customer_ledger_company_customer" ON "customer_ledger"("company_id", "customer_id", "transaction_date");
      `);
      this.logger.log('Customer master and ledger database schema verified successfully.');
      // Auto demo seeding disabled to keep only genuine PWI business customers
    } catch (err) {
      this.logger.warn(`Customer master schema init error: ${err}`);
    }
  }

  /**
   * Extracts a 3-letter uppercase abbreviation from the Customer Name:
   * - 3+ words (e.g. "Baba Fareed Autos" -> "BFA", "SSD Autos Larkana" -> "SSD")
   * - 2 words (e.g. "Swabi Autos" -> "SWA", "Royal Power" -> "ROP")
   * - 1 word (e.g. "FABRO" -> "FAB")
   */
  extractCustomerNameAbbr(customerName?: string): string {
    const cleaned = (customerName || '')
      .toUpperCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^A-Z0-9\s-]/g, ' ')
      .trim();
    const words = cleaned.split(/[\s-]+/).filter((w) => w.length > 0 && !['PVT', 'LTD', 'LIMITED', 'THE', 'AND'].includes(w));
    const allWords = cleaned.split(/[\s-]+/).filter((w) => w.length > 0);
    const targetWords = words.length > 0 ? words : allWords;

    if (targetWords.length === 0) return 'GEN';
    if (allWords.length >= 3 && allWords[0].length === 3) {
      return allWords[0].slice(0, 3);
    }
    if (allWords.length >= 3) {
      return (allWords[0][0] + allWords[1][0] + allWords[2][0]).toUpperCase();
    }
    if (targetWords.length === 2) {
      const w1 = targetWords[0];
      const w2 = targetWords[1];
      if (w1.length >= 2) {
        return (w1.slice(0, 2) + w2[0]).toUpperCase();
      }
      return (w1[0] + w2.slice(0, 2)).padEnd(3, 'X').toUpperCase();
    }
    return targetWords[0].slice(0, 3).padEnd(3, 'X').toUpperCase();
  }

  /**
   * Generates a professional, sequential, company-scoped customer code
   * including 3 letters from the Customer Name:
   * e.g. CUS-SWA-019, CUS-PTL-002, CUS-BFA-017
   */
  async generateCustomerCode(companyId: string, customerName?: string): Promise<string> {
    const abbr = this.extractCustomerNameAbbr(customerName);
    const result = await this.repo
      .createQueryBuilder('c')
      .select("MAX(CAST(SUBSTRING(c.customerCode FROM '([0-9]+)$') AS INT))", 'maxNum')
      .where('c.companyId = :companyId', { companyId })
      .getRawOne();

    const maxNum = Number(result?.maxNum || 0);
    const nextNum = maxNum + 1;
    return `CUS-${abbr}-${String(nextNum).padStart(3, '0')}`;
  }

  private async syncSalesCustomer(saved: Customer): Promise<void> {
    try {
      await this.repo.manager.query(
        `INSERT INTO erp_sales.customers (id, company_id, customer_code, company_name, contact_person, email, phone, division_id, status, is_active, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           customer_code = EXCLUDED.customer_code,
           company_name = EXCLUDED.company_name,
           contact_person = EXCLUDED.contact_person,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           division_id = EXCLUDED.division_id,
           status = EXCLUDED.status,
           is_active = EXCLUDED.is_active`,
        [
          saved.id,
          saved.companyId,
          saved.customerCode,
          saved.name,
          saved.contactPerson || null,
          saved.email || null,
          saved.phone || null,
          saved.divisionId || null,
          saved.status || 'Active',
          saved.isActive !== false,
          saved.currencyCode || 'PKR',
        ],
      );
    } catch (err) {
      this.logger.warn(`Failed to sync customer ${saved.id} to erp_sales.customers: ${err}`);
    }
  }

  /**
   * Resolve a company id that actually exists. Tries the candidate(s) in order; falls back to the
   * first company in the database (single-company installs). Never returns a placeholder id.
   */
  async resolveCompanyId(...candidates: Array<string | undefined | null>): Promise<string> {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const cand of candidates) {
      if (!cand || !uuidRe.test(cand)) continue;
      const rows = await this.repo.manager.query('SELECT id FROM companies WHERE id = $1 LIMIT 1', [cand]);
      if (rows?.length) return rows[0].id;
    }
    const first = await this.repo.manager.query('SELECT id FROM companies ORDER BY created_at ASC LIMIT 1');
    if (first?.length) return first[0].id;
    throw new ConflictException('No company is configured. Please create a company before adding customers.');
  }

  async create(dto: CreateCustomerDto, userId?: string): Promise<Customer> {
    const companyId = await this.resolveCompanyId(dto.companyId);
    dto = { ...dto, companyId };
    const finalCode = dto.customerCode?.trim() || (await this.generateCustomerCode(companyId, dto.name));

    const existing = await this.repo.findOne({
      where: { customerCode: finalCode, companyId },
    });
    if (existing) {
      throw new ConflictException(`Customer code '${finalCode}' already exists in this company`);
    }

    const customer = this.repo.create({
      ...dto,
      customerCode: finalCode,
      divisionId: dto.divisionId || null,
      status: dto.status || 'ACTIVE',
      currencyCode: dto.currencyCode || 'PKR',
      customerSince: dto.customerSince ? new Date(dto.customerSince) : new Date(),
      lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : null,
      nextFollowUpDate: dto.nextFollowUpDate ? new Date(dto.nextFollowUpDate) : null,
      createdBy: userId || null,
      updatedBy: userId || null,
    });

    const saved = await this.repo.save(customer);
    await this.syncSalesCustomer(saved);

    // Auto-create centralized barcode registry entry
    try {
      await this.barcodeService.ensureBarcodeForEntity(
        saved.companyId,
        BarcodeEntityType.CUSTOMER,
        saved.id,
        saved.customerCode,
        saved.name,
        userId,
      );
    } catch (err) {
      this.logger.warn(`Failed to create centralized barcode for customer ${saved.id}: ${err}`);
    }

    // Authoritative Customer Ledger: Record Opening Balance if specified
    if (saved.openingBalance && Number(saved.openingBalance) > 0) {
      try {
        await this.ledgerService.recordOpeningBalance(
          saved.companyId,
          saved.id,
          Number(saved.openingBalance),
          (saved.openingBalanceType as 'DEBIT' | 'CREDIT') || 'DEBIT',
          userId,
        );
      } catch (err) {
        this.logger.warn(`Failed to record opening balance in customer ledger: ${err}`);
      }
    }

    await this.notificationsService.notifyActiveUsers({
      type: 'customer.created',
      title: 'New customer created',
      message: `${saved.name} (${saved.customerCode}) was added to customers`,
      entityType: 'customer',
      entityId: saved.id,
      actorAuthUserId: userId || null,
    });

    return saved;
  }

  async findAll(filter: CustomerFilterDto): Promise<{ data: Customer[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      companyId,
      divisionId,
      status,
      search,
      customerType,
      customerCategory,
      customerTier,
      state,
      city,
      sortField = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const qb = this.repo.createQueryBuilder('c').leftJoinAndSelect('c.division', 'division');
    let hasWhere = false;

    if (companyId) {
      qb.where('c.companyId = :companyId', { companyId });
      hasWhere = true;
    }
    if (divisionId) {
      qb[hasWhere ? 'andWhere' : 'where']('c.divisionId = :divisionId', { divisionId });
      hasWhere = true;
    }
    if (status) {
      qb[hasWhere ? 'andWhere' : 'where']('c.status = :status', { status });
      hasWhere = true;
    }
    if (customerType) {
      qb[hasWhere ? 'andWhere' : 'where']('c.customerType = :customerType', { customerType });
      hasWhere = true;
    }
    if (customerCategory) {
      qb[hasWhere ? 'andWhere' : 'where']('c.customerCategory = :customerCategory', { customerCategory });
      hasWhere = true;
    }
    if (customerTier) {
      qb[hasWhere ? 'andWhere' : 'where']('c.customerTier = :customerTier', { customerTier });
      hasWhere = true;
    }
    if (state) {
      qb[hasWhere ? 'andWhere' : 'where']('c.state ILIKE :state', { state: `%${state}%` });
      hasWhere = true;
    }
    if (city) {
      qb[hasWhere ? 'andWhere' : 'where']('c.city ILIKE :city', { city: `%${city}%` });
      hasWhere = true;
    }

    // Comprehensive Server-Side Search (Code, Name, Legal Name, Phone, Email, NTN, STRN)
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      qb[hasWhere ? 'andWhere' : 'where'](
        '(c.name ILIKE :search OR c.customerCode ILIKE :search OR c.legalName ILIKE :search OR c.shortName ILIKE :search OR c.contactPerson ILIKE :search OR c.phone ILIKE :search OR c.email ILIKE :search OR c.taxNumber ILIKE :search OR c.salesTaxNumber ILIKE :search)',
        { search: term },
      );
      hasWhere = true;
    }

    const validSortFields = [
      'createdAt',
      'customerCode',
      'name',
      'legalName',
      'status',
      'customerType',
      'customerTier',
      'totalRevenue',
      'creditLimit',
      'customerSince',
    ];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`c.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.repo.findOne({
      where: { id },
      relations: ['contacts', 'addresses', 'ledgerEntries', 'division'],
    });
    if (!customer) throw new NotFoundException(`Customer with ID '${id}' not found`);
    return customer;
  }

  async update(id: string, dto: Partial<CreateCustomerDto>, userId?: string): Promise<Customer> {
    const customer = await this.findOne(id);

    const oldOpening = Number(customer.openingBalance) || 0;
    const oldType = customer.openingBalanceType || 'DEBIT';

    if (dto.isActive !== undefined) {
      customer.isActive = dto.isActive;
      customer.status = dto.isActive ? 'ACTIVE' : 'INACTIVE';
    }

    if (dto.divisionId !== undefined) {
      const nextDivId = dto.divisionId || null;
      customer.divisionId = nextDivId;
      customer.division = nextDivId ? ({ id: nextDivId } as any) : null;
    }

    Object.assign(customer, dto, {
      lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : customer.lastContactDate,
      nextFollowUpDate: dto.nextFollowUpDate ? new Date(dto.nextFollowUpDate) : customer.nextFollowUpDate,
      updatedBy: userId || null,
    });

    if (dto.divisionId !== undefined) {
      const nextDivId = dto.divisionId || null;
      customer.divisionId = nextDivId;
      customer.division = nextDivId ? ({ id: nextDivId } as any) : null;
    }

    const saved = await this.repo.save(customer);
    await this.syncSalesCustomer(saved);

    // If opening balance was modified, update authoritative ledger
    const newOpening = Number(saved.openingBalance) || 0;
    const newType = (saved.openingBalanceType as 'DEBIT' | 'CREDIT') || 'DEBIT';
    if (newOpening !== oldOpening || newType !== oldType) {
      try {
        await this.ledgerService.recordOpeningBalance(saved.companyId, saved.id, newOpening, newType, userId);
      } catch (err) {
        this.logger.warn(`Could not sync updated opening balance in customer ledger: ${err}`);
      }
    }

    return this.findOne(id);
  }

  /**
   * RECYCLE BIN — deleting a customer is now a recoverable trash operation.
   *
   * The old implementation only flipped `status` to INACTIVE, which kept the
   * account visible in every live directory and was indistinguishable from the
   * separate, deliberate Activate/Deactivate action. `deleted_at` is now the
   * single delete signal, so the row leaves the directory grids immediately
   * while its contacts, addresses and — critically — its ledger rows are NOT
   * touched, so the immutable accounting history behind any transaction still
   * reconciles.
   *
   * `status` and `isActive` are deliberately left exactly as they were: they
   * are business state owned by `activate()` / `deactivate()` and a Restore
   * must return the account to precisely the state it was deleted in rather
   * than silently resurrecting a commercially dead customer as ACTIVE.
   */
  async remove(id: string, userId?: string): Promise<void> {
    const customer = await this.findOne(id);
    customer.deletedAt = new Date();
    customer.deletedBy = userId ?? null;
    customer.updatedBy = userId ?? null;
    await this.repo.save(customer);
  }

  async activate(id: string, userId?: string): Promise<Customer> {
    const customer = await this.findOne(id);
    customer.status = 'ACTIVE';
    customer.isActive = true;
    customer.updatedBy = userId || null;
    return this.repo.save(customer);
  }

  async deactivate(id: string, userId?: string): Promise<Customer> {
    const customer = await this.findOne(id);
    customer.status = 'INACTIVE';
    customer.isActive = false;
    customer.updatedBy = userId || null;
    return this.repo.save(customer);
  }

  async seedDemo(companyId: string, userId?: string): Promise<Customer[]> {
    return this.demoSeederService.seedDemoCustomers(companyId, userId);
  }

  // --- Contacts ---
  async addContact(customerId: string, dto: CreateCustomerContactDto, userId?: string): Promise<CustomerContact> {
    await this.findOne(customerId);
    if (dto.isPrimary) {
      await this.contactRepo.update(
        { customerId, isPrimary: true },
        { isPrimary: false },
      );
    }
    const contact = this.contactRepo.create({
      ...dto,
      customerId,
      status: 'ACTIVE',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.contactRepo.save(contact);
  }

  async updateContact(contactId: string, dto: Partial<CreateCustomerContactDto>, userId?: string): Promise<CustomerContact> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Customer contact with ID '${contactId}' not found`);
    if (dto.isPrimary) {
      await this.contactRepo.update(
        { customerId: contact.customerId, isPrimary: true },
        { isPrimary: false },
      );
    }
    Object.assign(contact, dto, { updatedBy: userId || null });
    return this.contactRepo.save(contact);
  }

  async removeContact(contactId: string): Promise<void> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Customer contact with ID '${contactId}' not found`);
    await this.contactRepo.remove(contact);
  }

  // --- Addresses ---
  async addAddress(customerId: string, dto: CreateCustomerAddressDto, userId?: string): Promise<CustomerAddress> {
    await this.findOne(customerId);
    if (dto.isDefault) {
      await this.addressRepo.update(
        { customerId, isDefault: true },
        { isDefault: false },
      );
    }
    const address = this.addressRepo.create({
      ...dto,
      customerId,
      status: 'ACTIVE',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.addressRepo.save(address);
  }

  async updateAddress(addressId: string, dto: Partial<CreateCustomerAddressDto>, userId?: string): Promise<CustomerAddress> {
    const address = await this.addressRepo.findOne({ where: { id: addressId } });
    if (!address) throw new NotFoundException(`Customer address with ID '${addressId}' not found`);
    if (dto.isDefault) {
      await this.addressRepo.update(
        { customerId: address.customerId, isDefault: true },
        { isDefault: false },
      );
    }
    Object.assign(address, dto, { updatedBy: userId || null });
    return this.addressRepo.save(address);
  }

  async removeAddress(addressId: string): Promise<void> {
    const address = await this.addressRepo.findOne({ where: { id: addressId } });
    if (!address) throw new NotFoundException(`Customer address with ID '${addressId}' not found`);
    await this.addressRepo.remove(address);
  }
}