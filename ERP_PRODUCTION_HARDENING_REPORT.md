# ERP Production Hardening Report

**Date:** 2026-08-29
**Legend:** ✅ PASS · ⚠️ PARTIAL · ❌ FAIL · 🔲 NOT TESTED

---

## 1. Environment Variables / Secrets

| Item | Status | Evidence |
|---|---|---|
| `.env` gitignored (backend + frontend) | ✅ PASS | `git check-ignore` confirms both excluded |
| Only `.env.example` / `.env.development` tracked | ✅ PASS | `git ls-files` |
| Service-role key not in frontend code | ✅ PASS | code audit |
| `DB_SSL_REJECT_UNAUTHORIZED=false` (dev) | ⚠️ PARTIAL | Required for Supabase pooler self-signed cert in dev; **production must set true** |
| `NODE_ENV=development` | ⚠️ PARTIAL | Production env not configured in repo |
| Supabase service-role / JWT secrets in backend `.env` | ⚠️ PARTIAL | Present (needed for admin ops); must be in secret manager for production |

## 2. Database Backup / Restore

| Item | Status | Evidence |
|---|---|---|
| `pg_dump` available in environment | ❌ FAIL | Not installed/on PATH in this environment |
| Backup executed | 🔲 NOT TESTED | Cannot run pg_dump here |
| Restore executed | 🔲 NOT TESTED | No second DB available |
| Supabase PITR / daily backup availability | ⚠️ PARTIAL | Supabase-managed (dashboard); not verified from here |
| **Backup/restore verification** | 🔲 **NOT TESTED** | **Documented blocker — cannot be verified in this environment** |

## 3. HTTPS / Transport

| Item | Status |
|---|---|
| Supabase DB over SSL | ✅ PASS (DB_SSL=true) |
| Backend → DB TLS | ⚠️ PARTIAL (rejectUnauthorized=false in dev) |
| Frontend served over HTTPS | 🔲 NOT TESTED (local Render/nginx; TLS not exercised here) |

## 4. Auth / Authentication

| Item | Status |
|---|---|
| Supabase JWT global guard | ✅ PASS |
| Anonymous blocked | ✅ PASS (RLS verified) |
| Token refresh (frontend) | ⚠️ PARTIAL (not implemented; session expires at token TTL) |
| Rate limiting | ⚠️ PARTIAL (in-memory, single instance) |

## 5. Logging / Monitoring / Error Handling

| Item | Status |
|---|---|
| NestJS logging (SQL + errors) | ✅ PASS (DB_LOGGING=true in dev) |
| `DB_LOGGING=true` in dev | ⚠️ PARTIAL (disable in prod to avoid SQL log noise) |
| Error responses (validation messages) | ✅ PASS |
| Monitoring / alerting | 🔲 NOT TESTED (no observability stack configured) |

## 6. Connection / Performance / Load

| Item | Status |
|---|---|
| TypeORM pool (max 10) | ✅ PASS |
| API response times on demo data | ✅ PASS |
| Load testing (large datasets) | 🔲 NOT TESTED |
| N+1 / eager-loading audit | ⚠️ PARTIAL (fixed HR list; others scale-dependent) |

## 7. Disaster Recovery

| Item | Status |
|---|---|
| Rollback procedure (migrations) | ⚠️ PARTIAL (documented approach; not executed) |
| PITR / restore runbook | 🔲 NOT TESTED |
| Redundant connection / failover | 🔲 NOT TESTED (Supabase-managed) |

## 8. Production Hardening Summary

| Metric | Count |
|---|---|
| PASS | 8 |
| PARTIAL | 8 |
| FAIL | 1 (pg_dump absent — test cannot run) |
| NOT TESTED | 7 |

**Critical hardening items NOT verifiable in this environment:** backup/restore execution, HTTPS end-to-end, load testing, monitoring. **Required before production:** set `DB_SSL_REJECT_UNAUTHORIZED=true`, move secrets to a secret manager, configure `NODE_ENV=production`, disable `DB_LOGGING`, add monitoring, and execute a real backup/restore drill.