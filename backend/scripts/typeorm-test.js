const { DataSource } = require('typeorm');

const ds = new DataSource({
  type: 'postgres',
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  username: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  schema: 'public',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
  logging: true,
  entities: [__dirname + '/../dist/modules/**/*.entity{.ts,.js}'],
});

(async () => {
  await ds.initialize();
  console.log('Data source initialized');

  const itemRepo = ds.getRepository('Item');

  // Test 1: Simple find
  console.log('\n=== TEST 1: itemRepo.find() with limit 5 ===');
  const items = await itemRepo.find({ take: 5 });
  console.log('Result count:', items.length);
  if (items.length > 0) console.log('First:', items[0].itemCode, items[0].name);

  // Test 2: Count
  console.log('\n=== TEST 2: itemRepo.count() ===');
  const count = await itemRepo.count();
  console.log('Count:', count);

  // Test 3: Query builder (what findAll does)
  console.log('\n=== TEST 3: createQueryBuilder (findAll logic) ===');
  const qb = itemRepo.createQueryBuilder('item')
    .leftJoinAndSelect('item.category', 'category')
    .leftJoinAndSelect('item.baseUom', 'baseUom')
    .leftJoinAndSelect('item.company', 'company')
    .leftJoinAndSelect('item.division', 'division')
    .leftJoinAndSelect('item.section', 'section')
    .leftJoinAndSelect('item.department', 'department')
    .orderBy('item.itemCode', 'ASC')
    .take(20);
  const [data, total] = await qb.getManyAndCount();
  console.log('Total:', total);
  console.log('Data count:', data.length);
  if (data.length > 0) console.log('First:', data[0].itemCode, data[0].name);

  // Test 4: Raw query through TypeORM
  console.log('\n=== TEST 4: Raw query through TypeORM ===');
  const raw = await ds.query('SELECT COUNT(*)::int AS cnt FROM items');
  console.log('Raw count:', raw[0].cnt);

  await ds.destroy();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); process.exit(1); });
