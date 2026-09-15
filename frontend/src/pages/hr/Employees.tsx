import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, App, Row, Col, Tag, DatePicker,
  Space, Tooltip, Popconfirm, Drawer, Tabs, Descriptions, Avatar, Dropdown, MenuProps,
  Upload, Divider, Typography, Checkbox, Progress, Segmented, Badge, Switch, Alert
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined, DownOutlined, ClearOutlined,
  PrinterOutlined, DownloadOutlined, FilePdfOutlined, UploadOutlined, ReloadOutlined,
  EyeOutlined, EditOutlined, PoweroffOutlined, UserOutlined, MailOutlined,
  PhoneOutlined, ApartmentOutlined, CheckCircleOutlined,
  CloseCircleOutlined, FileExcelOutlined, AppstoreOutlined, SettingOutlined,
  ToolOutlined, BuildOutlined, DatabaseOutlined, ProjectOutlined, TagOutlined,
  MinusOutlined, WarningOutlined, SyncOutlined, IdcardOutlined, CalendarOutlined,
  HomeOutlined, InboxOutlined, FileTextOutlined, ImportOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import { PageHeader, DraggableResizableModal } from '../../components/shared';
import '../../styles/erp-table.css';
import '../master-data/itemManagement.css';

const { Text } = Typography;

/* ─── Interfaces ─────────────────────────────────────────────────────────── */

interface Employee {
  id: string;
  companyId: string;
  employeeCode: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  cnic?: string | null;
  designationId?: string | null;
  designationName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  divisionName?: string | null;
  sectionName?: string | null;
  jobTitle?: string | null;
  status: string;
  employmentType?: string;
  joinDate?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  monthlySalary?: number | null;
  currency?: string;
  department?: {
    id: string;
    name: string;
    departmentCode?: string;
    divisionId?: string;
    sectionId?: string;
    division?: { id: string; name: string };
    section?: { id: string; name: string };
  } | null;
  designation?: {
    id: string;
    designationCode: string;
    designationName: string;
  } | null;
  manager?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName?: string;
  } | null;
  skills?: Array<{ id: string; skillName: string; proficiencyLevel?: string }>;
  training?: Array<{ id: string; trainingName: string; completionDate?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

interface OrgOption {
  id: string;
  name: string;
  code?: string;
  divisionId?: string;
  sectionId?: string;
}

interface DesignationOption {
  id: string;
  designationCode: string;
  designationName: string;
}

interface ImportRow {
  rowNumber: number;
  data: Record<string, string>;
  status: 'VALID' | 'INVALID' | 'DUPLICATE';
  errors: string[];
}

/* ─── Column Visibility Constants (Matching ItemManagement Model) ────────── */

const DEFAULT_EMPLOYEE_VISIBLE_COLUMNS: Record<string, boolean> = {
  employeeCode: true,
  employeeName: true,
  cnic: true,
  dateOfBirth: true,
  address: true,
  designation: true,
  designationName: true,
  department: true,
  departmentName: true,
  divisionSection: true,
  contact: true,
  employmentType: false,
  joinDate: false,
  status: true,
  actions: true,
};

const EMPLOYEE_COLUMN_LABELS: Record<string, string> = {
  employeeCode: 'EmployeeID',
  employeeName: 'EmployeeName',
  cnic: 'CNIC / National ID',
  dateOfBirth: 'Date of Birth',
  address: 'Address',
  designation: 'Designation',
  department: 'Department',
  divisionSection: 'Division / Section',
  contact: 'Contact (Phone & Email)',
  employmentType: 'Employment Type',
  joinDate: 'Join Date',
  status: 'Status',
  actions: 'Actions',
};

/* ─── 2027 Chevron Pipeline Ribbon Options ───────────────────────────────── */

interface EmployeeChevronOption {
  key: string;
  label: string;
  color: string;
  activeBg: string;
  icon: React.ReactNode;
}

const EMPLOYEE_CHEVRONS: EmployeeChevronOption[] = [
  { key: 'all', label: 'ALL EMPLOYEES', color: '#334155', activeBg: '#1e293b', icon: <AppstoreOutlined /> },
  { key: 'ACTIVE', label: 'ACTIVE', color: '#16a34a', activeBg: '#15803d', icon: <CheckCircleOutlined /> },
  { key: 'INACTIVE', label: 'INACTIVE', color: '#64748b', activeBg: '#475569', icon: <MinusOutlined /> },
  { key: 'dept_flattening', label: 'FLATTENING', color: '#d97706', activeBg: '#b45309', icon: <ToolOutlined /> },
  { key: 'dept_spiral', label: 'SPIRAL', color: '#0891b2', activeBg: '#0e7490', icon: <BuildOutlined /> },
  { key: 'dept_pvc', label: 'PVC', color: '#7c3aed', activeBg: '#6d28d9', icon: <DatabaseOutlined /> },
  { key: 'dept_packing', label: 'CUTTING & PACKING', color: '#0284c7', activeBg: '#0369a1', icon: <TagOutlined /> },
  { key: 'dept_production', label: 'PRODUCTION', color: '#e11d48', activeBg: '#be123c', icon: <ProjectOutlined /> },
];

/* ─── Frosted Crystal KPI Card ───────────────────────────────────────────── */

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<any>;
  tone: string;
  toneSoft: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon: Icon, tone, toneSoft }) => (
  <Card
    size="small"
    className="item-crystal-kpi-card"
    styles={{ body: { padding: '12px 14px' } }}
    style={{ position: 'relative', overflow: 'hidden', borderLeft: `4px solid ${tone}` }}
  >
    <Icon
      aria-hidden="true"
      style={{
        position: 'absolute',
        right: -10,
        bottom: -16,
        fontSize: 68,
        opacity: 0.12,
        pointerEvents: 'none',
        zIndex: 0,
        color: tone,
      }}
    />
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </Text>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          background: toneSoft,
          color: tone,
          fontSize: 14,
        }}
      >
        <Icon />
      </span>
    </div>
    <div style={{ position: 'relative', zIndex: 1, fontSize: 24, fontWeight: 800, marginTop: 4, color: 'var(--theme-text, #0f172a)' }}>
      {value}
    </div>
  </Card>
);

/* ─── CSV Helpers ─────────────────────────────────────────────────────────── */

function parseImportCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      if (cur.some((c) => c.trim() !== '')) rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  cur.push(field);
  if (cur.some((c) => c.trim() !== '')) rows.push(cur);
  return rows;
}

