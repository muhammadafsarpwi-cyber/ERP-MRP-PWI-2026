const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL database.');

  // Fetch SUPER_ADMIN and ADMIN role IDs
  const rolesRes = await client.query(`
    SELECT id, role_code FROM roles WHERE role_code IN ('SUPER_ADMIN', 'ADMIN')
  `);
  const superAdminRole = rolesRes.rows.find(r => r.role_code === 'SUPER_ADMIN');
  const adminRole = rolesRes.rows.find(r => r.role_code === 'ADMIN');

  // Fetch all existing module-resource pairs
  const pairsRes = await client.query(`
    SELECT DISTINCT module, resource FROM permissions ORDER BY module, resource
  `);

  // Fetch all existing permissions
  const existingPermsRes = await client.query(`
    SELECT id, module, resource, UPPER(action) as act, permission_code FROM permissions
  `);
  const existingMap = new Map();
  for (const r of existingPermsRes.rows) {
    existingMap.set(`${r.module}:${r.resource}:${r.act}`, r);
  }

  const standardActions = [
    { action: 'VIEW', suffix: 'view', name: 'View' },
    { action: 'CREATE', suffix: 'create', name: 'Create' },
    { action: 'UPDATE', suffix: 'update', name: 'Update' },
    { action: 'DELETE', suffix: 'delete', name: 'Delete' },
  ];

  const toInsert = [];

  for (const pair of pairsRes.rows) {
    const mod = pair.module;
    const res = pair.resource;

    for (const std of standardActions) {
      const key = `${mod}:${res}:${std.action}`;

      if (!existingMap.has(key)) {
        const cleanResource = res.replace(/[^a-zA-Z0-9_]/g, '_');
        const permCode = `${mod}.${cleanResource}.${std.suffix}`;
        const humanName = `${std.name} ${res.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;
        const desc = `Allows user to ${std.name.toLowerCase()} ${res.replace(/_/g, ' ')} in ${mod} module.`;

        toInsert.push({ permCode, humanName, mod, res, action: std.action, desc });
      }
    }
  }

  console.log(`Remaining missing permissions to insert: ${toInsert.length}`);

  if (toInsert.length > 0) {
    // Insert all in batches of 50
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const values = [];
      const placeholders = batch.map((item, idx) => {
        const base = idx * 6;
        values.push(item.permCode, item.humanName, item.mod, item.res, item.action, item.desc);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, 'ACTIVE', true)`;
      });

      const sql = `
        INSERT INTO permissions (permission_code, name, module, resource, action, description, status, is_active)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (permission_code) DO UPDATE
          SET status = 'ACTIVE', is_active = true;
      `;
      await client.query(sql, values);
    }
    console.log(`Batch inserted ${toInsert.length} permissions.`);
  }

  // Grant ALL active permissions to SUPER_ADMIN
  if (superAdminRole) {
    const saRes = await client.query(`
      INSERT INTO role_permissions (role_id, permission_id, status, is_active)
      SELECT $1, p.id, 'ACTIVE', true
      FROM permissions p
      WHERE p.status = 'ACTIVE'
      ON CONFLICT DO NOTHING;
    `, [superAdminRole.id]);
    console.log(`Updated SUPER_ADMIN permissions.`);
  }

  // Grant ALL active permissions to ADMIN
  if (adminRole) {
    const adminRes = await client.query(`
      INSERT INTO role_permissions (role_id, permission_id, status, is_active)
      SELECT $1, p.id, 'ACTIVE', true
      FROM permissions p
      WHERE p.status = 'ACTIVE'
      ON CONFLICT DO NOTHING;
    `, [adminRole.id]);
    console.log(`Updated ADMIN permissions.`);
  }

  const finalCount = await client.query(`SELECT count(*) FROM permissions WHERE status = 'ACTIVE'`);
  console.log(`Total active permissions in DB now: ${finalCount.rows[0].count}`);

  await client.end();
  console.log('Seeding complete!');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
