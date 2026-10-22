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

  const dns = await client.query(`
    SELECT sd.id, sd.delivery_number, sd.delivery_date, sd.company_id, sd.warehouse_id,
           c.company_name, c.customer_code
    FROM erp_sales.sales_deliveries sd
    LEFT JOIN erp_sales.customers c ON c.id = sd.customer_id
    WHERE sd.status = 'DELIVERED'
    ORDER BY sd.delivery_date ASC, sd.created_at ASC
  `);

  console.log(`Starting confirmation for ${dns.rows.length} DELIVERED delivery notes...`);

  let totalLinesPosted = 0;

  for (const dn of dns.rows) {
    const lines = await client.query(`
      SELECT sdl.*, i.item_code, i.name as item_name, i.base_uom_id,
             bu.code as base_uom_code, u.code as line_uom_code
      FROM erp_sales.sales_delivery_lines sdl
      JOIN public.items i ON i.id = sdl.item_id
      LEFT JOIN public.uoms bu ON bu.id = i.base_uom_id
      LEFT JOIN public.uoms u ON u.id = sdl.uom_id
      WHERE sdl.delivery_id = $1
    `, [dn.id]);

    for (const line of lines.rows) {
      const rawQty = Number(line.quantity || 0);
      const lineUom = (line.line_uom_code || 'GRS').toUpperCase();
      const baseUom = (line.base_uom_code || 'PCS').toUpperCase();
      const baseUomId = line.base_uom_id || line.uom_id;

      let baseQty = rawQty;
      if (lineUom === 'GRS' && baseUom === 'PCS') {
        baseQty = rawQty * 144;
      } else if (lineUom === 'CTN' && baseUom === 'PCS') {
        baseQty = rawQty * 10 * 144;
      } else if (lineUom === 'PCS' && baseUom === 'GRS') {
        baseQty = rawQty / 144;
      }

      const txDate = dn.delivery_date ? new Date(dn.delivery_date) : new Date();
      const custName = (dn.company_name || '').trim();
      const notes = `Sales delivery to ${custName} (${dn.delivery_number}): ${rawQty} ${lineUom} = ${baseQty} ${baseUom}`;

      // Insert stock_ledger record
      await client.query(`
        INSERT INTO public.stock_ledger (
          company_id, transaction_type, transaction_date, item_id, warehouse_id,
          quantity, uom_id, direction, reference_type, reference_id, reference_number, notes
        ) VALUES (
          $1, 'SALES_DELIVERY', $2, $3, $4,
          $5, $6, 'OUT', 'SALES_DELIVERY', $7, $8, $9
        )
      `, [
        dn.company_id,
        txDate,
        line.item_id,
        line.warehouse_id || dn.warehouse_id,
        baseQty,
        baseUomId,
        dn.id,
        dn.delivery_number,
        notes,
      ]);

      totalLinesPosted++;
    }

    // Set delivery status to CONFIRMED
    await client.query(`
      UPDATE erp_sales.sales_deliveries
      SET status = 'CONFIRMED', updated_at = NOW()
      WHERE id = $1
    `, [dn.id]);

    console.log(`✓ Confirmed ${dn.delivery_number} (${dn.delivery_date.toISOString().substring(0,10)}) to ${dn.company_name} [${lines.rows.length} lines]`);
  }

  console.log(`\nSuccessfully posted ${totalLinesPosted} lines across ${dns.rows.length} delivery notes!`);

  // Recalculate inventory_balances for all finished goods in SPI FG Dispatch Warehouse
  console.log('\nRecalculating inventory_balances from complete stock_ledger...');
  const fgWarehouseId = '2f6aabde-69c1-4068-a0ea-b0fe1b8fb0b5';

  const balancesRes = await client.query(`
    SELECT sl.item_id, sl.warehouse_id, i.base_uom_id,
           SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE -sl.quantity END) as net_balance
    FROM public.stock_ledger sl
    JOIN public.items i ON i.id = sl.item_id
    WHERE sl.warehouse_id = $1
    GROUP BY sl.item_id, sl.warehouse_id, i.base_uom_id
  `, [fgWarehouseId]);

  for (const b of balancesRes.rows) {
    const netBal = Number(b.net_balance || 0);
    await client.query(`
      INSERT INTO public.inventory_balances (
        company_id, item_id, warehouse_id, uom_id, on_hand, available, reserved, allocated
      ) VALUES (
        '7725aa04-a270-4314-9e82-90949cbe7791', $1, $2, $3, $4, $4, 0, 0
      )
      ON CONFLICT (company_id, item_id, warehouse_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
      DO UPDATE SET
        on_hand = $4,
        available = $4,
        updated_at = NOW()
    `, [b.item_id, b.warehouse_id, b.base_uom_id, netBal]);
  }

  console.log(`Recalculated ${balancesRes.rows.length} item balances in SPI FG Dispatch Warehouse.`);

  await client.end();
}

main().catch(console.error);
