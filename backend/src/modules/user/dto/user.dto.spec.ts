import 'reflect-metadata';
import { validateSync, ValidationError } from 'class-validator';
import { ScopeLevel } from '../entities';
import { AssignOrgScopeDto, SetDefaultContextDto, UUID_LOOSE } from './user.dto';

/**
 * Prompt #16A — regression cover for the Division Access grant payload.
 *
 * `divisions.id` for DIV-CCD / DIV-SPD are seeded values that are valid
 * PostgreSQL `uuid`s but are *not* RFC-4122 (version nibble 0, variant
 * nibble 0). class-validator's `@IsUUID()` delegates to validator.js, which
 * enforces those nibbles, so the API answered
 * `400 {"message":["divisionId must be a UUID"]}` for a correct id and the
 * Division Access modal could never grant those two divisions.
 *
 * These tests pin both halves of the contract: the seeded ids must pass, and
 * a human-readable code must still be rejected with the original message.
 */
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002'; // seeded, NOT RFC-4122
const DIV_SPD = 'd1000000-0000-0000-0000-000000000001'; // seeded, NOT RFC-4122
const DIV_PWI = '83ecd746-1cc9-4849-bec4-d00bcc3ceeec'; // real RFC-4122 v4
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791'; // real RFC-4122 v4

const messages = (errors: ValidationError[]): string[] =>
  errors.flatMap((e) => Object.values(e.constraints || {}));

const validateOrgScope = (dto: Partial<AssignOrgScopeDto>): ValidationError[] =>
  validateSync(Object.assign(new AssignOrgScopeDto(), dto));

const validateDefaultContext = (dto: Partial<SetDefaultContextDto>): ValidationError[] =>
  validateSync(Object.assign(new SetDefaultContextDto(), dto));

describe('UUID_LOOSE', () => {
  it('accepts every id the database actually stores', () => {
    for (const id of [DIV_CCD, DIV_SPD, DIV_PWI, COMPANY]) {
      expect(UUID_LOOSE.test(id)).toBe(true);
    }
  });

  it('rejects division codes and truncated ids', () => {
    for (const id of ['DIV-CCD', 'DIV-SPD', '', 'd1000000-0000-0000-0000-00000000000']) {
      expect(UUID_LOOSE.test(id)).toBe(false);
    }
  });

  it('does not let a non-UUID through just because it is hex shaped', () => {
    expect(UUID_LOOSE.test('zzzzzzzz-0000-0000-0000-000000000000')).toBe(false);
  });
});

describe('AssignOrgScopeDto (POST /admin/users/:id/org-scopes)', () => {
  it('accepts the seeded DIV-CCD / DIV-SPD ids that @IsUUID() rejected', () => {
    for (const divisionId of [DIV_CCD, DIV_SPD, DIV_PWI]) {
      expect(
        validateOrgScope({ companyId: COMPANY, divisionId, scopeLevel: ScopeLevel.DIVISION }),
      ).toHaveLength(0);
    }
  });

  it('still rejects a human-readable code with the original message', () => {
    const errors = validateOrgScope({
      companyId: COMPANY,
      divisionId: 'DIV-CCD',
      scopeLevel: ScopeLevel.DIVISION,
    });
    expect(messages(errors)).toEqual(['divisionId must be a UUID']);
  });

  it('still rejects malformed division ids', () => {
    for (const divisionId of ['', 'not-a-uuid', 'd1000000-0000-0000-0000-00000000000']) {
      expect(
        messages(
          validateOrgScope({ companyId: COMPANY, divisionId, scopeLevel: ScopeLevel.DIVISION }),
        ),
      ).toContain('divisionId must be a UUID');
    }
  });

  it('treats an omitted divisionId as company-wide (still optional)', () => {
    expect(
      validateOrgScope({ companyId: COMPANY, scopeLevel: ScopeLevel.COMPANY }),
    ).toHaveLength(0);
  });

  it('keeps companyId on strict UUID validation', () => {
    expect(
      messages(validateOrgScope({ companyId: 'COMP-001', scopeLevel: ScopeLevel.COMPANY })),
    ).toContain('companyId must be a UUID');
  });

  it('keeps scopeLevel constrained to the ScopeLevel enum', () => {
    expect(
      validateOrgScope({
        companyId: COMPANY,
        divisionId: DIV_CCD,
        scopeLevel: 'TEAM' as unknown as ScopeLevel,
      }),
    ).toHaveLength(1);
  });
});

describe('SetDefaultContextDto (set default context)', () => {
  it('accepts the seeded division ids for a default division', () => {
    for (const divisionId of [DIV_CCD, DIV_SPD, DIV_PWI]) {
      expect(validateDefaultContext({ companyId: COMPANY, divisionId })).toHaveLength(0);
    }
  });

  it('still rejects DIV-CCD as a default division', () => {
    const errors = validateDefaultContext({ companyId: COMPANY, divisionId: 'DIV-CCD' });
    expect(messages(errors)).toEqual(['divisionId must be a UUID']);
  });
});
