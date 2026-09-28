# Prompt #16 — Pre-Implementation Organization Scope Audit

Generated: 2026-09-27T12:50:58.774Z
Source: PostgreSQL postgres@aws-1-ap-northeast-1.pooler.supabase.com:6543 (read-only SELECT)

## Division Master (source of truth: `divisions`)

- `DIV-001` Manufacturing Division — INACTIVE (50824516-9c24-4122-86e7-c8e6fa1c5869)
- `DIV-002` Sales & Marketing Division — INACTIVE (b28f9d4f-53f3-4883-afb4-2af73c4dcca7)
- `DIV-003` Supply Chain Division — INACTIVE (3f222d46-6f96-44f6-9ead-27467c7e93a1)
- `DIV-004` Finance & Administration Division — INACTIVE (9efc527e-811d-4b45-92ea-4a562ab212cc)
- `DIV-005` Quality & Engineering Division — INACTIVE (a6b0f919-fcfc-4e31-85e0-ebd35766f9c2)
- `DIV-CCD` Control Cable Division — ACTIVE (d1000000-0000-0000-0000-000000000002)
- `DIV-NB` NB Division — ACTIVE (0653339b-94d0-4cc5-b880-e07908b2015f)
- `DIV-PWI` Main Division E-51 — ACTIVE (83ecd746-1cc9-4849-bec4-d00bcc3ceeec)
- `DIV-SPD` Spoke Division — ACTIVE (d1000000-0000-0000-0000-000000000001)

Existing `role_permission_division_scopes` table: not created yet

Total ERP users: 13

## A — No organization scope (will be AUTO-HEALED to full company scope on first guarded request)

Count: 1

  - System (Automatic Replenishment) | user=system.replenishment | roles=- | company=COMP-001 | defaultDiv=- | scopes=0[-] divs=[-] full=[-] status=[-]

## B — Company-level full scope (unrestricted ⇒ enforcement is a NO-OP for these users)

Count: 12

  -   Anas | user=Anas | roles=PRODUCTION | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - Anas | user=Anas | roles=PRODUCTION | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - dev@erp-local.test | user=Admin | roles=PRODUCTION, SUPER_ADMIN | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - GM Operation | user=GM_Operation | roles=MANAGEMENT | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - junaid | user=JunaidKareem | roles=PRODUCTION | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - Muhammad Afsar | user=muhammadafsarpwi | roles=SUPER_ADMIN | company=COMP-001 | defaultDiv=DIV-SPD | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - Muhammad Alam | user=Admin | roles=PRODUCTION | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - Muhammad Junaid | user=Junaidspd | roles=PRODUCTION | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - Rizwan ahmed | user=Rizwan | roles=SUPER_ADMIN | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - Store Manager QA (TASK11) | user=store_manager_qa | roles=INVENTORY | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]
  - Super Administrator | user=super_admim | roles=SUPER_ADMIN | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[false] status=[ACTIVE]
  - System Admin | user=system.admin | roles=PRODUCTION, SUPER_ADMIN | company=COMP-001 | defaultDiv=- | scopes=1[COMPANY] divs=[(company-wide)] full=[true] status=[ACTIVE]

## C — Division-level scope (⚠ ENFORCEMENT WILL START FILTERING THESE USERS)

Count: 0

_None._

## D — Department-level scope

Count: 0

_None._

## E — Section-level scope

Count: 0

_None._

## F — Inactive users holding scopes

Count: 0

_None._

