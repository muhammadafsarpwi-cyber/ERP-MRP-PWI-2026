import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerService } from './customer.service';
import { Customer, CustomerContact, CustomerAddress } from '../entities';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('CustomerService', () => {
  let service: CustomerService;
  let repo: jest.Mocked<Repository<Customer>>;
  let contactRepo: jest.Mocked<Repository<CustomerContact>>;
  let addressRepo: jest.Mocked<Repository<CustomerAddress>>;

  const mockCustomer: Customer = {
    id: 'cust-001',
    companyId: 'company-001',
    customerCode: 'CUST-0001',
    name: 'Test Customer',
    shortName: 'TC',
    customerType: 'WHOLESALE',
    contactPerson: 'John Doe',
    email: 'john@test.com',
    phone: '+92-21-12345678',
    fax: null,
    website: null,
    taxNumber: null,
    registrationNumber: null,
    addressLine1: null,
    addressLine2: null,
    city: 'Karachi',
    state: null,
    postalCode: null,
    country: 'Pakistan',
    currencyCode: 'PKR',
    paymentTerms: 'NET30',
    creditLimit: 100000,
    creditDays: 30,
    discountPercent: 5,
    customerTier: 'GOLD',
    leadSource: 'WEBSITE',
    assignedTo: null,
    lastContactDate: null,
    nextFollowUpDate: null,
    totalOrders: 0,
    totalRevenue: 0,
    notes: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-001',
    updatedBy: 'user-001',
    isActive: true,
    company: null as never,
    contacts: [],
    addresses: [],
  };

  const mockContact: CustomerContact = {
    id: 'contact-001',
    customerId: 'cust-001',
    firstName: 'Jane',
    lastName: 'Doe',
    jobTitle: 'Manager',
    email: 'jane@test.com',
    phone: '+92-21-87654321',
    mobile: null,
    isPrimary: true,
    notes: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-001',
    updatedBy: 'user-001',
    isActive: true,
    customer: null as never,
  };

  const mockAddress: CustomerAddress = {
    id: 'addr-001',
    customerId: 'cust-001',
    addressType: 'SHIPPING',
    addressLine1: '123 Main St',
    addressLine2: null,
    city: 'Karachi',
    state: 'Sindh',
    postalCode: '75500',
    country: 'Pakistan',
    isDefault: true,
    notes: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-001',
    updatedBy: 'user-001',
    isActive: true,
    customer: null as never,
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  beforeEach(async () => {
    const mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => ({ ...mockQueryBuilder })),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        { provide: getRepositoryToken(Customer), useValue: mockRepo },
        { provide: getRepositoryToken(CustomerContact), useValue: { ...mockRepo } },
        { provide: getRepositoryToken(CustomerAddress), useValue: { ...mockRepo } },
      ],
    }).compile();

    service = module.get<CustomerService>(CustomerService);
    repo = module.get(getRepositoryToken(Customer));
    contactRepo = module.get(getRepositoryToken(CustomerContact));
    addressRepo = module.get(getRepositoryToken(CustomerAddress));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new customer', async () => {
      const dto = { companyId: 'company-001', customerCode: 'CUST-0001', name: 'Test Customer' };
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockCustomer);
      repo.save.mockResolvedValue(mockCustomer);

      const result = await service.create(dto as any, 'user-001');
      expect(result).toEqual(mockCustomer);
    });

    it('should throw ConflictException for duplicate code', async () => {
      const dto = { companyId: 'company-001', customerCode: 'CUST-0001', name: 'Test Customer' };
      repo.findOne.mockResolvedValue(mockCustomer);

      await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const filter = { page: 1, limit: 20 };
      repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockCustomer], 1]),
      } as any);

      const result = await service.findAll(filter);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by search term', async () => {
      const filter = { page: 1, limit: 20, search: 'Test' };
      repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockCustomer], 1]),
      } as any);

      const result = await service.findAll(filter);
      expect(result.data).toHaveLength(1);
    });

    it('should filter by status', async () => {
      const filter = { page: 1, limit: 20, status: 'ACTIVE' };
      repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockCustomer], 1]),
      } as any);

      const result = await service.findAll(filter);
      expect(result.data).toHaveLength(1);
    });

    it('should filter by customer type', async () => {
      const filter = { page: 1, limit: 20, customerType: 'WHOLESALE' };
      repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockCustomer], 1]),
      } as any);

      const result = await service.findAll(filter);
      expect(result.data).toHaveLength(1);
    });

    it('should filter by customer tier', async () => {
      const filter = { page: 1, limit: 20, customerTier: 'GOLD' };
      repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockCustomer], 1]),
      } as any);

      const result = await service.findAll(filter);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return a customer by id', async () => {
      repo.findOne.mockResolvedValue(mockCustomer);
      const result = await service.findOne('cust-001');
      expect(result).toEqual(mockCustomer);
    });

    it('should throw NotFoundException if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a customer', async () => {
      repo.findOne.mockResolvedValue(mockCustomer);
      repo.save.mockResolvedValue({ ...mockCustomer, name: 'Updated' });

      const result = await service.update('cust-001', { name: 'Updated' } as any, 'user-001');
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update('non-existent', { name: 'Test' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete a customer', async () => {
      repo.findOne.mockResolvedValue(mockCustomer);
      repo.save.mockResolvedValue({ ...mockCustomer, status: 'INACTIVE' });

      await service.remove('cust-001');
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addContact', () => {
    it('should add a contact to customer', async () => {
      repo.findOne.mockResolvedValue(mockCustomer);
      contactRepo.update.mockResolvedValue({} as any);
      contactRepo.create.mockReturnValue(mockContact);
      contactRepo.save.mockResolvedValue(mockContact);

      const result = await service.addContact('cust-001', { firstName: 'Jane', isPrimary: true } as any, 'user-001');
      expect(result).toEqual(mockContact);
    });

    it('should unset other primary contacts when adding primary', async () => {
      repo.findOne.mockResolvedValue(mockCustomer);
      contactRepo.update.mockResolvedValue({} as any);
      contactRepo.create.mockReturnValue(mockContact);
      contactRepo.save.mockResolvedValue(mockContact);

      await service.addContact('cust-001', { firstName: 'Jane', isPrimary: true } as any, 'user-001');
      expect(contactRepo.update).toHaveBeenCalledWith(
        { customerId: 'cust-001', isPrimary: true },
        { isPrimary: false },
      );
    });
  });

  describe('updateContact', () => {
    it('should update a contact', async () => {
      contactRepo.findOne.mockResolvedValue(mockContact);
      contactRepo.update.mockResolvedValue({} as any);
      contactRepo.save.mockResolvedValue({ ...mockContact, firstName: 'Updated' });

      const result = await service.updateContact('contact-001', { firstName: 'Updated' } as any, 'user-001');
      expect(result.firstName).toBe('Updated');
    });

    it('should throw NotFoundException if not found', async () => {
      contactRepo.findOne.mockResolvedValue(null);
      await expect(service.updateContact('non-existent', { firstName: 'Test' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeContact', () => {
    it('should remove a contact', async () => {
      contactRepo.findOne.mockResolvedValue(mockContact);
      contactRepo.remove.mockResolvedValue(mockContact);

      await service.removeContact('contact-001');
      expect(contactRepo.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException if not found', async () => {
      contactRepo.findOne.mockResolvedValue(null);
      await expect(service.removeContact('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addAddress', () => {
    it('should add an address to customer', async () => {
      repo.findOne.mockResolvedValue(mockCustomer);
      addressRepo.update.mockResolvedValue({} as any);
      addressRepo.create.mockReturnValue(mockAddress);
      addressRepo.save.mockResolvedValue(mockAddress);

      const result = await service.addAddress('cust-001', { addressType: 'SHIPPING', addressLine1: '123 Main St', city: 'Karachi' } as any, 'user-001');
      expect(result).toEqual(mockAddress);
    });

    it('should unset other default addresses when adding default', async () => {
      repo.findOne.mockResolvedValue(mockCustomer);
      addressRepo.update.mockResolvedValue({} as any);
      addressRepo.create.mockReturnValue(mockAddress);
      addressRepo.save.mockResolvedValue(mockAddress);

      await service.addAddress('cust-001', { addressType: 'SHIPPING', addressLine1: '123 Main St', city: 'Karachi', isDefault: true } as any, 'user-001');
      expect(addressRepo.update).toHaveBeenCalledWith(
        { customerId: 'cust-001', isDefault: true },
        { isDefault: false },
      );
    });
  });

  describe('updateAddress', () => {
    it('should update an address', async () => {
      addressRepo.findOne.mockResolvedValue(mockAddress);
      addressRepo.update.mockResolvedValue({} as any);
      addressRepo.save.mockResolvedValue({ ...mockAddress, city: 'Lahore' });

      const result = await service.updateAddress('addr-001', { city: 'Lahore' } as any, 'user-001');
      expect(result.city).toBe('Lahore');
    });

    it('should throw NotFoundException if not found', async () => {
      addressRepo.findOne.mockResolvedValue(null);
      await expect(service.updateAddress('non-existent', { city: 'Lahore' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeAddress', () => {
    it('should remove an address', async () => {
      addressRepo.findOne.mockResolvedValue(mockAddress);
      addressRepo.remove.mockResolvedValue(mockAddress);

      await service.removeAddress('addr-001');
      expect(addressRepo.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException if not found', async () => {
      addressRepo.findOne.mockResolvedValue(null);
      await expect(service.removeAddress('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});