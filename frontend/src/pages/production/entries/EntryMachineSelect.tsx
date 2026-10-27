import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Row, Col, DatePicker, Select, Button, Space, Typography,
  Empty, Popover, Tag, Modal, App, theme, Progress, Badge, Tooltip, Grid,
} from 'antd';
import {
  DashboardOutlined, ArrowLeftOutlined, ReloadOutlined, EditOutlined,
  EyeOutlined, DeleteOutlined, FormOutlined, InboxOutlined,
  ThunderboltOutlined, CalendarOutlined, AppstoreOutlined,
  BuildOutlined, ToolOutlined, FireOutlined, ScissorOutlined,
  MinusOutlined, FullscreenOutlined, FullscreenExitOutlined, CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { useLookups, ShiftLk } from './lookups';
import { GlobalLoading } from '../../../components/shared';
import { useEntryDockStore, type EntryContextParams } from './entryDockStore';
import ProductionEntryDetailModal from './ProductionEntryDetailModal';
import './productionEntryModal.css';

const { Text } = Typography;

interface MachineEntryMini {
  id: string;
  entryId?: string;
  itemId: string;
  itemCode?: string | null;
  itemName: string | null;
  targetQuantity: number;
  actualQuantity: number;
  uom?: string | null;
}

interface MachineStatusRow {
  id: string;
  systemCode: string;
  machineCode: string;
  name: string;
  status: 'ENTERED' | 'ENTRY_REQUIRED';
  entryCount: number;
  primaryEntryId?: string | null;
  divisionId: string | null;
  sectionId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  targetQuantity?: number | null;
  actualQuantity?: number;
  uom?: string | null;
  achievementPercentage?: number | null;
  variance?: number | null;
  entries: MachineEntryMini[];
}

/** Formats numeric quantities cleanly without unnecessary trailing zeros: 70.0000 -> 70, 68.5000 -> 68.5 */
function formatQty(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0';
  const num = Number(val);
  if (isNaN(num)) return '0';
  return parseFloat(num.toFixed(4)).toString();
}

/** Formats achievement percentage cleanly: 97.14 -> 97.14%, 100 -> 100% */
function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const rounded = Math.round(val * 100) / 100;
  return `${parseFloat(rounded.toFixed(2))}%`;
}

interface MachineStatusResponse {
  success: boolean;
  data: MachineStatusRow[];
  meta: {
    totalMachines: number;
    enteredCount: number;
    entryRequiredCount: number;
    entryDate: string;
    shiftId: string;
  };
}

interface MachineCacheEntry {
  data: MachineStatusRow[];
  meta: MachineStatusResponse['meta'] | null;
  ts: number;
}
const machineStatusCache = new Map<string, MachineCacheEntry>();

const formatDivLabel = (d: { name: string; divisionCode?: string }) => {
  const code = d.divisionCode || '';
  if (code && d.name.toUpperCase().includes(code.toUpperCase())) {
    return d.name;
  }
  return code ? `${d.name} (${code})` : d.name;
};

// Department visual color palette for top selection cards
const DEPT_COLOR_PALETTES = [
  { color: '#3b82f6', bg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(30, 64, 175, 0.05) 100%)', icon: <ScissorOutlined /> },
  { color: '#8b5cf6', bg: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(91, 33, 182, 0.05) 100%)', icon: <ToolOutlined /> },
  { color: '#ea580c', bg: 'linear-gradient(135deg, rgba(234, 88, 12, 0.15) 0%, rgba(154, 52, 18, 0.05) 100%)', icon: <ThunderboltOutlined /> },
  { color: '#10b981', bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 95, 70, 0.05) 100%)', icon: <FireOutlined /> },
  { color: '#06b6d4', bg: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(14, 116, 144, 0.05) 100%)', icon: <BuildOutlined /> },
  { color: '#ec4899', bg: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(157, 23, 77, 0.05) 100%)', icon: <AppstoreOutlined /> },
];

/**
 * Enterprise Production Entry Wizard:
 * Step 1: Shift & Production Area (Division, Section, Date, Shift)
 * Step 2: Department Selection Cards + Wide Horizontal Machine Rows
 * Step 3: Direct transition into Production Details Form
 */
export interface EntryMachineSelectProps {
  isEmbedded?: boolean;
  open?: boolean;
  onClose?: () => void;
  onEntryCreated?: () => void;
}

const WIZARD_STORAGE_KEY = 'pwi_entry_wizard_active_state';

interface SavedWizardState {
  step?: number;
  entryDate?: string;
  shiftId?: string;
  divisionId?: string;
  sectionId?: string;
  selectedDeptId?: string | null;
}

const getSavedWizardState = (): SavedWizardState | null => {
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const EntryMachineSelect: React.FC<EntryMachineSelectProps> = ({
  isEmbedded = false,
  open: propOpen,
  onClose: propOnClose,
  onEntryCreated,
}) => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lookups = useLookups();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const savedWizard = useMemo(() => getSavedWizardState(), []);

  // Wizard state: Step 1 (Setup) vs Step 2 (Department & Machines)
  const [step, setStep] = useState<number>(() => {
    const paramStep = searchParams.get('step');
    if (paramStep === '2') return 2;
    if (paramStep === '1') return 1;
    if (savedWizard?.step) return savedWizard.step;
    return 1;
  });
  const [modalOpen, setModalOpen] = useState<boolean>(propOpen !== undefined ? propOpen : true);

  useEffect(() => {
    if (propOpen !== undefined) {
      setModalOpen(propOpen);
      if (propOpen) {
        setIsMinimized(false);
      }
    }
  }, [propOpen]);

  // ── Window control states (Minimize, Maximize / Fullscreen, Movable via Mouse) ──
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [modalPos, setModalPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = React.useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const handleDragStart = (e: React.MouseEvent) => {
    // Only drag when not maximized and left mouse button clicked
    if (isMaximized || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('.ant-select') ||
      target.closest('.ant-btn') ||
      target.closest('.ant-picker')
    ) {
      return;
    }

    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: modalPos.x,
      origY: modalPos.y,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setModalPos({
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      });
    };

    const handleMouseUp = () => {
      dragRef.current.isDragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ── selection state: date defaults to yesterday (1 day minus) ──
  const [entryDate, setEntryDate] = useState<dayjs.Dayjs | null>(() => {
    const qDate = searchParams.get('entryDate');
    if (qDate) return dayjs(qDate);
    if (savedWizard?.entryDate) return dayjs(savedWizard.entryDate);
    return dayjs().subtract(1, 'day');
  });
  const [shiftId, setShiftId] = useState<string | undefined>(
    () => searchParams.get('shiftId') || savedWizard?.shiftId || undefined,
  );
  const [divisionId, setDivisionId] = useState<string | undefined>(
    () => searchParams.get('divisionId') || savedWizard?.divisionId || undefined,
  );
  const [sectionId, setSectionId] = useState<string | undefined>(
    () => searchParams.get('sectionId') || savedWizard?.sectionId || undefined,
  );

  // Department selected in Step 2 for machine filtering
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(
    () => searchParams.get('departmentId') || savedWizard?.selectedDeptId || null,
  );

  // Sync state to sessionStorage so page refreshes and inter-component transitions preserve Step 2 & selections
  useEffect(() => {
    try {
      sessionStorage.setItem(
        WIZARD_STORAGE_KEY,
        JSON.stringify({
          step,
          entryDate: entryDate ? entryDate.format('YYYY-MM-DD') : null,
          shiftId: shiftId || null,
          divisionId: divisionId || null,
          sectionId: sectionId || null,
          selectedDeptId: selectedDeptId || null,
        }),
      );
    } catch {}
  }, [step, entryDate, shiftId, divisionId, sectionId, selectedDeptId]);

  // In-Modal Production Entry Detail Dialog State
  const [detailModalEntryId, setDetailModalEntryId] = useState<string | null>(null);

  // ── section & division-scoped target shifts (Loads all 5+ shifts configured for the active Section) ──
  const [scopedShifts, setScopedShifts] = useState<ShiftLk[] | null>(null);
  const [scopedShiftsLoading, setScopedShiftsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!sectionId && !divisionId) {
      setScopedShifts(null);
      return;
    }
    setScopedShiftsLoading(true);
    apiService
      .get<{ success?: boolean; data?: ShiftLk[] }>('/production/shifts', {
        ...(sectionId ? { sectionId } : { divisionId }),
      })
      .then((res) => {
        if (cancelled) return;
        const shiftsData = Array.isArray(res) ? res : (res as any)?.data;
        if (Array.isArray(shiftsData) && shiftsData.length > 0) {
          setScopedShifts(shiftsData);
          setShiftId((prev) => {
            if (prev && shiftsData.some((s) => s.id === prev)) return prev;
            return shiftsData[0].id;
          });
        } else {
          setScopedShifts(null);
        }
      })
      .catch(() => {
        if (!cancelled) setScopedShifts(null);
      })
      .finally(() => {
        if (!cancelled) setScopedShiftsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, divisionId]);

  const availableShifts = scopedShifts && scopedShifts.length > 0 ? scopedShifts : lookups.shifts;
  const effectiveShift = availableShifts.find((s) => s.id === shiftId);

  const selectedDivObj = lookups.divisions.find((d) => d.id === divisionId);
  const selectedSecObj = lookups.sections.find((s) => s.id === sectionId);

  // ── machine status global cache for 0ms tab switching & instantaneous hydration ──
  const dateIso = entryDate ? entryDate.format('YYYY-MM-DD') : undefined;

  // Key generator for in-memory status cache
  const currentCacheKey = `${dateIso || ''}_${shiftId || ''}_${divisionId || 'all'}_${sectionId || 'all'}`;
  const initialCacheHit = machineStatusCache.get(currentCacheKey);

  // ── machine status state (seeded from in-memory cache if available) ──
  const [machines, setMachines] = useState<MachineStatusRow[]>(() => initialCacheHit?.data || []);
  const [meta, setMeta] = useState<MachineStatusResponse['meta'] | null>(() => initialCacheHit?.meta || null);
  const [loading, setLoading] = useState<boolean>(() => !initialCacheHit && !!(dateIso && shiftId));
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const sectionsFiltered = lookups.sectionsForDivision(divisionId);

  // Active departments under selected division/section for Step 2 cards
  const activeDepartments = useMemo(() => {
    if (sectionId) {
      return lookups.departmentsForSection(sectionId);
    }
    if (divisionId) {
      return lookups.departmentsForDivision(divisionId);
    }
    return lookups.departments;
  }, [sectionId, divisionId, lookups]);

  // When departments load, auto-select first department if none selected
  useEffect(() => {
    if (activeDepartments.length > 0 && (!selectedDeptId || !activeDepartments.some(d => d.id === selectedDeptId))) {
      setSelectedDeptId(activeDepartments[0].id);
    }
  }, [activeDepartments, selectedDeptId]);

  // Auto-select first shift when loaded if not yet chosen
  useEffect(() => {
    if (!shiftId && availableShifts && availableShifts.length > 0) {
      setShiftId(availableShifts[0].id);
    }
  }, [shiftId, availableShifts]);

  // Auto-select first division when loaded if not yet chosen
  useEffect(() => {
    if (!divisionId && lookups.divisions && lookups.divisions.length > 0) {
      setDivisionId(lookups.divisions[0].id);
    }
  }, [divisionId, lookups.divisions]);

  const ready = !!dateIso && !!shiftId;

  const fetchStatus = useCallback(async () => {
    if (!dateIso || !shiftId) {
      setMachines([]);
      setMeta(null);
      return;
    }

    const cacheKey = `${dateIso}_${shiftId}_${divisionId || 'all'}_${sectionId || 'all'}`;
    const cached = machineStatusCache.get(cacheKey);

    // If cache hit, immediately display cached machines (0ms screen wipe)
    if (cached && cached.data.length > 0) {
      setMachines(cached.data);
      setMeta(cached.meta);
      if (Date.now() - cached.ts < 15000 && refreshTick === 0) {
        setLoading(false);
        return;
      }
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const res = await apiService.get<MachineStatusResponse>('/production/entries/machine-status', {
        entryDate: dateIso,
        shiftId,
        ...(divisionId && { divisionId }),
        ...(sectionId && { sectionId }),
      });
      const data = res.data || [];
      const resMeta = res.meta || null;
      machineStatusCache.set(cacheKey, { data, meta: resMeta, ts: Date.now() });
      setMachines(data);
      setMeta(resMeta);
    } catch (err: any) {
      if (!cached) {
        const msg = err?.response?.data?.message || err?.message || 'Failed to load machine entry status. Please retry.';
        setError(Array.isArray(msg) ? msg.join('; ') : String(msg));
      }
    } finally {
      setLoading(false);
    }
  }, [dateIso, shiftId, divisionId, sectionId, refreshTick]);

  // Recompute whenever Date / Shift / Division / Section change
  useEffect(() => {
    const t = setTimeout(() => void fetchStatus(), 150);
    return () => clearTimeout(t);
  }, [fetchStatus, refreshTick]);

  // When entry modal closes/saves in dock store, refresh availability grid automatically
  useEffect(() => {
    let wasOpen = false;
    const unsub = useEntryDockStore.subscribe((state) => {
      if (wasOpen && !state.isOpen) {
        setRefreshTick((t) => t + 1);
        if (onEntryCreated) onEntryCreated();
      }
      wasOpen = state.isOpen;
    });
    return () => unsub();
  }, [onEntryCreated]);

  const openNewEntry = (m: MachineStatusRow) => {
    const ctxDepartment = m.departmentId ?? selectedDeptId;
    const depObj = lookups.departments.find((d) => d.id === ctxDepartment);
    const ctxDivision = m.divisionId ?? divisionId ?? depObj?.divisionId;
    const ctxSection = m.sectionId ?? sectionId ?? depObj?.sectionId;
    const divObj = lookups.divisions.find((d) => d.id === ctxDivision);
    const secObj = lookups.sections.find((d) => d.id === ctxSection);
    const depName = m.departmentName || depObj?.name;
    const divName = divObj?.name;
    const secName = secObj?.name;
    const shiftName = effectiveShift?.name;

    const params: EntryContextParams = {
      from: 'select',
      machineId: m.id,
      machineCode: m.machineCode,
      machineName: m.name,
      ...(dateIso && { entryDate: dateIso }),
      ...(shiftId && { shiftId }),
      ...(shiftName && { shiftName }),
      ...(ctxDivision && { divisionId: ctxDivision }),
      ...(divName && { divisionName: divName }),
      ...(ctxSection && { sectionId: ctxSection }),
      ...(secName && { sectionName: secName }),
      ...(ctxDepartment && { departmentId: ctxDepartment }),
      ...(depName && { departmentName: depName }),
      mode: 'create',
    };

    useEntryDockStore.getState().openEntry(params);
  };

  const handleEditEntry = (entryId: string) => {
    useEntryDockStore.getState().openEntry({
      from: 'select',
      entryId,
      mode: 'edit',
      ...(dateIso && { entryDate: dateIso }),
      ...(shiftId && { shiftId }),
      ...(divisionId && { divisionId }),
      ...(sectionId && { sectionId }),
      ...(selectedDeptId && { departmentId: selectedDeptId }),
    });
  };

  const deleteEntry = useCallback(
    (entryId: string) => {
      modal.confirm({
        centered: true,
        zIndex: 70000,
        title: 'Delete Production Entry?',
        content:
          'Are you sure you want to permanently delete this production entry? This will remove dummy or test data and allow you to re-enter production for this machine.',
        okText: 'Yes, Delete Entry',
        cancelText: 'Cancel',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await apiService.delete(`/production/entries/${entryId}`);
            message.success('Production entry deleted successfully');
            setRefreshTick((t) => t + 1);
          } catch (err: any) {
            message.error(err?.response?.data?.message || 'Failed to delete entry');
          }
        },
      });
    },
    [modal, message],
  );

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    const sec = lookups.sections.find((s) => s.id === sectionId);
    const div = lookups.divisions.find((d) => d.id === divisionId);
    if (sec) parts.push(`${sec.name} Section`);
    else if (div) parts.push(`${div.name} (${div.divisionCode})`);
    return parts.length ? parts.join(' · ') : undefined;
  }, [lookups.sections, lookups.divisions, sectionId, divisionId]);

  const handleCloseModal = () => {
    try {
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
    } catch {}
    setModalOpen(false);
    if (propOnClose) {
      propOnClose();
    }
    if (!isEmbedded) {
      navigate('/production/entries');
    }
  };

  // Machines filtered by the active department selected in Step 2
  const displayedMachines = useMemo(() => {
    if (!selectedDeptId) return machines;
    return machines.filter((m) => m.departmentId === selectedDeptId);
  }, [machines, selectedDeptId]);

  const activeDeptObj = activeDepartments.find((d) => d.id === selectedDeptId);

  return (
    <div>
      {/* ── Enterprise Production Entry Wizard Modal ── */}
      <Modal
        open={modalOpen && !isMinimized}
        onCancel={handleCloseModal}
        width={isMobile || isMaximized ? '100vw' : 1280}
        centered={!isMobile && !isMaximized && modalPos.x === 0 && modalPos.y === 0}
        footer={null}
        closable={false}
        destroyOnClose={false}
        zIndex={50000}
        getContainer={() => document.body}
        style={
          isMobile
            ? { top: 0, left: 0, right: 0, bottom: 0, margin: 0, padding: 0, maxWidth: '100vw', width: '100vw', height: '100vh', transform: 'none' }
            : isMaximized
            ? { top: 0, left: 0, right: 0, bottom: 0, margin: 0, paddingBottom: 0, maxWidth: '100vw', width: '100vw', height: '100vh', transform: 'none' }
            : { top: 20, transform: `translate(${modalPos.x}px, ${modalPos.y}px)` }
        }
        bodyStyle={{
          padding: isMobile ? '12px 12px 28px' : isMaximized ? '22px 30px' : '22px 26px',
          backgroundColor: token.colorBgContainer,
          borderRadius: isMobile || isMaximized ? 0 : 16,
          height: isMobile || isMaximized ? '100vh' : undefined,
          maxHeight: isMobile || isMaximized ? '100vh' : '92vh',
          overflowY: 'auto',
          boxShadow: isMobile || isMaximized ? 'none' : '0 16px 48px rgba(0, 0, 0, 0.35)',
        }}
        wrapClassName={isMobile ? 'pwi-entry-wizard-modal-mobile' : isMaximized ? 'pwi-entry-wizard-modal-maximized' : 'pwi-entry-wizard-modal-wrap'}
      >
        {/* Top Header HUD Banner - Serves as Draggable Mouse Handle */}
        <div
          onMouseDown={isMobile || isMaximized ? undefined : handleDragStart}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isMobile ? 12 : 20,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            paddingBottom: isMobile ? 10 : 14,
            flexWrap: 'wrap',
            gap: isMobile ? 8 : 12,
            cursor: isMobile || isMaximized ? 'default' : 'grab',
            userSelect: 'none',
          }}
        >
          {/* Left: Branding & Draggable indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
            <div
              style={{
                width: isMobile ? 34 : 44,
                height: isMobile ? 34 : 44,
                borderRadius: 10,
                backgroundColor: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.45)',
                color: '#ffffff',
                fontSize: isMobile ? 17 : 22,
                flexShrink: 0,
              }}
            >
              <DashboardOutlined />
            </div>
            <div>
              {!isMobile && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '1.2px',
                    color: '#ea580c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>FACTORY FLOOR TOUCH TERMINAL • ZERO-TYPING INTERFACE</span>
                  {!isMaximized && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: token.colorTextSecondary,
                        backgroundColor: token.colorFillAlter,
                        padding: '1px 8px',
                        borderRadius: 6,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        letterSpacing: 'normal',
                        textTransform: 'none',
                      }}
                    >
                      🖱️ Drag to Move
                    </span>
                  )}
                </div>
              )}
              <div style={{ fontSize: isMobile ? 16 : 21, fontWeight: 900, color: token.colorText, marginTop: 1 }}>
                Daily Production Entry Wizard
              </div>
            </div>
          </div>

          {/* Right: Step Indicator + Minimize, Maximize, Close Control Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12 }}>
            {/* Progression Step Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                onClick={() => setStep(1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: isMobile ? '4px 8px' : '6px 14px',
                  borderRadius: 20,
                  backgroundColor: step === 1 ? '#ea580c' : token.colorFillAlter,
                  color: step === 1 ? '#ffffff' : token.colorTextSecondary,
                  fontWeight: 800,
                  fontSize: isMobile ? 11 : 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{isMobile ? '1 Area' : '1 Shift & Area'}</span>
              </div>
              <span style={{ color: token.colorTextTertiary, fontSize: 11 }}>➔</span>
              <div
                onClick={() => {
                  if (ready) setStep(2);
                  else message.warning('Please select a production date and shift to proceed');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: isMobile ? '4px 8px' : '6px 14px',
                  borderRadius: 20,
                  backgroundColor: step === 2 ? '#ea580c' : token.colorFillAlter,
                  color: step === 2 ? '#ffffff' : token.colorTextSecondary,
                  fontWeight: 800,
                  fontSize: isMobile ? 11 : 12,
                  cursor: ready ? 'pointer' : 'not-allowed',
                  opacity: ready ? 1 : 0.6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{isMobile ? '2 Machines' : '2 Department & Machines'}</span>
              </div>
              {!isMobile && (
                <>
                  <span style={{ color: token.colorTextTertiary, fontSize: 11 }}>➔</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 14px',
                      borderRadius: 20,
                      backgroundColor: token.colorFillAlter,
                      color: token.colorTextTertiary,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'default',
                      opacity: 0.6,
                    }}
                  >
                    <span>3 Production Details</span>
                  </div>
                </>
              )}
            </div>

            {/* Window Action Control Bar (Minimize, Maximize / Restore, Close) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 4px',
                borderRadius: 8,
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Tooltip title="Minimize">
                <Button
                  type="text"
                  size="small"
                  icon={<MinusOutlined style={{ fontSize: 12 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMinimized(true);
                  }}
                  style={{
                    color: token.colorTextSecondary,
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                  }}
                />
              </Tooltip>

              {!isMobile && (
                <Tooltip title={isMaximized ? 'Restore standard size' : 'Maximize fullscreen'}>
                  <Button
                    type="text"
                    size="small"
                    icon={
                      isMaximized ? (
                        <FullscreenExitOutlined style={{ fontSize: 12 }} />
                      ) : (
                        <FullscreenOutlined style={{ fontSize: 12 }} />
                      )
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMaximized((prev) => !prev);
                    }}
                    style={{
                      color: token.colorTextSecondary,
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                    }}
                  />
                </Tooltip>
              )}

              <Tooltip title="Close Wizard">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined style={{ fontSize: 12 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseModal();
                  }}
                  danger
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                  }}
                />
              </Tooltip>
            </div>
          </div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STEP 1: SHIFT & PRODUCTION AREA IDENTIFICATION
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: token.colorText }}>
                Step 1: Shift & Production Area Identification
              </h3>
              <div style={{ color: token.colorTextSecondary, fontSize: 13, marginTop: 4 }}>
                Select your target manufacturing division, operating date, and scheduled shift via rapid touch selectors (Zero Typing Required).
              </div>
            </div>

            {/* 3 LARGE HIGH-CONTRAST SELECTION CARDS (ZERO BORDER & MOBILE RESPONSIVE) */}
            <Row gutter={isMobile ? [12, 12] : [18, 18]}>
              {/* 1. ACTIVE MANUFACTURING AREA (DIVISION & SECTION ONLY) */}
              <Col xs={24} md={8}>
                <div
                  style={{
                    backgroundColor: token.colorBgContainer,
                    border: 'none',
                    borderRadius: 14,
                    padding: isMobile ? '12px 14px' : '18px 20px',
                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: isMobile ? 'auto' : 270,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isMobile ? 12 : 16 }}>
                      <div
                        style={{
                          width: isMobile ? 36 : 44,
                          height: isMobile ? 36 : 44,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.1) 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#3b82f6',
                          fontSize: isMobile ? 18 : 22,
                        }}
                      >
                        <AppstoreOutlined />
                      </div>
                      <div>
                        <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: token.colorText }}>Manufacturing Area</div>
                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Division & Section Selection</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14 }}>
                      <div>
                        <Text style={{ fontSize: 12, fontWeight: 700, color: token.colorTextSecondary, display: 'block', marginBottom: 4 }}>
                          Select Manufacturing Division:
                        </Text>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Select Division"
                          style={{ width: '100%', height: 42 }}
                          value={divisionId}
                          options={lookups.divisions.map((d) => ({ value: d.id, label: formatDivLabel(d) }))}
                          onChange={(v) => {
                            setDivisionId(v);
                            setSectionId(undefined);
                            setSelectedDeptId(null);
                          }}
                        />
                      </div>

                      {sectionsFiltered.length > 0 && (
                        <div>
                          <Text style={{ fontSize: 12, fontWeight: 700, color: token.colorTextSecondary, display: 'block', marginBottom: 4 }}>
                            Operational Section (Optional):
                          </Text>
                          <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="All Sections in Division"
                            style={{ width: '100%', height: 42 }}
                            value={sectionId}
                            options={sectionsFiltered.map((s) => ({ value: s.id, label: s.name }))}
                            onChange={(v) => {
                              setSectionId(v);
                              setSelectedDeptId(null);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: isMobile ? 10 : 14,
                      padding: isMobile ? '8px 12px' : '10px 14px',
                      borderRadius: 10,
                      backgroundColor: token.colorFillAlter,
                      border: 'none',
                    }}
                  >
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, textTransform: 'uppercase', fontWeight: 700 }}>
                      Verified Manufacturing Scope:
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: token.colorPrimary, marginTop: 2 }}>
                      {scopeLabel || 'All Manufacturing Divisions'}
                    </div>
                  </div>
                </div>
              </Col>

              {/* 2. PRODUCTION DATE */}
              <Col xs={24} md={8}>
                <div
                  style={{
                    backgroundColor: token.colorBgContainer,
                    border: 'none',
                    borderRadius: 14,
                    padding: isMobile ? '12px 14px' : '18px 20px',
                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: isMobile ? 'auto' : 270,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isMobile ? 12 : 16 }}>
                      <div
                        style={{
                          width: isMobile ? 36 : 44,
                          height: isMobile ? 36 : 44,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.2) 0%, rgba(194, 65, 12, 0.1) 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ea580c',
                          fontSize: isMobile ? 18 : 22,
                        }}
                      >
                        <CalendarOutlined />
                      </div>
                      <div>
                        <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: token.colorText }}>Production Work Date</div>
                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Shift Calendar Schedule</div>
                      </div>
                    </div>

                    <div>
                      <Text style={{ fontSize: 12, fontWeight: 700, color: token.colorTextSecondary, display: 'block', marginBottom: 4 }}>
                        Select Operating Date:
                      </Text>
                      <DatePicker
                        style={{ width: '100%', height: 42, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
                        value={entryDate}
                        onChange={(v) => setEntryDate(v)}
                        allowClear={false}
                      />

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
                        <Button
                          onClick={() => setEntryDate(dayjs().subtract(1, 'day'))}
                          style={{
                            height: 36,
                            fontSize: 12,
                            fontWeight: 700,
                            backgroundColor: token.colorFillAlter,
                            border: 'none',
                            color: token.colorText,
                          }}
                        >
                          Yesterday
                        </Button>
                        <Button
                          onClick={() => setEntryDate(dayjs())}
                          style={{
                            height: 36,
                            fontSize: 12,
                            fontWeight: 700,
                            backgroundColor: token.colorFillAlter,
                            border: 'none',
                            color: token.colorText,
                          }}
                        >
                          Today
                        </Button>
                        <Button
                          onClick={() => setEntryDate(dayjs().subtract(2, 'day'))}
                          style={{
                            height: 36,
                            fontSize: 12,
                            fontWeight: 700,
                            backgroundColor: token.colorFillAlter,
                            border: 'none',
                            color: token.colorText,
                          }}
                        >
                          -2 Days
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: isMobile ? 10 : 14,
                      padding: isMobile ? '8px 12px' : '10px 14px',
                      borderRadius: 10,
                      backgroundColor: token.colorFillAlter,
                      border: 'none',
                    }}
                  >
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, textTransform: 'uppercase', fontWeight: 700 }}>
                      Scheduled Date:
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#ea580c', marginTop: 2 }}>
                      {entryDate ? entryDate.format('dddd, DD-MMMM-YYYY') : 'No Date Selected'}
                    </div>
                  </div>
                </div>
              </Col>

              {/* 3. ACTIVE SHIFT ROSTER */}
              <Col xs={24} md={8}>
                <div
                  style={{
                    backgroundColor: token.colorBgContainer,
                    border: 'none',
                    borderRadius: 14,
                    padding: isMobile ? '12px 14px' : '18px 20px',
                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: isMobile ? 'auto' : 270,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isMobile ? 12 : 16 }}>
                      <div
                        style={{
                          width: isMobile ? 36 : 44,
                          height: isMobile ? 36 : 44,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#10b981',
                          fontSize: isMobile ? 18 : 22,
                        }}
                      >
                        <ThunderboltOutlined />
                      </div>
                      <div>
                        <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: token.colorText }}>Active Shift Roster</div>
                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Manufacturing Shift Schedule</div>
                      </div>
                    </div>

                    <div>
                      <Text style={{ fontSize: 12, fontWeight: 700, color: token.colorTextSecondary, display: 'block', marginBottom: 4 }}>
                        Select Manufacturing Shift:
                      </Text>
                      <Select
                        placeholder="Select Shift"
                        style={{ width: '100%', height: 42 }}
                        value={shiftId}
                        loading={scopedShiftsLoading}
                        options={availableShifts.map((s) => ({
                          value: s.id,
                          label: `${s.name} (${s.startTime ?? ''}–${s.endTime ?? ''})`,
                        }))}
                        onChange={(v) => setShiftId(v)}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: isMobile ? 10 : 14,
                      padding: isMobile ? '8px 12px' : '10px 14px',
                      borderRadius: 10,
                      backgroundColor: token.colorFillAlter,
                      border: 'none',
                    }}
                  >
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, textTransform: 'uppercase', fontWeight: 700 }}>
                      Shift Capacity:
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                      {effectiveShift?.name?.includes('12') || effectiveShift?.name?.includes('N+OT')
                        ? '12.00 Gross (8h Duty + 4h OT)'
                        : '8.00 Net Hours Basis'}
                    </div>
                  </div>
                </div>
              </Col>
            </Row>

            {/* Big Proceed Action Button */}
            <div style={{ marginTop: isMobile ? 16 : 26, textAlign: 'center' }}>
              <Button
                type="primary"
                onClick={() => {
                  if (!ready) {
                    message.warning('Please select a production date and shift to proceed');
                    return;
                  }
                  setStep(2);
                }}
                style={{
                  height: isMobile ? 48 : 58,
                  width: '100%',
                  maxWidth: 500,
                  background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                  borderColor: '#ea580c',
                  borderRadius: 12,
                  fontSize: isMobile ? 15 : 18,
                  fontWeight: 900,
                  letterSpacing: '0.5px',
                  boxShadow: '0 6px 20px rgba(234, 88, 12, 0.35)',
                }}
              >
                PROCEED TO DEPARTMENT & MACHINES ➔
              </Button>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STEP 2: DEPARTMENT CARDS + WIDE HORIZONTAL MACHINE ROWS
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === 2 && (
          <div>
            {/* Top Navigation & Info Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => setStep(1)}
                  style={{
                    height: 42,
                    backgroundColor: token.colorFillAlter,
                    borderColor: token.colorBorderSecondary,
                    color: token.colorText,
                    fontWeight: 700,
                    borderRadius: 10,
                  }}
                >
                  Back to Step 1
                </Button>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: token.colorText }}>
                    Step 2: Department Selection & Machine Station Fleet
                  </h3>
                  <div style={{ color: token.colorTextSecondary, fontSize: 12, marginTop: 2 }}>
                    Area: <strong style={{ color: token.colorPrimary }}>{scopeLabel || 'All Manufacturing'}</strong> | Shift: <strong style={{ color: '#10b981' }}>{effectiveShift?.name || 'Shift'}</strong> | Date: <strong style={{ color: '#ea580c' }}>{dateIso ? dayjs(dateIso).format('DD-MMM-YYYY') : '—'}</strong>
                  </div>
                </div>
              </div>

              <Space wrap>
                <Button
                  icon={<InboxOutlined />}
                  onClick={() => {
                    setModalOpen(false);
                    navigate('/production/packing');
                  }}
                  style={{
                    fontWeight: 600,
                    borderColor: '#10b981',
                    color: '#10b981',
                    borderRadius: 8,
                  }}
                >
                  Hand Packing (No Machine)
                </Button>
                <Button
                  icon={<FormOutlined />}
                  onClick={() => {
                    setModalOpen(false);
                    navigate('/production/entries/new');
                  }}
                  style={{ fontWeight: 600, borderRadius: 8 }}
                >
                  Direct Entry Form
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => setRefreshTick((t) => t + 1)}
                  loading={loading}
                  style={{ backgroundColor: token.colorFillAlter, borderColor: token.colorBorderSecondary, color: token.colorText, borderRadius: 8 }}
                >
                  Refresh Fleet
                </Button>
              </Space>
            </div>

            {/* ━━━ TOP DEPARTMENT CARDS (IDENTICAL TO IMAGE 2) ━━━ */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, textTransform: 'uppercase', color: token.colorTextSecondary, fontWeight: 800, marginBottom: 10 }}>
                Manufacturing Departments ({activeDepartments.length} Sections Available):
              </div>
              <Row gutter={[12, 12]}>
                {activeDepartments.map((dept, idx) => {
                  const isSelected = selectedDeptId === dept.id;
                  const palette = DEPT_COLOR_PALETTES[idx % DEPT_COLOR_PALETTES.length];
                  const deptMachines = machines.filter((m) => m.departmentId === dept.id);
                  const deptRequiredCount = deptMachines.filter((m) => m.status === 'ENTRY_REQUIRED').length;

                  return (
                    <Col xs={24} sm={12} md={activeDepartments.length <= 4 ? 6 : 4} key={dept.id}>
                      <div
                        onClick={() => setSelectedDeptId(dept.id)}
                        style={{
                          backgroundColor: isSelected ? token.colorFillSecondary : token.colorBgContainer,
                          borderRadius: 12,
                          padding: isMobile ? '10px 12px' : '14px 14px',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? `0 0 16px ${palette.color}44` : '0 2px 8px rgba(0,0,0,0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 10,
                              background: palette.bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: palette.color,
                              fontSize: 18,
                            }}
                          >
                            {palette.icon}
                          </div>
                          <Badge
                            count={`${deptMachines.length} Machines`}
                            style={{
                              backgroundColor: deptRequiredCount > 0 ? '#ea580c' : '#065f46',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: 11,
                            }}
                          />
                        </div>

                        <div style={{ fontSize: 15, fontWeight: 800, color: token.colorText, marginTop: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {dept.name}
                        </div>
                        <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
                          {dept.departmentCode || 'DEP'} • {deptRequiredCount} Pending
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            textAlign: 'center',
                            padding: '4px',
                            borderRadius: 6,
                            backgroundColor: token.colorFillAlter,
                            color: palette.color,
                            fontWeight: 800,
                            fontSize: 11,
                          }}
                        >
                          {isSelected ? '✓ Selected Section' : 'Tap to View Machines →'}
                        </div>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </div>

            {/* Summary Ribbon */}
            <div
              style={{
                padding: '10px 16px',
                backgroundColor: token.colorFillAlter,
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <Space size={18} wrap>
                <Text style={{ fontSize: 13, color: token.colorText }}>
                  Active Section: <strong style={{ color: token.colorPrimary }}>{activeDeptObj?.name || 'Selected Department'}</strong>
                </Text>
                <Text style={{ fontSize: 13, color: token.colorText }}>
                  Total Machines: <Text strong style={{ color: token.colorText }}>{displayedMachines.length}</Text>
                </Text>
                <Text style={{ fontSize: 13, color: token.colorText }}>
                  <span
                    aria-hidden
                    style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: '#10b981', marginRight: 6 }}
                  />
                  Entered: <Text strong style={{ color: '#10b981' }}>{displayedMachines.filter(m => m.status === 'ENTERED').length}</Text>
                </Text>
                <Text style={{ fontSize: 13, color: token.colorText }}>
                  <span
                    aria-hidden
                    style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: '#f43f5e', marginRight: 6 }}
                  />
                  Entry Required: <Text strong style={{ color: '#f43f5e' }}>{displayedMachines.filter(m => m.status === 'ENTRY_REQUIRED').length}</Text>
                </Text>
              </Space>

              <Space size={8} wrap>
                {dateIso && <Tag color="blue" style={{ fontWeight: 700, borderRadius: 6 }}>{dayjs(dateIso).format('DD-MMM-YYYY')}</Tag>}
              </Space>
            </div>

            {error && (
              <div style={{ marginBottom: 14 }}>
                <Tag color="error">{error}</Tag>
              </div>
            )}

            {/* ━━━ WIDE HORIZONTAL MACHINE ROWS ━━━ */}
            {loading && machines.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center' }}>
                <GlobalLoading title="Loading Machines..." subtitle="Retrieving active machines for this selection..." badgeText="LIVE DATABASE QUERY" minHeight={240} />
              </div>
            ) : displayedMachines.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: token.colorFillAlter, borderRadius: 14, border: `1px dashed ${token.colorBorderSecondary}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText }}>
                  No active machines found for {activeDeptObj?.name || 'this department'}.
                </div>
                <div style={{ fontSize: 13, color: token.colorTextSecondary, marginTop: 4 }}>
                  Please select another department from the cards above.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  maxHeight: '48vh',
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {displayedMachines.map((m) => (
                  <HorizontalMachineRow
                    key={m.id}
                    machine={m}
                    onSelect={() => {
                      openNewEntry(m);
                    }}
                    onEdit={(entryId) => handleEditEntry(entryId)}
                    onView={(entryId) => setDetailModalEntryId(entryId)}
                    onDelete={(entryId) => deleteEntry(entryId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Minimized Floating HUD Dock (Keeps wizard state alive in background while browsing other pages) ── */}
      {modalOpen && isMinimized && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 28,
            zIndex: 50001,
            backgroundColor: token.colorBgElevated,
            border: `2px solid #ea580c`,
            borderRadius: 16,
            padding: '10px 18px',
            boxShadow: '0 10px 32px rgba(234, 88, 12, 0.28), 0 4px 16px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            backdropFilter: 'blur(16px)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 18,
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.4)',
            }}
          >
            <DashboardOutlined />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: token.colorText }}>
                Daily Production Entry Wizard
              </span>
              <Tag color="orange" style={{ margin: 0, fontSize: 11, fontWeight: 700, borderRadius: 10 }}>
                Step {step}: {step === 1 ? 'Shift & Area' : 'Machines'}
              </Tag>
            </div>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
              {selectedSecObj?.name || 'Section'} • {effectiveShift?.name || 'Shift'} • {dateIso || 'Date'}
            </div>
          </div>

          <Space size={6}>
            <Button
              type="primary"
              size="small"
              icon={<FullscreenOutlined />}
              onClick={() => setIsMinimized(false)}
              style={{
                backgroundColor: '#ea580c',
                borderColor: '#ea580c',
                fontWeight: 700,
                borderRadius: 8,
              }}
            >
              Restore Wizard
            </Button>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={handleCloseModal}
              style={{ color: token.colorTextTertiary }}
            />
          </Space>
        </div>
      )}

      {/* ── Enterprise In-Modal Production Entry Detail Dialog ── */}
      <ProductionEntryDetailModal
        open={Boolean(detailModalEntryId)}
        entryId={detailModalEntryId}
        onClose={() => setDetailModalEntryId(null)}
        onEdit={(entryId) => {
          setDetailModalEntryId(null);
          handleEditEntry(entryId);
        }}
        onDeleted={() => {
          setDetailModalEntryId(null);
          setRefreshTick((t) => t + 1);
        }}
      />
    </div>
  );
};

