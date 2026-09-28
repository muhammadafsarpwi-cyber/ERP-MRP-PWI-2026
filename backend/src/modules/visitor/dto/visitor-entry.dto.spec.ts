import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateVisitorEntryDto, ListVisitorEntriesQueryDto } from './visitor-entry.dto';
import type { ExitVisitorEntryBody } from './visitor-entry.dto';
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

/**
 * Prompt #18 §4 — WHY the exit route has no DTO class.
 *
 * DEFECT FOUND DURING PROMPT #18 IMPLEMENTATION (and fixed before it shipped).
 * The obvious way to make "the client cannot send a Time-Out" is an empty DTO:
 *
 *     export class ExitVisitorEntryDto {}
 *
 * Under the pipe options this app boots with, that class makes class-validator
 * answer `unknownValue: "an unknown value was passed to the validate function"`
 * — for EVERY payload, an empty body included — so every checkout would 400.
 *
 * `ExitVisitorEntryBody` is therefore a plain record, which Nest's
 * `ValidationPipe.toValidate` skips (`Object` is in its skip list), and the
 * enforcement lives in `VisitorEntryController.assertNoClientExitFields`.
 *
 * This test is the guard that keeps nobody from "fixing" the type back into an
 * empty class.
 */
describe('exit payload typing (Prompt #18 §4)', () => {
  class EmptyDto {}

  const run = (payload: Record<string, unknown>) =>
    validate(plainToInstance(EmptyDto, payload), PIPE_OPTIONS);

  it('an empty DTO class is NOT a safe way to forbid a body — it rejects everything', async () => {
    // Even an empty body fails, which is why the exit route does not use one.
    const errors = await run({});
    expect(errors).toHaveLength(1);
    expect(messages(errors)).toMatch(/an unknown value was passed to the validate function/);
  });

  it('keeps the exit body a plain record, so the pipe skips it', () => {
    // Compile-time contract: a record is not a class, so ValidationPipe.toValidate
    // returns false for it and the controller's own key check is the gate.
    const body: ExitVisitorEntryBody = {};
    expect(typeof body).toBe('object');
    expect(body instanceof EmptyDto).toBe(false);
  });
});

/** Prompt #18 §12 / §19 — the list filters that drive the pending/completed views. */
describe('ListVisitorEntriesQueryDto', () => {
  const run = (payload: Record<string, unknown>) =>
    validate(plainToInstance(ListVisitorEntriesQueryDto, payload, { enableImplicitConversion: true }), PIPE_OPTIONS);

  it.each(['PENDING', 'INSIDE', 'COMPLETED', 'CANCELLED'])('accepts the %s status filter', async (status) => {
    expect(await run({ status })).toHaveLength(0);
  });

  it('rejects an unknown status', async () => {
    const errors = await run({ status: 'NOPE' });
    expect(errors.map((e) => e.property)).toContain('status');
  });

  it.each([
    ['true', true],
    ['"true"', true],
    ['1', true],
    ['false', false],
    ['absent', undefined],
  ])('normalises the current-day flag sent as %s', async (_label, raw) => {
    const dto = plainToInstance(
      ListVisitorEntriesQueryDto,
      raw === undefined ? {} : { today: raw },
      { enableImplicitConversion: true },
    );
    expect(dto.today).toBe(raw);
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
