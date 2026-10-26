-- ============================================================================
-- ERP_00073 — AI ASSISTANT READ-ONLY EXECUTION LAYER
--
-- Security model (defense in depth):
--   Layer 1 (this file)      Dedicated `erp_ai_reader` role: SELECT-only
--                            grants, default_transaction_read_only=on,
--                            statement/lock/idle timeouts.
--   Layer 2 (TypeORM)        Secondary independent DataSource named
--                            'ai-readonly' in backend/src/modules/ai — all
--                            AI-generated SQL executes through it only.
--   Layer 3 (app guard)      read-only-sql.util.ts blocks any statement that
--                            is not a single SELECT and logs a security alert.
--
-- HOW TO RUN
--   • Local docker:  psql -U postgres -d erp_database -f this_file
--   • Supabase:      SQL Editor → run this file (owner must be `postgres`)
--
-- THEN set in backend/.env:
--   AI_DB_USERNAME=erp_ai_reader
--   AI_DB_PASSWORD=<the password set below — CHANGE IT>
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. DEDICATED READ-ONLY ROLE
--    Created NOLOGIN first so the role can be hardened BEFORE it can connect.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_ai_reader') THEN
    CREATE ROLE erp_ai_reader NOLOGIN;
  END IF;
END $$;

-- ⚠️ CHANGE THIS PASSWORD for production, then mirror it in backend/.env
--    (AI_DB_PASSWORD). Use a 24+ char random string, e.g.:
--      openssl rand -base64 24
ALTER ROLE erp_ai_reader LOGIN PASSWORD 'ChangeMe_AiReader_Str0ng!';

-- Privilege hardening: it can only connect and read. Period.
-- NOTE: New roles default to NOSUPERUSER, NOBYPASSRLS, NOREPLICATION.
-- Supabase's `postgres` role has CREATEROLE + CREATEDB but is NOT a Postgres
-- SUPERUSER (only `supabase_admin` is), and PG 15/16+ rejects ALTER ROLE with
-- NOSUPERUSER / NOBYPASSRLS / NOREPLICATION from non-superusers (ERROR 42501).
ALTER ROLE erp_ai_reader
  NOCREATEDB         -- cannot create databases
  NOCREATEROLE       -- cannot create/modify roles
  LOGIN CONNECTION LIMIT 10;   -- cap concurrent sessions (pooler + AI pool)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper = true) THEN
    ALTER ROLE erp_ai_reader NOSUPERUSER NOBYPASSRLS NOREPLICATION;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. STRICT EXECUTION TIMEOUTS (set directly on the role)
--    These apply to EVERY session of erp_ai_reader, so an unoptimized
--    generated query can never freeze the Supabase pooler or the DB.
-- ────────────────────────────────────────────────────────────────────────────
-- Kill any statement running longer than 15 seconds (57014 = query cancelled).
ALTER ROLE erp_ai_reader SET statement_timeout = '15s';
-- Do not let a transaction sit idle holding resources.
ALTER ROLE erp_ai_reader SET idle_in_transaction_session_timeout = '10s';
-- Abandon lock waits after 3s instead of queueing behind other work.
ALTER ROLE erp_ai_reader SET lock_timeout = '3s';
-- HARD DATABASE-LEVEL GUARDRAIL: every transaction opened by this role is
-- read-only. Even if every application-layer check were bypassed, PostgreSQL
-- itself rejects INSERT/UPDATE/DELETE/DDL with:
--   "cannot execute ... in a read-only transaction"
ALTER ROLE erp_ai_reader SET default_transaction_read_only = on;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CONNECTION + NAMESPACE GRANTS
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO erp_ai_reader', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO erp_ai_reader;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. EXPLICIT SELECT-ONLY GRANTS ON THE AI-VISIBLE TABLES
--    Only these tables are readable by the AI engine. Add new table names to
--    the ARRAY below as the assistant gains new data domains.
--    NOTE: the maintenance module's table is `maintenance_job_cards`
--          (there is no `job_cards` table); both names are listed so the
--          migration is self-healing if the table is ever renamed.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  table_name TEXT;
  granted    TEXT[] := '{}';
  missing    TEXT[] := '{}';
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'production_entries',
    'maintenance_job_cards',
    'job_cards',
    'customers',
    'machines',
    'divisions'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO erp_ai_reader', table_name);
      granted := granted || table_name;
    ELSE
      missing := missing || table_name;
    END IF;
  END LOOP;

  RAISE NOTICE 'erp_ai_reader: SELECT granted on % table(s): %',
    array_length(granted, 1), array_to_string(granted, ', ');
  IF array_length(missing, 1) > 0 THEN
    RAISE NOTICE 'erp_ai_reader: table(s) not found (skipped): %',
      array_to_string(missing, ', ');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. DEFAULT PRIVILEGES — SELECT on future tables (as specified)