/**
 * Wide Horizontal Machine Row Component
 * Styled identically to the horizontal contracts in Image 2.
 */
const HorizontalMachineRow: React.FC<{
  machine: MachineStatusRow;
  onSelect: () => void;
  onEdit: (entryId: string) => void;
  onView: (entryId: string) => void;
  onDelete: (entryId: string) => void;
}> = ({ machine, onSelect, onEdit, onView, onDelete }) => {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const entered = machine.status === 'ENTERED';

  // Metrics resolution
  const hasEntries = machine.entries && machine.entries.length > 0;
  const target = machine.targetQuantity !== undefined && machine.targetQuantity !== null
    ? machine.targetQuantity
    : hasEntries
      ? machine.entries.reduce((sum, e) => sum + (Number(e.targetQuantity) || 0), 0)
      : null;

  const production = machine.actualQuantity !== undefined && machine.actualQuantity !== null
    ? machine.actualQuantity
    : hasEntries
      ? machine.entries.reduce((sum, e) => sum + (Number(e.actualQuantity) || 0), 0)
      : 0;

  const uom = machine.uom || (hasEntries ? machine.entries[0]?.uom : null) || 'KG';

  const achievement = machine.achievementPercentage !== undefined && machine.achievementPercentage !== null
    ? machine.achievementPercentage
    : target && target > 0
      ? Number(((production / target) * 100).toFixed(2))
      : null;

  const variance = machine.variance !== undefined && machine.variance !== null
    ? machine.variance
    : target !== null && target !== undefined
      ? Number((production - target).toFixed(4))
      : null;

  let varianceNode: React.ReactNode = null;
  if (variance !== null) {
    if (variance > 0) {
      varianceNode = (
        <span style={{ color: token.colorSuccess, fontWeight: 700 }}>
          ↑ {formatQty(variance)} {uom}
        </span>
      );
    } else if (variance < 0) {
      varianceNode = (
        <span style={{ color: token.colorError, fontWeight: 700 }}>
          ↓ {formatQty(Math.abs(variance))} {uom}
        </span>
      );
    } else {
      varianceNode = (
        <span style={{ color: token.colorTextSecondary, fontWeight: 600 }}>
          – 0 {uom}
        </span>
      );
    }
  }

  const entriesList = (
    <div style={{ minWidth: 280 }}>
      {machine.entries.map((e, idx) => (
        <div
          key={e.id}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 8, padding: '8px 2px',
            borderBottom: idx < machine.entries.length - 1 ? `1px solid ${token.colorBorderSecondary}` : 'none',
          }}
        >
          <div>
            <Text strong style={{ fontSize: 13, color: token.colorText }}>{e.itemName ?? e.itemId}</Text>
            <br />
            <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
              Actual {formatQty(e.actualQuantity)} {e.uom || uom} / Target {formatQty(e.targetQuantity)} {e.uom || uom}
            </Text>
          </div>
          <Space size={4}>
            <Button size="small" type="primary" ghost icon={<EditOutlined />} onClick={() => onEdit(e.entryId || e.id)}>
              Edit
            </Button>
            <Button size="small" icon={<EyeOutlined />} onClick={() => onView(e.entryId || e.id)}>
              View
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(e.entryId || e.id)} />
          </Space>
        </div>
      ))}
    </div>
  );

  return (
    <div
      style={{
        backgroundColor: token.colorBgContainer,
        borderRadius: 12,
        padding: isMobile ? '10px 12px' : '14px 20px',
        border: 'none',
        borderLeft: `4px solid ${entered ? '#10b981' : '#ea580c'}`,
        boxShadow: entered ? '0 2px 10px rgba(16, 185, 129, 0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
        transition: 'all 0.15s ease',
      }}
    >
      <Row gutter={[16, 10]} align="middle">
        {/* Machine Identity & Status */}
        <Col xs={24} md={7}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                backgroundColor: entered ? '#10b981' : '#ea580c',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.5px',
              }}
            >
              {machine.machineCode}
            </span>
            <span style={{ color: token.colorTextSecondary, fontSize: 11 }}>
              {machine.departmentName || 'Asset Machinery'}
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: token.colorText, marginTop: 4 }}>
            {machine.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: entered ? '#10b981' : '#f43f5e',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: entered ? '#10b981' : '#f43f5e' }}>
              {entered ? 'Already Entered' : 'Entry Required'}
            </span>
            {machine.systemCode && machine.systemCode !== machine.machineCode && (
              <span style={{ fontSize: 11, color: token.colorTextTertiary }}>• {machine.systemCode}</span>
            )}
          </div>
        </Col>

        {/* Target & Production Numbers */}
        <Col xs={24} md={8}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>Target:</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: token.colorText }}>
                {target !== null ? `${formatQty(target)} ${uom}` : '—'}
              </div>
            </div>
            <div style={{ borderLeft: `1px solid ${token.colorBorderSecondary}`, height: 26 }} />
            <div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>Production:</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: entered || target !== null ? '#10b981' : token.colorText }}>
                {entered || target !== null ? `${formatQty(production)} ${uom}` : '—'}
              </div>
            </div>
            <div style={{ borderLeft: `1px solid ${token.colorBorderSecondary}`, height: 26 }} />
            <div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>Variance:</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {varianceNode || '—'}
              </div>
            </div>
          </div>

          {/* Breakdown if multi-item */}
          {machine.entries && machine.entries.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
              {machine.entries.slice(0, 2).map((itemEntry, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 11,
                    backgroundColor: token.colorFillAlter,
                    padding: '1px 6px',
                    borderRadius: 4,
                    color: token.colorTextSecondary,
                  }}
                >
                  {itemEntry.itemName || itemEntry.itemId}: {formatQty(itemEntry.actualQuantity)}
                </span>
              ))}
              {machine.entries.length > 2 && (
                <span style={{ fontSize: 11, color: token.colorTextTertiary }}>+{machine.entries.length - 2} more</span>
              )}
            </div>
          )}
        </Col>

        {/* Visual Progress Bar (Achievement) */}
        <Col xs={24} md={5}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: token.colorTextSecondary, fontSize: 11 }}>Achievement</span>
            <span style={{ fontWeight: 800, color: achievement !== null && achievement >= 100 ? '#10b981' : token.colorText }}>
              {achievement !== null ? formatPercent(achievement) : '—'}
            </span>
          </div>
          <Progress
            percent={achievement !== null ? Math.min(100, Math.round(achievement)) : 0}
            status={achievement !== null && achievement >= 100 ? 'success' : 'active'}
            strokeColor={{
              '0%': '#ea580c',
              '100%': '#10b981',
            }}
            trailColor={token.colorFillAlter}
            strokeWidth={9}
          />
        </Col>

        {/* Action Button */}
        <Col xs={24} md={4} style={{ textAlign: 'right' }}>
          {entered ? (
            machine.entryCount <= 1 ? (
              <Space size={6}>
                <Button
                  type="primary"
                  ghost
                  icon={<EditOutlined />}
                  onClick={() => onEdit(machine.primaryEntryId || machine.entries[0]?.entryId || machine.entries[0]?.id)}
                  style={{ fontWeight: 700, borderRadius: 8 }}
                >
                  Edit
                </Button>
                <Button
                  icon={<EyeOutlined />}
                  onClick={() => onView(machine.primaryEntryId || machine.entries[0]?.entryId || machine.entries[0]?.id)}
                  style={{ borderRadius: 8 }}
                />
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => onDelete(machine.primaryEntryId || machine.entries[0]?.entryId || machine.entries[0]?.id)}
                  style={{ borderRadius: 8 }}
                />
              </Space>
            ) : (
              <Popover content={entriesList} title={`${machine.entryCount} entries for this shift`} trigger="click">
                <Button icon={<EditOutlined />} style={{ borderRadius: 8, fontWeight: 700 }}>
                  Entries ({machine.entryCount})
                </Button>
              </Popover>
            )
          ) : (
            <Button
              type="primary"
              onClick={onSelect}
              style={{
                height: isMobile ? 38 : 44,
                width: '100%',
                backgroundColor: '#ea580c',
                borderColor: '#ea580c',
                fontWeight: 900,
                borderRadius: 8,
                fontSize: isMobile ? 13 : 14,
                letterSpacing: '0.5px',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
              }}
            >
              SELECT ➔
            </Button>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default EntryMachineSelect;
