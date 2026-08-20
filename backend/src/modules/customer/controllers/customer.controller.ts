import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerService } from '../services/customer.service';
import { CreateCustomerDto, CreateCustomerContactDto, CreateCustomerAddressDto } from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('customer/customers')
@Controller('customer/customers')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.create')
  @ApiOperation({ summary: 'Create a customer' })
  async create(@Body() dto: CreateCustomerDto) {
    const customer = await this.customerService.create(dto);
    return { success: true, data: customer, message: 'Customer created successfully' };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'List customers' })
  async findAll(
    @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string,
    @Query('companyId') companyId?: string, @Query('status') status?: string,
    @Query('customerType') customerType?: string, @Query('customerTier') customerTier?: string,
    @Query('sortField') sortField?: string, @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.customerService.findAll({
      page: Number(page) || 1, limit: Number(limit) || 20, search, companyId, status,
      customerType, customerTier, sortField, sortOrder,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.view')
  @ApiOperation({ summary: 'Get customer by ID' })
  async findOne(@Param('id') id: string) {
    const customer = await this.customerService.findOne(id);
    return { success: true, data: customer };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.update')
  @ApiOperation({ summary: 'Update customer' })
  async update(@Param('id') id: string, @Body() dto: Partial<CreateCustomerDto>) {
    const customer = await this.customerService.update(id, dto);
    return { success: true, data: customer, message: 'Customer updated successfully' };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.customer.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete customer' })
  async remove(@Param('id') id: string) {
    await this.customerService.remove(id);
    return { success: true, message: 'Customer deleted successfully' };
  }

  @Post(':id/contacts')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.contact.create')
  @ApiOperation({ summary: 'Add contact to customer' })
  async addContact(@Param('id') id: string, @Body() dto: CreateCustomerContactDto) {
    const contact = await this.customerService.addContact(id, dto);
    return { success: true, data: contact, message: 'Contact added successfully' };
  }

  @Patch(':id/contacts/:contactId')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.contact.update')
  @ApiOperation({ summary: 'Update customer contact' })
  async updateContact(@Param('contactId') contactId: string, @Body() dto: Partial<CreateCustomerContactDto>) {
    const contact = await this.customerService.updateContact(contactId, dto);
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

  @Post(':id/addresses')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.address.create')
  @ApiOperation({ summary: 'Add address to customer' })
  async addAddress(@Param('id') id: string, @Body() dto: CreateCustomerAddressDto) {
    const address = await this.customerService.addAddress(id, dto);
    return { success: true, data: address, message: 'Address added successfully' };
  }

  @Patch(':id/addresses/:addressId')
  @UseGuards(PermissionGuard)
  @RequirePermission('customer.address.update')
  @ApiOperation({ summary: 'Update customer address' })
  async updateAddress(@Param('addressId') addressId: string, @Body() dto: Partial<CreateCustomerAddressDto>) {
    const address = await this.customerService.updateAddress(addressId, dto);
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