import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, App, Button, Card, Col, Descriptions, Empty, Form, Input, Modal, Row,
  Select, Space, Spin, Switch, Table, Tag, Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { DivisionSelect, PageHeader, PhotoCapture, SignaturePad } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import VisitorSlipPreview from './VisitorSlipPreview';

// ΓöÇΓöÇΓöÇ Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
interface DivisionRow {
  id: string;
  divisionCode: string;
  name: string;
  status?: string;
}

interface LocationRow {
  id: string;
  locationCode: string;
  name: string;
  divisionId: string;
  status?: string;
}

interface HostRow {
  id: string;
  employeeCode: string;
  name: string;
  department: string | null;
  divisionId: string | null;
}

interface VisitorRow {
  id: string;
  /** Server-generated reception reference, printed on the slip (Prompt #19). */
  visitorReference?: string | null;
  visitorName: string;
  cnic: string | null;
  mobile: string | null;
  visitorCompany: string | null;
  hostEmployeeId: string | null;
  hostNameSnapshot: string | null;
  divisionId: string;
  locationId: string;
  division?: { id: string; divisionCode: string; name: string } | null;
  location?: { id: string; locationCode: string; name: string } | null;
  timeIn: string;
  timeOut: string | null;
  status: string;
  /** Server-derived: still on site (status PENDING and no Time-Out yet). */
  onSite?: boolean;
  /** Who recorded the Time-Out (Prompt #18) ΓÇö null until the visit is closed. */
  exitedBy?: string | null;
  /** Host confirmation (Prompt #19) ΓÇö independent of the visit status (┬º28). */
  hostConfirmed?: boolean;
  hostConfirmedAt?: string | null;
  hostConfirmedBy?: string | null;
  hasSignature?: boolean;
  hasPhoto: boolean;
  photoUrl?: string | null;
  signatureUrl?: string | null;
  signatureCapturedAt?: string | null;
  signatureCapturedBy?: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt?: string | null;
}

const STATUS_TAG_COLOR: Record<string, string> = {
  PENDING: 'orange',
  INSIDE: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'default',
};

/** 13 raw digits or the formatted `00000-0000000-0` (same rule as the API). */
const CNIC_SHAPE = /^(?:\d{13}|\d{5}-\d{7}-\d)$/;

/** Same acceptance rule as the API: PK mobile or a plain 10ΓÇô15 digit number. */
const MOBILE_SHAPE = /^(?:\+?92|0)?3\d{9}$|^\+?\d{10,15}$/;

/** Store the canonical CNIC form without dropping any digit. */
function normaliseCnic(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : raw;
}

/** Strip display separators only; the digits stay exactly as typed. */
function normaliseMobile(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

const formatDateTime = (value?: string | null): string => {
  if (!value) return 'ΓÇö';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY HH:mm') : 'ΓÇö';
};

/**
 * A visitor is on site while the status is PENDING *and* no Time-Out exists ΓÇö
 * the same rule the API applies when it filters (┬º10/┬º20). `onSite` from the
 * server wins; the fallback keeps the table honest for a row shaped without it.
 */
const isOnSite = (row: VisitorRow): boolean =>
  typeof row.onSite === 'boolean' ? row.onSite : row.status === 'PENDING' && !row.timeOut;

export function VisitorManagement() {
  const { message } = App.useApp();
  const { can, allowedDivisionIds, divisionsUnrestricted } = usePermission();
  const canCreate = can('visitor.entry.create');
  // Prompt #18 ┬º21 ΓÇö same permission family as the rest of the Visitor module.
  // UX only: the backend rejects the request regardless.
  const canExit = can('visitor.entry.update');
  // Prompt #19 ┬º19 ΓÇö printing the physical document is its own capability, so it
  // has its own permission (`visitor.slip.print`) and a role may hold one
  // without the other. A hidden button is UX only; the slip endpoint is guarded.
  const canPrintSlip = can('visitor.slip.print');

  // ΓöÇΓöÇ List state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [rows, setRows] = useState<VisitorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  // ┬º19 ΓÇö the day window is computed by the SERVER, never in the browser.
  const [todayOnly, setTodayOnly] = useState(false);

  // ΓöÇΓöÇ Division master (client-side intersection with the caller scope) ΓöÇΓöÇΓöÇ
  const [divisionRows, setDivisionRows] = useState<DivisionRow[] | null>(null);

  // ΓöÇΓöÇ New visitor modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [form] = Form.useForm();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<VisitorRow | null>(null);
  const [createdPhotoError, setCreatedPhotoError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [locationOptions, setLocationOptions] = useState<LocationRow[]>([]);
  const [hostOptions, setHostOptions] = useState<HostRow[]>([]);
  const [hostLoading, setHostLoading] = useState(false);

  // ΓöÇΓöÇ Detail ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [detail, setDetail] = useState<VisitorRow | null>(null);
  const [detailPhoto, setDetailPhoto] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ΓöÇΓöÇ Exit confirmation (Prompt #18 ┬º14) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [exitTarget, setExitTarget] = useState<VisitorRow | null>(null);
  const [exiting, setExiting] = useState(false);

  // ΓöÇΓöÇ Slip + host confirmation (Prompt #19) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  /** The visitor whose slip preview is open; opening it never mutates data. */
  const [slipTarget, setSlipTarget] = useState<VisitorRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<VisitorRow | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [confirmNote, setConfirmNote] = useState<string>('');

  const divisionId = Form.useWatch('divisionId', form);
  const hostSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ΓöÇΓöÇ Divisions the caller may use ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    let cancelled = false;
    apiService
      .get<{ data?: DivisionRow[] }>('/divisions', { limit: 500, status: 'ACTIVE' })
      .then((res) => {
        if (!cancelled) setDivisionRows(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setDivisionRows(null); // let the picker fall back to its own load
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const divisionOptions = useMemo<DivisionRow[] | null>(() => {
    if (divisionRows === null) return null;
    if (divisionsUnrestricted) return divisionRows;
    const allowed = new Set(allowedDivisionIds);
    return divisionRows.filter((row) => allowed.has(row.id));
  }, [divisionRows, divisionsUnrestricted, allowedDivisionIds]);

  // ΓöÇΓöÇ List loader ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pageSize };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (todayOnly) params.today = true;
      const res = await apiService.get<{ data?: VisitorRow[]; total?: number }>(
        '/visitor/entries',
        params,
      );
      setRows(Array.isArray(res?.data) ? res.data : []);
      setTotal(Number(res?.total ?? 0));
    } catch (err: any) {
      setRows([]);
      setTotal(0);
      if (err?.response?.status === 403) {
        message.error('You do not have permission to view visitor entries.');
      } else {
        message.error(formatApiError(err, 'Could not load visitor entries'));
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, todayOnly, message]);

  useEffect(() => {
    void load();
  }, [load]);

  // ΓöÇΓöÇ Division ΓåÆ Location / Host dependency (┬º17) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    // A location (or host) picked for the previous division must never survive
    // a division change ΓÇö clear it, then reload both lists for the new one.
    form.setFieldValue('locationId', undefined);
    form.setFieldValue('hostEmployeeId', undefined);
    setLocationOptions([]);
    setHostOptions([]);

    if (!divisionId) return undefined;
    let cancelled = false;

    apiService
      .get<{ data?: LocationRow[] }>('/locations', {
        divisionId,
        status: 'ACTIVE',
        limit: 500,
      })
      .then((res) => {
        if (!cancelled) {
          setLocationOptions(Array.isArray(res?.data) ? res.data : []);
        }
      })
      .catch(() => {
        if (!cancelled) setLocationOptions([]);
      });

    apiService
      .get<{ data?: HostRow[] }>('/visitor/hosts', { divisionId, limit: 100 })
      .then((res) => {
        if (!cancelled) setHostOptions(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setHostOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [divisionId, form]);

  useEffect(
    () => () => {
      if (hostSearchRef.current) clearTimeout(hostSearchRef.current);
    },
    [],
  );

  const onHostSearch = useCallback(
    (value: string) => {
      if (hostSearchRef.current) clearTimeout(hostSearchRef.current);
      if (!divisionId) return;
      if (!value.trim()) {
        setHostOptions([]);
        setHostLoading(false);
        void apiService
          .get<{ data?: HostRow[] }>('/visitor/hosts', { divisionId, limit: 100 })
          .then((res) => setHostOptions(Array.isArray(res?.data) ? res.data : []))
          .catch(() => undefined);
        return;
      }
      setHostLoading(true);
      hostSearchRef.current = setTimeout(() => {
        apiService
          .get<{ data?: HostRow[] }>('/visitor/hosts', {
            divisionId,
            search: value.trim(),
            limit: 100,
          })
          .then((res) => setHostOptions(Array.isArray(res?.data) ? res.data : []))
          .catch(() => undefined)
          .finally(() => setHostLoading(false));
      }, 300);
    },
    [divisionId],
  );

  // ΓöÇΓöÇ Create ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const openCreate = () => {
    form.resetFields();
    setCreated(null);
    setCreatedPhotoError(null);
    setPhotoFile(null);
    setLocationOptions([]);
    setHostOptions([]);
    setCreateOpen(true);
  };

  const submit = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return; // antd already highlighted the offending fields
    }

    setSubmitting(true);
    let createdRow: VisitorRow | null = null;
    try {
      const payload: Record<string, unknown> = {
        divisionId: values.divisionId,
        locationId: values.locationId,
        visitorName: String(values.visitorName).trim(),
        cnic: normaliseCnic(String(values.cnic).trim()),
        mobile: normaliseMobile(String(values.mobile)),
        hostEmployeeId: values.hostEmployeeId,
      };
      if (values.visitorCompany && String(values.visitorCompany).trim()) {
        payload.visitorCompany = String(values.visitorCompany).trim();
      }

      // NOTE: no time_in / status / host name ΓÇö the API generates them.
      const res = await apiService.post<{ data: VisitorRow }>('/visitor/entries', payload);
      createdRow = res?.data ?? null;
    } catch (err) {
      message.error(formatApiError(err, 'Could not register the visitor'));
      setSubmitting(false);
      return;
    }

    // Photo is uploaded AFTER the entry exists (the endpoint is entry-scoped).
    // A photo failure never rolls the visitor back ΓÇö it is reported instead.
    let photoError: string | null = null;
    if (photoFile && createdRow?.id) {
      try {
        const formData = new FormData();
        formData.append('file', photoFile, photoFile.name || 'visitor-photo.jpg');
        await apiService.upload(`/visitor/entries/${createdRow.id}/photo`, formData);
      } catch (err) {
        photoError = formatApiError(err, 'The photo could not be uploaded');
      }
    }

    setCreated(createdRow);
    setCreatedPhotoError(photoError);
    setPhotoFile(null);
    setSubmitting(false);
    message.success('Visitor registered successfully');
    void load();
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreated(null);
    setCreatedPhotoError(null);
    setPhotoFile(null);
    form.resetFields();
  };

  // ΓöÇΓöÇ Detail ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const openDetail = useCallback(async (row: VisitorRow) => {
    setDetail(row);
    setDetailPhoto(null);
    setDetailLoading(true);
    try {
      const res = await apiService.get<{ data?: VisitorRow }>(`/visitor/entries/${row.id}`);
      const full = res?.data ?? row;
      setDetail(full);
      if (full.photoUrl && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          const blob = await apiService.getFile(full.photoUrl);
          setDetailPhoto(URL.createObjectURL(blob as Blob));
        } catch {
          setDetailPhoto(null);
        }
      }
    } catch (err) {
      message.error(formatApiError(err, 'Could not open this visitor entry'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [message]);

  useEffect(
    () => () => {
      if (detailPhoto && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(detailPhoto);
      }
    },
    [detailPhoto],
  );

  // ΓöÇΓöÇ Exit / Time-Out (Prompt #18 ┬º14) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  /**
   * The confirmation dialog never mutates anything by itself: a queued row only
   * becomes the target once the user confirms (┬º14).
   */
  const askExit = useCallback((row: VisitorRow) => {
    if (!canExit) {
      message.error('You do not have permission to record a visitor exit.');
      return;
    }
    if (!isOnSite(row)) return; // already checked out ΓÇö the action is hidden
    setExitTarget(row);
  }, [canExit, message]);

  const closeExit = useCallback(() => {
    if (exiting) return; // never leave the dialog while the request is in flight
    setExitTarget(null);
  }, [exiting]);

  /**
   * Confirm ΓåÆ PATCH .../exit. No Time-Out is ever sent: the server generates it
   * (┬º4). The list row is replaced with the server's own response, so the table
   * can never show a Time-Out the backend did not record.
   */
  const confirmExit = useCallback(async () => {
    if (!exitTarget) return;
    setExiting(true);
    try {
      const res = await apiService.patch<{ data?: VisitorRow }>(
        `/visitor/entries/${exitTarget.id}/exit`,
      );
      const updated = res?.data ?? null;
      setExitTarget(null);
      message.success(
        updated?.timeOut
          ? `Visitor exit recorded at ${formatDateTime(updated.timeOut)}`
          : 'Visitor exit recorded',
      );
      if (updated) {
        setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        setDetail((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      }
      // A status/day filter decides whether the closed visit still belongs in
      // the current view, so refetch whenever one is active.
      if (statusFilter || todayOnly) void load();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        // Lost the race or the visit was closed by someone else ΓÇö re-read the
        // truth rather than guessing what happened (┬º15).
        message.error(formatApiError(err, 'Visitor has already checked out'));
        setExitTarget(null);
        void load();
        if (detail?.id === exitTarget.id) void openDetail(exitTarget);
      } else if (status === 403) {
        message.error(formatApiError(err, 'You do not have permission to record this visitor exit'));
        setExitTarget(null);
      } else {
        message.error(formatApiError(err, 'Could not record the visitor exit'));
      }
    } finally {
      setExiting(false);
    }
  }, [exitTarget, detail, statusFilter, todayOnly, load, openDetail, message]);

  // ΓöÇΓöÇ Slip print / re-print (Prompt #19 ┬º9/┬º10/┬º11) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  /**
   * Opening the preview performs NO write: `VisitorSlipPreview` only issues GET
   * requests for the slip and its images (┬º9). Printing is also allowed for a
   * COMPLETED visitor ΓÇö a closed visit stays printable and then shows the real
   * Time-In + Time-Out (┬º29).
   */
  const openSlip = useCallback(
    (row: VisitorRow | null) => {
      if (!row) return;
      if (!canPrintSlip) {
        message.error('You do not have permission to print a visitor slip.');
        return;
      }
      setSlipTarget(row);
    },
    [canPrintSlip, message],
  );

  // ΓöÇΓöÇ Host confirmation (Prompt #19 ┬º12/┬º15/┬º16) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  /**
   * Open the confirmation dialog. Nothing is sent until the user confirms ΓÇö the
   * dialog itself never mutates state.
   */
  const askHostConfirmation = useCallback(
    (row: VisitorRow) => {
      if (!canExit) {
        message.error('You do not have permission to record a host confirmation.');
        return;
      }
      // ┬º16 ΓÇö the action disappears once the host has confirmed; a second
      // confirmation would overwrite the first `confirmed_at`.
      if (row.hostConfirmed) return;
      setSignature(null);
      setConfirmNote('');
      setConfirmTarget(row);
    },
    [canExit, message],
  );

  const closeHostConfirmation = useCallback(() => {
    if (confirming) return; // never leave the dialog while the request is in flight
    setConfirmTarget(null);
    setSignature(null);
    setConfirmNote('');
  }, [confirming]);

  /**
   * Confirm ΓåÆ POST .../host-confirmation. The client sends ONLY the optional
   * signature and note: `host_confirmed*` and every Time-Out field are the
   * server's (┬º17, ┬º28) and a payload that tries to state them is a 400.
   *
   * The response is the server's own updated record, so the row and the detail
   * can only ever show a confirmation the backend actually recorded.
   */
  const confirmHost = useCallback(async () => {
    if (!confirmTarget) return;
    setConfirming(true);
    try {
      const payload: Record<string, unknown> = {};
      if (signature) payload.signature = signature;
      if (confirmNote.trim()) payload.note = confirmNote.trim();

      const res = await apiService.post<{ data?: VisitorRow }>(
        `/visitor/entries/${confirmTarget.id}/host-confirmation`,
        payload,
      );
      const updated = res?.data ?? null;
      setConfirmTarget(null);
      setSignature(null);
      setConfirmNote('');
      message.success('Host visit confirmed');
      if (updated) {
        setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        setDetail((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        // Someone else confirmed first, or a double-click. Re-read the truth.
        message.error(formatApiError(err, 'Host visit has already been confirmed'));
        setConfirmTarget(null);
        void load();
        if (detail?.id === confirmTarget.id) void openDetail(confirmTarget);
      } else if (status === 403) {
        message.error(formatApiError(err, 'You do not have permission to record this host confirmation'));
        setConfirmTarget(null);
      } else {
        message.error(formatApiError(err, 'Could not confirm the host visit'));
      }
    } finally {
      setConfirming(false);
    }
  }, [confirmTarget, signature, confirmNote, detail, load, openDetail, message]);

  // ΓöÇΓöÇ Columns ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const columns: ColumnsType<VisitorRow> = useMemo(
    () => [
      {
        // ┬º5 ΓÇö the reception reference is what security quotes, so it leads the
        // row rather than being buried at the end.
        title: 'Visitor ID',
        dataIndex: 'visitorReference',
        key: 'visitorReference',
        width: 150,
        render: (v: string | null, row) =>
          v ? (
            <Typography.Text code data-testid={`visitor-ref-${row.id}`}>
              {v}
            </Typography.Text>
          ) : (
            'ΓÇö'
          ),
      },
      {
        title: 'Visitor Name',
        dataIndex: 'visitorName',
        key: 'visitorName',
        width: 180,
        render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        title: 'CNIC',
        dataIndex: 'cnic',
        key: 'cnic',
        width: 140,
        // Server masks it in list responses; the detail view shows it in full.
        render: (value: string | null) => value || 'ΓÇö',
      },
      { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', width: 130, render: (v: string | null) => v || 'ΓÇö' },
      {
        title: 'Visitor Company',
        dataIndex: 'visitorCompany',
        key: 'visitorCompany',
        width: 160,
        render: (v: string | null) => v || 'ΓÇö',
      },
      {
        title: 'Host',
        dataIndex: 'hostNameSnapshot',
        key: 'hostNameSnapshot',
        width: 170,
        render: (v: string | null) => v || 'ΓÇö',
      },
      {
        title: 'Division',
        key: 'division',
        width: 170,
        render: (_, row) =>
          row.division ? `${row.division.divisionCode} ┬╖ ${row.division.name}` : row.divisionId,
      },
      {
        title: 'Location',
        key: 'location',
        width: 150,
        render: (_, row) => (row.location ? `${row.location.locationCode} ┬╖ ${row.location.name}` : row.locationId),
      },
      {
        title: 'Time-In',
        dataIndex: 'timeIn',
        key: 'timeIn',
        width: 150,
        render: (v: string) => formatDateTime(v),
      },
      {
        title: 'Time-Out',
        dataIndex: 'timeOut',
        key: 'timeOut',
        width: 150,
        // ┬º11/┬º20 ΓÇö the pending state is spelled out, not only coloured.
        render: (v: string | null, row) =>
          v ? (
            <span data-testid={`visitor-timeout-${row.id}`}>{formatDateTime(v)}</span>
          ) : isOnSite(row) ? (
            <Tag color="orange" data-testid={`visitor-timeout-pending-${row.id}`}>
              Pending
            </Tag>
          ) : (
            <span data-testid={`visitor-timeout-${row.id}`}>ΓÇö</span>
          ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: string) => (
          <Tag color={STATUS_TAG_COLOR[status] ?? 'default'} data-testid={`visitor-status-${status}`}>
            {status}
          </Tag>
        ),
      },
      {
        // ┬º16 ΓÇö the host confirmation is its own column so a still-on-site
        // visitor can be seen as "host confirmed, not yet departed".
        title: 'Host Confirmation',
        key: 'hostConfirmed',
        width: 160,
        render: (_, row) =>
          row.hostConfirmed ? (
            <Tag color="blue" data-testid={`visitor-host-confirmed-${row.id}`}>
              Confirmed
            </Tag>
          ) : (
            <Tag data-testid={`visitor-host-pending-${row.id}`}>Pending</Tag>
          ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: canExit || canPrintSlip ? 260 : 90,
        render: (_, row) => (
          <Space size={4}>
            {canPrintSlip && (
              <Button
                size="small"
                icon={<PrinterOutlined />}
                onClick={() => openSlip(row)}
                data-testid={`visitor-slip-${row.id}`}
              >
                Print Slip
              </Button>
            )}
            {canExit && isOnSite(row) && (
              <Button
                size="small"
                icon={<ClockCircleOutlined />}
                onClick={() => askExit(row)}
                data-testid={`visitor-exit-${row.id}`}
              >
                Time Out
              </Button>
            )}
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => void openDetail(row)}
              data-testid={`visitor-view-${row.id}`}
            >
              View
            </Button>
          </Space>
        ),
      },
    ],
    [canExit, canPrintSlip, askExit, openSlip, openDetail],
  );

  const statusOptions = [
    { value: 'PENDING', label: 'Pending (still on site)' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'INSIDE', label: 'Inside' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <div data-testid="visitor-page">
      <PageHeader
        icon={<UserOutlined />}
        title="Visitors"
        subtitle="Visitor Management ΓÇö gate register with server-side Time-In"
      />

      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <Typography.Text type="secondary">
            Time-In is generated by the server when the visitor is registered. Time-Out is generated by the server on
            exit.
          </Typography.Text>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} data-testid="visitor-refresh">
              Refresh
            </Button>
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} data-testid="new-visitor-button">
                New Visitor
              </Button>
            )}
          </Space>
        </div>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={8}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search name, company, host, mobileΓÇª"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              data-testid="visitor-search"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div data-testid="visitor-status-filter">
              <Select
                allowClear
                style={{ width: '100%' }}
                placeholder="All visitors"
                options={statusOptions}
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={10}>
            <Space wrap>
              <Switch
                checked={todayOnly}
                onChange={(checked) => {
                  setTodayOnly(checked);
                  setPage(1);
                }}
                data-testid="visitor-today-only"
              />
              <Typography.Text>Today only</Typography.Text>
              <Tag data-testid="visitor-filter-summary">
                {statusFilter ?? 'ALL'}
                {todayOnly ? ' ┬╖ TODAY' : ''}
              </Tag>
            </Space>
          </Col>
        </Row>

        <Table<VisitorRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          locale={{
            emptyText: loading ? <Spin size="small" /> : <Empty description="No visitor entries yet" />,
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `${count} visitor${count === 1 ? '' : 's'}`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      {/* ΓöÇΓöÇ New visitor ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <Modal
        title={created ? 'Visitor Registered' : 'New Visitor'}
        open={createOpen}
        onCancel={closeCreate}
        footer={null}
        width={760}
        data-testid="new-visitor-modal"
      >
        {created ? (
          <div data-testid="visitor-created">
            <Typography.Paragraph type="success">
              Visitor registered successfully.
            </Typography.Paragraph>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Visitor ID">
                <span data-testid="created-visitor-reference">{created.visitorReference || 'ΓÇö'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Visitor">{created.visitorName}</Descriptions.Item>
              <Descriptions.Item label="Host">{created.hostNameSnapshot || 'ΓÇö'}</Descriptions.Item>
              <Descriptions.Item label="Division">
                {created.division ? `${created.division.divisionCode} ┬╖ ${created.division.name}` : created.divisionId}
              </Descriptions.Item>
              <Descriptions.Item label="Location">
                {created.location ? `${created.location.locationCode} ┬╖ ${created.location.name}` : created.locationId}
              </Descriptions.Item>
              <Descriptions.Item label="Time-In">
                {/* Display-only: the server generated it, the client cannot edit it. */}
                <span data-testid="created-time-in">{formatDateTime(created.timeIn)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Time-Out">
                <span data-testid="created-time-out">ΓÇö</span>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_TAG_COLOR[created.status] ?? 'default'} data-testid="created-status">
                  {created.status}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            {createdPhotoError && (
              <Typography.Paragraph type="warning" style={{ marginTop: 12 }} data-testid="created-photo-warning">
                The visitor was saved, but the photo could not be uploaded: {createdPhotoError}
              </Typography.Paragraph>
            )}
            {/* ┬º25 ΓÇö the record is already saved at this point, so the slip is
                generated from the STORED row. Cancelling the print leaves the
                registration completely valid and re-printable from the list or
                from Visitor Detail. */}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {canPrintSlip && (
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => openSlip(created)}
                  data-testid="created-print-slip"
                >
                  Print Visitor Slip
                </Button>
              )}
              <Button type="primary" onClick={closeCreate} data-testid="created-close">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <Form form={form} layout="vertical" data-testid="visitor-form">
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Division"
                  name="divisionId"
                  rules={[{ required: true, message: 'Please select a division' }]}
                >
                  <DivisionSelect divisions={divisionOptions} placeholder="Select division" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Location"
                  name="locationId"
                  rules={[{ required: true, message: 'Please select a location for this division' }]}
                >
                  <Select
                    placeholder="Select location"
                    options={locationOptions.map((loc) => ({
                      value: loc.id,
                      label: `${loc.locationCode} ┬╖ ${loc.name}`,
                    }))}
                    notFoundContent={divisionId ? 'No locations in this division' : 'Select a division first'}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Visitor Name"
                  name="visitorName"
                  rules={[
                    { required: true, message: 'Please enter the visitor name' },
                    { max: 255, message: 'Visitor name is too long' },
                  ]}
                >
                  <Input placeholder="Full name" data-testid="visitor-form-name" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="CNIC"
                  name="cnic"
                  rules={[
                    { required: true, message: 'Please enter the CNIC' },
                    {
                      pattern: CNIC_SHAPE,
                      message: 'CNIC must be 13 digits or formatted as 00000-0000000-0',
                    },
                  ]}
                >
                  <Input placeholder="12345-1234567-1" maxLength={15} data-testid="visitor-form-cnic" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Mobile Number"
                  name="mobile"
                  rules={[
                    { required: true, message: 'Please enter the mobile number' },
                    {
                      validator: (_, value) =>
                        !value || MOBILE_SHAPE.test(normaliseMobile(String(value)))
                          ? Promise.resolve()
                          : Promise.reject(new Error('Mobile number must be a valid number, e.g. 0300-1234567')),
                    },
                  ]}
                >
                  <Input placeholder="0300-1234567" maxLength={20} data-testid="visitor-form-mobile" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Visitor Company / Source" name="visitorCompany">
                  <Input placeholder="Company or source (optional)" maxLength={255} data-testid="visitor-form-company" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              label="Person Being Visited"
              name="hostEmployeeId"
              rules={[{ required: true, message: 'Please select the person being visited' }]}
            >
              <Select
                showSearch
                allowClear
                filterOption={false}
                loading={hostLoading}
                placeholder="Search employeeΓÇª"
                onSearch={onHostSearch}
                options={hostOptions.map((host) => ({
                  value: host.id,
                  label: `${host.name} ┬╖ ${host.employeeCode}`,
                }))}
                notFoundContent={divisionId ? 'No matching employee' : 'Select a division first'}
              />
            </Form.Item>
            <Form.Item label="Visitor Photo" required={false}>
              <PhotoCapture
                value={photoFile}
                onChange={setPhotoFile}
                disabled={submitting}
                testId="visitor-photo"
                hint="Take Photo (camera) or Upload Photo as a fallback ┬╖ preview shown before saving"
              />
            </Form.Item>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={closeCreate} data-testid="new-visitor-cancel">
                Cancel
              </Button>
              <Button
                type="primary"
                loading={submitting}
                onClick={() => void submit()}
                data-testid="new-visitor-submit"
              >
                Register Visitor
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      {/* ΓöÇΓöÇ Detail ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <Modal
        title="Visitor Detail"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={
          detail ? (
            <Space wrap>
              <Button onClick={() => setDetail(null)} data-testid="visitor-detail-close">
                Close
              </Button>
              {/* ┬º10/┬º29 ΓÇö re-print is available from the detail of a PENDING *and*
                  a COMPLETED visitor, straight from the stored record. */}
              {canPrintSlip && (
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => openSlip(detail)}
                  data-testid="visitor-detail-print"
                >
                  Print Visitor Slip
                </Button>
              )}
              {canExit && !detail.hostConfirmed && (
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={() => askHostConfirmation(detail)}
                  data-testid="visitor-detail-confirm-host"
                >
                  Confirm Host Visit
                </Button>
              )}
              {canExit && isOnSite(detail) && (
                <Button
                  danger
                  type="primary"
                  icon={<ClockCircleOutlined />}
                  onClick={() => askExit(detail)}
                  data-testid="visitor-detail-exit"
                >
                  Time Out
                </Button>
              )}
            </Space>
          ) : null
        }
        width={720}
        data-testid="visitor-detail-modal"
      >
        {detailLoading ? (
          <Spin style={{ display: 'block', margin: '24px auto' }} />
        ) : detail ? (
          <div data-testid="visitor-detail">
            <Row gutter={16}>
              <Col span={10}>
                {detailPhoto ? (
                  <img
                    src={detailPhoto}
                    alt={`Visitor ${detail.visitorName}`}
                    data-testid="visitor-detail-photo"
                    style={{ width: '100%', borderRadius: 8, border: '1px solid #d9d9d9' }}
                  />
                ) : (
                  <div
                    data-testid="visitor-detail-photo-placeholder"
                    style={{
                      height: 160,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px dashed #d9d9d9',
                      borderRadius: 8,
                      color: '#999',
                    }}
                  >
                    {detail.hasPhoto ? 'Photo loadingΓÇª' : 'No photo'}
                  </div>
                )}
              </Col>
              <Col span={14}>
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="Visitor ID">
                    <span data-testid="detail-visitor-reference">
                      {detail.visitorReference || 'ΓÇö'}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Visitor">{detail.visitorName}</Descriptions.Item>
                  <Descriptions.Item label="CNIC">{detail.cnic || 'ΓÇö'}</Descriptions.Item>
                  <Descriptions.Item label="Mobile">{detail.mobile || 'ΓÇö'}</Descriptions.Item>
                  <Descriptions.Item label="Visitor Company">
                    {detail.visitorCompany || 'ΓÇö'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Host">{detail.hostNameSnapshot || 'ΓÇö'}</Descriptions.Item>
                  <Descriptions.Item label="Division">
                    {detail.division
                      ? `${detail.division.divisionCode} ┬╖ ${detail.division.name}`
                      : detail.divisionId}
                  </Descriptions.Item>
                  <Descriptions.Item label="Location">
                    {detail.location
                      ? `${detail.location.locationCode} ┬╖ ${detail.location.name}`
                      : detail.locationId}
                  </Descriptions.Item>
                  <Descriptions.Item label="Time-In">{formatDateTime(detail.timeIn)}</Descriptions.Item>
                  <Descriptions.Item label="Time-Out">
                    {detail.timeOut ? (
                      <span data-testid="detail-time-out">{formatDateTime(detail.timeOut)}</span>
                    ) : isOnSite(detail) ? (
                      <Tag color="orange" data-testid="detail-time-out-pending">
                        Pending
                      </Tag>
                    ) : (
                      'ΓÇö'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Tag color={STATUS_TAG_COLOR[detail.status] ?? 'default'}>{detail.status}</Tag>
                  </Descriptions.Item>
                  {/* ┬º16/┬º24 ΓÇö host confirmation state, with the actor and moment. */}
                  <Descriptions.Item label="Host Confirmation">
                    {detail.hostConfirmed ? (
                      <span data-testid="detail-host-confirmed">
                        <Tag color="blue">Confirmed</Tag>
                      </span>
                    ) : (
                      <span data-testid="detail-host-pending">
                        <Tag>Pending</Tag>
                      </span>
                    )}
                  </Descriptions.Item>
                  {detail.hostConfirmed && (
                    <>
                      <Descriptions.Item label="Confirmed By">
                        <span data-testid="detail-host-confirmed-by">
                          {detail.hostConfirmedBy || 'ΓÇö'}
                        </span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Confirmed At">
                        <span data-testid="detail-host-confirmed-at">
                          {formatDateTime(detail.hostConfirmedAt)}
                        </span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Signature">
                        <span data-testid="detail-signature-status">
                          {detail.hasSignature ? 'Captured' : 'Not captured (physical slip only)'}
                        </span>
                      </Descriptions.Item>
                    </>
                  )}
                  <Descriptions.Item label="Created At">{formatDateTime(detail.createdAt)}</Descriptions.Item>
                  <Descriptions.Item label="Created By">{detail.createdBy || 'ΓÇö'}</Descriptions.Item>
                  {/* ┬º17 ΓÇö who recorded the Time-Out, once the visit is closed. */}
                  {detail.timeOut && (
                    <Descriptions.Item label="Exit Recorded By">
                      <span data-testid="detail-exited-by">{detail.exitedBy || 'ΓÇö'}</span>
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* ┬º17 ΓÇö stated once, plainly, so nobody reads "Confirmed By" as
                    proof that the person who clicked is the person being visited. */}
                <Typography.Paragraph
                  type="secondary"
                  style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}
                  data-testid="detail-host-identity-note"
                >
                  Host confirmation records the signed-in ERP user as the confirming party. The
                  system does not verify that this user is the selected host.
                </Typography.Paragraph>
              </Col>
            </Row>
          </div>
        ) : null}
      </Modal>

      {/* ΓöÇΓöÇ Confirm exit (Prompt #18 ┬º14) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <Modal
        title="Confirm Visitor Exit"
        open={!!exitTarget}
        onCancel={closeExit}
        maskClosable={!exiting}
        closable={!exiting}
        width={520}
        data-testid="visitor-exit-modal"
        footer={
          <Space>
            <Button onClick={closeExit} disabled={exiting} data-testid="visitor-exit-cancel">
              Cancel
            </Button>
            <Button
              danger
              type="primary"
              loading={exiting}
              onClick={() => void confirmExit()}
              data-testid="visitor-exit-confirm"
            >
              Confirm Time-Out
            </Button>
          </Space>
        }
      >
        {exitTarget && (
          <div data-testid="visitor-exit-body">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Visitor">{exitTarget.visitorName}</Descriptions.Item>
              <Descriptions.Item label="Host">{exitTarget.hostNameSnapshot || 'ΓÇö'}</Descriptions.Item>
              <Descriptions.Item label="Division">
                {exitTarget.division
                  ? `${exitTarget.division.divisionCode} ┬╖ ${exitTarget.division.name}`
                  : exitTarget.divisionId}
              </Descriptions.Item>
              <Descriptions.Item label="Location">
                {exitTarget.location
                  ? `${exitTarget.location.locationCode} ┬╖ ${exitTarget.location.name}`
                  : exitTarget.locationId}
              </Descriptions.Item>
              <Descriptions.Item label="Time-In">
                <span data-testid="visitor-exit-time-in">{formatDateTime(exitTarget.timeIn)}</span>
              </Descriptions.Item>
            </Descriptions>
            <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
              Are you sure this visitor has exited the premises?
            </Typography.Paragraph>
            <Typography.Text type="secondary">
              The Time-Out is recorded by the system at the moment you confirm.
            </Typography.Text>
          </div>
        )}
      </Modal>

      {/* ΓöÇΓöÇ Confirm host visit (Prompt #19 ┬º12/┬º16) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <Modal
        title="Confirm Host Visit"
        open={!!confirmTarget}
        onCancel={closeHostConfirmation}
        maskClosable={!confirming}
        closable={!confirming}
        width={620}
        data-testid="visitor-host-modal"
        footer={
          <Space>
            <Button onClick={closeHostConfirmation} disabled={confirming} data-testid="visitor-host-cancel">
              Cancel
            </Button>
            <Button
              type="primary"
              loading={confirming}
              onClick={() => void confirmHost()}
              data-testid="visitor-host-confirm"
            >
              Confirm Host Visit
            </Button>
          </Space>
        }
      >
        {confirmTarget && (
          <div data-testid="visitor-host-body">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Visitor">{confirmTarget.visitorName}</Descriptions.Item>
              <Descriptions.Item label="Host (Person Being Visited)">
                {confirmTarget.hostNameSnapshot || 'ΓÇö'}
              </Descriptions.Item>
              <Descriptions.Item label="Division">
                {confirmTarget.division
                  ? `${confirmTarget.division.divisionCode} ┬╖ ${confirmTarget.division.name}`
                  : confirmTarget.divisionId}
              </Descriptions.Item>
              <Descriptions.Item label="Time-In">
                <span data-testid="visitor-host-time-in">{formatDateTime(confirmTarget.timeIn)}</span>
              </Descriptions.Item>
            </Descriptions>

            <Alert
              type="info"
              showIcon
              style={{ margin: '12px 0' }}
              data-testid="visitor-host-exit-note"
              message="Confirming the host visit does NOT record the visitor's departure."
              description="The visitor stays PENDING (still on site) until the exit records a Time-Out."
            />

            <Typography.Paragraph style={{ marginBottom: 4 }}>
              Digital signature (optional)
            </Typography.Paragraph>
            <SignaturePad
              value={signature}
              onChange={setSignature}
              disabled={confirming}
              testId="visitor-host-signature"
            />

            <Form.Item
              label="Note (optional, recorded in the audit log only)"
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              <Input.TextArea
                rows={2}
                maxLength={200}
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                disabled={confirming}
                data-testid="visitor-host-note"
                placeholder="e.g. Host received the visitor at the department"
              />
            </Form.Item>
          </div>
        )}
      </Modal>

      {/* ΓöÇΓöÇ Print / re-print the slip (Prompt #19 ┬º9/┬º10) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <VisitorSlipPreview
        open={!!slipTarget}
        visitorId={slipTarget?.id ?? null}
        visitorLabel={slipTarget?.visitorReference ?? null}
        onClose={() => setSlipTarget(null)}
      />
    </div>
  );
}

export default VisitorManagement;
