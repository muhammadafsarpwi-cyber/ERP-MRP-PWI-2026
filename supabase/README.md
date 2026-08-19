# Supabase Migrations

This directory contains version-controlled database migrations for the ERP system.

## Structure

```
supabase/
├── migrations/
│   ├── <timestamp>_initial_schema.sql
│   ├── <timestamp>_company_organization.sql
│   ├── <timestamp>_division_section_department.sql
│   └── ...
├── seed.sql
└── config.toml
```

## Migration Convention

- Each migration file must be named with a timestamp prefix: `<YYYYMMDDHHMMSS>_<description>.sql`
- Example: `20260818120000_initial_schema.sql`
- Migrations must be idempotent (safe to run multiple times)
- All schema changes must be tracked in migration files
- Never manually modify the production database schema

## Workflow

1. Create migration file
2. Apply to development Supabase database
3. Verify schema
4. Test constraints and relationships
5. Commit migration file
6. Update documentation

## Rollback

Each migration should include a rollback section (commented) for reversibility where practical.
