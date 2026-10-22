const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
});

async function main() {
  await client.connect();

  console.log('Recalculating inventory_balances from complete stock_ledger...');
  const fgWarehouseId = '2f6aabde-69c1-4068-a0ea-b0fe1b8fb0b5';

  const balancesRes = await client.query(`
    SELECT sl.item_id, sl.warehouse_id, i.base_uom_id, i.item_code,
           SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE -sl.quantity END) as net_balance
    FROM public.stock_ledger sl
    JOIN public.items i ON i.id = sl.item_id
    WHERE sl.warehouse_id = $1
    GROUP BY sl.item_id, sl.warehouse_id, i.base_uom_id, i.item_code
  `, [fgWarehouseId]);

  for (const b of balancesRes.rows) {
    const netBal = Number(b.net_balance || 0);
    const existing = await client.query(`
      SELECT id FROM public.inventory_balances
      WHERE warehouse_id = $1 AND item_id = $2
    `, [b.warehouse_id, b.item_id]);

    if (existing.rows.length > 0) {
      await client.query(`
        UPDATE public.inventory_balances
        SET on_hand = $1, available = $1, updated_at = NOW()
        WHERE id = $2
      `, [netBal, existing.rows[0].id]);
    } else {
      await client.query(`
        INSERT INTO public.inventory_balances (
          company_id, item_id, warehouse_id, uom_id, on_hand, available, reserved
        ) VALUES (
          '7725aa04-a270-4314-9e82-90949cbe7791', $1, $2, $3, $4, $4, 0
        )
      `, [b.item_id, b.warehouse_id, b.base_uom_id, netBal]);
    }

    console.log(`✓ ${b.item_code}: on_hand = ${netBal} PCS (${netBal/144} GRS)`);
  }

  console.log('\nRecalculation complete!');
  await client.end();
}

main().catch(console.error);
