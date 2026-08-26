const { Client } = require('pg');

(async () => {
  const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  // First check columns
  const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'permissions' ORDER BY ordinal_position`);
  console.log('Permissions columns:', cols.rows.map(r => r.column_name).join(', '));
  
  // All active permissions
  const perms = await client.query(`SELECT id, permission_code, module, resource, action, status FROM permissions WHERE status = 'ACTIVE' ORDER BY module, resource, action`);
  console.log('\n=== ACTIVE PERMISSIONS: ' + perms.rows.length + ' ===');
  
  const grouped = {};
  for (const p of perms.rows) {
    if (!grouped[p.module]) grouped[p.module] = {};
    if (!grouped[p.module][p.resource]) grouped[p.module][p.resource] = {};
    grouped[p.module][p.resource][p.action] = p.permission_code;
  }
  
  let totalResources = 0;
  for (const [mod, resources] of Object.entries(grouped).sort()) {
    console.log(`\nMODULE: ${mod} (${Object.keys(resources).length} resources)`);
    for (const [res, actions] of Object.entries(resources).sort()) {
      totalResources++;
      const actNames = Object.keys(actions).sort().join(', ');
      console.log(`  ${res}: [${actNames}]`);
    }
  }
  
  const uniqueModules = Object.keys(grouped).length;
  console.log(`\n=== COUNTS ===`);
  console.log(`Active permissions: ${perms.rows.length}`);
  console.log(`Unique modules: ${uniqueModules}`);
  console.log(`Unique resources: ${totalResources}`);
  
  // All active roles
  const roles = await client.query(`SELECT id, role_code, name, status FROM roles WHERE status = 'ACTIVE' ORDER BY role_code`);
  console.log(`\n=== ACTIVE ROLES: ${roles.rows.length} ===`);
  roles.rows.forEach(r => console.log(`  ${r.role_code} (${r.id})`));
  
  // Role-permission mappings
  const rp = await client.query(`
    SELECT rp.role_id, r.role_code, p.permission_code, p.module, p.resource, p.action
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.status = 'ACTIVE' AND r.status = 'ACTIVE' AND p.status = 'ACTIVE'
    ORDER BY r.role_code, p.module, p.resource, p.action
  `);
  console.log(`\n=== ACTIVE ROLE-PERMISSIONS: ${rp.rows.length} ===`);
  
  const roleCounts = {};
  for (const r of rp.rows) {
    roleCounts[r.role_code] = (roleCounts[r.role_code] || 0) + 1;
  }
  for (const [code, count] of Object.entries(roleCounts).sort()) {
    console.log(`  ${code}: ${count} permissions`);
  }
  
  // Orphan permissions NOT in any role
  const unr = await client.query(`
    SELECT p.permission_code, p.module, p.resource, p.action
    FROM permissions p
    WHERE p.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id AND rp.status = 'ACTIVE')
  `);
  console.log(`\n=== ORPHAN PERMISSIONS (not in any role): ${unr.rows.length} ===`);
  unr.rows.forEach(r => console.log(`  ${r.permission_code} (${r.module}.${r.resource}.${r.action})`));
  
  // Actions inventory
  const actions = await client.query(`SELECT DISTINCT action, COUNT(*) as cnt FROM permissions WHERE status = 'ACTIVE' GROUP BY action ORDER BY action`);
  console.log(`\n=== DISTINCT ACTIONS ===`);
  actions.rows.forEach(r => console.log(`  ${r.action}: ${r.cnt} permissions`));
  
  // Resources with ONLY non-V/A/E/D actions
  const resourcesWithoutVed = await client.query(`
    SELECT module, resource, array_agg(action ORDER BY action) as actions
    FROM permissions
    WHERE status = 'ACTIVE'
    GROUP BY module, resource
    HAVING NOT (array_agg(action) && ARRAY['VIEW','CREATE','UPDATE','DELETE'])
  `);
  console.log(`\n=== RESOURCES WITHOUT VIEW/CREATE/UPDATE/DELETE: ${resourcesWithoutVed.rows.length} ===`);
  resourcesWithoutVed.rows.forEach(r => console.log(`  ${r.module}.${r.resource}: [${r.actions}]`));
  
  // Resources with ALL 4 standard actions
  const resourcesWithAll = await client.query(`
    SELECT module, resource, array_agg(action ORDER BY action) as actions
    FROM permissions
    WHERE status = 'ACTIVE'
    GROUP BY module, resource
    HAVING array_agg(action) @> ARRAY['VIEW','CREATE','UPDATE','DELETE']
  `);
  console.log(`\n=== RESOURCES WITH ALL 4 ACTIONS (VIEW/CREATE/UPDATE/DELETE): ${resourcesWithAll.rows.length} ===`);
  resourcesWithAll.rows.forEach(r => console.log(`  ${r.module}.${r.resource}: [${r.actions}]`));
  
  await client.end();
  console.log('\n=== AUDIT COMPLETE ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
