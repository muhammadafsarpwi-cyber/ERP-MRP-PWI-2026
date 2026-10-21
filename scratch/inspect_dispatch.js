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
  const balances = await c.query(`
    SELECT ib.id, ib.location_id, ib.batch_id, ib.on_hand, ib.available, u.code as uom, i.item_code, w.warehouse_code
    FROM public.inventory_balances ib
    LEFT JOIN public.uoms u ON ib.uom_id = u.id
    LEFT JOIN public.items i ON ib.item_id = i.id
    LEFT JOIN public.warehouses w ON ib.warehouse_id = w.id
    WHERE w.warehouse_code = 'SPI-FGDW-001' AND (i.item_code = 'SPI-FG-SPK-002' OR i.item_code = 'SPI-FG-SPK-003')
  `);
  console.log('ALL BALANCES FOR SPK-002 & 003:');
  console.table(balances.rows);
  await c.end();
}

main().catch(console.error);
