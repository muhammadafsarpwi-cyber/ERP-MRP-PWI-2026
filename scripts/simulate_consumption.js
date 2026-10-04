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

  const product = (await client.query("SELECT * FROM items WHERE item_code = 'SPI-FG-SPK-002'")).rows[0];
  const bom = (await client.query("SELECT * FROM bill_of_materials WHERE product_id = $1 AND status = 'ACTIVE'", [product.id])).rows[0];
  const lines = (await client.query("SELECT * FROM bom_lines WHERE bom_id = $1", [bom.id])).rows;
  const convs = (await client.query("SELECT * FROM uom_conversions")).rows;
  const uoms = (await client.query("SELECT * FROM uoms")).rows;

  function convertQty(fromUomId, toUomId, qty) {
    if (!fromUomId || fromUomId === toUomId) return qty;
    let conv = convs.find(c => c.from_uom_id === fromUomId && c.to_uom_id === toUomId);
    if (conv) return qty * Number(conv.conversion_factor);
    conv = convs.find(c => c.from_uom_id === toUomId && c.to_uom_id === fromUomId);
    if (conv && Number(conv.conversion_factor) !== 0) return qty / Number(conv.conversion_factor);
    throw new Error(`No conv between ${fromUomId} and ${toUomId}`);
  }

  // The payload sent:
  // output = { itemId: product.id, uomId: PCS_UUID, actualQuantity: 1440, scrapQuantity: 0 }
  const PCS_ID = uoms.find(u => u.code === 'PCS').id;
  const output = { itemId: product.id, uomId: PCS_ID, actualQuantity: 1440, scrapQuantity: 0 };
  const companyId = product.company_id;

  const PL_WH = 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b';
  const WH_002 = 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d';

  const compWarehouseMap = new Map([
    ['e72d30e1-e0da-447c-af1e-6a57d9aad0af', PL_WH],
    ['a7b4d433-e97c-4d11-bc26-75541f4f1593', PL_WH],
    ['43cec585-2413-4374-a77d-fc4ed263276d', WH_002],
  ]);

  console.log('Testing computeBomRequirement for each line:');
  const requirements = [];
  const productionQty = 1440;

  for (const line of lines) {
    const productBaseUomId = product.base_uom_id || output.uomId;
    const goodQty = 1440;
    const qtyInBase = output.uomId === productBaseUomId ? goodQty : convertQty(output.uomId, productBaseUomId, goodQty);
    const units = qtyInBase / Number(bom.base_quantity || 1);

    const comp = (await client.query("SELECT * FROM items WHERE id = $1", [line.item_id])).rows[0];
    const compUom = uoms.find(u => u.id === comp.base_uom_id)?.code || '';

    let req = units * Number(line.quantity);
    if (comp.base_uom_id && comp.base_uom_id !== line.uom_id) {
      req = convertQty(line.uom_id, comp.base_uom_id, req);
    }
    const effectiveWh = compWarehouseMap.get(line.item_id);

    const bal = await client.query(
      "SELECT available FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2",
      [line.item_id, effectiveWh]
    );
    const avail = Number(bal.rows[0]?.available || 0);

    console.log({
      item: comp.item_code,
      req,
      compUom,
      avail,
      effectiveWh
    });
    requirements.push({ item: comp.item_code, req, avail });
  }

  // Authoritative IN Item check (line 1987)
  const authoritativeInItemId = product.production_in_item_id;
  console.log('authoritativeInItemId:', authoritativeInItemId);
  if (authoritativeInItemId && !requirements.some(r => r.item === 'WIP-SPL-001')) {
    console.log('Authoritative IN Item WOULD BE ADDED!');
  } else {
    console.log('Authoritative IN Item ALREADY in requirements, skipping!');
  }

  // WAIT! What if lines in payload items were also processed?
  // Let's check outputs in postInventoryAndConsume:
  // outputs = buildProductionOutputs(entry, dto.items)
  console.log('Checking if outputs had duplicate items...');

  await client.end();
}
run().catch(console.error);
