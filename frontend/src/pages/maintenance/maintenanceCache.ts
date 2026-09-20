/**
 * Global In-Memory Cache for Maintenance Master Data
 * Ensures instant (0ms) loading of technicians, categories, hierarchy, and spare parts
 * without repetitive network waterfalls or loading spinners when opening modals/tabs.
 */

import apiService from '../../services/api';

interface CacheStore {
  technicians: any[];
  rootCauseCategories: any[];
  failureCategories: any[];
  divisions: any[];
  sections: Record<string, any[]>; // keyed by divisionId or '__all__'
  departments: Record<string, any[]>; // keyed by sectionId or '__all__'
  masterItems: any[];
  lastFetchedAt: Record<string, number>;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache freshness

const cache: CacheStore = {
  technicians: [],
  rootCauseCategories: [],
  failureCategories: [],
  divisions: [],
  sections: {},
  departments: {},
  masterItems: [],
  lastFetchedAt: {},
};

function isFresh(key: string): boolean {
  const ts = cache.lastFetchedAt[key];
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL_MS;
}

export const maintenanceCache = {
  /** Get technicians with in-memory caching */
  async getTechnicians(force = false): Promise<any[]> {
    if (!force && cache.technicians.length > 0 && isFresh('technicians')) {
      return cache.technicians || [];
    }
    try {
      const res = await apiService.get<any>('/master-data/maintenance/technicians', { active: 'true' });
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      cache.technicians = list.filter((t: any) => t && t.id);
      cache.lastFetchedAt['technicians'] = Date.now();
      return cache.technicians || [];
    } catch (err) {
      console.warn('maintenanceCache: failed to load technicians', err);
      return cache.technicians || [];
    }
  },

  /** Get root cause categories with in-memory caching */
  async getRootCauseCategories(force = false): Promise<any[]> {
    if (!force && cache.rootCauseCategories.length > 0 && isFresh('rootCauses')) {
      return cache.rootCauseCategories || [];
    }
    try {
      const res = await apiService.get<any>('/master-data/maintenance/categories/root-cause');
      cache.rootCauseCategories = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      cache.lastFetchedAt['rootCauses'] = Date.now();
      return cache.rootCauseCategories || [];
    } catch (err) {
      return cache.rootCauseCategories || [];
    }
  },

  /** Get failure categories with in-memory caching */
  async getFailureCategories(force = false): Promise<any[]> {
    if (!force && cache.failureCategories.length > 0 && isFresh('failures')) {
      return cache.failureCategories || [];
    }
    try {
      const res = await apiService.get<any>('/master-data/maintenance/categories/failure');
      cache.failureCategories = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      cache.lastFetchedAt['failures'] = Date.now();
      return cache.failureCategories || [];
    } catch (err) {
      return cache.failureCategories || [];
    }
  },

  /** Get divisions with in-memory caching */
  async getDivisions(force = false): Promise<any[]> {
    if (!force && cache.divisions.length > 0 && isFresh('divisions')) {
      return cache.divisions || [];
    }
    try {
      const res = await apiService.get<any>('/divisions', { limit: 200 });
      cache.divisions = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      cache.lastFetchedAt['divisions'] = Date.now();
      return cache.divisions || [];
    } catch (err) {
      return cache.divisions || [];
    }
  },

  /** Get sections with in-memory caching */
  async getSections(divisionId?: string, force = false): Promise<any[]> {
    const key = divisionId || '__all__';
    if (!force && cache.sections[key] && cache.sections[key].length > 0 && isFresh(`sections_${key}`)) {
      return cache.sections[key] || [];
    }
    try {
      const params: Record<string, any> = { limit: 200 };
      if (divisionId) params.divisionId = divisionId;
      const res = await apiService.get<any>('/sections', params);
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      cache.sections[key] = list;
      cache.lastFetchedAt[`sections_${key}`] = Date.now();
      return list || [];
    } catch (err) {
      return cache.sections[key] || [];
    }
  },

  /** Get departments with in-memory caching */
  async getDepartments(sectionId?: string, force = false): Promise<any[]> {
    const key = sectionId || '__all__';
    if (!force && cache.departments[key] && cache.departments[key].length > 0 && isFresh(`depts_${key}`)) {
      return cache.departments[key] || [];
    }
    try {
      const params: Record<string, any> = { limit: 200 };
      if (sectionId) params.sectionId = sectionId;
      const res = await apiService.get<any>('/departments', params);
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      cache.departments[key] = list;
      cache.lastFetchedAt[`depts_${key}`] = Date.now();
      return list || [];
    } catch (err) {
      return cache.departments[key] || [];
    }
  },

  /** Get master inventory items with in-memory caching */
  async getMasterItems(force = false): Promise<any[]> {
    if (!force && cache.masterItems.length > 0 && isFresh('masterItems')) {
      return cache.masterItems || [];
    }
    try {
      const res = await apiService.get<any>('/master-data/items', { limit: 1000, status: 'ACTIVE' });
      cache.masterItems = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []));
      cache.lastFetchedAt['masterItems'] = Date.now();
      return cache.masterItems || [];
    } catch (err) {
      return cache.masterItems || [];
    }
  },

  /** Invalidate all or specific caches (e.g. after adding a new spare part) */
  invalidate(key?: string) {
    if (key) {
      delete cache.lastFetchedAt[key];
    } else {
      cache.lastFetchedAt = {};
    }
  },

  _jobCardClearListeners: [] as Array<() => void>,

  /** Register cache invalidator listener from JobCardList */
  onClearJobCards(listener: () => void) {
    this._jobCardClearListeners.push(listener);
  },

  /** Clear cached job cards array across the application */
  clearJobCardsCache() {
    this._jobCardClearListeners.forEach((fn) => {
      try { fn(); } catch {}
    });
  },
};
