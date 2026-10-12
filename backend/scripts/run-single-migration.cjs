/**
 * Run EXACTLY ONE migration — 1808000000000 LedgerWarehouseGuard — and nothing
 * else.
 *
 * Why not `npm run migration:run`: the migrations table is missing 1801000000000
 * through 1807000000000 (several of which already have their effects applied by
 * other means), so a blanket run would execute unrelated pending work against a
 * live database. This runner imports the single migration class by path and
 * drives its `up()`, then records only that row.
 *
 * Default is DRY RUN (prints the SQL it would execute, writes nothing).
 * Write mode:   node backend/scripts/run-single-migration.cjs apply=APPLY
 */
const path = require('path');
const fs = require('fs');

const APPLY = process.argv.includes('apply=APPLY');
const BACKEND = path.join('D:', 'ERP-MRP-PWI-2026', 'backend');

require(path.join(BACKEND, 'node_modules', 'ts-node')).register({
  transpileOnly: true,
  // The project tsconfig uses moduleResolution=node10, which the bundled
  // TypeScript now reports as a hard error. transpileOnly means nothing type
  // checks here anyway (tsc does that separately), so silence it rather than
  // reach for a second tsconfig.
  ignoreDiagnostics: ['5107'],
  compilerOptions: {
    module: 'commonjs',
    target: 'es2021',
    moduleResolution: 'node10',
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    ignoreDeprecations: '6.0',
  },
});

const dataSource = require(path.join(BACKEND, 'src', 'database', 'data-source.ts')).default;
const { LedgerWarehouseGuard1808000000000 } = require(
  path.join(BACKEND, 'src', 'database', 'migrations', '1808000000000-LedgerWarehouseGuard.ts'),
);

const NAME = 'LedgerWarehouseGuard1808000000000';
const TS = 1808000000000;

// SQL we expect up() to run — captured for the dry-run report.
const EXPECTED = [
  `stock_ledger_append_only() function`,
  `trg_stock_ledger_append_only  BEFORE UPDATE ON stock_ledger`,
  `production_entry_warehouse_guard() function`,
  `trg_prod_entry_warehouse_guard  AFTER INSERT/UPDATE OF warehouse_id (DEFERRABLE)`,
  `inventory_balance_identity() function`,
  `trg_inventory_balance_identity  BEFORE UPDATE ON inventory_balances`,
];

(async () => {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`  SINGLE MIGRATION RUN — ${NAME}`);
  console.log(`  mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);
  console.log('════════════════════════════════════════════════════════════════════');

  if (!APPLY) {
    console.log('\n1. WHAT up() WILL EXECUTE');
    EXPECTED.forEach((e) => console.log(`   - ${e}`));
    console.log('\n2. PRE-INSTALL STATE (read-only)');
    await dataSource.initialize();
    const qr = dataSource.createQueryRunner();
    const trig = await qr.query(
      `SELECT tgname, tgtype, tgdeferrable, tginitdeferred
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT tgisinternal AND c.relname IN
          ('stock_ledger','production_entries','inventory_balances')
        ORDER BY c.relname, tgname`,
    );
    console.log('   triggers on the three tables BEFORE:');
    if (!trig.length) console.log('     (none)');
    for (const t of trig) {
      console.log(`     ${t.tgname}  deferrable=${t.tgdeferrable} initially=${t.tginitdeferred}`);
    }
    const fn = await qr.query(
      `SELECT proname FROM pg_proc WHERE proname IN
        ('stock_ledger_append_only','production_entry_warehouse_guard','inventory_balance_identity')`,
    );
    console.log(`   guard functions present BEFORE: ${fn.length}`);

    // prove the invariant holds today, so the guard cannot break live data
    const viol = await qr.query(`
      SELECT COUNT(*)::int AS violating_pairs
        FROM (SELECT sl.reference_id AS pe_id, sl.warehouse_id,
                     SUM(CASE
                           WHEN sl.transaction_type = 'PRODUCTION_SCRAP' THEN 0
                           WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
                                AND COALESCE(sl.notes,'') ~ '^Reversal of PRODUCTION_SCRAP' THEN 0
                           WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
                                AND COALESCE(sl.notes,'') ~ '^Reversal of PRODUCTION_RECEIPT'
                             THEN -sl.quantity
                           WHEN sl.transaction_type = 'PRODUCTION_RECEIPT'
                             THEN CASE WHEN sl.direction='IN' THEN sl.quantity
                                       ELSE -sl.quantity END
                           ELSE 0 END) AS net
                FROM stock_ledger sl
               WHERE sl.reference_type = 'PRODUCTION_ENTRY' AND sl.reference_id IS NOT NULL
               GROUP BY 1, 2) f
        JOIN production_entries pe ON pe.id = f.pe_id
       WHERE f.warehouse_id IS DISTINCT FROM pe.warehouse_id AND ABS(f.net) > 0.0001`);
    console.log(`   existing ledger/document warehouse violations: ${viol[0].violating_pairs}`);
    console.log(`   -> ${viol[0].violating_pairs === 0
      ? 'guard is safe to install (nothing live violates it)'
      : 'ABORT: live data already violates the invariant'}`);

    await qr.release();
    await dataSource.destroy();
    console.log('\n[DRY RUN — nothing was written. Re-run with apply=APPLY]');
    return;
  }

  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  await qr.startTransaction();
  try {
    const migration = new LedgerWarehouseGuard1808000000000();
    await migration.up(qr);

    const already = await qr.query(
      `SELECT 1 FROM migrations WHERE name = $1 AND timestamp = $2`,
      [NAME, TS],
    );
    if (!already.length) {
      await qr.query(`INSERT INTO migrations (timestamp, name) VALUES ($1, $2)`, [TS, NAME]);
    }

    await qr.commitTransaction();

    console.log('\n1. INSTALLED — triggers on the three tables AFTER');
    const trig = await qr.query(
      `SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) AS def
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname IN
          ('stock_ledger','production_entries','inventory_balances')
        ORDER BY c.relname, t.tgname`,
    );
    for (const t of trig) console.log(`   ${t.relname}: ${t.tgname}`);
    console.log('\n   definitions:');
    for (const t of trig) console.log(`   ${t.def}\n`);

    const row = await qr.query(`SELECT name FROM migrations WHERE timestamp = $1`, [TS]);
    console.log(`2. migrations row recorded: ${row[0] ? row[0].name : '(none)'}`);
    console.log('\n════════════════════════════════════════════════════════════════════');
    console.log('  COMMITTED');
    console.log('════════════════════════════════════════════════════════════════════');
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
})().catch((err) => {
  console.error('ERR:', err.message);
  process.exit(1);
});
