const { Client } = require('../backend/node_modules/pg');

async function run() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });
  await client.connect();

  const fg = await client.query("SELECT id, item_code, name, production_in_item_id FROM items WHERE item_code = 'SPI-FG-SPK-002'");
  console.log('FG:', fg.rows[0]);
  const fgId = fg.rows[0].id;

  const bom = await client.query("SELECT id, bom_number, item_id, is_active FROM boms WHERE item_id = $1", [fgId]);
  console.log('BOMs:', bom.rows);

  if (bom.rows.length > 0) {
    const lines = await client.query(`
      SELECT bl.id, bl.item_id, i.item_code, i.name, bl.quantity, bl.uom_id, u.code as uom_code
      FROM bom_lines bl
      JOIN items i ON i.id = bl.item_id
      LEFT JOIN uoms u ON u.id = bl.uom_id
      WHERE bl.bom_id = $1
    `, [bom.rows[0].id]);
    console.log('BOM Lines:');
    console.table(lines.rows);

    for (const l of lines.rows) {
      const inv = await client.query(`
        SELECT ib.warehouse_id, w.code as wh_code, w.name as wh_name, ib.available_quantity, ib.on_hand_quantity
        FROM inventory_balances ib
        JOIN warehouses w ON w.id = ib.warehouse_id
        WHERE ib.item_id = $1
      `, [l.item_id]);
      console.log('Inventory for ' + l.item_code + ' (' + l.name + '):');
      console.table(inv.rows);
    }
  }

  // Also check item 'SPI-FG-NP-001'
  const np = await client.query("SELECT id, item_code, name FROM items WHERE item_code LIKE '%NP%'");
  console.log('Nipple items:');
  console.table(np.rows);

  // Check inventory of SPI-FG-NP-001 specifically
  const np1 = await client.query("SELECT id, item_code, name FROM items WHERE item_code = 'SPI-FG-NP-001'");
  if (np1.rows.length > 0) {
    const invNp = await client.query(`
      SELECT ib.warehouse_id, w.code as wh_code, w.name as wh_name, ib.available_quantity, ib.on_hand_quantity
      FROM inventory_balances ib
      JOIN warehouses w ON w.id = ib.warehouse_id
      WHERE ib.item_id = $1
    `, [np1.rows[0].id]);
    console.log('Inventory for SPI-FG-NP-001:');
    console.table(invNp.rows);
  }

  await client.end();
}

run().catch(console.error);
