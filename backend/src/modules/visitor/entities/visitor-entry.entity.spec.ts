import { getMetadataArgsStorage } from 'typeorm';
import { VisitorEntry } from './visitor-entry.entity';

/**
 * MAPPING GUARD — Prompt #19 §35 / §36.
 *
 * Prompt #18 found a silent, application-wide failure: one `@Column` without an
 * explicit `name` under a project that runs no snake_case NamingStrategy, so
 * Postgres rejected every insert and the audit trail was silently empty. The
 * Prompt #19 migration adds EIGHT columns to `visitor_entries` and reads every
 * one of them through TypeORM, so the entity ↔ migration agreement is asserted
 * here instead of being discovered by a 500 at runtime.
 *
 * These names are the same ones `20260930000000_erp_00071_visitor_slip.sql`
 * creates. If either side changes, this test is where the mismatch surfaces.
 */
describe('VisitorEntry column mapping', () => {
  const columns = getMetadataArgsStorage()
    .columns.filter((c) => c.target === VisitorEntry)
    .map((c) => ({ property: c.propertyName, name: c.options.name as string | undefined }));

  const byProperty = Object.fromEntries(columns.map((c) => [c.property, c.name]));

  it('maps the Prompt #19 slip/host-confirmation columns to the migration names', () => {
    expect(byProperty).toMatchObject({
      visitorReference: 'visitor_reference',
      hostConfirmed: 'host_confirmed',
      hostConfirmedAt: 'host_confirmed_at',
      hostConfirmedBy: 'host_confirmed_by',
      signaturePath: 'signature_path',
      signatureMime: 'signature_mime',
      signatureCapturedAt: 'signature_captured_at',
      signatureCapturedBy: 'signature_captured_by',
    });
  });

  it('leaves the Prompt #17 / #18 columns mapped exactly as they were', () => {
    expect(byProperty).toMatchObject({
      companyId: 'company_id',
      divisionId: 'division_id',
      locationId: 'location_id',
      visitorName: 'visitor_name',
      visitorCompany: 'visitor_company',
      hostEmployeeId: 'host_employee_id',
      hostNameSnapshot: 'host_name_snapshot',
      photoPath: 'photo_path',
      photoMime: 'photo_mime',
      timeIn: 'time_in',
      timeOut: 'time_out',
      exitedBy: 'exited_by',
    });
  });

  it('never asks Postgres for a camelCase column', () => {
    const offenders = columns.filter((c) => !c.name && /[A-Z]/.test(c.property));
    expect(offenders).toEqual([]);
  });
});