function escapeCsvField(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const TEMPLATE_CSV = `\uFEFFEmployeeID,EmployeeName,Designation,Department,CNIC,DateOfBirth,Address,Phone,Email,Status
00400541,Muhammad Farooq,Flattening Operator,Flattening,42101-1234567-1,1992-05-14,House 12 Street 4 Karachi,0300-1234567,farooq@example.com,ACTIVE
00400542,M.Arsalan,Senior operator,Spiral,42101-7654321-2,1994-08-22,Main Bazar Lahore,0301-7654321,arsalan@example.com,ACTIVE
00400551,Muhammad Umar,Shift incharge,Production,42101-9988776-3,1990-11-03,Model Town Gujranwala,0321-1122334,umar@example.com,ACTIVE
00400628,Danyal,PVC Operator,PVC,42101-4455667-4,1996-02-18,Sector 5-G Karachi,0333-9988776,danyal@example.com,ACTIVE
00400606,Noor Ahmed khan,Operator,Cutting & Packing,42101-3322110-5,1993-09-29,Industrial Area Lahore,0345-5544332,noor@example.com,ACTIVE`;

const TEMPLATE_UPDATE_CSV = `\uFEFFEmployeeID,CNIC,DateOfBirth,Address
00400541,42101-1234567-1,1992-05-14,House 12 Street 4 Karachi
00400542,42101-7654321-2,1994-08-22,Main Bazar Lahore
00400551,42101-9988776-3,1990-11-03,Model Town Gujranwala
00400628,42101-4455667-4,1996-02-18,Sector 5-G Karachi
00400606,42101-3322110-5,1993-09-29,Industrial Area Lahore`;

function formatEstimatedTime(secs: number): string {
  if (secs <= 0 || !isFinite(secs)) return 'Almost done…';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

const EmployeesPage: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Eager company resolution
  const [companyId, setCompanyId] = useState<string>(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        return p?.defaultCompanyId || '';
      } catch { /* ignore */ }
    }
    return '';
  });

  // Search & Collapsible Filters
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [fDivision, setFDivision] = useState<string | undefined>(undefined);
  const [fSection, setFSection] = useState<string | undefined>(undefined);
  const [fDepartment, setFDepartment] = useState<string | undefined>(undefined);
  const [fDesignation, setFDesignation] = useState<string | undefined>(undefined);
  const [fStatus, setFStatus] = useState<string | undefined>(undefined);
  const [activeChevron, setActiveChevron] = useState<string>('all');

  // Column Visibility Chooser
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('pwi_employee_table_columns_v1');
      if (saved) return { ...DEFAULT_EMPLOYEE_VISIBLE_COLUMNS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_EMPLOYEE_VISIBLE_COLUMNS;
  });

  // Lookups
  const [divisions, setDivisions] = useState<OrgOption[]>([]);
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [designations, setDesignations] = useState<DesignationOption[]>([]);

  // Modals & Drawers
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Import Modal (2027 UX Model matching ItemManagement)
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    percent: number;
    current: number;
    total: number;
    currentCode?: string;
    speed?: number;
    estimatedSecondsRemaining?: number;
    successCount: number;
    failCount: number;
  }>({
    percent: 0,
    current: 0,
    total: 0,
    successCount: 0,
    failCount: 0,
  });
  const [importFilter, setImportFilter] = useState<'ALL' | 'INVALID' | 'DUPLICATE' | 'VALID'>('ALL');
  const [showErrorsFirst, setShowErrorsFirst] = useState(true);
  const [importPage, setImportPage] = useState(1);
  const [importPageSize, setImportPageSize] = useState(10);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [isImportMinimized, setIsImportMinimized] = useState(false);
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);

  // Print & PDF states
  const [exporting, setExporting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [form] = Form.useForm();
  const selectedDeptId = Form.useWatch('departmentId', form);
  const modalDivision = Form.useWatch('divisionId', form);

  // Fetch Lookups
  const loadLookups = useCallback(async (cid: string) => {
    try {
      const [divRes, secRes, deptRes, desigRes] = await Promise.allSettled([
        apiService.get<{ data: OrgOption[] }>('/divisions', { limit: 200 }),
        apiService.get<{ data: OrgOption[] }>('/sections', { limit: 200 }),
        apiService.get<{ data: OrgOption[] }>('/departments', { limit: 200 }),
        apiService.get<{ data: DesignationOption[] }>('/hr/designations', { companyId: cid }),
      ]);

      if (divRes.status === 'fulfilled') setDivisions(divRes.value.data || []);
      if (secRes.status === 'fulfilled') setSections(secRes.value.data || []);
      if (deptRes.status === 'fulfilled') setDepartments(deptRes.value.data || []);
      if (desigRes.status === 'fulfilled') setDesignations(desigRes.value.data || []);
    } catch {
      // Non-fatal
    }
  }, []);

  // Quick lookup maps for instant client-side resolution
  const deptMap = useMemo(() => {
    const map = new Map<string, OrgOption>();
    departments.forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  const desigMap = useMemo(() => {
    const map = new Map<string, DesignationOption>();
    designations.forEach((d) => map.set(d.id, d));
    return map;
  }, [designations]);

  const divMap = useMemo(() => {
    const map = new Map<string, OrgOption>();
    divisions.forEach((d) => map.set(d.id, d));
    return map;
  }, [divisions]);

  const secMap = useMemo(() => {
    const map = new Map<string, OrgOption>();
    sections.forEach((s) => map.set(s.id, s));
    return map;
  }, [sections]);

  useEffect(() => {
    if (companyId) {
      void loadLookups(companyId);
    }
  }, [companyId, loadLookups]);

  // Fetch Employees List
  const fetchData = useCallback(async (
    p = page,
    ps = pageSize,
    s = search,
    div = fDivision,
    sec = fSection,
    dept = fDepartment,
    des = fDesignation,
    st = fStatus
  ) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {
        companyId,
        page: p,
        limit: ps,
        search: s.trim() || undefined,
        divisionId: div || undefined,
        sectionId: sec || undefined,
        departmentId: dept || undefined,
        designationId: des || undefined,
        status: st || undefined,
      };
      const res = await apiService.get<{ data: Employee[]; total: number }>('/hr/employees', params);
      setData(res.data || []);
      setTotal(res.total || 0);

      // Cache all employees for local stats / ribbon counts
      if (!s && !div && !sec && !dept && !des && !st) {
        setAllEmployees(res.data || []);
      }
    } catch {
      message.error('Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  }, [companyId, page, pageSize, search, fDivision, fSection, fDepartment, fDesignation, fStatus, message]);

  useEffect(() => {
    if (companyId) {
      void fetchData();
    }
  }, [companyId, fetchData]);

  // When Department is picked in modal, auto-fill division and section!
  useEffect(() => {
    if (selectedDeptId && departments.length > 0) {
      const found = departments.find((d) => d.id === selectedDeptId);
      if (found) {
        if (found.divisionId && !form.getFieldValue('divisionId')) {
          form.setFieldValue('divisionId', found.divisionId);
        }
        if (found.sectionId && !form.getFieldValue('sectionId')) {
          form.setFieldValue('sectionId', found.sectionId);
        }
      }
    }
  }, [selectedDeptId, departments, form]);

  // Cascading sections and departments for filter
  const filteredSections = useMemo(() => {
    if (!fDivision) return sections;
    return sections.filter((s) => s.divisionId === fDivision);
  }, [sections, fDivision]);

  const filteredDepartments = useMemo(() => {
    let list = departments;
    if (fDivision) list = list.filter((d) => !d.divisionId || d.divisionId === fDivision);
    if (fSection) list = list.filter((d) => !d.sectionId || d.sectionId === fSection);
    return list;
  }, [departments, fDivision, fSection]);

  // In modal, always allow all departments, but sort matching division first
  const modalDepartmentOptions = useMemo(() => {
    if (!modalDivision) return departments;
    const matching = departments.filter((d) => d.divisionId === modalDivision);
    const others = departments.filter((d) => d.divisionId !== modalDivision);
    return [...matching, ...others];
  }, [departments, modalDivision]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (fDivision) count++;
    if (fSection) count++;
    if (fDepartment) count++;
    if (fDesignation) count++;
    if (fStatus) count++;
    return count;
  }, [search, fDivision, fSection, fDepartment, fDesignation, fStatus]);

  const handleApplySearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSearchInput('');
    setFDivision(undefined);
    setFSection(undefined);
    setFDepartment(undefined);
    setFDesignation(undefined);
    setFStatus(undefined);
    setActiveChevron('all');
    setPage(1);
  };

  /* ─── KPI Stats & Ribbon Counts ─────────────────────────────────────────── */

  const stats = useMemo(() => {
    const list = allEmployees.length > 0 ? allEmployees : data;
    const active = list.filter((e) => e.status === 'ACTIVE').length;
    const inactive = (total || list.length) - active;
    const operators = list.filter((e) => {
      const d = (e.designationName || e.jobTitle || (e.designationId ? desigMap.get(e.designationId)?.designationName : '') || '').toLowerCase();
      return d.includes('operator') || d.includes('incharge') || d.includes('helper') || d.includes('machine') || d.includes('checker');
    }).length;
    const depts = new Set(
      list.map((e) => e.departmentName || e.department?.name || (e.departmentId ? deptMap.get(e.departmentId)?.name : null)).filter(Boolean)
    ).size;

    return {
      total: total || list.length,
      active,
      inactive,
      operators,
      departments: depts || departments.length,
    };
  }, [allEmployees, data, total, departments, deptMap, desigMap]);

  const ribbonCounts = useMemo(() => {
    const list = allEmployees.length > 0 ? allEmployees : data;
    const counts: Record<string, number> = {
      all: total || list.length,
      ACTIVE: list.filter((e) => e.status === 'ACTIVE').length,
      INACTIVE: list.filter((e) => e.status === 'INACTIVE').length,
    };

    const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[\s&_.-]+/g, '');
    const getDeptName = (e: Employee) =>
      e.departmentName || e.department?.name || (e.departmentId ? deptMap.get(e.departmentId)?.name : '') || '';

    counts['dept_flattening'] = list.filter((e) => norm(getDeptName(e)).includes('flattening')).length;
    counts['dept_spiral'] = list.filter((e) => norm(getDeptName(e)).includes('spiral') || norm(getDeptName(e)).includes('spril')).length;
    counts['dept_pvc'] = list.filter((e) => norm(getDeptName(e)).includes('pvc')).length;
    counts['dept_packing'] = list.filter((e) => norm(getDeptName(e)).includes('packing') || norm(getDeptName(e)).includes('cutting')).length;
    counts['dept_production'] = list.filter((e) => norm(getDeptName(e)).includes('production')).length;

    return counts;
  }, [allEmployees, data, total, deptMap]);

  const handleChevronSelect = (key: string) => {
    setActiveChevron(key);
    setPage(1);

    if (key === 'all') {
      setFStatus(undefined);
      setFDepartment(undefined);
    } else if (key === 'ACTIVE' || key === 'INACTIVE') {
      setFStatus(key);
      setFDepartment(undefined);
    } else {
      setFStatus(undefined);
      const targetName = key.replace('dept_', '').toLowerCase();
      const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[\s&_.-]+/g, '');
      const found = departments.find((d) => norm(d.name).includes(targetName));
      if (found) {
        setFDepartment(found.id);
      } else {
        setSearch(targetName);
      }
    }
  };

  /* ─── View Employee Detail ───────────────────────────────────────────────── */

  const handleViewEmployee = async (emp: Employee) => {
    setSelectedEmployee(emp);
    setDetailVisible(true);
    try {
      const res = await apiService.get<{ data: Employee }>(`/hr/employees/${emp.id}`);
      if (res.data) {
        setSelectedEmployee(res.data);
      }
    } catch {
      // Keep existing row data
    }
  };

  /* ─── Add / Edit Employee ────────────────────────────────────────────────── */

  const handleOpenCreate = () => {
    setEditingEmployee(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
    });
    setFormModalVisible(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    form.resetFields();
    const deptId = emp.departmentId || emp.department?.id;
    const desigId = emp.designationId || emp.designation?.id;
    const deptObj = deptId ? deptMap.get(deptId) : undefined;
    const divId = emp.department?.divisionId || emp.department?.division?.id || deptObj?.divisionId;
    const secId = emp.department?.sectionId || emp.department?.section?.id || deptObj?.sectionId;

    form.setFieldsValue({
      employeeCode: emp.employeeCode,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone,
      cnic: emp.cnic,
      departmentId: deptId,
      designationId: desigId,
      divisionId: divId,
      sectionId: secId,
      jobTitle: emp.jobTitle || emp.designationName || (desigId ? desigMap.get(desigId)?.designationName : undefined),
      employmentType: emp.employmentType || 'FULL_TIME',
      joinDate: emp.joinDate ? dayjs(emp.joinDate) : undefined,
      dateOfBirth: emp.dateOfBirth ? dayjs(emp.dateOfBirth) : undefined,
      gender: emp.gender,
      address: emp.address,
      status: emp.status || 'ACTIVE',
    });
    setFormModalVisible(true);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setFormSubmitting(true);
      const payload: any = {
        companyId,
        employeeCode: values.employeeCode.trim(),
        firstName: values.firstName.trim(),
        lastName: values.lastName?.trim() || undefined,
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        cnic: values.cnic?.trim() || undefined,
        departmentId: values.departmentId || undefined,
        designationId: values.designationId || undefined,
        jobTitle: values.jobTitle?.trim() || undefined,
        employmentType: values.employmentType || 'FULL_TIME',
        joinDate: values.joinDate ? values.joinDate.format('YYYY-MM-DD') : undefined,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : undefined,
        gender: values.gender || undefined,
        address: values.address?.trim() || undefined,
        status: values.status || 'ACTIVE',
      };

      if (editingEmployee) {
        await apiService.patch(`/hr/employees/${editingEmployee.id}`, payload);
        message.success(`Employee ${payload.employeeCode} updated successfully`);
      } else {
        await apiService.post('/hr/employees', payload);
        message.success(`Employee ${payload.employeeCode} saved successfully`);
      }

      setFormModalVisible(false);
      form.resetFields();
      void fetchData(page);

      if (selectedEmployee && editingEmployee && selectedEmployee.id === editingEmployee.id) {
        void handleViewEmployee({ ...selectedEmployee, ...payload });
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Operation failed. Check input fields.'));
    } finally {
      setFormSubmitting(false);
    }
  };

  /* ─── Toggle Status / Delete ─────────────────────────────────────────────── */

  const handleToggleStatus = async (emp: Employee) => {
    try {
      await apiService.delete(`/hr/employees/${emp.id}`);
      const newStatus = emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      message.success(`Employee ${emp.employeeCode} status set to ${newStatus}`);
      void fetchData(page);
      if (selectedEmployee && selectedEmployee.id === emp.id) {
        setSelectedEmployee({ ...selectedEmployee, status: newStatus });
      }
    } catch {
      message.error('Failed to update employee status');
    }
  };

  /* ─── Export (Excel & CSV) ───────────────────────────────────────────────── */

  const collectAllFilteredEmployees = async (): Promise<Employee[]> => {
    const res = await apiService.get<{ data: Employee[]; total: number }>('/hr/employees', {
      companyId,
      page: 1,
      limit: 10000,
      search: search.trim() || undefined,
      divisionId: fDivision || undefined,
      sectionId: fSection || undefined,
      departmentId: fDepartment || undefined,
      designationId: fDesignation || undefined,
      status: fStatus || undefined,
    });
    return res.data || [];
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const rows = await collectAllFilteredEmployees();
      if (!rows.length) {
        message.warning('No employees to export');
        return;
      }
      const headers = ['EmployeeID', 'EmployeeName', 'CNIC', 'DateOfBirth', 'Address', 'Designation', 'Department', 'Division', 'Section', 'Email', 'Phone', 'Status', 'JoinDate'];
      const csvLines = [
        headers.join(','),
        ...rows.map((r) => [
          escapeCsvField(r.employeeCode || ''),
          escapeCsvField(`${r.firstName || ''} ${r.lastName || ''}`.trim()),
          escapeCsvField(r.cnic || ''),
          escapeCsvField(r.dateOfBirth ? String(r.dateOfBirth).slice(0, 10) : ''),
          escapeCsvField(r.address || ''),
          escapeCsvField(r.designationName || r.jobTitle || ''),
          escapeCsvField(r.departmentName || ''),
          escapeCsvField(r.divisionName || ''),
          escapeCsvField(r.sectionName || ''),
          escapeCsvField(r.email || ''),
          escapeCsvField(r.phone || ''),
          escapeCsvField(r.status || ''),
          escapeCsvField(r.joinDate ? String(r.joinDate).slice(0, 10) : ''),
        ].join(',')),
      ];

      const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `employees_master_${dayjs().format('YYYYMMDD_HHmm')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`Exported ${rows.length} employees`);
    } catch {
      message.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  /* ─── PDF Report ─────────────────────────────────────────────────────────── */

  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      const rows = await collectAllFilteredEmployees();
      if (!rows.length) {
        message.warning('No employees to export to PDF');
        return;
      }
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('Employee Master Directory', 40, 40);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on ${dayjs().format('YYYY-MM-DD HH:mm')} · Total: ${rows.length} employee(s)`, 40, 56);

      const head = [['EmployeeID', 'EmployeeName', 'CNIC / National ID', 'DOB', 'Designation', 'Department', 'Address', 'Status']];
      const body = rows.map((r) => [
        r.employeeCode || '',
        `${r.firstName || ''} ${r.lastName || ''}`.trim(),
        r.cnic || '—',
        r.dateOfBirth ? dayjs(r.dateOfBirth).format('YYYY-MM-DD') : '—',
        r.designationName || r.jobTitle || '—',
        r.departmentName || '—',
        r.address || '—',
        r.status || '',
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 70,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      }

      doc.save(`employees_directory_${dayjs().format('YYYYMMDD')}.pdf`);
      message.success(`PDF exported successfully (${rows.length} records)`);
    } catch {
      message.error('PDF generation failed');
    } finally {
      setPdfLoading(false);
    }
  };

  /* ─── Print View ─────────────────────────────────────────────────────────── */

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const rows = await collectAllFilteredEmployees();
      const printWindow = window.open('', '_blank', 'width=1000,height=700');
      if (!printWindow) {
        message.error('Popup blocked. Allow popups to print.');
        return;
      }

      const rowsHtml = rows.map((r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${r.employeeCode}</strong></td>
          <td>${r.firstName} ${r.lastName || ''}</td>
          <td>${r.cnic || '—'}</td>
          <td>${r.dateOfBirth ? String(r.dateOfBirth).slice(0, 10) : '—'}</td>
          <td>${r.designationName || r.jobTitle || '—'}</td>
          <td>${r.departmentName || '—'}</td>
          <td>${r.address || '—'}</td>
          <td class="status-${(r.status || '').toLowerCase()}">${r.status || ''}</td>
        </tr>
      `).join('');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Employees Directory Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; }
            h1 { margin: 0 0 4px 0; font-size: 20px; }
            .subtitle { font-size: 12px; color: #64748b; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-weight: 600; }
            td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) td { background: #f8fafc; }
            .status-active { color: #15803d; font-weight: 600; }
            .status-inactive { color: #b91c1c; font-weight: 600; }
            @media print { body { padding: 0; } @page { size: landscape; margin: 12mm; } }
          </style>
        </head>
        <body>
          <h1>Employees Directory Report</h1>
          <div class="subtitle">Generated on ${dayjs().format('YYYY-MM-DD HH:mm')} · Total: ${rows.length} employee(s)</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>EmployeeID</th>
                <th>EmployeeName</th>
                <th>CNIC</th>
                <th>DOB</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="9" style="text-align:center;">No records found</td></tr>'}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch {
      message.error('Print preview failed');
    } finally {
      setPrinting(false);
    }
  };

  /* ─── Excel / CSV Import (2027 Enhanced Model) ───────────────────────────── */

  const handleDownloadTemplate = (type: 'full' | 'partial' = 'full') => {
    const csvContent = type === 'partial' ? TEMPLATE_UPDATE_CSV : TEMPLATE_CSV;
    const fileName = type === 'partial' ? 'employee_partial_update_template.csv' : 'employee_full_import_template.csv';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`${type === 'partial' ? 'Update' : 'Full'} template downloaded`);
  };

  const handleParseImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseImportCsv(text);
      if (parsed.length < 2) {
        message.error('File is empty or has no data rows.');
        return false;
      }

      const rawHeaders = parsed[0].map((h) => h.trim());
      const normHeaders = rawHeaders.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));

      // Check required columns: EmployeeID is always required
      if (!normHeaders.includes('employeeid') && !normHeaders.includes('code') && !normHeaders.includes('employeecode')) {
        message.error('Missing required column: EmployeeID');
        return false;
      }

      const getVal = (row: string[], colNames: string[]): string => {
        for (const c of colNames) {
          const idx = normHeaders.indexOf(c);
          if (idx !== -1 && row[idx] !== undefined) return row[idx].trim();
        }
        return '';
      };

      // Set of existing employee codes for duplicate / upsert detection
      const existingCodeMap = new Map<string, Employee>();
      (allEmployees.length > 0 ? allEmployees : data).forEach((e) => {
        if (e.employeeCode) existingCodeMap.set(e.employeeCode.toLowerCase(), e);
      });

      const rows: ImportRow[] = parsed.slice(1).map((cells, idx) => {
        const rowData: Record<string, string> = {};
        rawHeaders.forEach((h, i) => {
          rowData[h] = cells[i]?.trim() || '';
        });

        const empId = getVal(cells, ['employeeid', 'employeecode', 'code']);
        const empName = getVal(cells, ['employeename', 'name', 'firstname']);
        const cnic = getVal(cells, ['cnic', 'nationalid', 'idcard', 'nic', 'cnicno', 'cnicnumber', 'shanahticard', 'shanahticardno', 'identitycard']);
        const dob = getVal(cells, ['dateofbirth', 'dob', 'birthdate', 'date_of_birth', 'paidaishkitarikh']);
        const addr = getVal(cells, ['address', 'residence', 'homeaddress', 'city', 'pata']);
        const desig = getVal(cells, ['designation', 'jobtitle', 'designationname']);
        const dept = getVal(cells, ['department', 'departmentname']);
        const phone = getVal(cells, ['phone', 'contact', 'mobile']);
        const email = getVal(cells, ['email']);
        const status = (getVal(cells, ['status']) || 'ACTIVE').toUpperCase();

        const errors: string[] = [];
        if (!empId) {
          errors.push('EmployeeID is missing');
        }

        const isDup = existingCodeMap.has(empId.toLowerCase());
        const existingEmp = existingCodeMap.get(empId.toLowerCase());

        // For new employees, EmployeeName is mandatory. For existing employees, partial update is allowed!
        if (!isDup && !empName) {
          errors.push('EmployeeName is missing for new employee');
        }

        return {
          rowNumber: idx + 2,
          data: {
            ...rowData,
            _employeeId: empId,
            _employeeName: empName || (existingEmp ? `${existingEmp.firstName} ${existingEmp.lastName || ''}`.trim() : ''),
            _cnic: cnic || (existingEmp?.cnic || ''),
            _dateOfBirth: dob || (existingEmp?.dateOfBirth ? String(existingEmp.dateOfBirth).slice(0, 10) : ''),
            _address: addr || (existingEmp?.address || ''),
            _designation: desig || (existingEmp?.designationName || existingEmp?.jobTitle || ''),
            _department: dept || (existingEmp?.departmentName || ''),
            _phone: phone || (existingEmp?.phone || ''),
            _email: email || (existingEmp?.email || ''),
            _status: status,
          },
          status: errors.length > 0 ? 'INVALID' : (isDup ? 'DUPLICATE' : 'VALID'),
          errors,
        };
      });

      setImportFileName(file.name);
      setImportRows(rows);
      setImportFilter('ALL');
      setImportPage(1);
      message.success(`Parsed ${rows.length} rows from ${file.name}`);
    } catch {
      message.error('Failed to parse file');
    }
    return false;
  };

  const revalidateImportRows = () => {
    if (!importRows.length) return;
    const existingCodeMap = new Map<string, Employee>();
    (allEmployees.length > 0 ? allEmployees : data).forEach((e) => {
      if (e.employeeCode) existingCodeMap.set(e.employeeCode.toLowerCase(), e);
    });

    const updated = importRows.map((r) => {
      const empId = r.data._employeeId || '';
      const empName = r.data._employeeName || '';
      const isDup = existingCodeMap.has(empId.toLowerCase());
      const errors: string[] = [];
      if (!empId) errors.push('EmployeeID is missing');
      if (!isDup && !empName) errors.push('EmployeeName is missing for new employee');

      return {
        ...r,
        status: errors.length > 0 ? ('INVALID' as const) : isDup ? ('DUPLICATE' as const) : ('VALID' as const),
        errors,
      };
    });

    setImportRows(updated);
    message.success('Validation updated');
  };

  const handleReuploadSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleParseImportFile(file);
    }
    e.target.value = '';
  };

  const handleDownloadErrorReport = () => {
    const problematic = importRows.filter((r) => r.status === 'INVALID');
    if (!problematic.length) {
      message.info('No error rows to download.');
      return;
    }
    const headers = ['Row Number', 'EmployeeID', 'EmployeeName', 'CNIC', 'DateOfBirth', 'Address', 'Designation', 'Department', 'Errors'];
    const lines = [
      headers.join(','),
      ...problematic.map((r) => [
        r.rowNumber,
        escapeCsvField(r.data._employeeId || ''),
        escapeCsvField(r.data._employeeName || ''),
        escapeCsvField(r.data._cnic || ''),
        escapeCsvField(r.data._dateOfBirth || ''),
        escapeCsvField(r.data._address || ''),
        escapeCsvField(r.data._designation || ''),
        escapeCsvField(r.data._department || ''),
        escapeCsvField(r.errors.join('; ')),
      ].join(',')),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${dayjs().format('YYYYMMDD_HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExecuteImport = async () => {
    const validRows = importRows.filter((r) => r.status === 'VALID' || (r.status === 'DUPLICATE' && updateExisting));
    if (!validRows.length) {
      message.warning('No valid rows selected for import.');
      return;
    }

    setImporting(true);
    const totalCount = validRows.length;
    let processed = 0;
    let successCount = 0;
    let failCount = 0;
    const startTime = Date.now();

    setImportProgress({
      percent: 0,
      current: 0,
      total: totalCount,
      currentCode: validRows[0]?.data._employeeId,
      speed: 0,
      estimatedSecondsRemaining: 0,
      successCount: 0,
      failCount: 0,
    });

    const batchSize = 15;
    const errorsList: any[] = [];

    try {
      for (let i = 0; i < validRows.length; i += batchSize) {
        const batch = validRows.slice(i, i + batchSize);
        const payload = batch.map((r) => ({
          employeeCode: r.data._employeeId,
          employeeName: r.data._employeeName || undefined,
          cnic: r.data._cnic || undefined,
          dateOfBirth: r.data._dateOfBirth || undefined,
          address: r.data._address || undefined,
          designationName: r.data._designation || undefined,
          departmentName: r.data._department || undefined,
          phone: r.data._phone || undefined,
          email: r.data._email || undefined,
          status: r.data._status || 'ACTIVE',
        }));

        try {
          const res = await apiService.post<{ data: { total: number; created: number; updated: number; failed: number; errors: any[] } }>(
            '/hr/employees/bulk',
            { companyId, employees: payload }
          );
          const resData = res.data;
          const sCount = (resData?.created || 0) + (resData?.updated || 0);
          const fCount = resData?.failed || 0;
          successCount += sCount;
          failCount += fCount;
          if (resData?.errors?.length) {
            errorsList.push(...resData.errors);
          }
        } catch (bErr: any) {
          failCount += batch.length;
          errorsList.push({ message: bErr?.message || 'Batch failed' });
        }

        processed += batch.length;
        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.5);
        const speed = Math.max(Math.round(processed / elapsedSec), 1);
        const remaining = Math.max(totalCount - processed, 0);
        const estimatedSec = Math.round(remaining / speed);
        const percent = Math.min(Math.round((processed / totalCount) * 100), 100);

        setImportProgress({
          percent,
          current: processed,
          total: totalCount,
          currentCode: batch[batch.length - 1]?.data._employeeId,
          speed,
          estimatedSecondsRemaining: estimatedSec,
          successCount,
          failCount,
        });

        // Micro yield so browser updates smoothly
        await new Promise((r) => setTimeout(r, 40));
      }

      message.success(`Import complete! ${successCount} processed successfully.`);
      if (failCount > 0) {
        message.warning(`${failCount} records failed. Review errors.`);
      }

      setImportModalVisible(false);
      setImportRows([]);
      void fetchData(1);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Bulk import failed. Please check file format.';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setImporting(false);
    }
  };

  const filteredImportRows = useMemo(() => {
    let rows = importRows;
    if (importFilter === 'VALID') rows = importRows.filter((r) => r.status === 'VALID');
    else if (importFilter === 'DUPLICATE') rows = importRows.filter((r) => r.status === 'DUPLICATE');
    else if (importFilter === 'INVALID') rows = importRows.filter((r) => r.status === 'INVALID');

    if (showErrorsFirst && importFilter === 'ALL') {
      const invalid = rows.filter((r) => r.status === 'INVALID');
      const duplicates = rows.filter((r) => r.status === 'DUPLICATE');
      const valid = rows.filter((r) => r.status === 'VALID');
      return [...invalid, ...duplicates, ...valid];
    }
    return rows;
  }, [importRows, importFilter, showErrorsFirst]);

  /* ─── Table Columns & Customization ──────────────────────────────────────── */

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'excel-csv',
      label: 'Export to Excel (.csv)',
      icon: <FileExcelOutlined style={{ color: '#16a34a' }} />,
      onClick: handleExportCsv,
    },
    {
      key: 'pdf',
      label: 'Export to PDF',
      icon: <FilePdfOutlined style={{ color: '#dc2626' }} />,
      onClick: handleExportPdf,
    },
  ];

  const columns: ColumnsType<Employee> = [
    {
      title: 'EmployeeID',
      dataIndex: 'employeeCode',
      key: 'employeeCode',
      width: 140,
      sorter: (a, b) => a.employeeCode.localeCompare(b.employeeCode),
      render: (code: string, record) => (
        <span
          style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--theme-primary, #2563eb)' }}
          onClick={() => handleViewEmployee(record)}
        >
          {code}
        </span>
      ),
    },
    {
      title: 'EmployeeName',
      key: 'employeeName',
      width: 220,
      sorter: (a, b) => a.firstName.localeCompare(b.firstName),
      render: (_, r) => (
        <Space size={8}>
          <Avatar size="small" style={{ backgroundColor: '#2563eb' }}>
            {r.firstName ? r.firstName.charAt(0).toUpperCase() : <UserOutlined />}
          </Avatar>
          <span style={{ fontWeight: 500 }}>
            {r.firstName} {r.lastName || ''}
          </span>
        </Space>
      ),
    },
    {
      title: 'CNIC / National ID',
      dataIndex: 'cnic',
      key: 'cnic',
      width: 160,
      render: (cnic: string) => cnic ? (
        <Tag color="purple" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          <IdcardOutlined style={{ marginRight: 4 }} />{cnic}
        </Tag>
      ) : <span style={{ color: '#94a3b8' }}>—</span>,
    },
    {
      title: 'Date of Birth',
      dataIndex: 'dateOfBirth',
      key: 'dateOfBirth',
      width: 130,
      render: (d: string) => d ? (
        <Space size={4} style={{ fontSize: 12 }}>
          <CalendarOutlined style={{ color: '#0891b2' }} />
          <span>{dayjs(d).format('YYYY-MM-DD')}</span>
        </Space>
      ) : <span style={{ color: '#94a3b8' }}>—</span>,
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      width: 200,
      ellipsis: true,
      render: (addr: string) => addr ? (
        <Tooltip title={addr}>
          <Space size={4} style={{ fontSize: 12 }}>
            <HomeOutlined style={{ color: '#64748b' }} />
            <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{addr}</span>
          </Space>
        </Tooltip>
      ) : <span style={{ color: '#94a3b8' }}>—</span>,
    },
    {
      title: 'Designation',
      key: 'designation',
      dataIndex: 'designationName',
      width: 180,
      render: (_, r) => {
        const desigObj = r.designationId ? desigMap.get(r.designationId) : undefined;
        const title = r.designationName || r.jobTitle || desigObj?.designationName;
        return title ? (
          <Tag color="blue" style={{ borderRadius: 4, fontWeight: 500 }}>
            {title}
          </Tag>
        ) : (
          <span style={{ color: '#94a3b8' }}>—</span>
        );
      },
    },
    {
      title: 'Department',
      key: 'department',
      dataIndex: 'departmentName',
      width: 180,
      render: (_, r) => {
        const deptObj = r.departmentId ? deptMap.get(r.departmentId) : undefined;
        const dept = r.departmentName || r.department?.name || deptObj?.name;
        return dept ? (
          <Tag color="cyan" style={{ borderRadius: 4, fontWeight: 500 }}>
            {dept}
          </Tag>
        ) : (
          <span style={{ color: '#94a3b8' }}>—</span>
        );
      },
    },
    {
      title: 'Division / Section',
      key: 'divisionSection',
      width: 180,
      render: (_, r) => {
        const deptObj = r.departmentId ? deptMap.get(r.departmentId) : undefined;
        const divId = r.department?.divisionId || deptObj?.divisionId;
        const secId = r.department?.sectionId || deptObj?.sectionId;
        const div = r.divisionName || r.department?.division?.name || (divId ? divMap.get(divId)?.name : undefined);
        const sec = r.sectionName || r.department?.section?.name || (secId ? secMap.get(secId)?.name : undefined);
        if (!div && !sec) return <span style={{ color: '#94a3b8' }}>—</span>;
        return (
          <Space direction="vertical" size={2} style={{ fontSize: 12 }}>
            {div && <span><ApartmentOutlined style={{ color: '#64748b' }} /> {div}</span>}
            {sec && <Text type="secondary" style={{ fontSize: 11 }}>{sec}</Text>}
          </Space>
        );
      },
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 190,
      render: (_, r) => (
        <Space direction="vertical" size={2} style={{ fontSize: 12 }}>
          {r.phone && (
            <Space size={4}>
              <PhoneOutlined style={{ color: '#16a34a' }} />
              <span>{r.phone}</span>
            </Space>
          )}
          {r.email && (
            <Space size={4}>
              <MailOutlined style={{ color: '#2563eb' }} />
              <Text type="secondary" style={{ fontSize: 11 }}>{r.email}</Text>
            </Space>
          )}
          {!r.phone && !r.email && <span style={{ color: '#94a3b8' }}>—</span>}
        </Space>
      ),
    },
    {
      title: 'Employment Type',
      dataIndex: 'employmentType',
      key: 'employmentType',
      width: 140,
      render: (t?: string) => t || 'FULL_TIME',
    },
    {
      title: 'Join Date',
      dataIndex: 'joinDate',
      key: 'joinDate',
      width: 120,
      render: (d?: string) => d ? dayjs(d).format('YYYY-MM-DD') : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (s: string) => {
        const active = s === 'ACTIVE';
        return (
          <Tag
            color={active ? 'success' : 'error'}
            style={{ borderRadius: 10, padding: '0 8px', fontWeight: 600 }}
          >
            {active ? 'ACTIVE' : 'INACTIVE'}
          </Tag>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="View Employee Details">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined style={{ color: '#2563eb' }} />}
              onClick={() => handleViewEmployee(record)}
            />
          </Tooltip>
          <Tooltip title="Edit Employee">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ color: '#f59e0b' }} />}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>
          <Tooltip title={record.status === 'ACTIVE' ? 'Deactivate Employee' : 'Activate Employee'}>
            <Popconfirm
              title={record.status === 'ACTIVE' ? 'Deactivate this employee?' : 'Activate this employee?'}
              description={`Are you sure you want to change ${record.firstName}'s status?`}
              onConfirm={() => handleToggleStatus(record)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="text"
                size="small"
                icon={<PoweroffOutlined style={{ color: record.status === 'ACTIVE' ? '#dc2626' : '#16a34a' }} />}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Filter columns based on user customization
  const filteredColumns = useMemo(() => {
    return columns.filter((col) => {
      const k = String(col.key || '');
      const d = String((col as any).dataIndex || '');
      if (k && visibleCols[k] === false) return false;
      if (d && visibleCols[d] === false) return false;
      return true;
    });
  }, [columns, visibleCols]);

  /* ─── Render View ────────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: '0 4px' }}>
      {/* 2027 Top Header matching Enterprise Model */}
      <PageHeader
        icon={<UserOutlined />}
        title={
          <Space size={8} align="center">
            <span>Employees Master Directory</span>
            <span className="item-model-badge">ENTERPRISE 2027</span>
          </Space>
        }
        subtitle="Manage factory operators, master profiles, hierarchy, assignments & import"
        showBreadcrumbs
        extra={
          <Space size={8} wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
              style={{
                background: '#ea580c',
                borderColor: '#ea580c',
                fontWeight: 600,
                boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
              }}
            >
              New Employee
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchData(page)}
              title="Refresh"
            />
            <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
              <Button icon={<DownloadOutlined />} loading={exporting}>
                Export <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>
            <Button
              icon={<FilePdfOutlined />}
              onClick={handleExportPdf}
              loading={pdfLoading}
            >
              PDF
            </Button>
            <Button
              icon={<PrinterOutlined />}
              onClick={handlePrint}
              loading={printing}
            >
              Print
            </Button>
            <Button
              icon={<ImportOutlined />}
              onClick={() => { setImportRows([]); setImportFileName(''); setImportModalVisible(true); }}
            >
              Import
            </Button>
          </Space>
        }
      />

      {/* 2027 Crystal KPI Cards (Matching ItemManagement Model) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginTop: 12,
          marginBottom: 10,
        }}
      >
        <KpiCard
          label="Total Staff"
          value={stats.total}
          icon={UserOutlined}
          tone="#4f46e5"
          toneSoft="rgba(79, 70, 229, 0.12)"
        />
        <KpiCard
          label="Active Staff"
          value={stats.active}
          icon={CheckCircleOutlined}
          tone="#16a34a"
          toneSoft="rgba(22, 163, 74, 0.12)"
        />
        <KpiCard
          label="Inactive"
          value={stats.inactive}
          icon={CloseCircleOutlined}
          tone="#dc2626"
          toneSoft="rgba(220, 38, 38, 0.12)"
        />
        <KpiCard
          label="Factory Operators"
          value={stats.operators}
          icon={ToolOutlined}
          tone="#d97706"
          toneSoft="rgba(217, 119, 6, 0.12)"
        />
        <KpiCard
          label="Departments"
          value={stats.departments}
          icon={ApartmentOutlined}
          tone="#0891b2"
          toneSoft="rgba(8, 145, 178, 0.12)"
        />
      </div>

      {/* 2027 Chevron Pipeline Ribbon */}
      <Card style={{ marginBottom: 12, borderRadius: 8 }} styles={{ body: { padding: '10px 12px 10px' } }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            width: '100%',
            overflowX: 'auto',
            padding: '2px 2px 6px 2px',
            scrollbarWidth: 'thin',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))',
          }}
        >
          {EMPLOYEE_CHEVRONS.map((ch, idx) => {
            const isSelected = activeChevron === ch.key;
            const isFirst = idx === 0;
            const isLast = idx === EMPLOYEE_CHEVRONS.length - 1;
            const count = ribbonCounts[ch.key] ?? 0;

            const clipPath = isFirst
              ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
              : isLast
              ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
              : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

            return (
              <button
                key={ch.key}
                type="button"
                onClick={() => handleChevronSelect(ch.key)}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: isFirst ? '8px 20px 8px 16px' : '8px 20px 8px 24px',
                  minHeight: 40,
                  border: 'none',
                  background: isSelected ? ch.activeBg : '#f1f5f9',
                  color: isSelected ? '#ffffff' : '#334155',
                  fontWeight: isSelected ? 700 : 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  clipPath,
                  marginRight: -6,
                  zIndex: isSelected ? 10 : EMPLOYEE_CHEVRONS.length - idx,
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 13, color: isSelected ? '#ffffff' : ch.color }}>{ch.icon}</span>
                <span>{ch.label}</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 20,
                    height: 18,
                    padding: '0 6px',
                    borderRadius: 9,
                    fontSize: 11,
                    fontWeight: 700,
                    background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'rgba(15, 23, 42, 0.08)',
                    color: isSelected ? '#ffffff' : '#475569',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 2027 Collapsible Filter Panel & Column Chooser Bar */}
      <div className={`erp-collapsible-filters ${!filtersCollapsed ? 'erp-collapsible-filters--expanded' : ''}`}>
        <div className="erp-collapsible-filters__header">
          <div
            className="erp-collapsible-filters__toggle"
            onClick={() => setFiltersCollapsed((prev) => !prev)}
            role="button"
            tabIndex={0}
          >
            <FilterOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
            <span>Filters & Search</span>
            {activeFilterCount > 0 && (
              <span className="erp-collapsible-filters__badge">
                {activeFilterCount} active
              </span>
            )}
            <DownOutlined
              style={{
                fontSize: 10,
                marginLeft: 4,
                transition: 'transform 0.2s',
                transform: filtersCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              }}
            />
          </div>

          <Space size={8}>
            {/* Column Customizer Dropdown (Matching ItemManagement) */}
            <Dropdown
              trigger={['click']}
              popupRender={() => (
                <div
                  style={{
                    background: '#ffffff',
                    padding: '12px 16px',
                    borderRadius: 10,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                    minWidth: 220,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                      Table Columns
                    </span>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, height: 'auto', fontSize: 11 }}
                      onClick={() => {
                        setVisibleCols(DEFAULT_EMPLOYEE_VISIBLE_COLUMNS);
                        try { localStorage.removeItem('pwi_employee_table_columns_v1'); } catch {}
                      }}
                    >
                      Reset All
                    </Button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(EMPLOYEE_COLUMN_LABELS).map(([key, label]) => (
                      <Checkbox
                        key={key}
                        checked={visibleCols[key] !== false}
                        disabled={key === 'employeeCode' || key === 'actions'}
                        onChange={(e) => {
                          const next = { ...visibleCols, [key]: e.target.checked };
                          setVisibleCols(next);
                          try { localStorage.setItem('pwi_employee_table_columns_v1', JSON.stringify(next)); } catch {}
                        }}
                        style={{ fontSize: 13, color: '#334155' }}
                      >
                        {label}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              )}
            >
              <Button icon={<AppstoreOutlined />} style={{ fontWeight: 600 }}>
                Columns
              </Button>
            </Dropdown>

            {activeFilterCount > 0 && (
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={handleResetFilters}
                style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}
              >
                Clear Filters
              </Button>
            )}
          </Space>
        </div>

        {!filtersCollapsed && (
          <div className="erp-collapsible-filters__body">
            <Row gutter={[12, 12]} align="middle">
              {/* Quick Search */}
              <Col xs={24} sm={12} md={6} lg={5}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Search by ID, Name or Contact
                </Text>
                <Input
                  allowClear
                  placeholder="Code, Name, Email, Phone..."
                  prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onPressEnter={handleApplySearch}
                />
              </Col>

              {/* Division */}
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Division
                </Text>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Divisions"
                  style={{ width: '100%' }}
                  value={fDivision}
                  onChange={(val) => {
                    setFDivision(val);
                    setFSection(undefined);
                    setFDepartment(undefined);
                    setPage(1);
                  }}
                  options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Col>

              {/* Section */}
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Section
                </Text>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Sections"
                  style={{ width: '100%' }}
                  value={fSection}
                  onChange={(val) => {
                    setFSection(val);
                    setFDepartment(undefined);
                    setPage(1);
                  }}
                  options={filteredSections.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Col>

              {/* Department */}
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Department
                </Text>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Departments"
                  style={{ width: '100%' }}
                  value={fDepartment}
                  onChange={(val) => { setFDepartment(val); setPage(1); }}
                  options={filteredDepartments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Col>

              {/* Designation */}
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Designation
                </Text>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Designations"
                  style={{ width: '100%' }}
                  value={fDesignation}
                  onChange={(val) => { setFDesignation(val); setPage(1); }}
                  options={designations.map((d) => ({ value: d.id, label: d.designationName }))}
                />
              </Col>

              {/* Status & Search Action */}
              <Col xs={24} sm={12} md={6} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Status
                </Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    style={{ width: '65%' }}
                    value={fStatus}
                    onChange={(val) => { setFStatus(val); setPage(1); }}
                    options={[
                      { value: undefined, label: 'All' },
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'INACTIVE', label: 'Inactive' },
                    ]}
                  />
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={handleApplySearch}
                    style={{ width: '35%' }}
                  />
                </Space.Compact>
              </Col>
            </Row>
          </div>
        )}
      </div>

      {/* Main Table Card */}
      <Card style={{ marginTop: 12, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <Table
          columns={filteredColumns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1180 }}
          className="erp-table-striped"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (tot, range) => `${range[0]}-${range[1]} of ${tot} employees`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* ─── Drawer: Employee Detail View ──────────────────────────────────── */}
      <Drawer
        title={
          selectedEmployee ? (
            <Space size={12}>
              <Avatar size="large" style={{ backgroundColor: '#2563eb' }}>
                {selectedEmployee.firstName ? selectedEmployee.firstName.charAt(0).toUpperCase() : <UserOutlined />}
              </Avatar>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {selectedEmployee.firstName} {selectedEmployee.lastName || ''}
                </div>
                <Space size={6}>
                  <Tag color="blue">{selectedEmployee.employeeCode}</Tag>
                  <Tag color={selectedEmployee.status === 'ACTIVE' ? 'success' : 'error'}>
                    {selectedEmployee.status}
                  </Tag>
                </Space>
              </div>
            </Space>
          ) : 'Employee Details'
        }
        placement="right"
        width={680}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        extra={
          selectedEmployee && (
            <Space>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => {
                  setDetailVisible(false);
                  handleOpenEdit(selectedEmployee);
                }}
              >
                Edit Employee
              </Button>
            </Space>
          )
        }
      >
        {selectedEmployee && (
          <div>
            <Tabs
              defaultActiveKey="1"
              items={[
                {
                  key: '1',
                  label: 'Organization & Placement',
                  children: (
                    <Descriptions bordered column={2} size="small">
                      <Descriptions.Item label="Employee Code" span={1}>
                        <strong>{selectedEmployee.employeeCode}</strong>
                      </Descriptions.Item>
                      <Descriptions.Item label="Status" span={1}>
                        <Tag color={selectedEmployee.status === 'ACTIVE' ? 'green' : 'red'}>
                          {selectedEmployee.status}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Designation" span={2}>
                        <Tag color="blue" style={{ fontSize: 13 }}>
                          {selectedEmployee.designationName || selectedEmployee.jobTitle || '—'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Department" span={1}>
                        <Tag color="cyan">
                          {selectedEmployee.departmentName || selectedEmployee.department?.name || '—'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Division" span={1}>
                        {selectedEmployee.divisionName || selectedEmployee.department?.division?.name || '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Section" span={1}>
                        {selectedEmployee.sectionName || selectedEmployee.department?.section?.name || '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Employment Type" span={1}>
                        {selectedEmployee.employmentType || 'FULL_TIME'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Join Date" span={1}>
                        {selectedEmployee.joinDate ? dayjs(selectedEmployee.joinDate).format('YYYY-MM-DD') : '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Manager" span={1}>
                        {selectedEmployee.manager ? `${selectedEmployee.manager.firstName} (${selectedEmployee.manager.employeeCode})` : '—'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: '2',
                  label: 'Contact & Personal',
                  children: (
                    <Descriptions bordered column={2} size="small">
                      <Descriptions.Item label="CNIC / National ID" span={1}>
                        <Tag color="purple" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          <IdcardOutlined style={{ marginRight: 4 }} />
                          {selectedEmployee.cnic || '—'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Date of Birth" span={1}>
                        {selectedEmployee.dateOfBirth ? dayjs(selectedEmployee.dateOfBirth).format('YYYY-MM-DD') : '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Email" span={1}>
                        {selectedEmployee.email || '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Phone" span={1}>
                        {selectedEmployee.phone || '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Gender" span={1}>
                        {selectedEmployee.gender || '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Address" span={2}>
                        {selectedEmployee.address || '—'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: '3',
                  label: 'Skills & History',
                  children: (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>Skills Profile</div>
                      {selectedEmployee.skills && selectedEmployee.skills.length > 0 ? (
                        <Space wrap>
                          {selectedEmployee.skills.map((sk) => (
                            <Tag key={sk.id} color="purple">
                              {sk.skillName} {sk.proficiencyLevel ? `(${sk.proficiencyLevel})` : ''}
                            </Tag>
                          ))}
                        </Space>
                      ) : (
                        <Text type="secondary">No skills explicitly registered.</Text>
                      )}

                      <Divider style={{ margin: '16px 0' }} />

                      <div style={{ fontWeight: 600, marginBottom: 8 }}>Training Records</div>
                      {selectedEmployee.training && selectedEmployee.training.length > 0 ? (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          {selectedEmployee.training.map((tr) => (
                            <div key={tr.id} style={{ fontSize: 12 }}>
                              <CheckCircleOutlined style={{ color: '#16a34a' }} /> {tr.trainingName} — {tr.completionDate || 'Completed'}
                            </div>
                          ))}
                        </Space>
                      ) : (
                        <Text type="secondary">No training sessions recorded.</Text>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Drawer>

      {/* ─── Modal: Create / Edit Employee ─────────────────────────────────── */}
      <Modal
        title={editingEmployee ? `Edit Employee: ${editingEmployee.employeeCode}` : 'New Employee'}
        open={formModalVisible}
        onOk={handleFormSubmit}
        onCancel={() => setFormModalVisible(false)}
        confirmLoading={formSubmitting}
        width={720}
        okText={editingEmployee ? 'Update Employee' : 'Save Employee'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {/* Section 1: 4 Mandatory Fields */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
              Primary Master Details (Mandatory)
            </div>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="employeeCode"
                  label="EmployeeID (Code)"
                  rules={[{ required: true, message: 'Employee Code / ID is required' }]}
                >
                  <Input placeholder="e.g. 00400541" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="firstName"
                  label="Employee Name (First)"
                  rules={[{ required: true, message: 'Employee name is required' }]}
                >
                  <Input placeholder="e.g. Muhammad Farooq" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="departmentId"
                  label="Department"
                  rules={[{ required: true, message: 'Department is required' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select Department"
                    options={modalDepartmentOptions.map((d) => ({
                      value: d.id,
                      label: d.name,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="designationId"
                  label="Designation"
                  rules={[{ required: true, message: 'Designation is required' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select Designation"
                    options={designations.map((d) => ({
                      value: d.id,
                      label: `${d.designationCode} — ${d.designationName}`,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* Section 2: Organization Hierarchy (Optional) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
              Organization Hierarchy (Auto-resolved from Department)
            </div>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="divisionId" label="Division">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select Division"
                    options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="sectionId" label="Section">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select Section"
                    options={sections
                      .filter((s) => !modalDivision || s.divisionId === modalDivision)
                      .map((s) => ({ value: s.id, label: s.name }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* Section 3: Contact & Personal Details (Optional) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
              Contact & Employment Details (Optional)
            </div>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="phone" label="Phone / Mobile">
                  <Input placeholder="e.g. 0300-1234567" prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="email" label="Email Address">
                  <Input placeholder="e.g. farooq@example.com" prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="cnic" label="CNIC / National ID">
                  <Input placeholder="e.g. 42101-1234567-1" prefix={<IdcardOutlined style={{ color: '#94a3b8' }} />} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="dateOfBirth" label="Date of Birth">
                  <DatePicker style={{ width: '100%' }} placeholder="Select date of birth" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="joinDate" label="Join Date">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="employmentType" label="Employment Type">
                  <Select
                    options={[
                      { value: 'FULL_TIME', label: 'Full Time' },
                      { value: 'PART_TIME', label: 'Part Time' },
                      { value: 'CONTRACT', label: 'Contract' },
                      { value: 'DAILY_WAGE', label: 'Daily Wage' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="status" label="Status">
                  <Select
                    options={[
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'INACTIVE', label: 'Inactive' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="address" label="Address">
                  <Input placeholder="Residential Address / City" />
                </Form.Item>
              </Col>
            </Row>
          </div>
        </Form>
      </Modal>

      {/* ─── Modal: Excel / CSV Import (2027 UX Model matching ItemManagement) ─── */}
      <DraggableResizableModal
        open={importModalVisible && !isImportMinimized}
        onCancel={() => setImportModalVisible(false)}
        onMinimize={() => setIsImportMinimized(true)}
        width={1040}
        height={680}
        footer={
          importing ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--theme-text-muted, #64748b)' }}>
                Import in progress… please do not close the browser tab.
              </span>
              <Button onClick={() => setIsImportMinimized(true)}>
                Minimize to Dock
              </Button>
            </div>
          ) : importRows.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <Space size={8}>
                <Button
                  key="back"
                  onClick={() => {
                    setImportRows([]);
                    setImportFileName('');
                    setImportFilter('ALL');
                  }}
                >
                  Choose another file
                </Button>
                {importRows.some((r) => r.status === 'INVALID') && (
                  <Button
                    danger
                    icon={<DownloadOutlined />}
                    onClick={handleDownloadErrorReport}
                  >
                    Download Errors ({importRows.filter((r) => r.status === 'INVALID').length})
                  </Button>
                )}
              </Space>
              <Space size={8}>
                <Button onClick={() => setImportModalVisible(false)}>Cancel</Button>
                <Button
                  key="import"
                  type="primary"
                  disabled={!importRows.some((r) => r.status === 'VALID' || (r.status === 'DUPLICATE' && updateExisting))}
                  loading={importing}
                  onClick={handleExecuteImport}
                  style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 600 }}
                >
                  Import {importRows.filter((r) => r.status === 'VALID' || (r.status === 'DUPLICATE' && updateExisting)).length} valid row(s)
                </Button>
              </Space>
            </div>
          ) : (
            <Button type="primary" onClick={() => setImportModalVisible(false)}>Close</Button>
          )
        }
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 28 }}>
            <Space size={8}>
              <ImportOutlined style={{ color: 'var(--theme-accent, #4f46e5)' }} />
              <span style={{ fontWeight: 700, fontSize: 16 }}>Import Employees Master (Excel / CSV)</span>
              <span className="item-model-badge">2027 UX</span>
            </Space>
            <Space size={6}>
              <Tooltip title="Minimize to dock (keeps file open in background)">
                <Button
                  type="text"
                  size="small"
                  icon={<MinusOutlined />}
                  onClick={() => setIsImportMinimized(true)}
                  style={{ borderRadius: 6 }}
                />
              </Tooltip>
            </Space>
          </div>
        }
      >
        {importRows.length === 0 && !importing && (
          <div style={{ padding: '8px 0' }}>
            <Alert
              type="info"
              showIcon
              message="CSV / Excel Employee Import with Validation & Partial Upsert"
              description="Upload your master employee spreadsheet (.csv). For existing employees, you can update just CNIC, Date of Birth, and Address by matching their EmployeeID."
              style={{ marginBottom: 16 }}
            />
            <Space wrap style={{ marginBottom: 16 }}>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => handleDownloadTemplate('full')}
              >
                Download Template (.csv)
              </Button>
              <Button
                icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
                onClick={() => handleDownloadTemplate('partial')}
              >
                Download Update Template (ID + CNIC + DOB + Address)
              </Button>
            </Space>
            <Upload.Dragger
              name="file"
              accept=".csv,.txt"
              maxCount={1}
              showUploadList={false}
              beforeUpload={handleParseImportFile}
              style={{ padding: '24px 0', background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 8 }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 36, color: '#4f46e5' }} /></p>
              <p className="ant-upload-text" style={{ fontWeight: 600, fontSize: 15 }}>Click or drag a CSV file here</p>
              <p className="ant-upload-hint">
                Supported columns: EmployeeID, EmployeeName, Designation, Department, CNIC, DateOfBirth, Address, Phone, Email, Status.
              </p>
            </Upload.Dragger>
          </div>
        )}

        {importRows.length > 0 && !importing && (
          <div>
            {(() => {
              const validCount = importRows.filter((r) => r.status === 'VALID').length;
              const dupCount = importRows.filter((r) => r.status === 'DUPLICATE').length;
              const invalidCount = importRows.filter((r) => r.status === 'INVALID').length;

              return (
                <>
                  <Alert
                    type={invalidCount > 0 ? 'warning' : 'info'}
                    showIcon
                    message={
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>
                          Preview: <strong>{importFileName}</strong>
                        </span>
                        {invalidCount > 0 && importFilter !== 'INVALID' && (
                          <Button
                            size="small"
                            danger
                            type="primary"
                            onClick={() => { setImportFilter('INVALID'); setImportPage(1); }}
                          >
                            Focus on {invalidCount} Invalid Row{invalidCount > 1 ? 's' : ''}
                          </Button>
                        )}
                      </div>
                    }
                    description={
                      <span>
                        Total rows: <b>{importRows.length}</b> ·{' '}
                        Valid: <b style={{ color: '#1a7f37' }}>{validCount}</b> ·{' '}
                        Duplicates / Updates: <b style={{ color: '#b9770e' }}>{dupCount}</b> ·{' '}
                        Invalid: <b style={{ color: '#c0392b' }}>{invalidCount}</b>
                        {invalidCount > 0 && (
                          <span style={{ marginLeft: 8, color: '#c0392b', fontWeight: 500 }}>
                            — Errors highlighted below. Select "Failed / Invalid" to isolate them.
                          </span>
                        )}
                      </span>
                    }
                    style={{ marginBottom: 12 }}
                  />

                  {/* Filter & Triage Bar */}
                  <div className="import-filter-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <Space wrap size={10}>
                      <Segmented
                        value={importFilter}
                        onChange={(val) => {
                          setImportFilter(val as any);
                          setImportPage(1);
                        }}
                        options={[
                          {
                            label: (
                              <Space size={4}>
                                <AppstoreOutlined />
                                <span>All ({importRows.length})</span>
                              </Space>
                            ),
                            value: 'ALL',
                          },
                          {
                            label: (
                              <Space size={4}>
                                <CloseCircleOutlined style={{ color: '#ef4444' }} />
                                <span style={{ color: invalidCount > 0 ? '#ef4444' : undefined, fontWeight: invalidCount > 0 ? 700 : undefined }}>
                                  Failed / Invalid ({invalidCount})
                                </span>
                              </Space>
                            ),
                            value: 'INVALID',
                          },
                          {
                            label: (
                              <Space size={4}>
                                <WarningOutlined style={{ color: '#f59e0b' }} />
                                <span>Duplicates ({dupCount})</span>
                              </Space>
                            ),
                            value: 'DUPLICATE',
                          },
                          {
                            label: (
                              <Space size={4}>
                                <CheckCircleOutlined style={{ color: '#10b981' }} />
                                <span>Valid ({validCount})</span>
                              </Space>
                            ),
                            value: 'VALID',
                          },
                        ]}
                      />
                      {importFilter === 'ALL' && (
                        <Tooltip title="When enabled, faulty rows are pinned to page 1 so you don't have to scroll hundreds of pages">
                          <Switch
                            checked={showErrorsFirst}
                            onChange={setShowErrorsFirst}
                            checkedChildren="Errors First"
                            unCheckedChildren="File Order"
                            size="small"
                          />
                        </Tooltip>
                      )}
                      <Checkbox
                        checked={updateExisting}
                        onChange={(e) => setUpdateExisting(e.target.checked)}
                        style={{ fontWeight: 600, fontSize: 12, color: '#2563eb' }}
                      >
                        Update existing records if EmployeeID exists
                      </Checkbox>
                    </Space>
                    <Space wrap size={8}>
                      {invalidCount > 0 && (
                        <Button
                          danger
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={handleDownloadErrorReport}
                        >
                          Download Errors ({invalidCount})
                        </Button>
                      )}
                      <Tooltip title="Re-run validation against master employee directory">
                        <Button
                          size="small"
                          icon={<SyncOutlined />}
                          onClick={revalidateImportRows}
                        >
                          Re-validate
                        </Button>
                      </Tooltip>
                      <Tooltip title="Upload an updated or corrected CSV file">
                        <Button
                          size="small"
                          icon={<UploadOutlined />}
                          onClick={() => reuploadInputRef.current?.click()}
                        >
                          Replace File
                        </Button>
                      </Tooltip>
                    </Space>
                  </div>

                  <Table
                    rowKey="rowNumber"
                    size="small"
                    dataSource={filteredImportRows}
                    rowClassName={(r) => {
                      if (r.status === 'INVALID') return 'import-table-row-invalid';
                      if (r.status === 'DUPLICATE') return 'import-table-row-duplicate';
                      return '';
                    }}
                    pagination={{
                      current: importPage,
                      pageSize: importPageSize,
                      pageSizeOptions: ['10', '20', '50', '100', '250'],
                      showSizeChanger: true,
                      showQuickJumper: true,
                      className: 'import-preview-pagination',
                      onChange: (p, ps) => {
                        setImportPage(p);
                        setImportPageSize(ps);
                      },
                      showTotal: (totalCount, range) => (
                        <span style={{ fontSize: 13, fontWeight: 500 }}>
                          Showing {range[0]}–{range[1]} of <b>{totalCount}</b> {importFilter !== 'ALL' ? `${importFilter.toLowerCase()} ` : ''}rows
                        </span>
                      ),
                    }}
                    columns={[
                      {
                        title: <Space size={4}><FileTextOutlined /><span>Row</span></Space>,
                        dataIndex: 'rowNumber',
                        width: 75,
                        render: (n: number, r: ImportRow) => (
                          <span style={{ fontWeight: r.status !== 'VALID' ? 700 : 400, color: r.status === 'INVALID' ? '#dc2626' : undefined }}>
                            #{n}
                          </span>
                        ),
                      },
                      {
                        title: <Space size={4}><TagOutlined /><span>EmployeeID</span></Space>,
                        width: 140,
                        render: (_: unknown, r: ImportRow) => (
                          <b style={{ color: r.status === 'INVALID' ? '#dc2626' : undefined }}>
                            {r.data._employeeId || <Text type="danger">(empty)</Text>}
                          </b>
                        ),
                      },
                      {
                        title: <Space size={4}><AppstoreOutlined /><span>Name</span></Space>,
                        width: 180,
                        ellipsis: true,
                        render: (_: unknown, r: ImportRow) => r.data._employeeName || '—',
                      },
                      {
                        title: <Space size={4}><IdcardOutlined /><span>CNIC</span></Space>,
                        width: 150,
                        render: (_: unknown, r: ImportRow) => r.data._cnic ? (
                          <Tag color="purple" style={{ fontFamily: 'monospace' }}>{r.data._cnic}</Tag>
                        ) : '—',
                      },
                      {
                        title: <Space size={4}><CalendarOutlined /><span>DOB</span></Space>,
                        width: 120,
                        render: (_: unknown, r: ImportRow) => r.data._dateOfBirth || '—',
                      },
                      {
                        title: <Space size={4}><HomeOutlined /><span>Address</span></Space>,
                        width: 180,
                        ellipsis: true,
                        render: (_: unknown, r: ImportRow) => r.data._address || '—',
                      },
                      {
                        title: <Space size={4}><ProjectOutlined /><span>Designation</span></Space>,
                        width: 150,
                        render: (_: unknown, r: ImportRow) => r.data._designation || '—',
                      },
                      {
                        title: <Space size={4}><DatabaseOutlined /><span>Department</span></Space>,
                        width: 150,
                        render: (_: unknown, r: ImportRow) => r.data._department || '—',
                      },
                      {
                        title: <Space size={4}><CheckCircleOutlined /><span>Result</span></Space>,
                        width: 110,
                        render: (_: unknown, r: ImportRow) => {
                          if (r.status === 'VALID') return <Tag color="success">Valid</Tag>;
                          if (r.status === 'DUPLICATE') return <Tag color="warning">Duplicate</Tag>;
                          return <Tag color="error">Invalid</Tag>;
                        },
                      },
                      {
                        title: <Space size={4}><WarningOutlined /><span>Details / Error Description</span></Space>,
                        render: (_: unknown, r: ImportRow) =>
                          r.errors.length > 0 ? (
                            <div style={{ color: '#dc2626', fontSize: 12.5, fontWeight: 500 }}>
                              {r.errors.map((err, i) => (
                                <div key={i}>• {err}</div>
                              ))}
                            </div>
                          ) : (
                            <Text type="secondary" style={{ fontSize: 12 }}>Ready to import</Text>
                          ),
                      },
                    ]}
                  />
                </>
              );
            })()}
          </div>
        )}

        {importing && (
          <div className="import-live-progress-card">
            <div className="import-progress-header">
              <div className="import-progress-title-wrap">
                <div className="import-progress-pulse-dot" />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>
                    Uploading & Importing Employees Master…
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--theme-text-muted, #64748b)', marginTop: 2 }}>
                    Processing row <b>{importProgress?.current ?? 0}</b> of <b>{importProgress?.total ?? importRows.filter((r) => r.status === 'VALID' || (r.status === 'DUPLICATE' && updateExisting)).length}</b>
                    {importProgress?.currentCode && (
                      <span style={{ marginLeft: 8, fontFamily: 'monospace', color: '#4f46e5' }}>
                        [{importProgress.currentCode}]
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="import-progress-large-percent">
                {importProgress?.percent ?? 0}<span>%</span>
              </div>
            </div>

            {/* Ant Design Live Active Progress Bar with Gradient */}
            <div style={{ marginTop: 16 }}>
              <Progress
                percent={importProgress?.percent ?? 0}
                status="active"
                strokeColor={{
                  '0%': '#4f46e5',
                  '50%': '#3b82f6',
                  '100%': '#10b981',
                }}
                size={['100%', 14]}
                showInfo={false}
              />
            </div>

            {/* Continuous Ambient Flowing Shimmer Line */}
            <div className="import-progress-ambient-track" title="Continuous Real-time Flow Indicator">
              <div
                className="import-progress-ambient-glow"
                style={{ width: `${Math.max(importProgress?.percent ?? 3, 3)}%` }}
              />
            </div>

            {/* Metrics Row: Time Remaining, Speed, Success, Failed */}
            <div className="import-progress-metrics-row">
              <div className="import-metric-chip">
                <span className="metric-icon">⏱️</span>
                <div>
                  <div className="metric-label">Estimated Time</div>
                  <div className="metric-val" style={{ color: '#4f46e5' }}>
                    {formatEstimatedTime(importProgress?.estimatedSecondsRemaining ?? 0)}
                  </div>
                </div>
              </div>

              <div className="import-metric-chip">
                <span className="metric-icon">⚡</span>
                <div>
                  <div className="metric-label">Import Speed</div>
                  <div className="metric-val" style={{ color: '#0284c7' }}>
                    ~{importProgress?.speed ?? 0} items/sec
                  </div>
                </div>
              </div>

              <div className="import-metric-chip">
                <span className="metric-icon">✅</span>
                <div>
                  <div className="metric-label">Imported</div>
                  <div className="metric-val" style={{ color: '#16a34a' }}>
                    {importProgress?.successCount ?? 0}
                  </div>
                </div>
              </div>

              <div className="import-metric-chip">
                <span className="metric-icon">❌</span>
                <div>
                  <div className="metric-label">Failed</div>
                  <div className="metric-val" style={{ color: (importProgress?.failCount ?? 0) > 0 ? '#dc2626' : '#94a3b8' }}>
                    {importProgress?.failCount ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DraggableResizableModal>

      {/* Hidden file input for file replacement / re-upload */}
      <input
        type="file"
        ref={reuploadInputRef}
        style={{ display: 'none' }}
        accept=".csv,.txt"
        onChange={handleReuploadSelect}
      />

      {/* Universal Minimized Modals Dock */}
      {isImportMinimized && (
        <div className="erp-minimized-dock" data-testid="employee-minimized-dock">
          <div
            className="erp-minimized-tab minimized-import-dock"
            onClick={() => setIsImportMinimized(false)}
            role="button"
            tabIndex={0}
            title="Click to restore Import Employees modal"
          >
            <div className="erp-minimized-pulse minimized-import-pulse" />
            <Space size={8}>
              <ImportOutlined style={{ color: '#4f46e5', fontSize: 16 }} />
              <span>Import: <strong>{importFileName || 'Employees CSV'}</strong></span>
              {importing && <Tag color="blue">{importProgress.percent}%</Tag>}
            </Space>
            <span
              className="erp-minimized-close"
              onClick={(e) => {
                e.stopPropagation();
                setIsImportMinimized(false);
                if (!importing) setImportModalVisible(false);
              }}
              title="Close import modal"
            >
              ×
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeesPage;