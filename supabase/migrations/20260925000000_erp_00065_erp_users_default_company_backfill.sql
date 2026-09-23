-- ERP-000XX: Backfill missing erp_users.default_company_id with COMP-001
--
-- Symptom: the Maintenance Division dropdown rendered blank for QA/GM/management
-- profiles because their erp_users.default_company_id was NULL, so the frontend
-- hierarchy hook returned early before ever requesting /divisions.
--
-- Non-destructive + idempotent: only fills NULLs, never overwrites an existing
-- company binding. Safe to re-run.
--
-- Company resolved by code (COMP-001) rather than hardcoding the UUID, so the
-- statement stays correct if the seed is ever re-applied on another environment.

UPDATE erp_users
SET default_company_id = c.id,
    updated_at = NOW()
FROM companies c
WHERE erp_users.default_company_id IS NULL
  AND c.company_code = 'COMP-001';

-- Expected: 3 rows (store.gm.qa@erp-local.test, store.manager.qa@erp-local.test,
-- system.replenishment@erp.local). Re-run reports 0.
