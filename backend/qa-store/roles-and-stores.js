const { db } = require('./helper');

async function main() {
  const c = await db();
  try {
    const q = await c.query(
      `SELECT r.role_code, p.permission_code
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.status = 'ACTIVE' AND rp.is_active = true
          AND p.permission_code LIKE 'store.%'
        ORDER BY r.role_code, p.permission_code`
    );
    const m = {};
    for (const x of q.rows) {
      (m[x.role_code] = m[x.role_code] || []).push(x.permission_code);
    }
    for (const k of Object.keys(m).sort()) {
      console.log(k + ' [' + m[k].length + ']:');
      console.log('   ' + m[k].join(', '));
    }

    const stores = await c.query('SELECT id, name, store_code, company_id, is_active FROM stores ORDER BY name');
    console.log('\n=== STORES ===');
    for (const s of stores.rows) console.log('  ' + JSON.stringify(s));

    const items = await c.query('SELECT id, item_id, store_id, current_quantity, min_threshold, max_threshold FROM store_items ORDER BY store_id');
    console.log('\n=== STORE_ITEMS ===');
    for (const s of items.rows) console.log('  ' + JSON.stringify(s));
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });