import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerContact, CustomerAddress } from '../entities';
import { CustomerLedgerService } from './customer-ledger.service';

@Injectable()
export class CustomerDemoSeederService {
  private readonly logger = new Logger(CustomerDemoSeederService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerContact)
    private readonly contactRepo: Repository<CustomerContact>,
    @InjectRepository(CustomerAddress)
    private readonly addressRepo: Repository<CustomerAddress>,
    private readonly ledgerService: CustomerLedgerService,
  ) {}

  async seedDemoCustomers(companyId?: string, userId?: string): Promise<Customer[]> {
    let targetCompanyId = companyId;
    if (!targetCompanyId || targetCompanyId === '00000000-0000-0000-0000-000000000001') {
      try {
        const companies = await this.customerRepo.manager.query('SELECT id FROM companies ORDER BY created_at ASC LIMIT 1');
        if (companies && companies.length > 0) {
          targetCompanyId = companies[0].id;
        }
      } catch (err) {
        this.logger.warn(`Could not lookup company from database: ${err}`);
      }
    }

    if (!targetCompanyId) {
      throw new Error('No valid company found to seed demo customers.');
    }
    const demoConfigs = [
      {
        customerCode: 'DEMO-CUS-001',
        name: 'Pakistan Wire Industries Demo Customer',
        legalName: 'Pakistan Wire Industries (Pvt) Ltd (Demo Entity)',
        shortName: 'PWI Demo',
        customerType: 'Domestic Customer',
        customerCategory: 'Key Account',
        customerGroup: 'DOMESTIC_INDUSTRIAL',
        customerSince: new Date('2024-01-01'),
        taxStatus: 'REGISTERED_FILER',
        classification: 'A_TIER',
        contactPerson: 'Muhammad Tariq Khan',
        email: 'tariq.khan@pwidemo.com.pk',
        phone: '+92-42-35870001',
        fax: '+92-42-35870002',
        website: 'https://pwidemo.com.pk',
        taxNumber: 'NTN-1234567-1',
        salesTaxNumber: 'STRN-0300123456701',
        registrationNumber: 'REG-LHR-2024-001',
        addressLine1: 'Plot 45-B, Quaid-e-Azam Industrial Estate, Kot Lakhpat',
        addressLine2: 'Phase II, Near General Hospital',
        city: 'Lahore',
        state: 'Punjab',
        postalCode: '54770',
        country: 'Pakistan',
        currencyCode: 'PKR',
        paymentTerms: 'Net 30 Days',
        creditLimit: 1500000,
        creditDays: 30,
        openingBalance: 125000,
        openingBalanceType: 'DEBIT',
        priceList: 'DOMESTIC_WHOLESALE_2026',
        discountPercent: 2.5,
        customerTier: 'PLATINUM',
        leadSource: 'REFERRAL',
        status: 'ACTIVE',
        notes: 'DEMO RECORD: High-volume domestic buyer for copper and galvanized steel binding wire.',
        contacts: [
          {
            firstName: 'Muhammad',
            lastName: 'Tariq Khan',
            jobTitle: 'Procurement Director',
            designation: 'Head of Purchasing',
            email: 'tariq.khan@pwidemo.com.pk',
            phone: '+92-42-35870001',
            mobile: '+92-300-8451122',
            isPrimary: true,
          },
          {
            firstName: 'Suleman',
            lastName: 'Raza',
            jobTitle: 'Accounts Manager',
            designation: 'Finance Controller',
            email: 'suleman.raza@pwidemo.com.pk',
            phone: '+92-42-35870003',
            mobile: '+92-321-9876543',
            isPrimary: false,
          },
        ],
        addresses: [
          {
            addressType: 'BILLING',
            addressLine1: 'Executive Office Suite 402, Trade Center, MM Alam Road',
            city: 'Lahore',
            area: 'Gulberg III',
            state: 'Punjab',
            country: 'Pakistan',
            postalCode: '54000',
            contactPerson: 'Suleman Raza',
            phone: '+92-42-35870003',
            isDefault: true,
          },
          {
            addressType: 'SHIPPING',
            addressLine1: 'Central Warehouse Gate 2, 14-Km Multan Road',
            city: 'Lahore',
            area: 'Chung Industrial Belt',
            state: 'Punjab',
            country: 'Pakistan',
            postalCode: '53700',
            contactPerson: 'Muhammad Tariq Khan',
            phone: '+92-300-8451122',
            isDefault: false,
          },
        ],
      },
      {
        customerCode: 'DEMO-CUS-002',
        name: 'Demo Bicycle Components Dealer',
        legalName: 'Pak National Bicycle & Engineering Parts Co. (Demo)',
        shortName: 'Bicycle Parts Dealer',
        customerType: 'Dealer',
        customerCategory: 'Commercial Dealer',
        customerGroup: 'DEALER_NETWORK',
        customerSince: new Date('2024-03-15'),
        taxStatus: 'REGISTERED_FILER',
        classification: 'B_TIER',
        contactPerson: 'Khurram Shehzad',
        email: 'khurram@pakbicycleparts.com',
        phone: '+92-21-32410002',
        website: 'https://pakbicycleparts.com',
        taxNumber: 'NTN-7654321-2',
        salesTaxNumber: 'STRN-0400765432102',
        registrationNumber: 'REG-KHI-2024-089',
        addressLine1: 'Shop # 14-16, Bicycle Market, Tyron Road',
        addressLine2: 'Near Light House, Saddar',
        city: 'Karachi',
        state: 'Sindh',
        postalCode: '74400',
        country: 'Pakistan',
        currencyCode: 'PKR',
        paymentTerms: 'Cash On Delivery / 15 Days',
        creditLimit: 500000,
        creditDays: 15,
        openingBalance: 45000,
        openingBalanceType: 'DEBIT',
        priceList: 'DEALER_STANDARD_2026',
        discountPercent: 5.0,
        customerTier: 'GOLD',
        leadSource: 'TRADE_SHOW',
        status: 'ACTIVE',
        notes: 'DEMO RECORD: Regional dealer network purchasing bicycle spoke wire and spring steel strips.',
        contacts: [
          {
            firstName: 'Khurram',
            lastName: 'Shehzad',
            jobTitle: 'Managing Partner',
            designation: 'General Manager',
            email: 'khurram@pakbicycleparts.com',
            phone: '+92-21-32410002',
            mobile: '+92-333-2145890',
            isPrimary: true,
          },
        ],
        addresses: [
          {
            addressType: 'BOTH',
            addressLine1: 'Shop # 14-16, Bicycle Market, Tyron Road, Saddar',
            city: 'Karachi',
            area: 'Saddar Downtown',
            state: 'Sindh',
            country: 'Pakistan',
            postalCode: '74400',
            contactPerson: 'Khurram Shehzad',
            phone: '+92-333-2145890',
            isDefault: true,
          },
        ],
      },
      {
        customerCode: 'DEMO-CUS-003',
        name: 'Demo Export Customer',
        legalName: 'Gulf Wire & Cable Trading LLC (Demo Global)',
        shortName: 'Gulf Cable FZE',
        customerType: 'Export Customer',
        customerCategory: 'International Corporate',
        customerGroup: 'EXPORT_MIDDLE_EAST',
        customerSince: new Date('2024-06-01'),
        taxStatus: 'EXEMPT_ZERO_RATED_EXPORT',
        classification: 'STRATEGIC_GLOBAL',
        contactPerson: 'Zayn Al-Mansoor',
        email: 'orders@gulfcable-demo.ae',
        phone: '+971-4-3210003',
        website: 'https://gulfcable-demo.ae',
        taxNumber: 'TRN-100293847500003',
        salesTaxNumber: 'EXPORT-REG-PAK-991',
        registrationNumber: 'DED-DXB-984712',
        addressLine1: 'Warehouse 12, Al Quoz Industrial Area 3',
        addressLine2: 'P.O. Box 48192',
        city: 'Dubai',
        state: 'Dubai',
        postalCode: '00000',
        country: 'United Arab Emirates',
        currencyCode: 'USD',
        paymentTerms: 'Letter of Credit (LC at Sight)',
        creditLimit: 100000,
        creditDays: 60,
        openingBalance: 0,
        openingBalanceType: 'DEBIT',
        priceList: 'EXPORT_FOB_KARACHI_USD',
        discountPercent: 0,
        customerTier: 'PLATINUM',
        leadSource: 'WEBSITE',
        status: 'ACTIVE',
        notes: 'DEMO RECORD: Export partner ordering container-loads of PVC coated fencing wire for GCC projects.',
        contacts: [
          {
            firstName: 'Zayn',
            lastName: 'Al-Mansoor',
            jobTitle: 'Supply Chain Vice President',
            designation: 'VP Procurement',
            email: 'zayn@gulfcable-demo.ae',
            phone: '+971-4-3210003',
            mobile: '+971-50-1234567',
            isPrimary: true,
          },
        ],
        addresses: [
          {
            addressType: 'BILLING',
            addressLine1: 'Office 1804, The Binary Tower, Business Bay',
            city: 'Dubai',
            state: 'Dubai',
            country: 'United Arab Emirates',
            postalCode: '00000',
            contactPerson: 'Zayn Al-Mansoor',
            phone: '+971-4-3210003',
            isDefault: true,
          },
          {
            addressType: 'SHIPPING',
            addressLine1: 'Jebel Ali Free Zone (JAFZA) South, Gate 4, Warehouse 8',
            city: 'Dubai',
            state: 'Dubai',
            country: 'United Arab Emirates',
            postalCode: '00000',
            contactPerson: 'Logistics Supervisor',
            phone: '+971-4-8812345',
            isDefault: false,
          },
        ],
      },
    ];

    const results: Customer[] = [];

    for (const cfg of demoConfigs) {
      const existing = await this.customerRepo.findOne({
        where: { customerCode: cfg.customerCode, companyId: targetCompanyId },
      });
      if (existing) {
        results.push(existing);
        continue;
      }

      const { contacts, addresses, openingBalance, openingBalanceType, ...custData } = cfg;

      const customer = this.customerRepo.create({
        ...custData,
        companyId: targetCompanyId,
        openingBalance,
        openingBalanceType,
        createdBy: userId || null,
        updatedBy: userId || null,
      });

      const savedCustomer = await this.customerRepo.save(customer);

      // Create Contacts
      if (contacts && contacts.length > 0) {
        for (const c of contacts) {
          const contact = this.contactRepo.create({
            ...c,
            customerId: savedCustomer.id,
            status: 'ACTIVE',
            createdBy: userId || null,
          });
          await this.contactRepo.save(contact);
        }
      }

      // Create Addresses
      if (addresses && addresses.length > 0) {
        for (const a of addresses) {
          const address = this.addressRepo.create({
            ...a,
            customerId: savedCustomer.id,
            status: 'ACTIVE',
            createdBy: userId || null,
          });
          await this.addressRepo.save(address);
        }
      }

      // Record Opening Balance in Customer Ledger if > 0
      if (openingBalance > 0) {
        try {
          await this.ledgerService.recordOpeningBalance(
            targetCompanyId,
            savedCustomer.id,
            openingBalance,
            openingBalanceType as 'DEBIT' | 'CREDIT',
            userId,
          );
        } catch (err) {
          this.logger.warn(`Could not post opening balance for demo customer ${cfg.customerCode}: ${err}`);
        }
      }

      results.push(savedCustomer);
    }

    this.logger.log(`Ensured ${results.length} DEMO customer master records for company ${targetCompanyId}`);
    return results;
  }
}
