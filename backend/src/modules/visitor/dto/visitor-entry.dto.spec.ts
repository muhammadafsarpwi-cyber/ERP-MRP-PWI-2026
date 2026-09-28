import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateVisitorEntryDto } from './visitor-entry.dto';
import { normalizeCnic, maskCnic, normalizeMobile } from '../../../common/validators';

/**
 * Prompt #17 §5 / §8 — request-payload validation for Visitor Entry.
 *
 * The `forbidNonWhitelisted` options below are exactly the ones the app boots
 * with (`src/main.ts`), which is what makes "client cannot override Time-In"
 * a hard 400 rather than a silently ignored field.
 */
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

const valid = {
  divisionId: 'd1000000-0000-0000-0000-000000000002',
  locationId: 'a1000000-0000-0000-0000-00000000000c',
  visitorName: 'Muhammad Test',
  cnic: '12345-1234567-1',
  mobile: '0300-1234567',
  visitorCompany: 'PakWiz Trading',
  hostEmployeeId: 'e1000000-0000-0000-0000-00000000000c',
};

const run = async (payload: Record<string, unknown>) =>
  validate(plainToInstance(CreateVisitorEntryDto, payload, { enableImplicitConversion: true }), PIPE_OPTIONS);

const messages = (errors: ValidationError[]) =>
  errors.flatMap((e) => Object.values(e.constraints ?? {})).join(' | ');

describe('CreateVisitorEntryDto', () => {
  it('accepts a complete, valid visitor payload', async () => {
    expect(await run(valid)).toHaveLength(0);
  });

  it.each([
    ['13 raw digits', '1234512345671'],
    ['formatted CNIC', '12345-1234567-1'],
  ])('accepts a CNIC given as %s', async (_label, cnic) => {
    expect(await run({ ...valid, cnic })).toHaveLength(0);
  });

  it.each([
    ['too short', '12345'],
    ['12 digits', '123451234567'],
    ['letters', '12345-1234567-A'],
    ['bad separators', '12345.1234567.1'],
    ['missing', ''],
  ])('rejects an invalid CNIC (%s)', async (_label, cnic) => {
    const errors = await run({ ...valid, cnic });
    expect(errors.length).toBeGreaterThan(0);
    expect(messages(errors)).toMatch(/CNIC must be 13 digits or formatted as 00000-0000000-0/);
  });

  it.each(['03001234567', '0300-1234567', '+923001234567', '3001234567'])(
    'accepts the mobile number %s',
    async (mobile) => {
      expect(await run({ ...valid, mobile })).toHaveLength(0);
    },
  );

  it('normalises separators out of the mobile number', async () => {
    const dto = plainToInstance(CreateVisitorEntryDto, { ...valid, mobile: '0300-123 4567' }, {
      enableImplicitConversion: true,
    });
    expect(dto.mobile).toBe('03001234567');
  });

  it('rejects a malformed mobile number', async () => {
    const errors = await run({ ...valid, mobile: 'call-me-maybe' });
    expect(messages(errors)).toMatch(/Mobile number must be a valid number/);
  });

  it('requires every mandatory field', async () => {
    const errors = await run({});
    const props = errors.map((e) => e.property);
    expect(props).toEqual(
      expect.arrayContaining(['divisionId', 'locationId', 'visitorName', 'cnic', 'mobile', 'hostEmployeeId']),
    );
  });

  // ── §8 — Time-In can never come from the client ──────────────────────────
  it.each(['timeIn', 'time_out', 'timeOut', 'status', 'companyId', 'hostNameSnapshot', 'photoPath'])(
    'rejects a client-supplied %s (whitelist forbids it)',
    async (property) => {
      const errors = await run({ ...valid, [property]: 'x' });
      const props = errors.map((e) => e.property);
      expect(props).toContain(property);
      expect(messages(errors)).toMatch(/should not exist/);
    },
  );

  it('rejects a client-supplied time_in under the snake_case name too', async () => {
    const errors = await run({ ...valid, time_in: '2020-01-01T00:00:00Z' });
    expect(errors.map((e) => e.property)).toContain('time_in');
  });
});

describe('CNIC / mobile helpers', () => {
  it('normalises a CNIC without changing its digits', () => {
    expect(normalizeCnic('1234512345671')).toBe('12345-1234567-1');
    expect(normalizeCnic('12345-1234567-1')).toBe('12345-1234567-1');
    expect(normalizeCnic('12345')).toBeNull();
    expect(normalizeCnic(null)).toBeNull();
  });

  it('masks only the personal digits for list rows', () => {
    expect(maskCnic('1234512345671')).toBe('12345-*******-1');
    expect(maskCnic('12345-1234567-1')).toBe('12345-*******-1');
    expect(maskCnic(null)).toBeNull();
  });

  it('strips display separators from a mobile number', () => {
    expect(normalizeMobile('0300-123 4567')).toBe('03001234567');
  });
});
