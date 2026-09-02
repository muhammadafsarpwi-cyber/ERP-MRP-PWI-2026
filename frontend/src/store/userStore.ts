import { create } from 'zustand';

export interface UserRoleRef {
  id: string;
  roleId: string;
  role?: {
    id?: string;
    roleCode: string;
    name: string;
  } | null;
}

export interface UserData {
  id: string;
  authUserId?: string;
  email: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  username?: string | null;
  employeeId?: string | null;
  avatarUrl?: string | null;
  defaultCompanyId?: string | null;
  defaultCompany?: { id: string; name?: string } | null;
  defaultDepartment?: { id: string; name?: string } | null;
  status?: string;
  permissions?: string[];
  userRoles?: UserRoleRef[];
  [key: string]: any;
}

const STORAGE_KEY = 'erp_user';

function readStoredUser(): UserData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UserData;
  } catch {}
  return null;
}

function writeStoredUser(user: UserData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

interface UserStoreState {
  user: UserData | null;
  setUser: (user: UserData | null) => void;
  updateUser: (patch: Partial<UserData>) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserStoreState>((set, get) => ({
  user: typeof window !== 'undefined' ? readStoredUser() : null,

  setUser: (user) => {
    if (user) {
      writeStoredUser(user);
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    set({ user });
  },

  updateUser: (patch) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...patch };
    writeStoredUser(next);
    set({ user: next });
  },

  clearUser: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    set({ user: null });
  },
}));

export default useUserStore;
