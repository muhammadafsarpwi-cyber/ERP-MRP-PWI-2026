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
    if (!companyId) return;
    apiService.get<any>('/divisions', { companyId, limit: 200 })
      .then(r => setDivisions(uuidRowsOf(r)))
      .catch(() => setDivisions([]));
  }, [companyId]);

  useEffect(() => {
    setSections([]);
    if (!companyId || !divisionId) return;
    apiService.get<any>('/sections', { companyId, divisionId, limit: 500 })
      .then(r => setSections(uuidRowsOf(r)))
      .catch(() => setSections([]));
  }, [companyId, divisionId]);

  useEffect(() => {
    setDepartments([]);
    if (!companyId || !divisionId || !sectionId) return;
    apiService.get<any>('/departments', { companyId, divisionId, sectionId, limit: 500 })
      .then(r => setDepartments(uuidRowsOf(r)))
      .catch(() => setDepartments([]));
  }, [companyId, divisionId, sectionId]);

  return { divisions, sections, departments };
}
