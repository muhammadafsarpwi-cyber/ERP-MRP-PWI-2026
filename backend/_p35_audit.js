const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '.env') });
const c = new Client({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000,
});
async function main() {
  await c.connect();
  console.log('=== departments ===');
  let r = await c.query(`SELECT id, department_code, name FROM departments ORDER BY name LIMIT 40`);
  console.table(r.rows.map(x => ({ code: x.department_code, name: x.name })));

  console.log('=== operations ===');
  r = await c.query(`SELECT id, operation_code, operation_name, department_id, status FROM operations ORDER BY operation_name LIMIT 40`);
  console.table(r.rows.map(x => ({ code: x.operation_code, name: x.operation_name, dept: x.department_id, st: x.status })));

  console.log('=== items with production chain (non-null production_in_item_id) ===');
  r = await c.query(`
    SELECT i.id, i.item_code, i.name, i.item_type, i.production_in_item_id, pi.item_code AS input_code,
           i.wire_size_mm, i.diameter_mm, i.thickness_mm, i.width_mm, i.department_id, d.name AS dept_name
    FROM items i
    LEFT JOIN items pi ON pi.id = i.production_in_item_id
    LEFT JOIN departments d ON d.id = i.department_id
    WHERE i.production_in_item_id IS NOT NULL
    ORDER BY i.item_code LIMIT 60`);
  console.table(r.rows.map(x => ({ code: x.item_code, type: x.item_type, input: x.input_code, wire: x.wire_size_mm, dia: x.diameter_mm, thk: x.thickness_mm, wid: x.width_mm, dept: x.dept_name })));

  console.log('=== root raw materials ===');
  r = await c.query(`
    SELECT i.id, i.item_code, i.name, i.wire_size_mm, i.diameter_mm, i.thickness_mm, i.width_mm, d.name AS dept_name
    FROM items i LEFT JOIN departments d ON d.id = i.department_id
    WHERE (i.production_in_item_id IS NULL) AND i.item_type = 'RAW_MATERIAL' AND i.is_active = true
    ORDER BY i.item_code LIMIT 30`);
  console.table(r.rows.map(x => ({ code: x.item_code, wire: x.wire_size_mm, dia: x.diameter_mm, thk: x.thickness_mm, wid: x.width_mm, dept: x.dept_name })));

  console.log('=== routing tables ===');
  r = await c.query(`SELECT count(*) AS cnt FROM production_routings`);
  console.log('production_routings:', r.rows[0].cnt);
  r = await c.query(`SELECT count(*) AS cnt FROM routing_operations`);
  console.log('routing_operations:', r.rows[0].cnt);

  console.log('=== sample items ===');
  r = await c.query(`SELECT item_code, name, item_type, wire_size_mm, thickness_mm, width_mm, diameter_mm FROM items WHERE is_active = true ORDER BY item_code LIMIT 20`);
  console.table(r.rows);
  c.end();
}
main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });