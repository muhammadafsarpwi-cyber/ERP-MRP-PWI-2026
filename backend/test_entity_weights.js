const { DataSource } = require('./node_modules/typeorm');
require('dotenv').config({ path: './.env' });
const { Item } = require('./dist/modules/item/entities/item.entity');

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
  entities: [Item],
  synchronize: false,
});

async function run() {
  await AppDataSource.initialize();
  const itemRepo = AppDataSource.getRepository(Item);
  const it = await itemRepo.createQueryBuilder('item')
    .where('item.itemCode = :code', { code: 'WIP-ST-001' })
    .getOne();

  console.log('Fetched WIP-ST-001:', {
    id: it.id,
    itemCode: it.itemCode,
    name: it.name,
    weightPerPiece: it.weightPerPiece,
    piecesPerKg: it.piecesPerKg,
  });

  await AppDataSource.destroy();
}
run().catch(console.error);
