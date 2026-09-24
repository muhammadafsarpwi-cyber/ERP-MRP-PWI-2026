/**
 * Probe 2: verify the fix approach for WarehouseLocationService.update():
 *  V1: repository.update({id},{parentLocationId}) for SET and SET-NULL
 *  V2: full candidate flow: assign scalar+save -> repo.update(parent) -> findOne (response)
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

const C01 = 'CCD-C01', A01 = 'CCD-A01';
const queries = [];
(async () => {
  const ds = new DataSource({
    type: 'postgres',
    host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543,
    username: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()',
    database: 'postgres', ssl: { rejectUnauthorized: false },
    entities: collectEntities(distEntities),
    logging: ['query'], logger: 'advanced',
  });
  await ds.initialize();
  const repo = ds.getTreeRepository('WarehouseLocation');
  const rows = (await ds.query("SELECT id, location_code, parent_location_id FROM warehouse_locations WHERE location_code IN ($1,$2)", [C01, A01]));
  const c01 = rows.find(r => r.location_code === C01), a01 = rows.find(r => r.location_code === A01);
  const db = async () => (await ds.query('SELECT parent_location_id FROM warehouse_locations WHERE id=$1', [c01.id]))[0].parent_location_id;
  console.log('BASELINE c01.parent =', c01.parent_location_id);

  // ---- V1a: repo.update SET A01 ----
  console.log('\n=== V1a: repo.update({parentLocationId: A01}) ===');
  await repo.update({ id: c01.id }, { parentLocationId: a01.id });
  console.log('DB =', await db());

  // ---- V1b: repo.update SET null ----
  console.log('\n=== V1b: repo.update({parentLocationId: null}) ===');
  await repo.update({ id: c01.id }, { parentLocationId: null });
  console.log('DB =', await db());

  // ---- V2: full candidate service flow, SET A01 ----
  console.log('\n=== V2a: candidate service flow -> SET A01 ===');
  let location = await repo.findOne({ where: { id: c01.id }, relations: ['warehouse', 'parentLocation', 'children'] });
  Object.assign(location, { name: location.name, description: location.description, updatedBy: null });
  location.parentLocationId = a01.id;
  await repo.save(location);
  await repo.update({ id: c01.id }, { parentLocationId: a01.id });
  let fresh = await repo.findOne({ where: { id: c01.id }, relations: ['warehouse', 'parentLocation', 'children'] });
  console.log('DB          =', await db());
  console.log('response id =', fresh.parentLocationId);
  console.log('response rel=', fresh.parentLocation?.locationCode ?? null);

  // ---- V2b: full candidate service flow, SET null ----
  console.log('\n=== V2b: candidate service flow -> SET null ===');
  location = await repo.findOne({ where: { id: c01.id }, relations: ['warehouse', 'parentLocation', 'children'] });
  Object.assign(location, { name: location.name, description: location.description, updatedBy: null });
  location.parentLocationId = null;
  await repo.save(location);
  await repo.update({ id: c01.id }, { parentLocationId: null });
  fresh = await repo.findOne({ where: { id: c01.id }, relations: ['warehouse', 'parentLocation', 'children'] });
  console.log('DB          =', await db());
  console.log('response id =', fresh.parentLocationId);
  console.log('response rel=', fresh.parentLocation?.locationCode ?? null);

  await ds.query('UPDATE warehouse_locations SET parent_location_id = $1 WHERE id = $2', [c01.parent_location_id, c01.id]);
  console.log('\nRESTORED DB =', await db());
  await ds.destroy();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
