import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SalesQuotationController } from './sales-quotation.controller';
import { SalesOrderController } from './sales-order.controller';
import { CreateSalesQuotationDto, CreateSalesQuotationItemDto } from '../dto';
import { CreateSalesOrderDto, CreateSalesOrderItemDto } from '../dto';

const COMPANY = '3f2a1b4c-5d6e-4f8a-9b0c-1d2e3f4a5b6c';
const CUSTOMER = '5b2c3d4e-5f6a-4b8c-9d0e-1f2a3b4c5d6e';
const ITEM = '6c3d4e5f-6a7b-4c9d-8e0f-2a3b4c5d6e7f';
const UOM = '4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('Sales create-DTO companyId contract (TASK #18)', () => {
  it('CreateSalesQuotationDto validates WITHOUT a client-supplied companyId (server derives it)', async () => {
    const dto = plainToInstance(CreateSalesQuotationDto, {
      customerId: CUSTOMER,
      items: [{ itemId: ITEM, quantity: 2, uomId: UOM, unitPrice: 50 }],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed (non-UUID) companyId when one is supplied', async () => {
    const dto = plainToInstance(CreateSalesQuotationDto, {
      companyId: 'not-a-uuid',
      customerId: CUSTOMER,
      items: [],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'companyId')).toBe(true);
  });

  it('rejects a full quotation item that omits the required uomId', async () => {
    const dto = plainToInstance(CreateSalesQuotationDto, {
      customerId: CUSTOMER,
      items: [{ itemId: ITEM, quantity: 2, unitPrice: 50 }],
    });
    const errors = await validate(dto);
    const itemErrors = errors.find((e) => e.property === 'items')?.children || [];
    const uomError = itemErrors.find(
      (e) => e.property === '0' && (e.children || []).some((c) => c.property === 'uomId'),
    );
    expect(uomError).toBeDefined();
  });

  it('rejects a line-item uomId that is a UOM CODE string, not a UUID (proves the old ERPLineItems bug)', async () => {
    const itemDto = plainToInstance(CreateSalesQuotationItemDto, {
      itemId: ITEM,
      quantity: 2,
      uomId: 'KG',
      unitPrice: 50,
    });
    const errors = await validate(itemDto);
    expect(errors.some((e) => e.property === 'uomId')).toBe(true);
  });

  it('CreateSalesOrderDto validates WITHOUT companyId and with a valid UUID uomId', async () => {
    const dto = plainToInstance(CreateSalesOrderDto, {
      customerId: CUSTOMER,
      items: [{ itemId: ITEM, quantity: 1, uomId: UOM, unitPrice: 100 }],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('CreateSalesOrderItemDto rejects a missing uomId (the pre-fix frontend omission)', async () => {
    const itemDto = plainToInstance(CreateSalesOrderItemDto, {
      itemId: ITEM,
      quantity: 1,
      unitPrice: 100,
    });
    const errors = await validate(itemDto);
    expect(errors.some((e) => e.property === 'uomId')).toBe(true);
  });
});

describe('Sales controller server-side company derivation (TASK #18)', () => {
  it('SalesQuotationController.create overrides any client companyId with the JWT default company', async () => {
    const service = { create: jest.fn().mockResolvedValue({ id: 'q-1' }) };
    const controller = new SalesQuotationController(service as any);
    const req = {
      user: { id: 'user-1' },
      erpUser: { defaultCompanyId: COMPANY },
    };
    // Rogue client-supplied companyId must be ignored / overwritten server-side.
    const dto: any = { companyId: '9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f', customerId: CUSTOMER, items: [] };

    await controller.create(req, dto);

    expect(service.create).toHaveBeenCalledTimes(1);
    const arg = (service.create as jest.Mock).mock.calls[0][0];
    expect(arg.companyId).toBe(COMPANY);
  });

  it('SalesOrderController.create sets the JWT default company when the body omits companyId', async () => {
    const service = { create: jest.fn().mockResolvedValue({ id: 'o-1' }) };
    const controller = new SalesOrderController(service as any);
    const req = {
      user: { id: 'user-1' },
      erpUser: { defaultCompanyId: COMPANY },
    };
    const dto: any = { customerId: CUSTOMER, items: [] };

    await controller.create(req, dto);

    const arg = (service.create as jest.Mock).mock.calls[0][0];
    expect(arg.companyId).toBe(COMPANY);
  });
});
