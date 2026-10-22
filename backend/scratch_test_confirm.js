const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { SalesDeliveryService } = require('./dist/modules/sales/services/sales-delivery.service');

async function testConfirm() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(SalesDeliveryService);
  const deliveryId = '7c55f82f-475d-4b62-9eae-fc8691d798ec';
  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
  try {
    console.log('Testing confirm on DN-2026-00016...');
    const result = await service.confirm(deliveryId, 'test-user', companyId);
    console.log('Confirm result status:', result.status);
  } catch (e) {
    console.error('ERROR during confirm test:', e);
  } finally {
    await app.close();
  }
}
testConfirm();
