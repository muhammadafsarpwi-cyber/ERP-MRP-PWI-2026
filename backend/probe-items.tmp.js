require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, ssl: { rejectUnauthorized: false },
});
const EMAIL = 'dev@erp-local.test';
const TEMP_PASS = 'Probe-2026-x1!';
(async () => {
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const userId = (await q(`SELECT id FROM auth.users WHERE email=$1`, [EMAIL]))[0].id;
  const oldHash = (await q(`SELECT encrypted_password FROM auth.users WHERE id=$1`, [userId]))[0].encrypted_password;
  await q(`UPDATE auth.users SET encrypted_password=$1 WHERE id=$2`, [bcrypt.hashSync(TEMP_PASS, 10), userId]);
  try {
    const login = await fetch('http://localhost:3001/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: TEMP_PASS }),
    });
    const lj = await login.json();
    const token = lj.token;
    for (const qs of ['', '?limit=500', '?status=ACTIVE&limit=500', '?active=true&limit=500']) {
      const r = await fetch(`http://localhost:3001/api/v1/master-data/items${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      console.log(qs || '(none)', '→', r.status, 'total=', j.total, 'len=', Array.isArray(j.data) ? j.data.length : 'n/a');
    }
    // what does the user's org profile look like?
    const prof = await q(`SELECT default_company_id, default_division_id, default_section_id, default_department_id FROM erp_users WHERE auth_user_id=$1`, [userId]);
    console.log('erp profile:', prof);
  } finally {
    await q(`UPDATE auth.users SET encrypted_password=$1 WHERE id=$2`, [oldHash, userId]);
    await pool.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