--    Any table later created in `public` by the migration-running role
--    (postgres / Supabase) automatically becomes readable by the AI role.
--
--    Trade-off to be aware of: a FUTURE sensitive table (e.g. payroll) would
--    silently become AI-readable. Two mitigations already exist:
--      • the LLM never sees tables that are not on the allow-list in
--        schema-catalog.service.ts, and the SQL guard rejects unknown tables;
--      • if you prefer fail-closed-by-default instead, comment this line out
--        and add table names explicitly to section 4 above.
-- ────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO erp_ai_reader;

-- Belt and braces: never let default privileges grant more than SELECT, even
-- if someone later broadens them by mistake.
ALTER ROLE erp_ai_reader SET default_transaction_read_only = on;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. PERMISSIONS — ai.query / ai.voice (house convention: module.action)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO permissions (permission_code, name, module, resource, action, description, status, created_at, updated_at)
  VALUES
    ('ai.query',
     'AI Assistant — Ask questions (Text-to-SQL)',
     'ai', 'assistant', 'query',
     'Translate natural-language (English/Urdu) questions into read-only SELECT queries and return ERP data, scoped to the user''s divisions.',
     'ACTIVE', NOW(), NOW()),
    ('ai.voice',
     'AI Assistant — Voice query (Speech-to-Text)',
     'ai', 'assistant', 'voice',
     'Upload microphone audio, transcribe it with Whisper and run it through the Text-to-SQL engine.',
     'ACTIVE', NOW(), NOW())
  ON CONFLICT DO NOTHING;
END $$;

-- Grant both permissions to system admin roles.
DO $$
DECLARE
  role_rec  RECORD;
  perm_rec  RECORD;
BEGIN
  FOR role_rec IN
    SELECT id FROM roles WHERE role_code IN ('SUPER_ADMIN', 'ADMIN') AND status = 'ACTIVE'
  LOOP
    FOR perm_rec IN
      SELECT id FROM permissions WHERE permission_code IN ('ai.query', 'ai.voice')
    LOOP
      INSERT INTO role_permissions (id, role_id, permission_id, status, is_active, created_at, updated_at)
      SELECT gen_random_uuid(), role_rec.id, perm_rec.id, 'ACTIVE', true, NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = role_rec.id AND rp.permission_id = perm_rec.id
      );
    END LOOP;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. VERIFICATION (run manually after migration)
-- ────────────────────────────────────────────────────────────────────────────
--   psql "$CONN" -U erp_ai_reader -c "SELECT count(*) FROM production_entries;" -- OK
--   psql "$CONN" -U erp_ai_reader -c "DELETE FROM production_entries;"          -- FAILS (read-only tx)
--   psql "$CONN" -U erp_ai_reader -c "DROP TABLE customers;"                    -- FAILS (no privilege)
--   psql "$CONN" -U erp_ai_reader -c "SELECT pg_sleep(60);"                     -- FAILS (15s timeout)
--   psql "$CONN" -U erp_ai_reader -c "SELECT * FROM erp_users;"                 -- FAILS (no grant)
-- ============================================================================
