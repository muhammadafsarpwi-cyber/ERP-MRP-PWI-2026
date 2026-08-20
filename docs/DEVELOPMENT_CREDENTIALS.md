# Development Credentials

## Overview

This document describes the development login setup for ERP-MRP-PWI-2026. **Never commit real production credentials.** All values here are for local development only.

## Authentication Architecture

The ERP system uses **Supabase Auth** for authentication:

1. **Frontend** sends email/password to `POST /api/v1/auth/login`
2. **Backend** authenticates against Supabase Auth REST API (`/auth/v1/token?grant_type=password`)
3. Backend returns a JWT access token + refresh token + user profile
4. Frontend stores the token in `localStorage` and uses it for all API calls via the `Authorization: Bearer <token>` header
5. Backend guards (`SupabaseJwtGuard`) verify the JWT on protected routes
6. Backend auto-provisions an `erp_users` record on first login if none exists for the auth user

## Development Login

### Credentials

- **Email**: `dev@erp-local.test`
- **Password**: Set via direct database reset (not stored in source code, not in any migration, not in any config file)
- **To reset**: Update `encrypted_password` in `auth.users` table using a bcrypt hash, or use the Supabase Dashboard if service role key is available

### Other Confirmed Users (same password)

| Email | Status | Notes |
|-------|--------|-------|
| `dev@erp-local.test` | Active, confirmed | Primary dev account |
| `muhammadafsarpwi@gmail.com` | Active, confirmed | Also usable |
| `admin@erp.com` | Active, confirmed (reset) | Also usable |

### How to Reset the Password

If you need to change the dev password, run this SQL via Supabase SQL Editor or a direct database connection:

```sql
-- Replace '<NEW_HASH>' with: node -e "console.log(require('bcrypt').hashSync('YourNewPassword', 10))"
UPDATE auth.users
SET encrypted_password = '<NEW_HASH>',
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email = 'dev@erp-local.test';
```

Or via Supabase REST API (if you have the real service role key):

```bash
curl -X POST https://gnvobiwlzezostzjpqvu.supabase.co/auth/v1/admin/users/<user_id> \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"password": "YourNewPassword"}'
```

### Login Steps

1. Start services: `.\scripts\start-dev.ps1`
2. Navigate to http://localhost:3000
3. Enter the email and password
4. Dashboard loads with user greeting and module cards

## Environment Variables

Backend secrets are in `backend/.env`. These are development-only values:

| Variable | Purpose | Notes |
|----------|---------|-------|
| `JWT_SECRET` | Local JWT fallback (not used for Supabase auth) | `dev-jwt-secret-not-for-production` |
| `SUPABASE_JWT_SECRET` | Supabase JWT verification | ⚠️ Currently set to anon key (fallback to API verification) |
| `SUPABASE_ANON_KEY` | Supabase public API key | Used for auth API calls |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin operations | ⚠️ Currently equals anon key (admin API unavailable) |
| `DB_HOST` | PostgreSQL host | Supabase pooler endpoint |
| `DB_PASSWORD` | PostgreSQL password | Project-specific |

### Known Issues

- `SUPABASE_JWT_SECRET` is set to the anon JWT token instead of the HS256 signing secret. The backend detects this and falls back to Supabase API verification (slower but functional).
- `SUPABASE_SERVICE_ROLE_KEY` is identical to `SUPABASE_ANON_KEY`. Admin API operations (list users, confirm user, admin password reset) return 403. Use direct database access for admin operations instead.

**Never modify these values in production.** See `.env` files for actual values.

## Security Rules

- Development credentials must only be used locally
- Never hardcode passwords in source code
- Never commit real credentials to version control
- Production credentials must be injected via environment variables or secrets manager
- Passwords are never stored in plaintext — Supabase Auth uses bcrypt hashing
- The login response contains no password fields — only id, email, displayName, status
- Admin password reset sets a new password but does not reveal the existing one
- Temp scripts with credentials are in `.gitignore` and never committed

## Password Policy

All password-setting endpoints enforce:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- New password must differ from current (change password flow)
- Confirmation field required (user-facing flows)
