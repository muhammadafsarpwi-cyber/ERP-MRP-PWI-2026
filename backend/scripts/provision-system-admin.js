#!/usr/bin/env node
/**
 * Provision system.admin@erp.com with SUPER_ADMIN role.
 *
 * Usage:
 *   node scripts/provision-system-admin.js [password]
 *
 * Creates:
 *   1. auth.users record (bcrypt-hashed password, email confirmed)
 *   2. auth.identities record (email provider)
 *   3. erp_users record
 *   4. user_roles record (SUPER_ADMIN)
 */
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const EMAIL = 'system.admin@erp.com';
const PASSWORD = process.argv[2] || 'Admin#2026!Secure';
const SALT_ROUNDS = 10;

const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  await client.query('BEGIN');

  try {
    // 0. Check if already exists
    const existing = await client.query("SELECT id FROM erp_users WHERE email = $1", [EMAIL]);
    if (existing.rows.length > 0) {
      console.log(`${EMAIL} already exists in erp_users (id: ${existing.rows[0].id}). Skipping.`);
      await client.query('ROLLBACK');
      await client.end();
      return;
    }

    // 1. Create auth.users record
    console.log('[1/4] Creating auth.users record...');
    const authUserId = crypto.randomUUID();
    const instanceId = '00000000-0000-0000-0000-000000000000';
    const hashedPassword = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
    const now = new Date().toISOString();

    // Disable the on_auth_user_created trigger (erp_core.users table doesn't exist)
    await client.query("SET session_replication_role = 'replica'");
    console.log('  Disabled triggers at session level');

    try {
      await client.query(
        `INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, recovery_token, recovery_sent_at,
          email_change_token_new, email_change, email_change_sent_at,
          confirmation_token, confirmation_sent_at,
          raw_app_meta_data, raw_user_meta_data,
          is_super_admin, created_at, updated_at,
          is_sso_user, is_anonymous
        ) VALUES (
          $1, $2, 'authenticated', 'authenticated', $3, $4,
          $5, '', NULL,
          '', '', NULL,
          '', NULL,
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb,
          false, $5, $5,
          false, false
        )`,
        [instanceId, authUserId, EMAIL, hashedPassword, now]
      );
      console.log(`  auth.users record created: ${authUserId}`);
    } finally {
      await client.query("RESET session_replication_role");
      console.log('  Re-enabled all triggers');
    }

    // 2. Create auth.identities record
    console.log('[2/4] Creating auth.identities record...');
    const identityId = crypto.randomUUID();
    const identityData = JSON.stringify({
      sub: authUserId,
      email: EMAIL,
      email_verified: true,
      phone_verified: false
    });
    await client.query(
      `INSERT INTO auth.identities (
        id, provider_id, provider, identity_data, user_id, created_at, updated_at, last_sign_in_at
      ) VALUES (
        $1::uuid, $2, 'email',
        $3::jsonb,
        $4::uuid, $5, $5, $5
      )`,
      [identityId, authUserId, identityData, authUserId, now]
    );
    console.log(`  auth.identities record created: ${identityId}`);

    // 3. Create erp_users record
    console.log('[3/4] Creating erp_users record...');
    const erpUserId = crypto.randomUUID();
    await client.query(
      `INSERT INTO erp_users (id, auth_user_id, email, display_name, username, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [erpUserId, authUserId, EMAIL, 'System Admin', 'system.admin']
    );
    console.log(`  erp_users record created: ${erpUserId}`);

    // 4. Assign SUPER_ADMIN role
    console.log('[4/4] Assigning SUPER_ADMIN role...');
    const roleResult = await client.query(
      "SELECT id FROM roles WHERE role_code = 'SUPER_ADMIN' AND status = 'ACTIVE'"
    );
    if (roleResult.rows.length === 0) {
      throw new Error('SUPER_ADMIN role not found in database!');
    }
    const roleId = roleResult.rows[0].id;

    await client.query(
      `INSERT INTO user_roles (id, user_id, role_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'ACTIVE')`,
      [erpUserId, roleId]
    );
    console.log('  SUPER_ADMIN role assigned');

    await client.query('COMMIT');

    // Verify
    console.log('\n=== VERIFICATION ===');
    const verifyUser = await client.query(
      `SELECT u.id, u.email, u.display_name, u.status, r.role_code
       FROM erp_users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.status = 'ACTIVE'
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1`,
      [erpUserId]
    );
    const row = verifyUser.rows[0];
    console.log(`  erp_users id:  ${row.id}`);
    console.log(`  email:         ${row.email}`);
    console.log(`  display_name:  ${row.display_name}`);
    console.log(`  status:        ${row.status}`);
    console.log(`  role:          ${row.role_code}`);

    const permCount = await client.query(
      `SELECT COUNT(DISTINCT p.permission_code) as count
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1 AND rp.status = 'ACTIVE' AND p.status = 'ACTIVE'`,
      [roleId]
    );
    console.log(`  permissions:   ${permCount.rows[0].count}`);

    const hasMatrixView = await client.query(
      `SELECT EXISTS(
         SELECT 1 FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1 AND rp.status = 'ACTIVE' AND p.status = 'ACTIVE'
           AND p.permission_code = 'admin.roles.view'
       ) as has_it`,
      [roleId]
    );
    const hasMatrixEdit = await client.query(
      `SELECT EXISTS(
         SELECT 1 FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1 AND rp.status = 'ACTIVE' AND p.status = 'ACTIVE'
           AND p.permission_code = 'admin.roles.assign_permissions'
       ) as has_it`,
      [roleId]
    );
    console.log(`  matrix view:   ${hasMatrixView.rows[0].has_it}`);
    console.log(`  matrix edit:   ${hasMatrixEdit.rows[0].has_it}`);

    console.log('\n========================================');
    console.log('  PROVISIONING COMPLETE');
    console.log(`  Email:    ${EMAIL}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log(`  Role:     SUPER_ADMIN (${permCount.rows[0].count} permissions)`);
    console.log('========================================');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
