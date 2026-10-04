const { Client } = require('../backend/node_modules/pg');

async function check() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });
  await client.connect();

  const lines = await client.query(`
    SELECT bl.id, bl.bom_id, bl.item_id, i.item_code, i.name
    FROM bom_lines bl
    LEFT JOIN items i ON bl.item_id = i.id
    JOIN bill_of_materials b ON bl.bom_id = b.id
    WHERE b.bom_code = 'BOM-008'
  `);
  console.log('BOM-008 lines item_ids:');
  console.table(lines.rows);

  await client.end();
}

check().catch(console.error);
