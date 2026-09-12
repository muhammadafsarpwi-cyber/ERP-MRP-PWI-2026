import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateRoutingDto } from './src/modules/production-routing/dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function run(label: string, payload: any) {
  try {
    const res = await pipe.transform(payload, { type: 'body', metatype: CreateRoutingDto });
    console.log(`PASS [${label}] ->`, JSON.stringify({ routeTypeId: res.routeTypeId, ops: res.operations?.length }));
  } catch (err: any) {
    console.log(`FAIL [${label}] ->`, err.response?.message ?? err.message);
  }
}

async function main() {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await run('with routeTypeId', {
    name: 'TEST RTG',
    productId: uuid(1),
    routeTypeId: uuid(2),
    baseQuantity: 1,
    operations: [
      {
        sequenceNo: 10,
        operationCode: 'OP10',
        operationName: 'Flattening',
        inputs: [{ itemId: uuid(3), quantity: 100, uomId: uuid(9), isPrimary: true }],
        outputs: [{ itemId: uuid(4), quantity: 95, uomId: uuid(9), isPrimary: true }],
      },
    ],
  });
  await run('with routeTypeId null', {
    name: 'TEST RTG',
    productId: uuid(1),
    routeTypeId: null,
  });
  await run('without routeTypeId', {
    name: 'TEST RTG',
    productId: uuid(1),
  });
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});