const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();
  const items = await c.query(`
    SELECT id, item_code, name, item_type, is_manufacturable, production_in_item_id, category_id, division_id
    FROM public.items
    WHERE item_code IN ('SPI-FG-SPK-002', 'SPI-FG-SPK-006')
  `);
  console.table(items.rows);

  const boms = await c.query(`SELECT id, bom_code, name, product_id, status FROM public.bill_of_materials`);
  console.log('ALL BOMS:');
  console.table(boms.rows);

  await c.end();
}

main().catch(console.error);
