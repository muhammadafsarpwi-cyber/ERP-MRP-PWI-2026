/**
 * Standalone TypeORM probe: replicates WarehouseLocationService.update()
 * (findOne with relations -> Object.assign -> save) with SQL query logging.
 * Root-causes: (a) response stale parentLocationId after set, (b) null not persisting.
 */
const path = require('path');
const fs = require('fs');
const { DataSource } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'typeorm'));

const distEntities = path.join(__dirname, '..', 'backend', 'dist');
function collectEntities(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectEntities(full, out);
    else if (entry.name.endsWith('.entity.js')) out.push(full);
  }
  return out;
}
const entityFiles = collectEntities(distEntities);

const C01 = 'CCD-C01', A01 = 'CCD-A01';

(async () => {
  const ds = new DataSource({
    type: 'postgres',
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    username: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    entities: entityFiles,
    logging: ['query'],
    logger: 'advanced',
  });
  await ds.initialize();
  const repo = ds.getTreeRepository('WarehouseLocation');
  const [c01, a01] = (await ds.query(
    "SELECT id, location_code, parent_location_id FROM warehouse_locations WHERE location_code IN ($1,$2)", [C01, A01]
  ));
  const c01row = c01.location_code === C01 ? c01 : a01;
  const a01row = c01.location_code === A01 ? c01 : a01;
  console.log('BASELINE c01.parent =', c01row.parent_location_id);

  const say = (label, loc, dbVal) => {
    console.log(`\n=== ${label} ===`);
    console.log('returned.parentLocationId =', JSON.stringify(loc.parentLocationId));
    console.log('returned.parentLocation   =', loc.parentLocation ? loc.parentLocation.locationCode : loc.parentLocation);
    console.log('DB parent_location_id     =', dbVal);
  };

  // ---- CASE 1: set parent = A01 ----
  let loc = await repo.findOne({ where: { id: c01row.id }, relations: ['warehouse', 'parentLocation', 'children'] });
  console.log('\n[loaded] parentLocationId =', loc.parentLocationId, '| parentLocation =', loc.parentLocation?.locationCode ?? null);
  Object.assign(loc, { parentLocationId: a01row.id, updatedBy: null });
  loc = await repo.save(loc);
  let db = (await ds.query('SELECT parent_location_id FROM warehouse_locations WHERE id=$1', [c01row.id]))[0].parent_location_id;
  say('SET parent=A01', loc, db);

  // ---- CASE 2: set parent = null ----
  loc = await repo.findOne({ where: { id: c01row.id }, relations: ['warehouse', 'parentLocation', 'children'] });
  console.log('\n[loaded] parentLocationId =', loc.parentLocationId, '| parentLocation =', loc.parentLocation?.locationCode ?? null);
  Object.assign(loc, { parentLocationId: null, updatedBy: null });
  loc = await repo.save(loc);
  db = (await ds.query('SELECT parent_location_id FROM warehouse_locations WHERE id=$1', [c01row.id]))[0].parent_location_id;
  say('SET parent=null', loc, db);

  // restore baseline
  await ds.query('UPDATE warehouse_locations SET parent_location_id = $1 WHERE id = $2', [c01row.parent_location_id, c01row.id]);
  db = (await ds.query('SELECT parent_location_id FROM warehouse_locations WHERE id=$1', [c01row.id]))[0].parent_location_id;
  console.log('\nRESTORED DB =', db);

  await ds.destroy();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
