const { DataSource } = require('typeorm');

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'pwi_erp',
});

async function run() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const delivery = await AppDataSource.query(`SELECT id, "deliveryNumber", status, "companyId", "warehouseId", "salesOrderId" FROM sales_deliveries WHERE "deliveryNumber" = 'DN-2026-00001'`);
  console.log('Delivery:', delivery);

  if (delivery.length > 0) {
    const lines = await AppDataSource.query(`SELECT * FROM sales_delivery_lines WHERE "deliveryId" = $1`, [delivery[0].id]);
    console.log('Delivery Lines:', lines);
  }

  await AppDataSource.destroy();
}

run().catch(console.error);
