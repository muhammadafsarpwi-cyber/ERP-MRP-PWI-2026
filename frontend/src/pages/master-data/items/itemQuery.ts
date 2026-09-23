/**
 * ITEM-FILTER-01 — Products & Items server query.
 *
 * Single source of truth for the parameters sent to `GET /master-data/items`.
 * The table state (search, Division, Section, Department, Category, Route Type,
 * Material Role / Usage, Status, item type, sort, pagination) is turned into ONE
 * parameter object here, so:
 *
 *   - every selected filter is sent (nothing is dropped),
 *   - all filters are combined by the backend into a single AND query,
 *   - the key of that object tells the page when it must refetch.
 *
 * The backend (`ItemController.findAll` → `ItemService.findAll`) already
 * supports every one of these parameters and answers with `{ data, total }`
 * where `total` is the FILTERED row count — no client-side filtering is done.
 */

export interface ItemQueryState {
  page: number;
  pageSize: number;
  sortField: string;
  sortOrder: string;
  search?: string;
  fDivision?: string;
  fSection?: string;
  fDepartment?: string;
  fCategory?: string;
  fItemType?: string;
  fRoleUsage?: string;
  fRouteType?: string;
  fStatus?: string;
}

/** Builds the `GET /master-data/items` query parameters for a table state. */
export function buildItemQueryParams(
  state: ItemQueryState,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    page: state.page,
    limit: state.pageSize,
    sortField: state.sortField,
    sortOrder: state.sortOrder,
    ...extra,
  };
  if (state.search) params.search = state.search;
  if (state.fDivision) params.divisionId = state.fDivision;
  if (state.fSection) params.sectionId = state.fSection;
  if (state.fDepartment) params.departmentId = state.fDepartment;
  if (state.fCategory) params.categoryId = state.fCategory;
  if (state.fItemType) params.itemType = state.fItemType;
  if (state.fRoleUsage) params.materialRoleUsage = state.fRoleUsage;
  if (state.fRouteType) params.routeTypeId = state.fRouteType;
  if (state.fStatus) params.status = state.fStatus;
  return params;
}

/**
 * Stable identity of a query. Two states with the same key MUST return the
 * same rows, so the page can (a) refetch only when the key changes and
 * (b) drop duplicate identical requests that are already in flight.
 */
export function itemQueryKey(params: Record<string, unknown>): string {
  // Key order is fixed by buildItemQueryParams → JSON.stringify is stable.
  return JSON.stringify(params);
}

export function itemQueryStateKey(state: ItemQueryState, extra?: Record<string, unknown>): string {
  return itemQueryKey(buildItemQueryParams(state, extra));
}

/** The filter part of the state — persisted/restored with the loaded rows. */
export type ItemFilterSnapshot = Omit<ItemQueryState, 'page' | 'pageSize' | 'sortField' | 'sortOrder'> & {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: string;
  searchInput?: string;
  activeTab?: string;
  showFilters?: boolean;
};

export interface OrgSectionRef {
  id: string;
  divisionId?: string | null;
}

export interface OrgDepartmentRef {
  id: string;
  divisionId?: string | null;
  sectionId?: string | null;
}

export interface OrgSelection {
  fDivision?: string;
  fSection?: string;
  fDepartment?: string;
}

/**
 * ITEM-FILTER-01 #4 — Division → Section → Department cascade guard.
 *
 * Returns the Section / Department that are still valid for the current
 * Division. A selection is dropped when:
 *   - it no longer exists in the loaded organization lookups, or
 *   - its parent changed (Section of another Division, Department of another
 *     Section/Division).
 *
 * Lookups that have not loaded yet (empty arrays) are never used to prune, so
 * a restored selection is not thrown away while the lookups are in flight.
 */
export function pruneStaleOrgSelections(
  selection: OrgSelection,
  sections: OrgSectionRef[],
  departments: OrgDepartmentRef[],
): OrgSelection {
  let fSection = selection.fSection;
  let fDepartment = selection.fDepartment;

  if (fSection && sections.length > 0) {
    const sectionStillValid = sections.some(
      (s) => s.id === fSection && (!selection.fDivision || s.divisionId === selection.fDivision),
    );
    if (!sectionStillValid) {
      fSection = undefined;
      fDepartment = undefined;
      return { fSection, fDepartment };
    }
  }

  if (fDepartment && departments.length > 0) {
    const departmentStillValid = departments.some((d) => {
      if (d.id !== fDepartment) return false;
      if (fSection) return d.sectionId === fSection;
      if (selection.fDivision) return d.divisionId === selection.fDivision;
      return true;
    });
    if (!departmentStillValid) fDepartment = undefined;
  }

  return { fSection, fDepartment };
}
