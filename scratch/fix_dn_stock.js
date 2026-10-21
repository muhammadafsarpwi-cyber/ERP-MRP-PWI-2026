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

  const pcsUomRes = await c.query("SELECT id FROM public.uoms WHERE code = 'PCS'");
  const pcsUomId = pcsUomRes.rows[0].id;

  // 1. Update stock_ledger for DN-2026-00002
  await c.query(`
    UPDATE public.stock_ledger
    SET quantity = 28800.0000,
        uom_id = $1,
        notes = 'Sales delivery DN-2026-00002 confirmed (200 GRS = 28,800 PCS)'
    WHERE reference_number = 'DN-2026-00002' AND reference_type = 'SALES_DELIVERY'
  `, [pcsUomId]);
  console.log('Updated stock_ledger for DN-2026-00002');

  // 2. Update inventory_balances for the two batches
  await c.query(`
    UPDATE public.inventory_balances
    SET on_hand = 0, available = 0
    WHERE id IN ('330e1dc6-19e3-477d-ad4f-26687d0025b5', '6592f320-d34c-4052-89d2-8b24017e710d')
  `);
  console.log('Updated inventory_balances to 0');

  // Verify
  const sl = await c.query(`
    SELECT sl.id, sl.reference_type, sl.reference_number, sl.direction, sl.quantity, u.code as uom,
           i.item_code, w.warehouse_code, sl.notes
    FROM public.stock_ledger sl
    LEFT JOIN public.uoms u ON sl.uom_id = u.id
    LEFT JOIN public.items i ON sl.item_id = i.id
    LEFT JOIN public.warehouses w ON sl.warehouse_id = w.id
    WHERE sl.reference_number = 'DN-2026-00002'
  `);
  console.table(sl.rows);

  const ib = await c.query(`
    SELECT ib.id, ib.on_hand, ib.available, u.code as uom, i.item_code, w.warehouse_code
    FROM public.inventory_balances ib
    LEFT JOIN public.uoms u ON ib.uom_id = u.id
    LEFT JOIN public.items i ON ib.item_id = i.id
    LEFT JOIN public.warehouses w ON ib.warehouse_id = w.id
    WHERE ib.id IN ('330e1dc6-19e3-477d-ad4f-26687d0025b5', '6592f320-d34c-4052-89d2-8b24017e710d')
  `);
  console.table(ib.rows);

  await c.end();
}

main().catch(console.error);
