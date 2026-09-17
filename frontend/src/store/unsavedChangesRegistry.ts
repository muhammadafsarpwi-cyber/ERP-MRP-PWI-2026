import { useEffect } from 'react';

type UnsavedChecker = () => boolean;

const registry = new Map<string, UnsavedChecker>();

export const registerUnsavedChecker = (tabId: string, checker: UnsavedChecker): void => {
  registry.set(tabId, checker);
};

export const unregisterUnsavedChecker = (tabId: string): void => {
  registry.delete(tabId);
};

export const hasUnsavedChanges = (tabId: string): boolean => {
  const checker = registry.get(tabId);
  if (!checker) return false;
  try {
    return checker();
  } catch {
    return false;
  }
};

/**
 * React hook for any form or page component to register its unsaved status with the Tab Manager.
 * @param tabId Canonical tab ID (e.g. location.pathname)
 * @param isDirty Boolean flag or function indicating if unsaved changes exist
 */
export const useRegisterUnsavedChanges = (tabId: string, isDirty: boolean | (() => boolean)): void => {
  useEffect(() => {
    const checker = typeof isDirty === 'function' ? isDirty : () => isDirty;
    registerUnsavedChecker(tabId, checker);
    return () => {
      unregisterUnsavedChecker(tabId);
    };
  }, [tabId, isDirty]);
};
