import { DataSource } from 'typeorm';

/**
 * Resolves `createdByName` / `updatedByName` for entity records whose
 * `createdBy` / `updatedBy` columns hold either an erp_users.id or an
 * auth user id (auth_user_id). Populates the attached display name only
 * when a real value exists; leaves fields null otherwise so the UI never
 * shows a hard-coded or fabricated name.
 */
const AUDIT_NAME_CACHE_TTL_MS = 60_000;
const auditNameCache = new Map<string, { name: string | null; expiresAt: number }>();

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

  const now = Date.now();
  const isTest = process.env.NODE_ENV === 'test';
  const nameMap = new Map<string, string>();
  const missingIds: string[] = [];

  for (const uid of userIds) {
    if (!isTest) {
      const cached = auditNameCache.get(uid);
      if (cached && cached.expiresAt > now) {
        if (cached.name) nameMap.set(uid, cached.name);
        continue;
      }
    }
    missingIds.push(uid);
  }

  try {
    if (missingIds.length > 0) {
      const users = await dataSource.query(
        `SELECT id, auth_user_id, display_name, email FROM erp_users WHERE id = ANY($1::uuid[]) OR auth_user_id = ANY($1::uuid[])`,
        [missingIds],
      );

      const expiresAt = Date.now() + AUDIT_NAME_CACHE_TTL_MS;
      const fetchedIds = new Set<string>();
      for (const u of users) {
        const name = u.display_name || u.email || null;
        if (u.id) {
          fetchedIds.add(u.id);
          if (!isTest) auditNameCache.set(u.id, { name, expiresAt });
          if (name) nameMap.set(u.id, name);
        }
        if (u.auth_user_id) {
          fetchedIds.add(u.auth_user_id);
          if (!isTest) auditNameCache.set(u.auth_user_id, { name, expiresAt });
          if (name) nameMap.set(u.auth_user_id, name);
        }
      }
      if (!isTest) {
        for (const missingId of missingIds) {
          if (!fetchedIds.has(missingId)) {
            auditNameCache.set(missingId, { name: null, expiresAt });
          }
        }
      }
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