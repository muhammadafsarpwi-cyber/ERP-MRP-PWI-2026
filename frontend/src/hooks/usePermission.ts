import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiService from '../services/api';
import { useUserStore } from '../store/userStore';

interface UserData {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  permissions?: string[];
  [key: string]: any;
}

const PERMISSIONS_TTL_MS = 5 * 60 * 1000;

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

  return useMemo(() => ({
    user,
    permissions,
    can,
    canAny,
    canAll,
    canModule,
    refreshPermissions,
    isLoaded,
  }), [user, permissions, can, canAny, canAll, canModule, refreshPermissions, isLoaded]);
}

export default usePermission;
