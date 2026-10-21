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
  const routings = await c.query(`
    SELECT r.id, r.routing_code, r.name, r.product_id, r.status, i.item_code, i.name as product_name
    FROM public.production_routings r
    LEFT JOIN public.items i ON r.product_id = i.id
    ORDER BY r.routing_code
  `);
  console.log('ALL PRODUCTION ROUTINGS:');
  console.table(routings.rows);

  const items = await c.query(`
    SELECT id, item_code, name, item_type
    FROM public.items
    WHERE item_code IN ('SPI-FG-SPK-002', 'SPI-FG-SPK-006', 'WIP-ST-001')
       OR item_code ILIKE '%SPK-002%' OR item_code ILIKE '%SPK-006%' OR item_code ILIKE '%WIP-ST-001%'
  `);
  console.log('RELEVANT ITEMS:');
  console.table(items.rows);

  await c.end();
}

main().catch(console.error);
