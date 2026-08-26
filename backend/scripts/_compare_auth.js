const { Client } = require('pg');
const bcrypt = require('bcrypt');

(async () => {
  const client = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  // Get system.admin full row
  const sysAdmin = await client.query(`
    SELECT id, instance_id, aud, role, email, 
           LENGTH(encrypted_password) as pwd_len,
           SUBSTRING(encrypted_password, 1, 10) as pwd_prefix,
           email_confirmed_at, phone, phone_confirmed_at,
           confirmation_token, recovery_token,
           email_change, email_change_token_new, email_change_token_current,
           is_super_admin, raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, last_sign_in_at
    FROM auth.users WHERE email = 'system.admin@erp.com'
  `);
  console.log('=== SYSTEM.ADMIN ===');
  console.log(JSON.stringify(sysAdmin.rows[0], null, 2));
  
  // Create a test user and compare ALL columns
  const testId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const hash = await bcrypt.hash('TestPass123!', 10);
  console.log('\nHash length:', hash.length, 'prefix:', hash.substring(0, 7));
  
  await client.query('SET session_replication_role = \'replica\'');
  await client.query(`
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, 
      email_confirmed_at, created_at, updated_at, 
      confirmation_token, recovery_token, 
      raw_user_meta_data, raw_app_meta_data,
      is_super_admin, email_change, email_change_token_new, email_change_token_current)
    VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'compare@erp.test', $2, 
      NOW(), NOW(), NOW(), 
      '', '',
      '{}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb,
      false, '', '', '')
    ON CONFLICT DO NOTHING
  `, [testId, hash]);
  
  await client.query(`INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, 'email', $4, NOW(), NOW(), NOW())
    ON CONFLICT DO NOTHING
  `, ['aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff', testId, JSON.stringify({ sub: testId, email: 'compare@erp.test', email_verified: true }), testId]);
  await client.query('SET session_replication_role = \'origin\'');
  
  // Get the new user's full row
  const testUser = await client.query(`
    SELECT id, instance_id, aud, role, email, 
           LENGTH(encrypted_password) as pwd_len,
           SUBSTRING(encrypted_password, 1, 10) as pwd_prefix,
           email_confirmed_at, phone, phone_confirmed_at,
           confirmation_token, recovery_token,
           email_change, email_change_token_new, email_change_token_current,
           is_super_admin, raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, last_sign_in_at
    FROM auth.users WHERE id = $1
  `, [testId]);
  console.log('\n=== TEST USER ===');
  console.log(JSON.stringify(testUser.rows[0], null, 2));
  
  // Compare column by column
  console.log('\n=== COLUMN COMPARISON ===');
  const s = sysAdmin.rows[0];
  const t = testUser.rows[0];
  const columns = ['instance_id', 'aud', 'role', 'pwd_len', 'pwd_prefix', 'email_confirmed_at', 'phone', 'phone_confirmed_at', 'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new', 'email_change_token_current', 'is_super_admin', 'last_sign_in_at'];
  for (const col of columns) {
    const match = String(s[col]) === String(t[col]);
    if (!match) console.log(`  ${col}: SYS=${s[col]} TEST=${t[col]} DIFF`);
  }
  console.log('  (only showing differences)');
  
  // Check raw_app_meta_data
  console.log('\nSYS raw_app_meta_data:', JSON.stringify(s.raw_app_meta_data));
  console.log('TEST raw_app_meta_data:', JSON.stringify(t.raw_app_meta_data));
  
  // Also check identity comparison
  const sysIdent = await client.query(`SELECT * FROM auth.identities WHERE user_id = $1`, [sysAdmin.rows[0].id]);
  const testIdent = await client.query(`SELECT * FROM auth.identities WHERE user_id = $1`, [testId]);
  console.log('\nSYS identity:', JSON.stringify(sysIdent.rows[0], null, 2));
  console.log('TEST identity:', JSON.stringify(testIdent.rows[0], null, 2));
  
  // Cleanup
  await client.query('DELETE FROM auth.identities WHERE user_id = $1', [testId]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [testId]);
  
  await client.end();
  console.log('\nDone');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
