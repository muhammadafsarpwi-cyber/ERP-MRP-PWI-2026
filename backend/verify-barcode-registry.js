#!/usr/bin/env node
/**
 * Barcode Registry Database Integrity Checker
 * Read-only verification of the barcodes table in Supabase PostgreSQL.
 */

const fs = require('fs');
const path = require('path');

// ── 1. Load .env ──────────────────────────────────────────────────────────────
function loadEnv(envPath) {
  const raw = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
  return env;
}

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error(`ERROR: .env not found at ${envPath}`);
  process.exit(1);
}
const env = loadEnv(envPath);

const dbConfig = {
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10) || 5432,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED === 'true', servername: env.DB_SSL_SERVERNAME || undefined } : false,
  connectionTimeoutMillis: 15000,
  query_timeout: 30000,
};

console.log('='.repeat(80));
console.log('  BARCODE REGISTRY DATABASE INTEGRITY CHECK');
console.log('='.repeat(80));
console.log(`  Host: ${dbConfig.host}:${dbConfig.port}`);
console.log(`  Database: ${dbConfig.database}`);
console.log(`  User: ${dbConfig.user}`);
console.log('='.repeat(80));

// ── 2. Connect ────────────────────────────────────────────────────────────────
let Client;
try {
  Client = require('pg').Client;
  console.log('\n[OK] Loaded pg from node_modules');
} catch {
  try {
    const typeormPath = path.join(__dirname, 'node_modules', 'typeorm');
    if (fs.existsSync(typeormPath)) {
      console.log('\n[WARN] pg not found directly, but typeorm is installed. pg should be a transitive dep.');
      Client = require('pg').Client;
    } else {
      throw new Error('Neither pg nor typeorm found in node_modules');
    }
  } catch (e) {
    console.error(`\n[FATAL] Cannot load a DB client: ${e.message}`);
    console.error('Install pg: npm install pg');
    process.exit(1);
  }
}

const results = [];

function record(checkName, passed, detail) {
  results.push({ checkName, passed, detail });
  const status = passed ? 'PASS' : 'FAIL';
  const icon = passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`\n${icon}  [${status}] ${checkName}`);
  if (detail) console.log(`    ${detail}`);
}

