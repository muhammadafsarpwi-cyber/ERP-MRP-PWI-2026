import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerContact, CustomerAddress } from '../entities';
import { CreateCustomerDto, CreateCustomerContactDto, CreateCustomerAddressDto, CustomerFilterDto } from '../dto';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    @InjectRepository(CustomerContact)
    private readonly contactRepo: Repository<CustomerContact>,
    @InjectRepository(CustomerAddress)
    private readonly addressRepo: Repository<CustomerAddress>,
  ) {}

  async create(dto: CreateCustomerDto, userId?: string): Promise<Customer> {
    const existing = await this.repo.findOne({
      where: { customerCode: dto.customerCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Customer code '${dto.customerCode}' already exists in this company`);
    }
    const customer = this.repo.create({
      ...dto,
      status: 'ACTIVE',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.repo.save(customer);
  }

  async findAll(filter: CustomerFilterDto): Promise<{ data: Customer[]; total: number }> {
    const { page = 1, limit = 20, companyId, status, search, customerType, customerTier, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('c');
    let hasWhere = false;
    if (companyId) { qb.where('c.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('c.status = :status', { status }); hasWhere = true; }
    if (customerType) { qb[hasWhere ? 'andWhere' : 'where']('c.customerType = :customerType', { customerType }); hasWhere = true; }
    if (customerTier) { qb[hasWhere ? 'andWhere' : 'where']('c.customerTier = :customerTier', { customerTier }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(c.name ILIKE :search OR c.customerCode ILIKE :search OR c.contactPerson ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'customerCode', 'name', 'status', 'customerType', 'customerTier', 'totalRevenue'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`c.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.repo.findOne({
      where: { id },
      relations: ['contacts', 'addresses'],
    });
    if (!customer) throw new NotFoundException(`Customer with ID '${id}' not found`);
    return customer;
  }

  async update(id: string, dto: Partial<CreateCustomerDto>, userId?: string): Promise<Customer> {
    const customer = await this.findOne(id);
    Object.assign(customer, dto, { updatedBy: userId || null });
    return this.repo.save(customer);
  }

  async remove(id: string): Promise<void> {
    const customer = await this.findOne(id);
    customer.status = 'INACTIVE';
    await this.repo.save(customer);
  }

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