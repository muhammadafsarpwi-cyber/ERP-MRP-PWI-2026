import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiService from '../services/api';
import { useUserStore } from '../store/userStore';

export interface DivisionRef {
  id: string;
  divisionCode: string;
  name: string;
}

/**
 * Division access as reported by `GET /auth/me` (Prompt #16 §22).
 *
 * - `unrestricted`  – the user's own organization scope is company-wide, so
 *                     every division is available to them.
 * - `items`         – the division master rows they may actually use.
 * - `permissionScopes` – `permissionCode → divisionIds` for permissions whose
 *                     ROLE grant is division-restricted. A permission that is
 *                     absent from this map has NO role-level restriction.
 *
 * The two are deliberately separate so the UI can say
 *   "you have access to this division, but your role does not allow this
 *    module here" instead of conflating user scope with permission scope.
 */
export interface DivisionAccess {
  unrestricted: boolean;
  items: DivisionRef[];
  permissionScopes: Record<string, string[]>;
}

interface UserData {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  permissions?: string[];
  divisions?: DivisionAccess;
  [key: string]: any;
}

const PERMISSIONS_TTL_MS = 5 * 60 * 1000;

const DEFAULT_DIVISION_ACCESS: DivisionAccess = {
  unrestricted: true,
  items: [],
  permissionScopes: {},
};

function normalizeDivisionAccess(raw: any): DivisionAccess {
  if (!raw || typeof raw !== 'object') return DEFAULT_DIVISION_ACCESS;
  return {
    unrestricted: raw.unrestricted !== false,
    items: Array.isArray(raw.items) ? raw.items : [],
    permissionScopes:
      raw.permissionScopes && typeof raw.permissionScopes === 'object' ? raw.permissionScopes : {},
  };
}

function getStoredUser(): UserData | null {
  try {
    const stored = localStorage.getItem('erp_user');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return null;
}

function getStoredPermissionsTimestamp(): number {
  try {
    const ts = localStorage.getItem('erp_permissions_ts');
    return ts ? parseInt(ts, 10) : 0;
  } catch {}
  return 0;
}

export function usePermission() {
  const stored = getStoredUser();
  const [user, setUser] = useState<UserData | null>(stored);
  const [permissions, setPermissions] = useState<string[]>(stored?.permissions || []);
  const [isLoaded, setIsLoaded] = useState<boolean>(!!(stored && stored.permissions && stored.permissions.length > 0));
  const fetchingRef = useRef(false);

  const refreshPermissions = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const response = await apiService.get<{ data: UserData }>('/auth/me');
      const userData = response.data;
      setUser(userData);
      setPermissions(userData.permissions || []);
      setIsLoaded(true);
      localStorage.setItem('erp_user', JSON.stringify(userData));
      localStorage.setItem('erp_permissions_ts', Date.now().toString());
      useUserStore.getState().setUser(userData);
    } catch {
      setIsLoaded(true);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const storedUser = getStoredUser();
    const hasPerms = storedUser?.permissions && storedUser.permissions.length > 0;
    if (hasPerms) {
      const ts = getStoredPermissionsTimestamp();
      const age = Date.now() - ts;
      if (age > PERMISSIONS_TTL_MS) {
        refreshPermissions();
      } else {
        setIsLoaded(true);
      }
    } else {
      refreshPermissions();
    }
  }, [refreshPermissions]);

  const can = useCallback((permissionCode: string): boolean => {
    return permissions.includes(permissionCode);
  }, [permissions]);

  const canAny = useCallback((...permissionCodes: string[]): boolean => {
    return permissionCodes.some(code => permissions.includes(code));
  }, [permissions]);

  const canAll = useCallback((...permissionCodes: string[]): boolean => {
    return permissionCodes.every(code => permissions.includes(code));
  }, [permissions]);

  const canModule = useCallback((module: string, action: string): boolean => {
    return permissions.some(p => {
      const parts = p.split('.');
      if (parts.length >= 2) {
        return parts[0] === module && parts[parts.length - 1] === action.toUpperCase();
      }
      return false;
    });
  }, [permissions]);

  const divisionAccess = useMemo(
    () => normalizeDivisionAccess(user?.divisions),
    [user],
  );

  const allowedDivisions = useMemo<DivisionRef[]>(
    () => divisionAccess.items,
    [divisionAccess],
  );

  /**
   * Divisions this user may use at all (their organization scope).
   * Returns every id when the user is company-wide, so callers can simply do
   * `allowedDivisionIds.includes(x)` without a special case.
   */
  const allowedDivisionIds = useMemo<string[]>(
    () => divisionAccess.items.map((d) => d.id),
    [divisionAccess],
  );

  /**
   * `userOrganizationScope ∩ rolePermissionScope` for one permission (§11).
   *
   * - `can()` is still the authority on whether the permission is granted at
   *   all; this only narrows it per division.
   * - No role-level restriction + no division argument ⇒ behaves exactly like
   *   the legacy `can()` (§4 backward compatibility).
   * - Never *grants* access: a division outside `allowedDivisionIds` is always
   *   false, even if the role scope would allow it.
   */
  const canInDivision = useCallback(
    (permissionCode: string, divisionId?: string | null): boolean => {
      if (!permissions.includes(permissionCode)) return false;
      if (!divisionId) return true; // no specific division requested ⇒ like can()

      const inUserScope =
        divisionAccess.unrestricted || divisionAccess.items.some((d) => d.id === divisionId);
      if (!inUserScope) return false;

      const roleScope = divisionAccess.permissionScopes[permissionCode];
      if (!roleScope) return true; // no role-level restriction configured (§12)

      return roleScope.includes(divisionId);
    },
    [permissions, divisionAccess],
  );

  /**
   * True when the role permission — not the user scope — is what blocks this
   * module in this division, so the UI can explain the difference (§26).
   */
  const roleBlocksInDivision = useCallback(
    (permissionCode: string, divisionId?: string | null): boolean => {
      if (!permissions.includes(permissionCode)) return false;
      if (!divisionId) return false;
      const roleScope = divisionAccess.permissionScopes[permissionCode];
      if (!roleScope) return false;
      return !roleScope.includes(divisionId);
    },
    [permissions, divisionAccess],
  );

  return useMemo(() => ({
    user,
    permissions,
    can,
    canAny,
    canAll,
    canModule,
    refreshPermissions,
    isLoaded,
    // Prompt #16 §28 — division-aware additions. `can`/`canAny`/`canAll`/
    // `canModule` above are untouched so existing components keep working.
    divisionAccess,
    allowedDivisions,
    allowedDivisionIds,
    divisionsUnrestricted: divisionAccess.unrestricted,
    permissionDivisionScopes: divisionAccess.permissionScopes,
    canInDivision,
    roleBlocksInDivision,
  }), [
    user,
    permissions,
    can,
    canAny,
    canAll,
    canModule,
    refreshPermissions,
    isLoaded,
    divisionAccess,
    allowedDivisions,
    allowedDivisionIds,
    canInDivision,
    roleBlocksInDivision,
  ]);
}

export default usePermission;
