import { useEffect, useState } from 'react';
import apiService from '../../services/api';
import { OrgOption, uuidRowsOf } from './jobCards.types';

export interface MaintenanceHierarchy {
  divisions: OrgOption[];
  sections: OrgOption[];
  departments: OrgOption[];
}

export const divisionLabel = (d?: OrgOption): string =>
  (d && (d.name || d.code)) || 'Division';

export const sectionLabel = (s?: OrgOption): string =>
  (s && (s.name || s.code)) || 'Section';

export const departmentLabel = (d?: OrgOption): string =>
  (d && (d.name || d.departmentCode || d.code)) || 'Department';

export function useMaintenanceHierarchy(
  companyId?: string,
  divisionId?: string,
  sectionId?: string,
): MaintenanceHierarchy {
  const [divisions, setDivisions] = useState<OrgOption[]>([]);
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);

  useEffect(() => {
    setDivisions([]);
    // Narrow company scoping only when a company is known. If the profile's
    // companyId is missing/null on mount, fall back to an unscoped ACTIVE
    // lookup so the Division panel is never left blank.
    const divisionParams: Record<string, unknown> = companyId
      ? { companyId, limit: 200 }
      : { status: 'ACTIVE', limit: 200 };
    apiService.get<any>('/divisions', divisionParams)
      .then(r => setDivisions(uuidRowsOf(r)))
      .catch(() => setDivisions([]));
  }, [companyId]);

  useEffect(() => {
    setSections([]);
    if (!divisionId) return; // cascade key only — companyId is no longer required
    // Company scoping only when known; otherwise fall back to ACTIVE rows for
    // the selected division so the Section panel never blanks out.
    const sectionParams: Record<string, unknown> = companyId
      ? { companyId, divisionId, limit: 500 }
      : { status: 'ACTIVE', divisionId, limit: 200 };
    apiService.get<any>('/sections', sectionParams)
      .then(r => setSections(uuidRowsOf(r)))
      .catch(() => setSections([]));
  }, [companyId, divisionId]);

  useEffect(() => {
    setDepartments([]);
    if (!divisionId || !sectionId) return; // cascade keys only — companyId no longer required
    // Company scoping only when known; otherwise fall back to ACTIVE rows for
    // the selected division/section so the Department panel never blanks out.
    const departmentParams: Record<string, unknown> = companyId
      ? { companyId, divisionId, sectionId, limit: 500 }
      : { status: 'ACTIVE', divisionId, sectionId, limit: 200 };
    apiService.get<any>('/departments', departmentParams)
      .then(r => setDepartments(uuidRowsOf(r)))
      .catch(() => setDepartments([]));
  }, [companyId, divisionId, sectionId]);

  return { divisions, sections, departments };
}
