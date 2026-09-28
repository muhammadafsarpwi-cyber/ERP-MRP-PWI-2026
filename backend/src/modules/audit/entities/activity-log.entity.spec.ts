import { getMetadataArgsStorage } from 'typeorm';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ActivityLog } from './activity-log.entity';

/**
 * DEFECT GUARD — Prompt #18 §16.
 *
 * `ActivityLog.targetType` was mapped with `@Column({ type: 'varchar' })` and no
 * `name`, while this project runs NO snake_case NamingStrategy (every other
 * column names its database column explicitly, see `BaseEntity`). Postgres then
 * rejected every insert with
 *
 *   column "targetType" of relation "activity_logs" does not exist
 *
 * and `ActivityLogService.log()` swallows that error, so the application-wide
 * audit trail was silently empty — including the visitor exit audit that Prompt
 * #18 requires. The live run that found it: 0 rows in `activity_logs` for every
 * target type while the exit endpoint returned 200.
 *
 * The two blocks below pin the fix at the level it happened (the entity) and at
 * the level that would catch the next occurrence anywhere in the codebase.
 */
describe('ActivityLog column mapping', () => {
  const columnsFor = (target: new () => unknown) =>
    getMetadataArgsStorage()
      .columns.filter((c) => c.target === target)
      .map((c) => ({ property: c.propertyName, name: c.options.name as string | undefined }));

  it('maps every camelCase property to its snake_case database column', () => {
    const columns = columnsFor(ActivityLog);
    const byProperty = Object.fromEntries(columns.map((c) => [c.property, c.name]));

    expect(byProperty).toMatchObject({
      actorUserId: 'actor_user_id',
      actorEmail: 'actor_email',
      targetType: 'target_type', // ← the column that silently failed
      targetId: 'target_id',
      targetName: 'target_name',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
    });
  });

  it('never asks Postgres for a camelCase column', () => {
    const offenders = columnsFor(ActivityLog).filter(
      (c) => !c.name && /[A-Z]/.test(c.property),
    );
    expect(offenders).toEqual([]);
  });
});

describe('every entity in src/ maps its columns explicitly', () => {
  const SRC = join(__dirname, '..', '..', '..');

  const entityFiles = (dir = join(SRC, 'modules')): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...entityFiles(full));
      else if (entry.endsWith('.entity.ts')) out.push(full);
    }
    return out;
  };

  it('has no camelCase property mapped without an explicit `name`', () => {
    const offenders: string[] = [];

    for (const file of entityFiles()) {
      const src = readFileSync(file, 'utf8');
      const re = /@(Column|CreateDateColumn|UpdateDateColumn)\(([^)]*)\)\s*\n\s*([A-Za-z_][A-Za-z0-9_]*)\s*[?!]?:/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(src)) !== null) {
        const [, decorator, args, property] = match;
        if (!/[A-Z]/.test(property)) continue; // single words need no mapping
        if (/\bname\s*:/.test(args)) continue;
        offenders.push(`${file.replace(SRC, 'src')} :: ${property} (@${decorator})`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
