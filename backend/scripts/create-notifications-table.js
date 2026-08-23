/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

async function main() {
  loadEnv();
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS "public"."notifications" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "created_by" UUID,
      "updated_by" UUID,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "user_id" UUID NOT NULL,
      "type" VARCHAR(50) NOT NULL,
      "title" VARCHAR(200) NOT NULL,
      "message" VARCHAR(500),
      "entity_type" VARCHAR(50),
      "entity_id" UUID,
      "is_read" BOOLEAN NOT NULL DEFAULT false,
      "read_at" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "pk_notifications" PRIMARY KEY ("id")
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "idx_notifications_user_read" ON "notifications" ("user_id", "is_read")`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_notifications_user_entity" ON "notifications" ("user_id", "entity_type", "entity_id")`);

  const t = await client.query(`SELECT to_regclass('public.notifications') AS tbl`);
  console.log('TABLE:', t.rows[0].tbl);

  const users = await client.query(
    `SELECT id, auth_user_id, email, display_name, status FROM public.erp_users WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 5`
  );
  console.log('ACTIVE_USERS:');
  for (const u of users.rows) console.log(' ', JSON.stringify(u));

  const companies = await client.query(`SELECT id, company_code FROM public.companies LIMIT 3`);
  console.log('COMPANIES:');
  for (const c of companies.rows) console.log(' ', JSON.stringify(c));

  await client.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
