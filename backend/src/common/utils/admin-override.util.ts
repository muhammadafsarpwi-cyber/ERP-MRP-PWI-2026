import { EntityManager } from 'typeorm';

export interface AdminAuditActor {
  userId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const ADMIN_ROLE_NAMES = new Set(['administrator', 'super admin', 'superadmin', 'admin']);
const ADMIN_ROLE_CODES = new Set(['ADMIN', 'SUPER_ADMIN', 'ADMINISTRATOR']);

/**
 * Checks whether the current HTTP request belongs to an Administrator role.
 * Checks fast-path request user metadata first, then verifies against DB user_roles/roles.
 */
export async function isAdministratorRequest(req: any, manager?: EntityManager): Promise<boolean> {
  if (!req) return false;

  const directRoles: string[] = [];
  const collectRoles = (r: any) => {
    if (!r) return;
    if (typeof r === 'string') {
      directRoles.push(r);
    } else if (Array.isArray(r)) {
      r.forEach(collectRoles);
    } else if (typeof r === 'object') {
      if (r.name) directRoles.push(String(r.name));
      if (r.code) directRoles.push(String(r.code));
      if (r.role?.name) directRoles.push(String(r.role.name));
      if (r.role?.code) directRoles.push(String(r.role.code));
    }
  };

  collectRoles(req.erpUser?.role);
  collectRoles(req.erpUser?.roles);
  collectRoles(req.erpUser?.userRoles);
  collectRoles(req.user?.role);
  collectRoles(req.user?.roles);

  if (
    directRoles.some(
      (role) => ADMIN_ROLE_NAMES.has(role.trim().toLowerCase()) || ADMIN_ROLE_CODES.has(role.trim().toUpperCase()),
    )
  ) {
    return true;
  }

  const erpUserId = req.erpUser?.id;
  const authUserId = req.user?.id;
  if (!manager || (!erpUserId && !authUserId)) return false;

  try {
    const rows = await manager.query(
      `SELECT r.name, r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN users u ON u.id = ur.user_id
       WHERE u.id::text = $1 OR u.auth_user_id::text = $2
       LIMIT 20`,
      [String(erpUserId || ''), String(authUserId || '')],
    );
    return (rows || []).some(
      (row: any) =>
        ADMIN_ROLE_NAMES.has(String(row.name || '').trim().toLowerCase()) ||
        ADMIN_ROLE_CODES.has(String(row.code || '').trim().toUpperCase()),
    );
  } catch {
    return false;
  }
}

export function extractAuditActor(req: any): AdminAuditActor {
  return {
    userId: req?.erpUser?.id || req?.user?.id || null,
    email: req?.erpUser?.email || req?.user?.email || null,
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

/**
 * Persists an ADMIN_OVERRIDE_EDIT audit entry to `activity_logs`.
 * Safe no-op in isolated unit tests where `manager.query` is mocked or absent.
 */
export async function recordAdminOverrideAudit(
  manager: EntityManager | undefined,
  params: {
    actor?: AdminAuditActor;
    action?: string;
    targetType: 'SALES_ORDER' | 'SALES_DELIVERY' | 'SALES_INVOICE' | 'PURCHASE_ORDER';
    targetId: string;
    targetName: string;
    previousStatus: string;
    details: string;
  },
): Promise<void> {
  if (!manager || typeof manager.query !== 'function') return;
  try {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeActorId =
      params.actor?.userId && uuidRe.test(String(params.actor.userId)) ? String(params.actor.userId) : null;
    await manager.query(
      `INSERT INTO activity_logs (actor_user_id, actor_email, action, target_type, target_id, target_name, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        safeActorId,
        params.actor?.email || null,
        params.action || 'ADMIN_OVERRIDE_EDIT',
        params.targetType,
        params.targetId,
        params.targetName,
        `[Status: ${params.previousStatus}] ${params.details}`,
        params.actor?.ipAddress ? String(params.actor.ipAddress).slice(0, 45) : null,
        params.actor?.userAgent || null,
      ],
    );
  } catch {
    // Non-blocking audit log write
  }
}
