import { DataSource } from 'typeorm';

/**
 * Resolves `createdByName` / `updatedByName` for entity records whose
 * `createdBy` / `updatedBy` columns hold either an erp_users.id or an
 * auth user id (auth_user_id). Populates the attached display name only
 * when a real value exists; leaves fields null otherwise so the UI never
 * shows a hard-coded or fabricated name.
 */
export async function populateAuditNames<T extends { createdBy?: string | null; updatedBy?: string | null }>(
  dataSource: DataSource,
  records: T[],
): Promise<T[]> {
  if (!records || records.length === 0) return records;

  const userIds = new Set<string>();
  for (const record of records) {
    if (record.createdBy) userIds.add(record.createdBy);
    if (record.updatedBy) userIds.add(record.updatedBy);
  }

  if (userIds.size === 0) return records;

  try {
    const idsArray = Array.from(userIds);
    const users = await dataSource.query(
      `SELECT id, auth_user_id, display_name, email FROM erp_users WHERE id = ANY($1::uuid[]) OR auth_user_id = ANY($1::uuid[])`,
      [idsArray],
    );

    const nameMap = new Map<string, string>();
    for (const u of users) {
      const name = u.display_name || u.email;
      if (!name) continue;
      if (u.id) nameMap.set(u.id, name);
      if (u.auth_user_id) nameMap.set(u.auth_user_id, name);
    }

    for (const record of records) {
      (record as any).createdByName = record.createdBy ? (nameMap.get(record.createdBy) || null) : null;
      (record as any).updatedByName = record.updatedBy ? (nameMap.get(record.updatedBy) || null) : null;
    }
  } catch {
    // Graceful fallback: leave audit names null rather than fabricating them.
    for (const record of records) {
      (record as any).createdByName = null;
      (record as any).updatedByName = null;
    }
  }

  return records;
}