async function run() {
  const client = new Client(dbConfig);

  try {
    await client.connect();
    console.log('\n[OK] Connected to database');

    // ── Q1: Barcode count by entity type ─────────────────────────────────────
    {
      const res = await client.query(`
        SELECT entity_type, COUNT(*) as count
        FROM barcodes
        WHERE status = 'ACTIVE'
        GROUP BY entity_type
        ORDER BY entity_type;
      `);
      const rows = res.rows;
      if (rows.length === 0) {
        record('Q1: Barcode count by entity type', false, 'No ACTIVE barcodes found in the table');
      } else {
        console.log('\n    ┌─────────────────────┬───────┐');
        console.log('    │ Entity Type         │ Count │');
        console.log('    ├─────────────────────┼───────┤');
        let totalActive = 0;
        for (const r of rows) {
          const cnt = Number(r.count);
          totalActive += cnt;
          console.log(`    │ ${r.entity_type.padEnd(19)} │ ${String(cnt).padStart(5)} │`);
        }
        console.log('    ├─────────────────────┼───────┤');
        console.log(`    │ ${'TOTAL'.padEnd(19)} │ ${String(totalActive).padStart(5)} │`);
        console.log('    └─────────────────────┴───────┘');
        record('Q1: Barcode count by entity type', rows.length > 0, `${rows.length} entity types, ${totalActive} active barcodes`);
      }
    }

    // ── Q2: Total barcode count ──────────────────────────────────────────────
    {
      const res = await client.query(`SELECT COUNT(*) as total FROM barcodes;`);
      const total = Number(res.rows[0].total);
      console.log(`\n    Total barcodes (all statuses): ${total}`);
      record('Q2: Total barcode count', true, `${total} rows`);
    }

    // ── Q3: Duplicate barcode values (same company) ──────────────────────────
    {
      const res = await client.query(`
        SELECT barcode_value, company_id, COUNT(*) as cnt
        FROM barcodes
        WHERE status = 'ACTIVE'
        GROUP BY barcode_value, company_id
        HAVING COUNT(*) > 1;
      `);
      const rows = res.rows;
      if (rows.length === 0) {
        record('Q3: Duplicate barcode values', true, 'No duplicate ACTIVE barcode values found');
      } else {
        console.log('\n    Duplicate barcode values:');
        console.log('    ┌──────────────────────────┬──────────────────────────────────────┬─────┐');
        console.log('    │ Barcode Value            │ Company ID                           │ Cnt │');
        console.log('    ├──────────────────────────┼──────────────────────────────────────┼─────┤');
        for (const r of rows.slice(0, 20)) {
          console.log(`    │ ${(r.barcode_value || '').padEnd(24)} │ ${(r.company_id || '').padEnd(36)} │ ${String(r.cnt).padStart(3)} │`);
        }
        if (rows.length > 20) console.log(`    │ ... and ${rows.length - 20} more rows`);
        console.log('    └──────────────────────────┴──────────────────────────────────────┴─────┘');
        record('Q3: Duplicate barcode values', false, `${rows.length} duplicate groups found`);
      }
    }

    // ── Q4: Orphan barcodes ──────────────────────────────────────────────────
    const orphanChecks = [
      { entityType: 'ITEM', table: 'items', label: 'Items' },
      { entityType: 'CUSTOMER', table: 'customers', label: 'Customers' },
      { entityType: 'MACHINE', table: 'machines', label: 'Machines' },
      { entityType: 'WAREHOUSE', table: 'warehouses', label: 'Warehouses' },
      { entityType: 'EMPLOYEE', table: 'hr_employees', label: 'Employees (hr_employees)' },
      { entityType: 'PRODUCTION_ENTRY', table: 'production_entries', label: 'Production Entries' },
      { entityType: 'JOB_CARD', table: 'maintenance_job_cards', label: 'Job Cards (maintenance_job_cards)' },
    ];

    let anyOrphans = false;
    for (const oc of orphanChecks) {
      // First check if the table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) as exists;
      `, [oc.table]);
      const tableExists = tableCheck.rows[0].exists;

      if (!tableExists) {
        record(`Q4: Orphan barcodes - ${oc.label}`, false, `Table "${oc.table}" does not exist`);
        anyOrphans = true;
        continue;
      }

      const countRes = await client.query(`
        SELECT COUNT(*) as cnt
        FROM barcodes b
        LEFT JOIN ${oc.table} e ON e.id = b.entity_id::uuid
        WHERE b.entity_type = $1 AND b.status = 'ACTIVE' AND e.id IS NULL;
      `, [oc.entityType]);
      const orphanCount = Number(countRes.rows[0].cnt);

      if (orphanCount > 0) {
        anyOrphans = true;
        const sampleRes = await client.query(`
          SELECT b.id, b.barcode_value, b.entity_id
          FROM barcodes b
          LEFT JOIN ${oc.table} e ON e.id = b.entity_id::uuid
          WHERE b.entity_type = $1 AND b.status = 'ACTIVE' AND e.id IS NULL
          LIMIT 10;
        `, [oc.entityType]);
        console.log(`\n    Orphaned ${oc.label} barcodes (${orphanCount} total):`);
        console.log('    ┌──────────────────────────────────────┬──────────────────────────┬──────────────────────────────────────┐');
        console.log('    │ Barcode ID                           │ Barcode Value           │ Entity ID (missing)                  │');
        console.log('    ├──────────────────────────────────────┼──────────────────────────┼──────────────────────────────────────┤');
        for (const r of sampleRes.rows) {
          console.log(`    │ ${(r.id || '').padEnd(36)} │ ${(r.barcode_value || '').padEnd(24)} │ ${(r.entity_id || '').padEnd(36)} │`);
        }
        if (orphanCount > 10) console.log(`    │ ... and ${orphanCount - 10} more`);
        console.log('    └──────────────────────────────────────┴──────────────────────────┴──────────────────────────────────────┘');
        record(`Q4: Orphan barcodes - ${oc.label}`, false, `${orphanCount} orphan(s) — barcode references non-existent ${oc.label}`);
      } else {
        record(`Q4: Orphan barcodes - ${oc.label}`, true, `0 orphans`);
      }
    }
    if (!anyOrphans) {
      // Already recorded individually; this is just a summary
    }

    // ── Q5: Primary barcode per entity (multiple primary flag) ───────────────
    {
      const res = await client.query(`
        SELECT entity_type, entity_id, COUNT(*) as primary_count
        FROM barcodes
        WHERE is_primary = true AND status = 'ACTIVE'
        GROUP BY entity_type, entity_id
        HAVING COUNT(*) > 1
        LIMIT 20;
      `);
      const rows = res.rows;
      if (rows.length === 0) {
        record('Q5: Multiple primary barcodes per entity', true, 'No entity has more than one is_primary=true barcode');
      } else {
        console.log('\n    Entities with multiple primary barcodes:');
        console.log('    ┌─────────────────────┬──────────────────────────────────────┬───────┐');
        console.log('    │ Entity Type         │ Entity ID                            │ Count │');
        console.log('    ├─────────────────────┼──────────────────────────────────────┼───────┤');
        for (const r of rows) {
          console.log(`    │ ${r.entity_type.padEnd(19)} │ ${(r.entity_id || '').padEnd(36)} │ ${String(r.primary_count).padStart(5)} │`);
        }
        console.log('    └─────────────────────┴──────────────────────────────────────┴───────┘');
        record('Q5: Multiple primary barcodes per entity', false, `${rows.length} entities have >1 primary barcode`);
      }
    }

    // ── Q6: Barcode value format check (too short) ───────────────────────────
    {
      const res = await client.query(`
        SELECT barcode_value, entity_type, entity_id
        FROM barcodes
        WHERE status = 'ACTIVE' AND LENGTH(barcode_value) < 5
        LIMIT 10;
      `);
      const rows = res.rows;
      if (rows.length === 0) {
        record('Q6: Short barcode values (< 5 chars)', true, 'No ACTIVE barcodes shorter than 5 characters');
      } else {
        console.log('\n    Short barcode values:');
        console.log('    ┌──────────────────────────┬─────────────────────┬──────────────────────────────────────┐');
        console.log('    │ Barcode Value            │ Entity Type         │ Entity ID                            │');
        console.log('    ├──────────────────────────┼─────────────────────┼──────────────────────────────────────┤');
        for (const r of rows) {
          console.log(`    │ ${(r.barcode_value || '').padEnd(24)} │ ${(r.entity_type || '').padEnd(19)} │ ${(r.entity_id || '').padEnd(36)} │`);
        }
        console.log('    └──────────────────────────┴─────────────────────┴──────────────────────────────────────┘');
        record('Q6: Short barcode values (< 5 chars)', false, `${rows.length} short barcode(s) found`);
      }
    }

    // ── Q7: items.barcode sync check ─────────────────────────────────────────
    {
      // Check if items table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'items'
        ) as exists;
      `);
      const itemsExists = tableCheck.rows[0].exists;

      if (!itemsExists) {
        record('Q7: items.barcode sync', false, 'Table "items" does not exist');
      } else {
        const res = await client.query(`
          SELECT i.id, i.item_code, i.barcode as item_barcode, b.barcode_value as registry_barcode
          FROM items i
          LEFT JOIN barcodes b ON b.entity_id = i.id::uuid AND b.entity_type = 'ITEM' AND b.status = 'ACTIVE'
          WHERE i.barcode IS NOT NULL AND i.barcode != ''
            AND (b.barcode_value IS NULL OR b.barcode_value != i.barcode)
          LIMIT 10;
        `);
        const rows = res.rows;

        // Also get total count of items with barcode but no registry match
        const countRes = await client.query(`
          SELECT COUNT(*) as cnt
          FROM items i
          LEFT JOIN barcodes b ON b.entity_id = i.id::uuid AND b.entity_type = 'ITEM' AND b.status = 'ACTIVE'
          WHERE i.barcode IS NOT NULL AND i.barcode != ''
            AND (b.barcode_value IS NULL OR b.barcode_value != i.barcode);
        `);
        const mismatchCount = Number(countRes.rows[0].cnt);

        if (rows.length === 0) {
          record('Q7: items.barcode ↔ registry sync', true, 'All items with a barcode column match their registry entry');
        } else {
          console.log('\n    Items with barcode ≠ registry barcode:');
          console.log('    ┌──────────────────────────────────────┬────────────┬──────────────────────────┬──────────────────────────┐');
          console.log('    │ Item ID                              │ Item Code  │ items.barcode            │ registry.barcode_value   │');
          console.log('    ├──────────────────────────────────────┼────────────┼──────────────────────────┼──────────────────────────┤');
          for (const r of rows) {
            console.log(`    │ ${(r.id || '').padEnd(36)} │ ${(r.item_code || '').padEnd(10)} │ ${(r.item_barcode || 'NULL').padEnd(24)} │ ${(r.registry_barcode || 'NO ENTRY').padEnd(24)} │`);
          }
          if (mismatchCount > 10) console.log(`    │ ... and ${mismatchCount - 10} more`);
          console.log('    └──────────────────────────────────────┴────────────┴──────────────────────────┴──────────────────────────┘');
          record('Q7: items.barcode ↔ registry sync', false, `${mismatchCount} item(s) have barcode mismatch`);
        }
      }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log('\n' + '='.repeat(80));
    console.log('  SUMMARY');
    console.log('='.repeat(80));
    console.log(`  Checks run:  ${results.length}`);
    console.log(`  Passed:      \x1b[32m${passed}\x1b[0m`);
    console.log(`  Failed:      ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : '0'}`);
    console.log('='.repeat(80));

    if (failed > 0) {
      console.log('\n  FAILED CHECKS:');
      for (const r of results.filter(r => !r.passed)) {
        console.log(`    - ${r.checkName}: ${r.detail}`);
      }
    } else {
      console.log('\n  All checks passed. Barcode registry is healthy.');
    }
    console.log('');

  } catch (err) {
    console.error(`\n[FATAL] Database error: ${err.message}`);
    if (err.code) console.error(`  PG Error Code: ${err.code}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
    console.log('[OK] Connection closed');
  }
}

run();
