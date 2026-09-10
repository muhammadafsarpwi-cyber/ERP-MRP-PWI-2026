const { db } = require('./helper');

async function main() {
  const c = await db();
  try {
    for (const t of ['goods_receipts', 'goods_receipt_lines', 'material_request_lines', 'material_issue_lines', 'material_return_lines', 'stock_ledger']) {
      const q = await c.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]
      );
      console.log(t + ': ' + q.rows.map((x) => x.column_name).join(', '));
    }
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });