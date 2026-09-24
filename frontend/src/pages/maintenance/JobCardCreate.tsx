import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ApartmentOutlined,
  BarcodeOutlined,
  BranchesOutlined,
  BuildOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  ClusterOutlined,
  CopyOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileTextOutlined,
  FormOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  MinusOutlined,
  ReloadOutlined,
  ScanOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import BarcodeScanner from '../../components/shared/BarcodeScanner';
import {
  JOB_CARD_BASE,
  JOB_CARD_PRIORITIES,
  MAINTENANCE_TYPES,
  JobCard,
  OrgOption,
  JobCardContext,
  normalizeOptionalUuid,
  rowsOf,
  uuidRowsOf,
  optionLabel,
  categoryLabel,
  errorText,
  label,
} from './jobCards.types';
import './jobCardCreate.css';
import './maintTheme.css';

const { Text } = Typography;

const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const machineLabel = (m: OrgOption) =>
  `${m.machineCode || m.machineId || '—'} — ${m.machineName || m.name || m.machineId || 'Unnamed machine'}`;

const MACHINE_CODE_MISMATCH = 'Machine code does not match the selected machine.';

/**
 * Robustly extracts a valid companyId string from context or user store.
 * Strictly returns string or undefined, preventing objects or circular references
 * from entering Form state.
 */
export const resolveCompanyId = (ctx?: JobCardContext | null, u?: any): string | undefined => {
  if (typeof ctx?.companyId === 'string' && ctx.companyId.trim()) return ctx.companyId.trim();
  if (typeof u?.defaultCompanyId === 'string' && u.defaultCompanyId.trim()) return u.defaultCompanyId.trim();
  if (typeof u?.companyId === 'string' && u.companyId.trim()) return u.companyId.trim();
  if (typeof u?.defaultCompany?.id === 'string' && u.defaultCompany.id.trim()) return u.defaultCompany.id.trim();
  if (typeof u?.company?.id === 'string' && u.company.id.trim()) return u.company.id.trim();
  return undefined;
};

/**
 * Validates a typed / scanned value against a machine record's authoritative
 * identifiers (mirrors the backend `GET /machines/by-code/:code` resolver):
 *  - machineCode  — human code printed on the asset (e.g. FT-01)
 *  - machineId    — system-generated id (e.g. MCH001)
 *  - qrPayload    — stored QR value (qr_code column, e.g. /production/machines/<uuid>)
 *  - id           — primary UUID (embedded in printed QR URLs)
 * Exact match is case-insensitive and tolerates a `machine:` prefix; printed
 * QR labels encode an absolute URL around the payload, so long tokens also
 * match by containment. Short tokens never match by containment to avoid
 * false positives.
 */
export const machineCodeMatches = (
  raw: string,
  machine: Record<string, any> | null | undefined,
): boolean => {
  if (!machine) return false;
  const norm = (v: any) => String(v ?? '').trim().toLowerCase().replace(/^machine:/, '');
  const code = norm(raw);
  if (!code) return false;
  const tokens = [machine.machineCode, machine.machineId, machine.qrPayload, machine.id]
    .map(norm)
    .filter(Boolean);
  if (tokens.includes(code)) return true;
  return tokens.some((t) => t.length >= 8 && code.includes(t));
};

// Common shop-floor 1-tap quick complaint presets for rapid mobile/tablet entry
const QUICK_COMPLAINTS = [
  { label: '⚡ Power Trip / No Supply', text: 'Machine power tripped during operation, not turning ON.' },
  { label: '🔊 Heavy Vibration / Noise', text: 'Abnormal loud noise and heavy vibration detected during running.' },
  { label: '🌡️ Motor Overheating', text: 'Drive motor running unusually hot with burning smell.' },
  { label: '⚙️ Drive Belt Broken', text: 'Drive belt slipped off / broken during production run.' },
  { label: '🛑 Bearing Jammed / Rollers Stuck', text: 'Bearing jammed, rollers/shaft not rotating smoothly.' },
  { label: '💧 Hydraulic Oil Leakage', text: 'Hydraulic oil leakage detected near cylinder, pressure dropping.' },
  { label: '📏 Wire Feeding Jam', text: 'Wire feeding mechanism stuck, wire bunching up at guide rollers.' },
  { label: '🔧 Sensor / Limit Switch Fault', text: 'Proximity sensor / limit switch not sensing, cycle stopped.' },
];

export const JobCardCreate: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const context = (location.state as { context?: JobCardContext } | null)?.context;
  const { user, can } = usePermission();

  const [form] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // Window State: Draggable, Resizable, Maximizable, Minimizable, Toggle Detail Sheet
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPreviewPane, setShowPreviewPane] = useState(true);
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

  // Mobile View Tab: 'form' | 'preview'
  const [mobileActiveTab, setMobileActiveTab] = useState<'form' | 'preview'>('form');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 960);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 960);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Machine Lookup State
  const [lookupCode, setLookupCode] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<JobCard | null>(null);
  // Machine verification result (drives the machine banner's verified/error state)
  const [machineVerified, setMachineVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Machine & Organization Data
  const [machines, setMachines] = useState<OrgOption[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [machinesError, setMachinesError] = useState('');

  const [categories, setCategories] = useState<OrgOption[]>([]);
  const [rootCategories, setRootCategories] = useState<OrgOption[]>([]);
  const [failureCategories, setFailureCategories] = useState<OrgOption[]>([]);
  const [, setCategoryError] = useState('');
  const [, setRelatedCategoryError] = useState('');

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);

  // Save Confirmation & Success Modal States
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<JobCard | null>(null);

  const [org, setOrg] = useState<{ divisions: OrgOption[]; sections: OrgOption[]; departments: OrgOption[] }>({
    divisions: [],
    sections: [],
    departments: [],
  });
  const [divisionsLoading, setDivisionsLoading] = useState(false);
  const [divisionsError, setDivisionsError] = useState('');
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState('');
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departmentsError, setDepartmentsError] = useState('');

  // Watched Form Fields for Real-Time Live Preview Sheet
  const companyId = Form.useWatch('companyId', form);
  const divisionId = Form.useWatch('divisionId', form);
  const sectionId = Form.useWatch('sectionId', form);
  const departmentId = Form.useWatch('assignedDepartmentId', form);
  const watchedPriority = Form.useWatch('priority', form) || 'MEDIUM';
  const watchedMaintenanceType = Form.useWatch('maintenanceType', form) || 'BREAKDOWN';
  const watchedComplaint = Form.useWatch('complaint', form) || '';
  const watchedMachineId = Form.useWatch('machineId', form);
  const watchedMachineBarcode = Form.useWatch('machineBarcode', form);
  const watchedComplaintCat = Form.useWatch('complaintCategoryId', form);
  const watchedRootCauseCat = Form.useWatch('rootCauseCategoryId', form);
  const watchedFailureCat = Form.useWatch('failureCategoryId', form);
  const watchedDescription = Form.useWatch('description', form) || '';

  // Initial user default company setup - fires on mount and whenever user/context becomes available
  useEffect(() => {
    const defaultCid = resolveCompanyId(context, user);
    if (defaultCid && !form.getFieldValue('companyId')) {
      form.setFieldValue('companyId', defaultCid);
    }
  }, [user, context, form]);

  // Resolve companyId from context, user defaults, or form value (guaranteed string or undefined)
  const resolvedCompanyId = useMemo(() => {
    return resolveCompanyId(context, user) || (typeof companyId === 'string' ? companyId : undefined);
  }, [context, user, companyId]);

  // Load Divisions - unconditional mount fetch of the authoritative Division
  // master (Organization module) filtered to ACTIVE rows, narrowed to the
  // resolved company whenever one is known so company isolation is preserved.
  // Deliberately un-guarded: runs immediately, no companyId gate, so a missing
  // default company can never leave the dropdown permanently blank.
  useEffect(() => {
    let cancelled = false;
    setDivisionsLoading(true);
    setDivisionsError('');

    apiService
      .get<any>('/divisions', {
        status: 'ACTIVE',
        ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}),
        limit: 500,
      })
      .then((r) => {
        if (cancelled) return;
        const cleanDivisions = (rowsOf(r) as any[])?.map(div => ({ id: String(div.id), name: div.name, divisionCode: div.divisionCode || div.division_code })) || [];
        setOrg((v) => ({ ...v, divisions: cleanDivisions }));
        setDivisionsError('');

        // Auto-select first division if none selected and not in context mode
        if (!context && cleanDivisions.length > 0 && !form.getFieldValue('divisionId')) {
          const firstId = cleanDivisions[0]?.id;
          if (firstId && typeof firstId === 'string') {
            form.setFieldValue('divisionId', firstId);
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setOrg((v) => ({ ...v, divisions: [] }));
          setDivisionsError(errorText(e));
        }
      })
      .finally(() => {
        if (!cancelled) setDivisionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context, form, resolvedCompanyId]);

  // Load Sections - Cascading fetch triggered when divisionId changes
  useEffect(() => {
    const divId = form.getFieldValue('divisionId');
    if (!divId) {
      setOrg((v) => ({ ...v, sections: [] }));
      setSectionsError('');
      return;
    }

    let cancelled = false;
    setSectionsLoading(true);
    setSectionsError('');

    apiService
      .get<any>('/sections', { status: 'ACTIVE', ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}), divisionId: divId, limit: 100 })
      .then((r) => {
        if (cancelled) return;
        const secList = (uuidRowsOf(r) as any[]).map(s => ({ id: s.id, name: s.name, sectionCode: s.sectionCode ?? s.section_code }));
        setOrg((v) => ({ ...v, sections: secList }));
        setSectionsError('');

        // Auto-clear dependent fields
        form.resetFields(['assignedDepartmentId']);

        // Auto-select first section if none selected and not in context mode, only if single result
        if (!context && secList.length === 1 && !form.getFieldValue('sectionId')) {
          form.setFieldValue('sectionId', secList[0].id);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setOrg((v) => ({ ...v, sections: [] }));
          setSectionsError(errorText(e));
        }
      })
      .finally(() => {
        if (!cancelled) setSectionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedCompanyId, divisionId, context, form]);

  // Load Departments - Cascading fetch triggered when sectionId changes
  useEffect(() => {
    const secId = form.getFieldValue('sectionId');
    if (!secId) {
      setOrg((v) => ({ ...v, departments: [] }));
      setDepartmentsError('');
      return;
    }

    let cancelled = false;
    setDepartmentsLoading(true);
    setDepartmentsError('');

    apiService
      .get<any>('/departments', { status: 'ACTIVE', ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}), divisionId: form.getFieldValue('divisionId'), sectionId: secId, limit: 100 })
      .then((r) => {
        if (cancelled) return;
        const deptList = (uuidRowsOf(r) as any[]).map(d => ({ id: d.id, name: d.name, departmentCode: d.departmentCode ?? d.department_code }));
        setOrg((v) => ({ ...v, departments: deptList }));
        setDepartmentsError('');
      })
      .catch((e) => {
        if (!cancelled) {
          setOrg((v) => ({ ...v, departments: [] }));
          setDepartmentsError(errorText(e));
        }
      })
      .finally(() => {
        if (!cancelled) setDepartmentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedCompanyId, divisionId, sectionId]);

  // Load Machines - filtered by the selected organization hierarchy
  // Division -> Section -> Department -> Machine (Department is optional).
  // Gated on the resolved company (context / user default / form) rather than
  // the raw form field so machines can never be permanently unreachable.
  useEffect(() => {
    if (!resolvedCompanyId) {
      setMachines([]);
      return;
    }
    let cancelled = false;
    setMachinesLoading(true);
    const params: Record<string, any> = { limit: 1000, sortBy: 'machineCode' };
    if (divisionId) params.divisionId = divisionId;
    if (sectionId) params.sectionId = sectionId;
    if (departmentId) params.departmentId = departmentId;

    apiService
      .get<any>('/machines', params)
      .then((r) => {
        if (!cancelled) {
          setMachines(
            (uuidRowsOf(r) as any[]).map((m) => ({
              id: m.id,
              name: m.name,
              machineCode: m.machineCode ?? m.machine_code,
              machineId: m.machineId,
              machineName: m.machineName,
              machineNumber: m.machineNumber,
              machineType: m.machineType,
              location: m.location,
              qrPayload: m.qrPayload,
              companyId: m.companyId,
              divisionId: m.divisionId,
              sectionId: m.sectionId,
              departmentId: m.departmentId,
              status: m.status,
            }))
          );
          setMachinesError('');
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setMachines([]);
          setMachinesError(errorText(e));
        }
      })
      .finally(() => {
        if (!cancelled) setMachinesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedCompanyId, divisionId, sectionId, departmentId]);

  // Load Categories
  const loadCategories = useCallback(async () => {
    if (!companyId) {
      setCategories([]);
      setCategoryError('');
      return;
    }
    setCategoryError('');
    try {
      const response = await apiService.get<any>('/master-data/maintenance/categories/complaint', { companyId });
      setCategories(uuidRowsOf(response));
    } catch (error) {
      setCategories([]);
      setCategoryError(errorText(error));
    }
  }, [companyId]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Load Related Categories (Failure & Root Cause)
  const loadRelatedCategories = useCallback(async () => {
    if (!companyId) {
      setFailureCategories([]);
      setRootCategories([]);
      setRelatedCategoryError('');
      return;
    }
    setRelatedCategoryError('');
    Promise.all([
      apiService.get<any>('/master-data/maintenance/categories/failure', { companyId }),
      apiService.get<any>('/master-data/maintenance/categories/root-cause', { companyId }),
    ])
      .then(([failure, root]) => {
        setFailureCategories(uuidRowsOf(failure));
        setRootCategories(uuidRowsOf(root));
      })
      .catch((error) => {
        setFailureCategories([]);
        setRootCategories([]);
        setRelatedCategoryError(errorText(error));
      });
  }, [companyId]);

  useEffect(() => {
    loadRelatedCategories();
  }, [loadRelatedCategories]);

  // Save new category
  const saveCategory = async (values: any) => {
    if (!companyId) return;
    setCategorySaving(true);
    try {
      const created = await apiService.post<any>('/master-data/maintenance/categories/complaint', {
        ...values,
        companyId,
      });
      const category = created?.data || created;
      await loadCategories();
      if (category?.id) form.setFieldValue('complaintCategoryId', category.id);
      setCategoryModalOpen(false);
      categoryForm.resetFields();
      message.success('Complaint category added successfully');
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setCategorySaving(false);
    }
  };

  // Any machine change must invalidate the previous verification result and
  // clear the previously scanned code so it cannot stay "verified" by proxy.
  const resetMachineVerification = () => {
    setMachineVerified(false);
    setVerifyError(null);
    setLookupCode('');
  };

  const clearMachine = () => {
    setSelectedMachine(null);
    resetMachineVerification();
    form.setFieldsValue({ machineId: undefined, machineNumber: undefined, machineBarcode: undefined });
  };

  const handleMachineChange = (value: string) => {
    const machine = machines.find((m) => m.id === value) || null;
    resetMachineVerification();
    setSelectedMachine(machine);
    if (machine) {
      form.setFieldsValue({
        machineId: machine.id,
        machineBarcode: (machine as any).qrPayload || machine.machineCode || '',
      });
      // Auto populate division, section, department if available on machine
      if (machine.divisionId && !form.getFieldValue('divisionId')) {
        form.setFieldValue('divisionId', machine.divisionId);
      }
      if (machine.sectionId && !form.getFieldValue('sectionId')) {
        form.setFieldValue('sectionId', machine.sectionId);
      }
      if (machine.departmentId && !form.getFieldValue('assignedDepartmentId')) {
        form.setFieldValue('assignedDepartmentId', machine.departmentId);
      }
    } else {
      form.setFieldsValue({ machineId: undefined, machineBarcode: undefined });
    }
  };

  // Machine QR / Barcode verification — the SINGLE entry point shared by the
  // "Verify Code" button, the input's Enter key and the camera scanner.
  // With a machine already selected the entered/scanned value is validated
  // against that record's authoritative identifiers (machineCode / machineId /
  // stored qrPayload / UUID); only when no machine is selected does it fall
  // back to server-side resolution via GET /machines/by-code/:code.
  const verifyMachineCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? lookupCode).trim();
    if (!code) {
      message.warning('Please scan or enter a machine code first.');
      return;
    }

    if (selectedMachine) {
      if (machineCodeMatches(code, selectedMachine)) {
        setMachineVerified(true);
        setVerifyError(null);
        message.success(
          `Machine Verified: ${selectedMachine.machineName || selectedMachine.name || selectedMachine.machineCode || selectedMachine.id}`,
        );
      } else {
        setMachineVerified(false);
        setVerifyError(MACHINE_CODE_MISMATCH);
        message.error(MACHINE_CODE_MISMATCH);
      }
      return;
    }

    // No machine selected yet — resolve the code server-side and select it.
    setLookupLoading(true);
    try {
      const machine = await apiService.get<JobCard>(`/machines/by-code/${encodeURIComponent(code)}`);
      if (
        (companyId && machine.companyId !== companyId) ||
        (divisionId && machine.divisionId !== divisionId) ||
        (sectionId && machine.sectionId !== sectionId) ||
        (departmentId && machine.departmentId !== departmentId)
      ) {
        throw new Error('Machine is outside the selected organizational context');
      }
      setSelectedMachine(machine);
      // The entered code resolved this exact record → it is verified.
      setMachineVerified(true);
      setVerifyError(null);
      form.setFieldValue('machineId', machine.id);
      form.setFieldValue('machineBarcode', machine.qrPayload || machine.machineCode || '');
      form.setFieldValue('machineNumber', machine.id);
      if (machine.divisionId) form.setFieldValue('divisionId', machine.divisionId);
      if (machine.sectionId) form.setFieldValue('sectionId', machine.sectionId);
      if (machine.departmentId) form.setFieldValue('assignedDepartmentId', machine.departmentId);
      message.success(`Machine Verified: ${machine.machineName || machine.name || machine.machineCode || machine.id}`);
    } catch (e) {
      setSelectedMachine(null);
      setMachineVerified(false);
      setVerifyError(null);
      message.error(errorText(e));
    } finally {
      setLookupLoading(false);
    }
  };

  // Quick complaint chip applicator
  const handleApplyQuickComplaint = (text: string) => {
    const current = form.getFieldValue('complaint') || '';
    if (!current.trim()) {
      form.setFieldValue('complaint', text);
    } else {
      form.setFieldValue('complaint', `${current.trim()}\n${text}`);
    }
  };

  // Draggable logic
  const handleDragStart = (e: React.MouseEvent) => {
    if (isMaximized) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: modalPos.x,
      initialY: modalPos.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;
      setModalPos({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Submit Job Card - Validates and opens in-modal confirmation popup
  const submit = (values: JobCard) => {
    try {
      const targetCompanyId = normalizeOptionalUuid(values.companyId || user?.defaultCompanyId || (user as any)?.companyId);
      if (!targetCompanyId) {
        message.error('Company selection is invalid. Please select a company again.');
        return;
      }
      const targetDivisionId = normalizeOptionalUuid(values.divisionId);
      if (!targetDivisionId) {
        message.error('Division selection is required.');
        return;
      }
      const targetSectionId = normalizeOptionalUuid(values.sectionId);
      if (!targetSectionId) {
        message.error('Section selection is required.');
        return;
      }
      const targetMachineId = normalizeOptionalUuid(values.machineId);
      if (!targetMachineId) {
        message.error('Machine selection is required.');
        return;
      }

      const assignedDepartmentId = normalizeOptionalUuid(values.assignedDepartmentId);
      const complaintCategoryId = normalizeOptionalUuid(values.complaintCategoryId);
      const rootCauseCategoryId = normalizeOptionalUuid(values.rootCauseCategoryId);
      const failureCategoryId = normalizeOptionalUuid(values.failureCategoryId);

      const maintenanceType = MAINTENANCE_TYPES.includes(values.maintenanceType) ? values.maintenanceType : 'BREAKDOWN';
      const priority = JOB_CARD_PRIORITIES.includes(values.priority) ? values.priority : 'MEDIUM';

      const payload: Record<string, any> = {
        companyId: targetCompanyId,
        divisionId: targetDivisionId,
        sectionId: targetSectionId,
        machineId: targetMachineId,
        complaint: values.complaint,
        priority,
        maintenanceType,
      };
      if (assignedDepartmentId) payload.assignedDepartmentId = assignedDepartmentId;
      if (complaintCategoryId) payload.complaintCategoryId = complaintCategoryId;
      if (rootCauseCategoryId) payload.rootCauseCategoryId = rootCauseCategoryId;
      if (failureCategoryId) payload.failureCategoryId = failureCategoryId;
      if (values.description) payload.description = values.description;

      setPendingPayload(payload);
      setSubmitError(null);
      setConfirmModalOpen(true);
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const handleConfirmSave = async () => {
    if (!pendingPayload) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const created = await apiService.post<JobCard>(JOB_CARD_BASE, pendingPayload);
      setCreatedTicket(created);
      setConfirmModalOpen(false);
      setSuccessModalOpen(true);
      message.success('Job card created successfully');
    } catch (e) {
      setSubmitError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  const initialValues = useMemo(() => {
    const defaultCid = resolveCompanyId(context, user);
    return context
      ? {
          priority: 'MEDIUM',
          maintenanceType: 'BREAKDOWN',
          companyId: defaultCid,
          divisionId: context.divisionId ? String(context.divisionId) : undefined,
          sectionId: context.sectionId ? String(context.sectionId) : undefined,
          assignedDepartmentId: context.departmentId ? String(context.departmentId) : undefined,
          machineId: context.machineId ? String(context.machineId) : undefined,
        }
      : {
          priority: 'MEDIUM',
          maintenanceType: 'BREAKDOWN',
          companyId: defaultCid,
        };
  }, [context, user]);

  // Live Sheet Calculations
  const resolvedDivisionName = useMemo(() => {
    if (context?.divisionName) return context.divisionName;
    return org.divisions.find((d) => d.id === divisionId)?.name || 'Division';
  }, [context, org.divisions, divisionId]);

  const resolvedSectionName = useMemo(() => {
    if (context?.sectionName) return context.sectionName;
    return org.sections.find((s) => s.id === sectionId)?.name || 'Section';
  }, [context, org.sections, sectionId]);

  const resolvedDepartmentName = useMemo(() => {
    if (context?.departmentName) return context.departmentName;
    return org.departments.find((d) => d.id === departmentId)?.name || 'Department';
  }, [context, org.departments, departmentId]);

  const resolvedComplaintCatName = useMemo(() => {
    return categories.find((c) => c.id === watchedComplaintCat)?.name || null;
  }, [categories, watchedComplaintCat]);

  const resolvedRootCatName = useMemo(() => {
    return rootCategories.find((c) => c.id === watchedRootCauseCat)?.name || null;
  }, [rootCategories, watchedRootCauseCat]);

  const resolvedFailureCatName = useMemo(() => {
    return failureCategories.find((c) => c.id === watchedFailureCat)?.name || null;
  }, [failureCategories, watchedFailureCat]);

  // Form completion checklist
  const completionStats = useMemo(() => {
    let score = 0;
    const total = 4;
    if (divisionId && sectionId) score++;
    if (watchedMachineId) score++;
    if (watchedComplaint && watchedComplaint.trim().length > 3) score++;
    if (watchedPriority && watchedMaintenanceType) score++;
    return {
      score,
      total,
      percent: Math.round((score / total) * 100),
      isReady: score === total,
    };
  }, [divisionId, sectionId, watchedMachineId, watchedComplaint, watchedPriority, watchedMaintenanceType]);

  return (
    <div className="erp-jc-page-wrapper">
      {/* Minimized Docked Pill */}
      {isMinimized && (
        <div
          className="erp-jc-docked-pill"
          onClick={() => setIsMinimized(false)}
          title="Click to restore Open Job Card form"
        >
          <Badge status="processing" color="#3b82f6" />
          <ToolOutlined style={{ color: '#60a5fa', fontSize: 18 }} />
          <div>
            <div className="erp-jc-docked-pill-title">Open Job Card (In Progress)</div>
            <div className="erp-jc-docked-pill-sub">
              {selectedMachine ? `Asset: ${selectedMachine.machineName || selectedMachine.machineCode}` : 'Drafting new ticket...'}
            </div>
          </div>
          <Button size="small" type="primary" shape="round" style={{ fontWeight: 600 }}>
            Restore
          </Button>
        </div>
      )}

      {/* Main Draggable & Resizable Popup Modal */}
      <Modal
        wrapClassName={`erp-jc-modal-wrap ${isMobile ? 'erp-jc-mobile-view' : ''}`}
        rootClassName={isMobile ? 'erp-jc-mobile-root' : undefined}
        open={!isMinimized}
        closable={false}
        footer={null}
        zIndex={1250}
        width={isMobile || isMaximized ? '100vw' : 1180}
        styles={{
          content: {
            height: isMobile || isMaximized ? '100vh' : undefined,
            maxHeight: isMobile || isMaximized ? '100vh' : undefined,
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            borderRadius: isMobile || isMaximized ? 0 : 16,
            overflow: 'hidden',
          },
          body: {
            flex: '1 1 0%',
            height: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            overflow: 'hidden',
          },
        }}
        style={
          isMobile || isMaximized
            ? {
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: 0,
                margin: 0,
                maxWidth: '100vw',
                width: '100vw',
                height: '100vh',
                position: 'fixed',
              }
            : {
                top: 24,
                transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
                maxWidth: 'calc(100vw - 32px)',
              }
        }
      >
        <div
          className="erp-jc-modal-root-container"
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 0%',
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Header with mouse drag & window controls */}
          <div
            className="erp-jc-modal-header"
            style={{ flexShrink: 0 }}
            onMouseDown={isMobile ? undefined : handleDragStart}
          >
            <div className="erp-jc-header-title-group">
              <div className="erp-jc-header-icon">
                <ToolOutlined />
              </div>
              <div className="erp-jc-header-title-text">
                <h4>Open Maintenance Job Card</h4>
                <span>Fast asset fault logging & real-time ticket preview</span>
              </div>
            </div>

            <div className="erp-jc-header-ctrl-group" onMouseDown={(e) => e.stopPropagation()}>
              {!isMobile && (
                <Tooltip title={showPreviewPane ? 'Hide Live Ticket Sheet' : 'Show Live Ticket Sheet'}>
                  <button
                    type="button"
                    className="erp-jc-header-ctrl-btn"
                    onClick={() => setShowPreviewPane((v) => !v)}
                    aria-label={showPreviewPane ? 'Hide Detail Sheet' : 'Show Detail Sheet'}
                    style={{
                      width: 'auto',
                      padding: '0 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: showPreviewPane ? 'rgba(37, 99, 235, 0.35)' : 'rgba(255, 255, 255, 0.1)',
                      borderColor: showPreviewPane ? '#3b82f6' : 'rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    {showPreviewPane ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    <span>{showPreviewPane ? 'Hide Detail Sheet' : 'Show Detail Sheet'}</span>
                  </button>
                </Tooltip>
              )}

              {!isMobile && (
                <Tooltip title={isMaximized ? 'Restore Window Size' : 'Maximize Fullscreen'}>
                  <button
                    type="button"
                    className="erp-jc-header-ctrl-btn"
                    onClick={() => setIsMaximized(!isMaximized)}
                    aria-label="Maximize"
                  >
                    {isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  </button>
                </Tooltip>
              )}

              <Tooltip title="Minimize to bottom dock">
                <button
                  type="button"
                  className="erp-jc-header-ctrl-btn"
                  onClick={() => setIsMinimized(true)}
                  aria-label="Minimize"
                >
                  <MinusOutlined />
                </button>
              </Tooltip>

              <Tooltip title="Close and return to Job Cards list">
                <button
                  type="button"
                  className="erp-jc-header-ctrl-btn erp-jc-header-ctrl-btn--close"
                  onClick={() => navigate('/maintenance/job-cards')}
                  aria-label="Close"
                >
                  <CloseOutlined />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Mobile Tab Switcher */}
          <div
            className="erp-jc-mobile-tab-bar"
            style={{
              flexShrink: 0,
              display: isMobile ? 'block' : 'none',
              padding: '8px 14px',
              background: 'var(--theme-surface-alt, #0f172a)',
              borderBottom: '1px solid var(--theme-border, #1e293b)',
            }}
          >
            <Segmented
              block
              value={mobileActiveTab}
              onChange={(val) => setMobileActiveTab(val as 'form' | 'preview')}
              options={[
                { label: 'Form Input', value: 'form', icon: <FormOutlined /> },
                { label: 'Live Ticket Sheet', value: 'preview', icon: <EyeOutlined /> },
              ]}
            />
          </div>

          {/* Modal Body Container: Left Form + Right Live Ticket Sheet */}
          <div
            className="erp-jc-body-container"
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              flex: '1 1 0%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* ── Left Form Pane ────────────────────────────────────────── */}
            {(!isMobile || mobileActiveTab === 'form') && (
              <div
                className="erp-jc-form-pane"
                style={{
                  flex: isMobile ? '1 1 100%' : (showPreviewPane ? '1 1 60%' : '1 1 100%'),
                  height: '100%',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  borderRight: !isMobile && showPreviewPane ? '1px solid var(--theme-border)' : 'none',
                  width: isMobile ? '100%' : undefined,
                  display: isMobile && mobileActiveTab !== 'form' ? 'none' : 'block',
                }}
              >
              <Form
                form={form}
                layout="vertical"
                onFinish={submit}
                initialValues={initialValues}
                requiredMark="optional"
              >
                {/* 1. Organization & Asset Hierarchy */}
                <div className="erp-jc-form-section">
                  <div className="erp-jc-section-header">
                    <span className="erp-jc-section-badge">1</span>
                    <h5 className="erp-jc-section-title">Equipment &amp; Asset Location</h5>
                  </div>

                  {context ? (
                    <Descriptions bordered size="small" column={{ xs: 1, md: 3 }} style={{ marginBottom: 12 }}>
                      <Descriptions.Item label="Division">{context.divisionName}</Descriptions.Item>
                      <Descriptions.Item label="Section">{context.sectionName}</Descriptions.Item>
                      <Descriptions.Item label="Department">{context.departmentName}</Descriptions.Item>
                      <Descriptions.Item label="Machine">
                        {context.machineName} {context.machineCode ? `(${context.machineCode})` : ''}
                      </Descriptions.Item>
                    </Descriptions>
                  ) : (
                    <>
                      <Row gutter={12}>
                        <Col xs={24} md={8}>
                           <Form.Item
                             name="divisionId"
                             label={<span><ApartmentOutlined style={{ marginRight: 4, color: 'var(--maint-info-fg)' }} />Division</span>}
                             rules={[{ required: true, message: 'Division is required' }]}
                           >
                             <Select
                               showSearch
                               optionFilterProp="label"
                               placeholder={divisionsLoading ? 'Loading divisions...' : 'Select Division'}
                               loading={divisionsLoading}
                                classNames={{ popup: { root: 'erp-jc-select-dropdown' } }}
                               options={org.divisions?.map(div => ({ value: div.id, label: div.name || div.division_code || div.divisionCode }))}
                               notFoundContent={
                                 divisionsLoading
                                    ? 'Loading divisions...'
                                    : divisionsError
                                      ? `Unable to load divisions. Please try again. (${divisionsError})`
                                      : 'No divisions available for your company.'
                               }
                               onChange={(val) => {
                                 form.setFieldValue('divisionId', val);
                                  form.resetFields(['sectionId', 'assignedDepartmentId']);
                                 clearMachine();
                               }}
                             />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                           <Form.Item
                             name="sectionId"
                             label={<span><BranchesOutlined style={{ marginRight: 4, color: 'var(--maint-info-fg)' }} />Section</span>}
                             rules={[{ required: true, message: 'Section is required' }]}
                           >
                             <Select
                               showSearch
                               disabled={!divisionId}
                               placeholder={sectionsLoading ? 'Loading sections...' : 'Select Section'}
                               loading={sectionsLoading}
                                classNames={{ popup: { root: 'erp-jc-select-dropdown' } }}
                               options={org.sections.map((v) => ({ value: v.id, label: optionLabel(v) }))}
                               notFoundContent={
                                 !divisionId
                                    ? 'Select a division first'
                                    : sectionsLoading
                                      ? 'Loading sections...'
                                      : sectionsError
                                        ? `Unable to load sections. Please try again. (${sectionsError})`
                                        : 'No sections available for this division.'
                               }
                               onChange={(val) => {
                                 form.setFieldValue('sectionId', val);
                                 form.resetFields(['assignedDepartmentId']);
                                 clearMachine();
                               }}
                             />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                           <Form.Item
                             name="assignedDepartmentId"
                             label={<span><ClusterOutlined style={{ marginRight: 4, color: 'var(--maint-info-fg)' }} />Department (Optional)</span>}
                           >
                             <Select
                               showSearch
                               allowClear
                               disabled={!sectionId}
                               placeholder={departmentsLoading ? 'Loading departments...' : 'Select Department'}
                               loading={departmentsLoading}
                                classNames={{ popup: { root: 'erp-jc-select-dropdown' } }}
                               options={org.departments.map((v) => ({ value: v.id, label: optionLabel(v) }))}
                               notFoundContent={
                                 !sectionId
                                    ? 'Select a section first'
                                    : departmentsLoading
                                      ? 'Loading departments...'
                                      : departmentsError
                                        ? `Unable to load departments. Please try again. (${departmentsError})`
                                        : 'No departments available for this section.'
                               }
                               onChange={() => clearMachine()}
                             />
                          </Form.Item>
                        </Col>
                      </Row>

                      {/* Machine Select & Barcode QR Scanner */}
                      <Row gutter={12}>
                        <Col xs={24} md={16}>
                          <Form.Item
                            name="machineNumber"
                            label={<span><BuildOutlined style={{ marginRight: 4, color: 'var(--maint-info-fg)' }} />Select Machine</span>}
                            rules={[{ required: true, message: 'Machine selection is required' }]}
                          >
                            <Select
                              showSearch
                              allowClear
                              placeholder="Search machine by name or code..."
                              optionFilterProp="label"
                              classNames={{ popup: { root: 'erp-jc-select-dropdown' } }}
                              filterOption={(input, option) =>
                                ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())
                              }
                              loading={machinesLoading}
                              disabled={!resolvedCompanyId || machinesLoading}
                              options={machines.map((m) => ({
                                value: m.id,
                                label: machineLabel(m),
                                title: machineLabel(m),
                              }))}
                              notFoundContent={
                                machinesLoading
                                  ? 'Loading machines...'
                                  : machinesError
                                    ? `Unable to load machines. Please try again. (${machinesError})`
                                    : 'No machines available for the selected organization'
                              }
                              onChange={handleMachineChange}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                          <Form.Item
                            name="machineBarcode"
                            label={<span><BarcodeOutlined style={{ marginRight: 4, color: 'var(--maint-info-fg)' }} />Machine Barcode</span>}
                            tooltip="Auto-populated when machine is selected or scanned"
                          >
                            <Input
                              readOnly
                              placeholder="Auto-populated"
                              suffix={<BarcodeOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  )}

                  {/* QR Scan or Quick Code Input */}
                  <Row gutter={12} align="bottom" style={{ marginBottom: 12 }}>
                    <Col xs={24} sm={16}>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--theme-text-secondary)', marginBottom: 4 }}>
                          Scan Machine Barcode / QR Code
                        </div>
                        <Input
                          placeholder="Scan QR or enter machine code and press Enter..."
                          value={lookupCode}
                          onChange={(e) => setLookupCode(e.target.value)}
                          onPressEnter={() => verifyMachineCode()}
                          suffix={
                            <ScanOutlined
                              title="Open camera scanner"
                              aria-label="Open camera scanner"
                              style={{ color: 'var(--maint-info-fg)', cursor: 'pointer' }}
                              onClick={() => setScannerOpen(true)}
                            />
                          }
                        />
                      </div>
                    </Col>
                    <Col xs={24} sm={8}>
                      <div style={{ marginBottom: 8 }}>
                        <Button
                          type="default"
                          icon={<ScanOutlined />}
                          loading={lookupLoading}
                          onClick={() => verifyMachineCode()}
                          block
                        >
                          Verify Code
                        </Button>
                      </div>
                    </Col>
                  </Row>

                  {/* Machine Live Alert Banner — also the verification result/status area */}
                  {selectedMachine && (
                    <div
                      className={
                        verifyError
                          ? 'erp-jc-machine-banner erp-jc-machine-banner--error'
                          : machineVerified
                            ? 'erp-jc-machine-banner erp-jc-machine-banner--verified'
                            : 'erp-jc-machine-banner'
                      }
                    >
                      <Space>
                        {verifyError ? (
                          <CloseCircleOutlined style={{ color: 'var(--maint-danger-fg)', fontSize: 18 }} />
                        ) : (
                          <CheckCircleOutlined style={{ color: 'var(--maint-success-fg)', fontSize: 18 }} />
                        )}
                        <div>
                          {machineVerified && (
                            <div className="erp-jc-machine-banner-verified-label">&#10003; Machine Verified</div>
                          )}
                          <div className="erp-jc-machine-banner-title">
                            {selectedMachine.machineName || selectedMachine.name || selectedMachine.machineCode}
                          </div>
                          <div className="erp-jc-machine-banner-sub">
                            Code: {selectedMachine.machineCode || '—'} &bull; Type: {selectedMachine.machineType || '—'} &bull; Location: {selectedMachine.location || '—'}
                          </div>
                          {verifyError && (
                            <div className="erp-jc-machine-banner-error-msg">{verifyError}</div>
                          )}
                        </div>
                      </Space>
                      <Button size="small" type="text" danger onClick={clearMachine}>
                        Change
                      </Button>
                    </div>
                  )}

                  <Form.Item name="companyId" hidden><Input /></Form.Item>
                  <Form.Item name="machineId" hidden rules={[{ required: true, message: 'Machine is required' }]}><Input /></Form.Item>
                </div>

                {/* 2. Issue Details & Quick Complaint Chips */}
                <div className="erp-jc-form-section">
                  <div className="erp-jc-section-header">
                    <span className="erp-jc-section-badge">2</span>
                    <h5 className="erp-jc-section-title">Fault &amp; Complaint Description</h5>
                  </div>

                  {/* 1-Tap Quick Complaint Chips (Mobile Friendly) */}
                  <div className="erp-jc-quick-chips-wrapper">
                    <div className="erp-jc-quick-chips-title">
                      <ThunderboltOutlined style={{ color: '#f59e0b' }} />
                      Quick 1-Tap Complaint Templates (Click to fill):
                    </div>
                    <div className="erp-jc-chips-scroll">
                      {QUICK_COMPLAINTS.map((item, idx) => (
                        <span
                          key={idx}
                          className="erp-jc-quick-chip"
                          onClick={() => handleApplyQuickComplaint(item.text)}
                          title="Click to automatically fill this complaint"
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Form.Item
                    name="complaint"
                    label={<span><WarningOutlined style={{ marginRight: 4, color: '#ef4444' }} />Complaint / Issue Summary</span>}
                    rules={[{ required: true, message: 'Complaint summary is required' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input.TextArea
                      rows={3}
                      placeholder="Describe the problem, machine symptoms, or breakdown details..."
                    />
                  </Form.Item>

                  {/* Interactive Priority Selector (Cards) */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text-secondary, #94a3b8)', marginBottom: 4 }}>
                      Urgency / Priority Level:
                    </div>
                    <div className="erp-jc-priority-grid">
                      {priorities.map((p) => (
                        <div
                          key={p}
                          className={`erp-jc-priority-pill ${
                            watchedPriority === p ? `erp-jc-priority-pill--active-${p}` : ''
                          }`}
                          onClick={() => form.setFieldValue('priority', p)}
                        >
                          <div style={{ fontSize: 13 }}>{label(p)}</div>
                        </div>
                      ))}
                    </div>
                    <Form.Item name="priority" hidden>
                      <Input />
                    </Form.Item>
                  </div>

                  {/* Maintenance Type & Complaint Category */}
                  <Row gutter={12}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="maintenanceType"
                        label="Maintenance Type"
                        rules={[{ required: true }]}
                      >
                        <Select
                          classNames={{ popup: { root: 'erp-jc-select-dropdown' } }}
                          options={MAINTENANCE_TYPES.map((v) => ({
                            value: v,
                            label: label(v),
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="complaintCategoryId"
                        label="Complaint Category"
                      >
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={categories.map((c) => ({ value: c.id, label: categoryLabel(c) }))}
                          classNames={{ popup: { root: 'erp-jc-select-dropdown' } }}
                          placeholder="Select complaint category"
                          notFoundContent="No categories available"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>

                {/* 3. Classification & Work Scope */}
                <div className="erp-jc-form-section">
                  <div className="erp-jc-section-header">
                    <span className="erp-jc-section-badge">3</span>
                    <h5 className="erp-jc-section-title">Root Cause &amp; Technical Notes</h5>
                  </div>

                  <Row gutter={12}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="rootCauseCategoryId" label="Root Cause Category (Optional)">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={rootCategories.map((c) => ({ value: c.id, label: categoryLabel(c) }))}
                          classNames={{ popup: { root: 'erp-jc-select-dropdown' } }}
                          placeholder="Select root cause"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="failureCategoryId" label="Failure Category (Optional)">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={failureCategories.map((c) => ({ value: c.id, label: categoryLabel(c) }))}
                          classNames={{ popup: { root: 'erp-jc-select-dropdown' } }}
                          placeholder="Select failure category"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    name="description"
                    label={<span><FileTextOutlined style={{ marginRight: 4 }} />Additional Technical Notes / Observations</span>}
                    style={{ marginBottom: 4 }}
                  >
                    <Input.TextArea
                      rows={3}
                      placeholder="Any supplementary technical observations, safety precautions, or parts required..."
                    />
                  </Form.Item>

                  {can('maintenance.category.manage') && (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => setCategoryModalOpen(true)}
                        style={{ padding: 0 }}
                      >
                        + Create New Complaint Category
                      </Button>
                    </div>
                  )}
                </div>
              </Form>
            </div>
            )}

            {/* ── Right Live Sheet Preview Pane (Collapsible via Toggle Button) ── */}
            {(!isMobile ? showPreviewPane : mobileActiveTab === 'preview') && (
              <div
                className="erp-jc-preview-pane"
                style={{
                  flex: isMobile ? '1 1 100%' : undefined,
                  height: '100%',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  width: isMobile ? '100%' : undefined,
                  maxWidth: isMobile ? '100%' : 480,
                  display: isMobile && mobileActiveTab !== 'preview' ? 'none' : 'flex',
                }}
              >
              {/* Readiness Progress Meter */}
              <div className="erp-jc-completion-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text, #ffffff)' }}>Form Completion</span>
                  <Tag color={completionStats.isReady ? 'green' : 'orange'} style={{ borderRadius: 10, margin: 0, fontWeight: 600 }}>
                    {completionStats.isReady ? 'Ready to Submit' : `${completionStats.score}/${completionStats.total} Complete`}
                  </Tag>
                </div>
                <Progress
                  percent={completionStats.percent}
                  size="small"
                  strokeColor={completionStats.isReady ? '#10b981' : '#2563eb'}
                  showInfo={false}
                />
              </div>

              {/* Live Job Card Ticket Card */}
              <div className="erp-jc-live-ticket">
                {/* Ticket Header */}
                <div className="erp-jc-ticket-header">
                  <div>
                    <div className="erp-jc-ticket-code">
                      <BarcodeOutlined />
                      #JC-DRAFT
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                      Status: <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 4px', height: 18, lineHeight: '16px' }}>OPEN</Tag>
                    </div>
                  </div>

                  {/* Priority Tag */}
                  <Tag
                    color={
                      watchedPriority === 'CRITICAL'
                        ? 'red'
                        : watchedPriority === 'HIGH'
                        ? 'orange'
                        : watchedPriority === 'LOW'
                        ? 'default'
                        : 'blue'
                    }
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 12,
                      margin: 0,
                    }}
                  >
                    {watchedPriority}
                  </Tag>
                </div>

                {/* Ticket Body */}
                <div className="erp-jc-ticket-body">
                  {/* Maintenance Type */}
                  <div className="erp-jc-ticket-row">
                    <span className="erp-jc-ticket-label">Maintenance Classification</span>
                    <div>
                      <Tag color="purple" style={{ fontWeight: 600 }}>
                        {label(watchedMaintenanceType)}
                      </Tag>
                    </div>
                  </div>

                  {/* Asset Details */}
                  <div className="erp-jc-ticket-row">
                    <span className="erp-jc-ticket-label">Equipment / Target Asset</span>
                    <div className="erp-jc-ticket-val">
                      {selectedMachine ? (
                        <span>
                          <BuildOutlined style={{ color: 'var(--maint-info-fg)', marginRight: 6 }} />
                          {selectedMachine.machineName || selectedMachine.name || selectedMachine.machineCode}
                          {selectedMachine.machineCode && (
                            <Tag color="cyan" style={{ marginLeft: 6, fontSize: 11 }}>
                              {selectedMachine.machineCode}
                            </Tag>
                          )}
                        </span>
                      ) : (
                        <Text type="secondary" style={{ fontStyle: 'italic', fontWeight: 400 }}>
                          No machine selected yet
                        </Text>
                      )}
                    </div>
                    {watchedMachineBarcode && (
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <BarcodeOutlined /> Barcode: <code>{watchedMachineBarcode}</code>
                      </div>
                    )}
                  </div>

                  {/* Location Hierarchy */}
                  <div className="erp-jc-ticket-row">
                    <span className="erp-jc-ticket-label">Location &amp; Hierarchy</span>
                    <div style={{ fontSize: 12, color: 'var(--theme-text, #cbd5e1)' }}>
                      <strong>{resolvedDivisionName}</strong> ➔ {resolvedSectionName}
                      {resolvedDepartmentName && resolvedDepartmentName !== 'Department' ? ` ➔ ${resolvedDepartmentName}` : ''}
                    </div>
                  </div>

                  {/* Complaint Quotation Box */}
                  <div className="erp-jc-ticket-row">
                    <span className="erp-jc-ticket-label">Reported Fault / Complaint</span>
                    <div
                      className={`erp-jc-ticket-complaint-box ${
                        !watchedComplaint.trim() ? 'erp-jc-ticket-complaint-box--empty' : ''
                      }`}
                    >
                      {watchedComplaint.trim() || 'Waiting for complaint summary to be typed or selected...'}
                    </div>
                  </div>

                  {/* Category Tags */}
                  {(resolvedComplaintCatName || resolvedRootCatName || resolvedFailureCatName) && (
                    <div className="erp-jc-ticket-row">
                      <span className="erp-jc-ticket-label">Classification Tags</span>
                      <Space wrap size={[4, 4]}>
                        {resolvedComplaintCatName && <Tag color="blue">{resolvedComplaintCatName}</Tag>}
                        {resolvedRootCatName && <Tag color="geekblue">Root: {resolvedRootCatName}</Tag>}
                        {resolvedFailureCatName && <Tag color="volcano">Fail: {resolvedFailureCatName}</Tag>}
                      </Space>
                    </div>
                  )}

                  {/* Description / Extra Notes */}
                  {watchedDescription.trim() && (
                    <div className="erp-jc-ticket-row">
                      <span className="erp-jc-ticket-label">Additional Technical Notes</span>
                      <div className="erp-jc-ticket-notes">
                        {watchedDescription}
                      </div>
                    </div>
                  )}

                  {/* Meta Grid */}
                  <div className="erp-jc-ticket-meta-grid">
                    <div>
                      <span className="erp-jc-ticket-label">Reported By</span>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <UserOutlined style={{ color: 'var(--maint-info-fg)' }} />
                        {user?.displayName || user?.email || 'Logged User'}
                      </div>
                    </div>
                    <div>
                      <span className="erp-jc-ticket-label">Date &amp; Time</span>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ClockCircleOutlined style={{ color: '#16a34a' }} />
                        {dayjs().format('DD MMM, hh:mm A')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

          {/* Modal Bottom Footer Actions */}
          <div
            className="erp-jc-footer"
            style={{
              flexShrink: 0,
              marginTop: 'auto',
              position: 'relative',
              zIndex: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: isMobile ? '100%' : 'auto',
                justifyContent: isMobile ? 'space-between' : 'flex-start',
              }}
            >
              <Button
                style={isMobile ? { flex: 1 } : undefined}
                onClick={() => navigate('/maintenance/job-cards')}
              >
                Cancel &amp; Return
              </Button>
              <Button
                style={isMobile ? { flex: 1 } : undefined}
                icon={<ReloadOutlined />}
                onClick={() => {
                  form.resetFields();
                  setSelectedMachine(null);
                  setLookupCode('');
                }}
              >
                Reset Form
              </Button>
              {!isMobile && (
                <Button
                  icon={showPreviewPane ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() => setShowPreviewPane((v) => !v)}
                >
                  {showPreviewPane ? 'Hide Detail Sheet' : 'Show Detail Sheet'}
                </Button>
              )}
            </div>

            <Space style={{ width: isMobile ? '100%' : 'auto' }}>
              <Button
                type="primary"
                size="large"
                icon={<CheckCircleOutlined />}
                loading={loading}
                disabled={!completionStats.isReady}
                onClick={() => form.submit()}
                block={isMobile}
                style={{
                  minWidth: isMobile ? '100%' : 170,
                  fontWeight: 700,
                  borderRadius: 10,
                  backgroundColor: completionStats.isReady ? '#2563eb' : undefined,
                  boxShadow: completionStats.isReady ? '0 4px 12px rgba(37, 99, 235, 0.35)' : undefined,
                }}
              >
                Submit Job Card
              </Button>
            </Space>
          </div>
        </div>
      </Modal>

      {/* Add Complaint Category Modal */}
      <Modal
        title="Add Complaint Category"
        wrapClassName="erp-jc-dialog-wrap"
        open={categoryModalOpen}
        zIndex={1500}
        confirmLoading={categorySaving}
        onCancel={() => {
          setCategoryModalOpen(false);
          categoryForm.resetFields();
        }}
        onOk={() => categoryForm.submit()}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        style={isMobile ? { top: 20, margin: '0 auto', maxWidth: 'calc(100vw - 24px)' } : undefined}
      >
        <Form form={categoryForm} layout="vertical" onFinish={saveCategory}>
          <Form.Item
            name="name"
            label="Category name"
            rules={[{ required: true, message: 'Category name is required' }]}
          >
            <Input placeholder="e.g. Electrical Fault, Mechanical Wear" />
          </Form.Item>
          <Form.Item name="code" label="Category code">
            <Input placeholder="e.g. CAT-ELEC, CAT-MECH" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Describe this complaint category..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Submission Confirmation Popup Modal ── */}
      <Modal
        wrapClassName="erp-jc-dialog-wrap"
        open={confirmModalOpen}
        zIndex={1500}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ToolOutlined style={{ color: 'var(--maint-info-fg)', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Confirm Job Card Submission</span>
          </div>
        }
        onCancel={() => {
          if (!loading) {
            setConfirmModalOpen(false);
            setSubmitError(null);
          }
        }}
        footer={[
          <Button key="back" onClick={() => setConfirmModalOpen(false)} disabled={loading}>
            Cancel & Review
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={loading}
            icon={<CheckCircleOutlined />}
            style={{ backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#ffffff', fontWeight: 700 }}
            onClick={handleConfirmSave}
          >
            Yes, Confirm & Submit
          </Button>,
        ]}
        width={isMobile ? 'calc(100vw - 24px)' : 540}
        style={isMobile ? { top: 20, margin: '0 auto', maxWidth: 'calc(100vw - 24px)' } : undefined}
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ color: 'var(--theme-text-secondary, #94a3b8)', marginBottom: 14, fontSize: 13 }}>
            Please review the ticket summary below. Once confirmed, this job card will be officially logged and queued for maintenance.
          </p>

          <div
            style={{
              background: 'var(--theme-surface-alt, #0f172a)',
              border: '1px solid var(--theme-border, #1e293b)',
              borderRadius: 10,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>TARGET MACHINE</span>
              <Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>
                {selectedMachine?.machineCode || '—'}
              </Tag>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--theme-text, #ffffff)' }}>
              {selectedMachine?.machineName || selectedMachine?.name || selectedMachine?.machineCode || 'Asset'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>CLASSIFICATION</span>
              <Space size={4}>
                <Tag color="purple">{label(pendingPayload?.maintenanceType)}</Tag>
                <Tag color={pendingPayload?.priority === 'CRITICAL' ? 'red' : 'blue'}>{pendingPayload?.priority}</Tag>
              </Space>
            </div>

            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>REPORTED COMPLAINT</span>
              <div
                style={{
                  background: 'var(--maint-danger-bg)',
                  borderLeft: '3px solid var(--maint-danger-fg)',
                  padding: '8px 12px',
                  borderRadius: 4,
                  fontSize: 12,
                  color: 'var(--maint-danger-fg)',
                  fontStyle: 'italic',
                  marginTop: 4,
                }}
              >
                "{pendingPayload?.complaint}"
              </div>
            </div>
          </div>

          {/* Any error displayed inside popup as requested */}
          {submitError && (
            <Alert
              type="error"
              showIcon
              message="Failed to create Job Card"
              description={submitError}
              style={{ marginTop: 12, borderRadius: 8 }}
            />
          )}
        </div>
      </Modal>

      {/* ── Success Dialog Modal ── */}
      <Modal
        wrapClassName="erp-jc-dialog-wrap"
        open={successModalOpen}
        zIndex={1500}
        closable={false}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 480}
        style={isMobile ? { top: 20, margin: '0 auto', maxWidth: 'calc(100vw - 24px)' } : undefined}
      >
        <div style={{ textAlign: 'center', padding: '20px 14px' }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '2px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              color: 'var(--maint-success-fg)',
              fontSize: 28,
            }}
          >
            <CheckCircleOutlined />
          </div>

          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--theme-text, #ffffff)' }}>
            Job Card Created Successfully!
          </h3>

          <p style={{ color: 'var(--theme-text-muted, #94a3b8)', marginBottom: 18, fontSize: 13 }}>
            Ticket has been assigned to the maintenance queue and is ready for repair work.
          </p>

          <div
            style={{
              background: 'var(--theme-surface-alt, #0f172a)',
              border: '1px solid var(--theme-border, #1e293b)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 20,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>TICKET NUMBER:</span>
              <Space size={4}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--maint-info-fg)', fontSize: 14 }}>
                  #{createdTicket?.jobCardNo || createdTicket?.id}
                </span>
                <Tooltip title="Copy ticket code">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined style={{ color: 'var(--maint-info-fg)' }} />}
                    onClick={() => {
                      navigator.clipboard?.writeText(createdTicket?.jobCardNo || createdTicket?.id || '');
                      message.info('Ticket code copied to clipboard!');
                    }}
                  />
                </Tooltip>
              </Space>
            </div>
            <div style={{ fontSize: 13, color: 'var(--theme-text, #ffffff)', fontWeight: 600 }}>
              Asset: {selectedMachine?.machineName || selectedMachine?.name} ({selectedMachine?.machineCode})
            </div>
          </div>

          <Space size={12} wrap style={{ justifyContent: 'center' }}>
            <Button
              onClick={() => {
                setSuccessModalOpen(false);
                form.resetFields();
                setSelectedMachine(null);
                setLookupCode('');
              }}
            >
              + Open Another Job Card
            </Button>
            <Button
              type="primary"
              style={{ backgroundColor: '#10b981', borderColor: '#10b981', color: '#ffffff', fontWeight: 700 }}
              onClick={() => {
                setSuccessModalOpen(false);
                navigate('/maintenance/job-cards');
              }}
            >
              Done / OK
            </Button>
          </Space>
        </div>
      </Modal>

      {/* Machine QR / Barcode camera scanner — reuses the shared html5-qrcode
          scanner component; the scanned value lands in the verification input
          and is verified through the same verifyMachineCode() entry point. */}
      <BarcodeScanner
        open={scannerOpen}
        zIndex={1500}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => {
          setLookupCode(code);
          verifyMachineCode(code);
        }}
        title="Machine QR / Barcode Scanner"
      />
    </div>
  );
};

export default JobCardCreate;
