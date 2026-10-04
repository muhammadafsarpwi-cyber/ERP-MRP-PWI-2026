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

  const productRes = await client.query("SELECT * FROM items WHERE item_code = 'SPI-FG-SPK-002'");
  const product = productRes.rows[0];

  const bomRes = await client.query("SELECT * FROM bill_of_materials WHERE product_id = $1 AND status = 'ACTIVE'", [product.id]);
  const bom = bomRes.rows[0];

  const linesRes = await client.query("SELECT * FROM bom_lines WHERE bom_id = $1", [bom.id]);
  const lines = linesRes.rows;

  const convsRes = await client.query("SELECT * FROM uom_conversions");
  const convs = convsRes.rows;

  function convertQty(fromUomId, toUomId, qty) {
    if (!fromUomId || fromUomId === toUomId) return qty;
    let conv = convs.find(c => c.from_uom_id === fromUomId && c.to_uom_id === toUomId);
    if (conv) return qty * Number(conv.conversion_factor);
    conv = convs.find(c => c.from_uom_id === toUomId && c.to_uom_id === fromUomId);
    if (conv && Number(conv.conversion_factor) !== 0) return qty / Number(conv.conversion_factor);
    throw new Error(`No conv between ${fromUomId} and ${toUomId}`);
  }

  // Simulate output from frontend:
  // output = { itemId: product.id, uomId: PCS_UUID, actualQuantity: 1440 }
  const PCS_ID = 'b932052f-141f-4d78-9baf-7025e5302442';
  const goodQty = 1440;
  const outputUomId = PCS_ID;

  const productBaseUomId = product.base_uom_id || outputUomId;
  console.log('product.base_uom_id:', productBaseUomId);

  const qtyInBase = outputUomId === productBaseUomId ? goodQty : convertQty(outputUomId, productBaseUomId, goodQty);
  console.log('qtyInBase:', qtyInBase);

  const units = qtyInBase / Number(bom.base_quantity || 1);
  console.log('units:', units);

  for (const line of lines) {
    const compRes = await client.query("SELECT * FROM items WHERE id = $1", [line.item_id]);
    const comp = compRes.rows[0];
    let req = units * Number(line.quantity);
    if (comp.base_uom_id && comp.base_uom_id !== line.uom_id) {
      req = convertQty(line.uom_id, comp.base_uom_id, req);
    }
    console.log(`Line ${comp.item_code}: req = ${req}`);
  }

  // Authoritative IN item check (line 1987)
  const authInId = product.production_in_item_id;
  console.log('authoritativeInItemId:', authInId);
  const isInRequirements = lines.some(l => l.item_id === authInId);
  console.log('Is authIn in lines?', isInRequirements);
  if (authInId && !isInRequirements) {
    const compRes = await client.query("SELECT * FROM items WHERE id = $1", [authInId]);
    const comp = compRes.rows[0];
    // Line 1997: convertProductQtyToComponentUom(product, comp, units)
    console.log('Checking fallback authIn requirement for', comp.item_code);
  }

  await client.end();
}
run().catch(console.error);
