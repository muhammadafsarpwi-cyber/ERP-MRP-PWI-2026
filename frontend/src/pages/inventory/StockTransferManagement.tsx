import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Button, Tag, Modal, Form, Input, Select, App,
  InputNumber, Row, Col, Tooltip, Spin,
  Tabs, Badge, Card, Alert, Timeline, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, InfoCircleOutlined,
  ArrowRightOutlined, CheckCircleOutlined,
  CloseCircleOutlined, RollbackOutlined, SendOutlined,
  AuditOutlined, DeleteOutlined, ClockCircleOutlined,
  ThunderboltOutlined, ExclamationCircleOutlined,
  BarcodeOutlined, AppstoreOutlined, ShopOutlined,
  SwapOutlined, CalculatorOutlined, TagOutlined,
  UserOutlined, CalendarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableActions, TableToolbar } from '../../components/shared/ERPTable';
import { usePermission } from '../../hooks/usePermission';
import { useNavBadgeStore } from '../../components/layout/navBadgeStore';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface StockTransfer {
  id: string;
  transferNumber: string;
  transferCode?: string;
  companyId?: string;
  fromWarehouseId: string;
  fromWarehouseName?: string;
  fromWarehouseCode?: string;
  toWarehouseId: string;
  toWarehouseName?: string;
  toWarehouseCode?: string;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  quantity: number;
  uomCode?: string;
  status: string;
  notes?: string;

  // Audit & Workflow fields
  createdBy?: string;
  createdByUser?: { id: string; displayName: string; email: string };
  createdAt?: string;

  submittedBy?: string;
  submittedByUser?: { id: string; displayName: string; email: string };
  submittedAt?: string;

  approvedBy?: string;
  approvedByUser?: { id: string; displayName: string; email: string };
  approvedAt?: string;
  approvalRemarks?: string;

  returnedBy?: string;
  returnedByUser?: { id: string; displayName: string; email: string };
  returnedAt?: string;
  returnReason?: string;
  returnRemarks?: string;

  rejectedBy?: string;
  rejectedByUser?: { id: string; displayName: string; email: string };
  rejectedAt?: string;
  rejectionReason?: string;
  rejectionRemarks?: string;

  postedBy?: string;
  postedByUser?: { id: string; displayName: string; email: string };
  postedAt?: string;

  lines?: any[];
}

export interface StockTransferHistoryItem {
  id: string;
  transferId: string;
  action: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'POSTED' | 'CANCELLED';
  previousStatus?: string;
  newStatus?: string;
  performedBy?: string;
  performedByUser?: { id: string; displayName: string; email: string };
  reason?: string;
  remarks?: string;
  createdAt: string;
}

export interface LiveStockTransferImpact {
  transferId: string;
  transferCode: string;
  status: string;
  hasLine: boolean;
  item: {
    id: string;
    itemCode: string;
    name: string;
    uom: string;
  };
  source: {
    warehouseId: string;
    warehouseName: string;
    onHand: number;
    available: number;
    transferQty: number;
    projectedBalance: number;
  };
  destination: {
    warehouseId: string;
    warehouseName: string;
    onHand: number;
    available: number;
    transferQty: number;
    projectedBalance: number;
  };
  isSufficient: boolean;
  negativeStockAllowed: boolean;
}

interface DropdownOption {
  id: string;
  name: string;
  itemCode?: string;
  warehouseCode?: string;
  code?: string;
  baseUom?: any;
  uom?: any;
}

interface TransferCounts {
  total: number;
  all?: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  returned: number;
  rejected: number;
  posted: number;
}

interface WarehouseBalanceInfo {
  onHand: number;
  available: number;
  reserved: number;
  uomCode: string;
  whName?: string;
  whCode?: string;
}

// ============================================================
// STATUS CONFIGURATION & BADGES
// ============================================================

const statusBadgeConfig: Record<string, { color: string; label: string; icon?: React.ReactNode }> = {
  DRAFT: { color: 'default', label: 'Draft', icon: <EditOutlined /> },
  PENDING_APPROVAL: { color: 'orange', label: 'Pending Approval', icon: <ClockCircleOutlined /> },
  SUBMITTED: { color: 'orange', label: 'Pending Approval', icon: <ClockCircleOutlined /> },
  RETURNED: { color: 'warning', label: 'Returned', icon: <RollbackOutlined /> },
  APPROVED: { color: 'success', label: 'Approved', icon: <CheckCircleOutlined /> },
  REJECTED: { color: 'error', label: 'Rejected', icon: <CloseCircleOutlined /> },
  POSTED: { color: 'processing', label: 'Posted to Ledger', icon: <ThunderboltOutlined /> },
  COMPLETED: { color: 'processing', label: 'Posted to Ledger', icon: <ThunderboltOutlined /> },
  CANCELLED: { color: 'default', label: 'Cancelled', icon: <CloseCircleOutlined /> },
};

export const RenderStatusTag: React.FC<{ status: string }> = ({ status }) => {
  const norm = status === 'SUBMITTED' ? 'PENDING_APPROVAL' : status;
  const cfg = statusBadgeConfig[norm] || { color: 'default', label: norm };
  return (
    <Tag color={cfg.color} icon={cfg.icon} className="erp-table-tag" style={{ fontWeight: 600 }}>
      {cfg.label}
    </Tag>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

interface StockTransferManagementProps {
  defaultTab?: string;
}

const StockTransferManagement: React.FC<StockTransferManagementProps> = ({ defaultTab }) => {
  const { message } = App.useApp();
  const { user, can } = usePermission();
  const location = useLocation();

  const isPendingApprovalRoute = location.pathname.includes('pending-approval') || defaultTab === 'PENDING_APPROVAL';

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [counts, setCounts] = useState<TransferCounts>({
    total: 0,
    all: 0,
    draft: 0,
    pendingApproval: 0,
    approved: 0,
    returned: 0,
    rejected: 0,
    posted: 0,
  });

  const [activeTab, setActiveTab] = useState<string>(isPendingApprovalRoute ? 'PENDING_APPROVAL' : defaultTab || 'ALL');

  useEffect(() => {
    if (isPendingApprovalRoute && activeTab !== 'PENDING_APPROVAL') {
      setActiveTab('PENDING_APPROVAL');
      setPage(1);
    }
  }, [isPendingApprovalRoute, activeTab]);

  const [search, setSearch] = useState('');
  const [filterFromWarehouse, setFilterFromWarehouse] = useState<string | undefined>(undefined);
  const [filterToWarehouse, setFilterToWarehouse] = useState<string | undefined>(undefined);

  // Modals state
  const [createEditModalOpen, setCreateEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockTransfer | null>(null);

  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvingItem, setApprovingItem] = useState<StockTransfer | null>(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<StockTransfer | null>(null);

  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postingItem, setPostingItem] = useState<StockTransfer | null>(null);

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submittingItem, setSubmittingItem] = useState<StockTransfer | null>(null);

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);

  // Permissions
  const canCreate = can('inventory.transfer.create');
  const canSubmit = can('inventory.transfer.create');
  const canApprove = can('inventory.transfer.approve');
  const canPost = can('inventory.transfer.post');

  // Load Counts
  const fetchCounts = useCallback(async () => {
    try {
      const res = await apiService.get<any>('/inventory/transfers/counts');
      const raw = res?.data || res || {};
      const total = Number(raw.total ?? raw.all ?? 0);
      const mapped: TransferCounts = {
        total,
        all: total,
        draft: Number(raw.draft ?? 0),
        pendingApproval: Number(raw.pendingApproval ?? 0),
        approved: Number(raw.approved ?? 0),
        returned: Number(raw.returned ?? 0),
        rejected: Number(raw.rejected ?? 0),
        posted: Number(raw.posted ?? 0),
      };
      setCounts(mapped);
      useNavBadgeStore.getState().setNavBadge('/inventory/transfers/pending-approval', mapped.pendingApproval);
    } catch (err) {
      console.error('Failed to load transfer counts', err);
    }
  }, []);

  // Load Transfers
  const fetchTransfers = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterFromWarehouse) params.fromWarehouseId = filterFromWarehouse;
      if (filterToWarehouse) params.toWarehouseId = filterToWarehouse;

      if (activeTab !== 'ALL') {
        params.status = activeTab;
      }

      const response = await apiService.get<{ data: any[]; total: number }>(
        '/inventory/transfers',
        params
      );

      const mapped: StockTransfer[] = (response.data || []).map((t: any) => {
        const line = t.lines?.[0];
        return {
          id: t.id,
          transferNumber: t.transferCode || t.transferNumber || '—',
          transferCode: t.transferCode,
          companyId: t.companyId,
          itemId: line?.itemId || t.itemId || '',
          itemName: line?.item?.name || t.itemName || '—',
          itemCode: line?.item?.itemCode || t.itemCode || '',
          fromWarehouseId: t.fromWarehouseId,
          fromWarehouseName: t.fromWarehouse?.name || t.fromWarehouseName || '—',
          fromWarehouseCode: t.fromWarehouse?.warehouseCode,
          toWarehouseId: t.toWarehouseId,
          toWarehouseName: t.toWarehouse?.name || t.toWarehouseName || '—',
          toWarehouseCode: t.toWarehouse?.warehouseCode,
          quantity: line?.quantity != null ? Number(line.quantity) : (t.quantity != null ? Number(t.quantity) : 0),
          uomCode: line?.uom?.code || line?.item?.baseUom?.code || t.uomCode || 'KG',
          status: t.status,
          notes: t.notes || '',

          createdBy: t.createdBy,
          createdByUser: t.createdByUser,
          createdAt: t.createdAt,

          submittedBy: t.submittedBy,
          submittedByUser: t.submittedByUser,
          submittedAt: t.submittedAt,

          approvedBy: t.approvedBy,
          approvedByUser: t.approvedByUser,
          approvedAt: t.approvedAt,
          approvalRemarks: t.approvalRemarks,

          returnedBy: t.returnedBy,
          returnedByUser: t.returnedByUser,
          returnedAt: t.returnedAt,
          returnReason: t.returnReason,
          returnRemarks: t.returnRemarks,

          rejectedBy: t.rejectedBy,
          rejectedByUser: t.rejectedByUser,
          rejectedAt: t.rejectedAt,
          rejectionReason: t.rejectionReason,
          rejectionRemarks: t.rejectionRemarks,

          postedBy: t.postedBy,
          postedByUser: t.postedByUser,
          postedAt: t.postedAt,

          lines: t.lines || [],
        };
      });

      setTransfers(mapped);
      setTotal(response.total ?? mapped.length);
    } catch (error) {
      message.error('Failed to fetch transfers');
    } finally {
      setLoading(false);
    }
  }, [search, filterFromWarehouse, filterToWarehouse, activeTab, pageSize, message]);

  // Load Dropdowns
  const fetchDropdowns = useCallback(async () => {
    try {
      const [itemRes, warehouseRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 200 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
      ]);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load transfer dropdowns';
      message.error(`Unable to load transfer options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchCounts();
    fetchTransfers(page);
  }, [page, activeTab, fetchTransfers, fetchCounts]);

  // Action handlers
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setPage(1);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setCreateEditModalOpen(true);
  };

  const handleEdit = (record: StockTransfer) => {
    setEditingItem(record);
    setCreateEditModalOpen(true);
  };

  const handleView = (record: StockTransfer) => {
    setDetailItem(record);
    setDetailModalOpen(true);
  };

  const handleOpenApproval = (record: StockTransfer) => {
    setApprovingItem(record);
    setApprovalModalOpen(true);
  };

  const handleOpenPost = (record: StockTransfer) => {
    setPostingItem(record);
    setPostModalOpen(true);
  };

  const handleOpenSubmit = (record: StockTransfer) => {
    setSubmittingItem(record);
    setSubmitModalOpen(true);
  };

  const handleDelete = async (record: StockTransfer) => {
    try {
      await apiService.delete(`/inventory/transfers/${record.id}`);
      message.success(`Stock transfer ${record.transferNumber} deleted successfully`);
      fetchCounts();
      fetchTransfers(page);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete transfer';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    }
  };

  // Tab Badge Helper
  const renderTabBadgeLabel = (
    label: string,
    count: number,
    badgeColor: string,
    tabKey: string
  ) => {
    const isActive = activeTab === tabKey;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: isActive ? 600 : 500,
          color: isActive ? 'var(--theme-text)' : 'var(--theme-text-muted)',
        }}
      >
        <span>{label}</span>
        {count > 0 && (
          <Badge
            count={count}
            overflowCount={999}
            style={{
              backgroundColor: isActive ? badgeColor : 'rgba(148, 163, 184, 0.25)',
              color: isActive ? '#ffffff' : 'var(--theme-text-muted)',
              fontSize: 11,
              fontWeight: 700,
              boxShadow: 'none',
              lineHeight: '16px',
              height: 16,
              padding: '0 5px',
            }}
          />
        )}
      </span>
    );
  };

  // Table Columns
  const columns: ColumnsType<StockTransfer> = [
    {
      title: (
        <span>
          <BarcodeOutlined style={{ marginRight: 6, color: '#38bdf8' }} />
          Transfer #
        </span>
      ),
      dataIndex: 'transferNumber',
      key: 'transferNumber',
      width: 150,
      render: (v: string, record: StockTransfer) => (
        <a
          onClick={() => handleView(record)}
          style={{ fontWeight: 600, color: 'var(--theme-primary, #38bdf8)', cursor: 'pointer' }}
        >
          {v}
        </a>
      ),
    },
    {
      title: (
        <span>
          <AppstoreOutlined style={{ marginRight: 6, color: '#a78bfa' }} />
          Item
        </span>
      ),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
      render: (v: string, record: StockTransfer) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v || '—'}</div>
          {record.itemCode && (
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{record.itemCode}</div>
          )}
        </div>
      ),
    },
    {
      title: (
        <span>
          <ShopOutlined style={{ marginRight: 6, color: '#f87171' }} />
          From Warehouse
        </span>
      ),
      dataIndex: 'fromWarehouseName',
      key: 'fromWarehouseName',
      width: 150,
      render: (wName: string) => <span>{wName || '—'}</span>,
    },
    {
      title: (
        <span>
          <ShopOutlined style={{ marginRight: 6, color: '#34d399' }} />
          To Warehouse
        </span>
      ),
      dataIndex: 'toWarehouseName',
      key: 'toWarehouseName',
      width: 150,
      render: (wName: string) => <span>{wName || '—'}</span>,
    },
    {
      title: (
        <span>
          <CalculatorOutlined style={{ marginRight: 6, color: '#38bdf8' }} />
          Qty
        </span>
      ),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      align: 'right' as const,
      render: (v: unknown) => {
        const num = Number(v) || 0;
        return (
          <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#38bdf8' }}>
            {formatNumber(num, 3)}
          </span>
        );
      },
    },
    {
      title: (
        <span>
          <TagOutlined style={{ marginRight: 6, color: '#fbbf24' }} />
          UOM
        </span>
      ),
      dataIndex: 'uomCode',
      key: 'uomCode',
      width: 75,
      render: (v: string) => <span style={{ color: 'var(--theme-text-muted)' }}>{v || '—'}</span>,
    },
    {
      title: (
        <span>
          <UserOutlined style={{ marginRight: 6, color: '#818cf8' }} />
          Requested By
        </span>
      ),
      key: 'requestedBy',
      width: 145,
      render: (_, r) => {
        const requester = r.submittedByUser?.displayName || r.createdByUser?.displayName || '—';
        return (
          <Tooltip title={r.submittedByUser?.email || r.createdByUser?.email}>
            <span>{requester}</span>
          </Tooltip>
        );
      },
    },
    {
      title: (
        <span>
          <CalendarOutlined style={{ marginRight: 6, color: '#cbd5e1' }} />
          Date
        </span>
      ),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (d: string, r) => {
        const dateVal = r.submittedAt || d;
        return (
          <span style={{ fontSize: 12, color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
            {dateVal ? dayjs(dateVal).format('DD-MMM HH:mm') : '—'}
          </span>
        );
      },
    },
    {
      title: (
        <span>
          <CheckCircleOutlined style={{ marginRight: 6, color: '#4ade80' }} />
          Status
        </span>
      ),
      dataIndex: 'status',
      key: 'status',
      width: 155,
      render: (s: string) => <RenderStatusTag status={s} />,
    },
    {
      title: (
        <span>
          <ThunderboltOutlined style={{ marginRight: 6, color: '#fb923c' }} />
          Actions
        </span>
      ),
      key: 'actions',
      width: 180,
      fixed: 'right',
      align: 'center',
      render: (_, record) => {
        const normStatus = record.status === 'SUBMITTED' ? 'PENDING_APPROVAL' : record.status;
        const isCreator = user?.id && (record.createdBy === user.id || record.submittedBy === user.id);

        return (
          <TableActions>
            {/* View Details always available */}
            <Tooltip title="View Transfer Details & Workflow History">
              <Button
                type="text"
                size="small"
                aria-label="View Transfer Details"
                icon={<EyeOutlined />}
                onClick={() => handleView(record)}
              />
            </Tooltip>

            {/* DRAFT actions */}
            {normStatus === 'DRAFT' && (
              <>
                {canCreate && (
                  <Tooltip title="Edit Draft">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(record)}
                    />
                  </Tooltip>
                )}
                {canSubmit && (
                  <Tooltip title="Submit for Approval">
                    <Button
                      type="text"
                      size="small"
                      style={{ color: '#3b82f6' }}
                      icon={<SendOutlined />}
                      onClick={() => handleOpenSubmit(record)}
                    />
                  </Tooltip>
                )}
                {canCreate && (
                  <Popconfirm
                    title="Delete Draft Transfer?"
                    description="Are you sure you want to delete this draft stock transfer?"
                    onConfirm={() => handleDelete(record)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                  >
                    <Tooltip title="Delete Draft">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                      />
                    </Tooltip>
                  </Popconfirm>
                )}
              </>
            )}

            {/* PENDING_APPROVAL actions */}
            {normStatus === 'PENDING_APPROVAL' && canApprove && (
              <Tooltip title={isCreator ? 'Review Transfer (Self-approval blocked)' : 'Review & Approve / Return / Reject Transfer'}>
                <Button
                  type="primary"
                  size="small"
                  style={{
                    backgroundColor: '#f59e0b',
                    borderColor: '#d97706',
                    color: '#ffffff',
                    fontWeight: 600,
                    padding: '2px 10px',
                    fontSize: 12,
                    height: 26,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: '0 1px 3px rgba(245, 158, 11, 0.4)',
                  }}
                  icon={<AuditOutlined />}
                  onClick={() => handleOpenApproval(record)}
                >
                  Review
                </Button>
              </Tooltip>
            )}

            {/* RETURNED actions */}
            {normStatus === 'RETURNED' && (
              <>
                {canCreate && (
                  <Tooltip title="Edit and Correct Transfer">
                    <Button
                      type="text"
                      size="small"
                      style={{ color: '#f59e0b' }}
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(record)}
                    />
                  </Tooltip>
                )}
                {canSubmit && (
                  <Tooltip title="Resubmit for Approval">
                    <Button
                      type="text"
                      size="small"
                      style={{ color: '#3b82f6' }}
                      icon={<SendOutlined />}
                      onClick={() => handleOpenSubmit(record)}
                    />
                  </Tooltip>
                )}
                {canCreate && (
                  <Popconfirm
                    title="Delete Returned Transfer?"
                    description="Are you sure you want to delete this returned transfer?"
                    onConfirm={() => handleDelete(record)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                  >
                    <Tooltip title="Delete Returned">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                      />
                    </Tooltip>
                  </Popconfirm>
                )}
              </>
            )}

            {/* APPROVED actions */}
            {normStatus === 'APPROVED' && canPost && (
              <Tooltip title="Post Transfer to Inventory Ledger">
                <Button
                  type="primary"
                  size="small"
                  style={{
                    backgroundColor: '#10b981',
                    borderColor: '#059669',
                    color: '#ffffff',
                    fontWeight: 600,
                    padding: '2px 10px',
                    fontSize: 12,
                    height: 26,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: '0 1px 3px rgba(16, 185, 129, 0.4)',
                  }}
                  icon={<ThunderboltOutlined />}
                  onClick={() => handleOpenPost(record)}
                >
                  Post
                </Button>
              </Tooltip>
            )}
          </TableActions>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', padding: '0 2px' }}>
      {/* Header with Title & Description */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, padding: '0 4px 2px 4px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--theme-text)' }}>
            Stock Transfers & Relocation
          </h2>
          <span style={{ fontSize: 12.5, color: 'var(--theme-text-muted)' }}>
            Manage inter-warehouse inventory transfers, approval lifecycle, and atomic dual-warehouse ledger posting.
          </span>
        </div>
      </div>

      {/* Unified Enterprise Workspace Container (Flush Edge-to-Edge with 1-2mm viewport margin) */}
      <div
        style={{
          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
          background: 'var(--theme-card-bg, rgba(255, 255, 255, 0.02))',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          width: '100%',
        }}
      >
        {/* Status Queue Tabs with Top-Right Pill Badges */}
        <div
          style={{
            padding: '4px 10px 0 10px',
            background: 'rgba(255, 255, 255, 0.015)',
            borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.15))',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            tabBarStyle={{ marginBottom: 0 }}
            items={[
              {
                key: 'ALL',
                label: renderTabBadgeLabel('All Transfers', counts.total ?? counts.all ?? 0, '#3b82f6', 'ALL'),
              },
              {
                key: 'PENDING_APPROVAL',
                label: renderTabBadgeLabel('Pending Approval', counts.pendingApproval ?? 0, '#f59e0b', 'PENDING_APPROVAL'),
              },
              {
                key: 'DRAFT',
                label: renderTabBadgeLabel('Drafts', counts.draft ?? 0, '#64748b', 'DRAFT'),
              },
              {
                key: 'APPROVED',
                label: renderTabBadgeLabel('Approved', counts.approved ?? 0, '#10b981', 'APPROVED'),
              },
              {
                key: 'RETURNED',
                label: renderTabBadgeLabel('Returned', counts.returned ?? 0, '#d97706', 'RETURNED'),
              },
              {
                key: 'REJECTED',
                label: renderTabBadgeLabel('Rejected', counts.rejected ?? 0, '#ef4444', 'REJECTED'),
              },
              {
                key: 'POSTED',
                label: renderTabBadgeLabel('Posted to Ledger', counts.posted ?? 0, '#8b5cf6', 'POSTED'),
              },
            ]}
          />
        </div>

        {/* Toolbar with Search, Warehouse Filters, Refresh, and New Transfer Button */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.1))' }}>
          <TableToolbar
            searchPlaceholder="Search by Transfer #, Item, Warehouse, Notes..."
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            filters={[
              {
                key: 'fromWarehouse',
                placeholder: 'From Warehouse',
                value: filterFromWarehouse,
                onChange: (v) => { setFilterFromWarehouse(v); setPage(1); },
                options: warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name,
                })),
              },
              {
                key: 'toWarehouse',
                placeholder: 'To Warehouse',
                value: filterToWarehouse,
                onChange: (v) => { setFilterToWarehouse(v); setPage(1); },
                options: warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name,
                })),
              },
            ]}
            onRefresh={() => {
              fetchCounts();
              fetchTransfers(page);
            }}
            primaryAction={
              canCreate
                ? {
                    label: 'New Stock Transfer',
                    icon: <PlusOutlined />,
                    onClick: handleCreate,
                  }
                : undefined
            }
          />
        </div>

        {/* Main Data Table */}
        <ERPTable
          columns={columns}
          dataSource={transfers}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          emptyTitle="No stock transfers found"
          emptyDescription="No transfer records match your current criteria."
          emptyActionLabel={canCreate ? 'Create Stock Transfer' : undefined}
          onEmptyAction={canCreate ? handleCreate : undefined}
          pagination={{
            current: page,
            total,
            pageSize,
            onChange: (p) => setPage(p),
            showTotal: (tot, range) => `Showing ${range[0]}–${range[1]} of ${tot} transfers`,
          }}
        />
      </div>

      {/* 1. Create / Edit Modal */}
      <StockTransferCreateEditModal
        open={createEditModalOpen}
        editingItem={editingItem}
        items={items}
        warehouses={warehouses}
        canSubmitImmediately={canSubmit}
        onCancel={() => {
          setCreateEditModalOpen(false);
          setEditingItem(null);
        }}
        onSuccess={() => {
          setCreateEditModalOpen(false);
          setEditingItem(null);
          fetchCounts();
          fetchTransfers(page);
        }}
      />

      {/* 2. Review & Approval Modal */}
      <StockTransferApprovalModal
        open={approvalModalOpen}
        transfer={approvingItem}
        currentUserId={user?.id}
        onCancel={() => {
          setApprovalModalOpen(false);
          setApprovingItem(null);
        }}
        onSuccess={() => {
          setApprovalModalOpen(false);
          setApprovingItem(null);
          fetchCounts();
          fetchTransfers(page);
        }}
      />

      {/* 3. Detail & History Modal */}
      <StockTransferDetailModal
        open={detailModalOpen}
        transfer={detailItem}
        canApprove={canApprove}
        canPost={canPost}
        currentUserId={user?.id}
        onCancel={() => {
          setDetailModalOpen(false);
          setDetailItem(null);
        }}
        onReview={() => {
          const item = detailItem;
          setDetailModalOpen(false);
          setDetailItem(null);
          if (item) handleOpenApproval(item);
        }}
        onPost={() => {
          const item = detailItem;
          setDetailModalOpen(false);
          setDetailItem(null);
          if (item) handleOpenPost(item);
        }}
      />

      {/* 4. Post Modal */}
      <StockTransferPostModal
        open={postModalOpen}
        transfer={postingItem}
        onCancel={() => {
          setPostModalOpen(false);
          setPostingItem(null);
        }}
        onSuccess={() => {
          setPostModalOpen(false);
          setPostingItem(null);
          fetchCounts();
          fetchTransfers(page);
        }}
      />

      {/* 5. Submit Modal */}
      <StockTransferSubmitModal
        open={submitModalOpen}
        transfer={submittingItem}
        onCancel={() => {
          setSubmitModalOpen(false);
          setSubmittingItem(null);
        }}
        onSuccess={() => {
          setSubmitModalOpen(false);
          setSubmittingItem(null);
          fetchCounts();
          fetchTransfers(page);
        }}
      />
    </div>
  );
};

// ============================================================
// 1. CREATE / EDIT MODAL (StockTransferCreateEditModal)
// ============================================================

interface StockTransferCreateEditModalProps {
  open: boolean;
  editingItem: StockTransfer | null;
  items: DropdownOption[];
  warehouses: DropdownOption[];
  canSubmitImmediately: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const StockTransferCreateEditModal: React.FC<StockTransferCreateEditModalProps> = ({
  open,
  editingItem,
  items,
  warehouses,
  canSubmitImmediately,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [submitAndSend, setSubmitAndSend] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balances, setBalances] = useState<Record<string, WarehouseBalanceInfo>>({});
  const [itemUom, setItemUom] = useState<string>('KG');

  const selectedItemId = Form.useWatch('itemId', form);
  const fromWhId = Form.useWatch('fromWarehouseId', form);
  const toWhId = Form.useWatch('toWarehouseId', form);
  const rawQty = Form.useWatch('quantity', form);
  const qtyNum = Number(rawQty || 0);

  const isEditing = Boolean(editingItem);

  useEffect(() => {
    if (open) {
      if (editingItem) {
        form.setFieldsValue({
          itemId: editingItem.itemId,
          quantity: Number(editingItem.quantity),
          fromWarehouseId: editingItem.fromWarehouseId,
          toWarehouseId: editingItem.toWarehouseId,
          notes: editingItem.notes ?? '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ quantity: undefined });
      }
    }
  }, [open, editingItem, form]);

  // Load real-time stock balances across warehouses for selected item
  useEffect(() => {
    if (!open || !selectedItemId) {
      setBalances({});
      setItemUom('KG');
      return;
    }
    let cancelled = false;
    setLoadingBalances(true);
    (async () => {
      try {
        const res = await apiService.get<{ data: any[] }>('/inventory/balances', {
          itemId: selectedItemId,
          limit: 100,
        });
        if (cancelled) return;
        const bMap: Record<string, WarehouseBalanceInfo> = {};
        let uom = '';

        for (const row of res.data || []) {
          const whId = row.warehouseId || row.warehouse?.id;
          if (whId) {
            bMap[whId] = {
              onHand: Number(row.onHand || 0),
              available: Number(row.available || 0),
              reserved: Number(row.reserved || 0),
              uomCode: row.uom?.code || row.item?.baseUom?.code || '',
              whName: row.warehouse?.name,
              whCode: row.warehouse?.warehouseCode,
            };
          }
          if (!uom && (row.uom?.code || row.item?.baseUom?.code)) {
            uom = row.uom?.code || row.item?.baseUom?.code;
          }
        }

        // Fallback from items prop if not found in balance rows
        if (!uom) {
          const matched = items.find((i: any) => i.id === selectedItemId);
          if (matched && matched.baseUom?.code) {
            uom = matched.baseUom.code;
          }
        }

        setBalances(bMap);
        setItemUom(uom || 'KG');
      } catch (err) {
        console.error('Failed to load item balances', err);
      } finally {
        if (!cancelled) setLoadingBalances(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedItemId, items]);

  const fromBalInfo = fromWhId ? balances[fromWhId] : null;
  const toBalInfo = toWhId ? balances[toWhId] : null;

  const rawFromAvailable = fromBalInfo ? fromBalInfo.available : (fromWhId ? 0 : null);
  const rawToCurrent = toBalInfo ? toBalInfo.available : (toWhId ? 0 : null);

  const isSameWarehouse = Boolean(fromWhId && toWhId && fromWhId === toWhId);
  const isOverTransfer = Boolean(rawFromAvailable !== null && qtyNum > rawFromAvailable);
  const isValidQuantity = qtyNum > 0;
  const canSave = !isSameWarehouse && isValidQuantity && Boolean(selectedItemId && fromWhId && toWhId);

  const handleSaveDraft = async () => {
    try {
      const values = await form.validateFields();
      if (values.fromWarehouseId === values.toWarehouseId) {
        message.error('Source and Destination warehouses must be different');
        return;
      }
      setSubmitting(true);
      if (editingItem) {
        await apiService.patch(`/inventory/transfers/${editingItem.id}`, {
          itemId: values.itemId,
          quantity: Number(values.quantity),
          fromWarehouseId: values.fromWarehouseId,
          toWarehouseId: values.toWarehouseId,
          notes: values.notes,
        });
        message.success('Stock transfer draft updated successfully');
      } else {
        await apiService.post('/inventory/transfers', {
          itemId: values.itemId,
          quantity: Number(values.quantity),
          fromWarehouseId: values.fromWarehouseId,
          toWarehouseId: values.toWarehouseId,
          notes: values.notes,
        });
        message.success('Draft stock transfer created successfully');
      }
      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to save transfer';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAndSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.fromWarehouseId === values.toWarehouseId) {
        message.error('Source and Destination warehouses must be different');
        return;
      }
      setSubmitAndSend(true);
      let transferId = editingItem?.id;

      if (editingItem) {
        await apiService.patch(`/inventory/transfers/${editingItem.id}`, {
          itemId: values.itemId,
          quantity: Number(values.quantity),
          fromWarehouseId: values.fromWarehouseId,
          toWarehouseId: values.toWarehouseId,
          notes: values.notes,
        });
      } else {
        const createRes = await apiService.post<any>('/inventory/transfers', {
          itemId: values.itemId,
          quantity: Number(values.quantity),
          fromWarehouseId: values.fromWarehouseId,
          toWarehouseId: values.toWarehouseId,
          notes: values.notes,
        });
        transferId = createRes.data?.data?.id || createRes.data?.id;
      }

      if (transferId) {
        await apiService.patch(`/inventory/transfers/${transferId}/submit`, {
          remarks: 'Submitted for management review',
        });
        message.success('Stock transfer submitted for approval successfully');
      }
      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to submit transfer';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitAndSend(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SwapOutlined style={{ color: '#3b82f6', fontSize: 18 }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>
            {isEditing ? 'Edit Stock Transfer' : 'New Stock Transfer'}
          </span>
        </div>
      }
      open={open}
      onCancel={onCancel}
      width="min(720px, 98vw)"
      style={{ top: 20 }}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="draft"
          onClick={handleSaveDraft}
          loading={submitting}
          disabled={!canSave || submitAndSend}
        >
          {isEditing ? 'Update Draft' : 'Save as Draft'}
        </Button>,
        canSubmitImmediately && (
          <Button
            key="submit"
            type="primary"
            onClick={handleSaveAndSubmit}
            loading={submitAndSend}
            disabled={!canSave || submitting}
            style={{ backgroundColor: '#3b82f6', borderColor: '#2563eb' }}
            icon={<SendOutlined />}
          >
            Save & Submit for Approval
          </Button>
        ),
      ]}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          {/* Item Selector */}
          <Col span={14}>
            <Form.Item
              name="itemId"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>Item <span style={{ color: '#ef4444' }}>*</span></span>
                  {loadingBalances && (
                    <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                      <Spin size="small" style={{ marginRight: 4 }} /> Loading stock...
                    </span>
                  )}
                </div>
              }
              rules={[{ required: true, message: 'Please select an item' }]}
            >
              <Select
                showSearch
                placeholder="Select item to transfer"
                optionFilterProp="label"
                options={items.map((i: any) => ({
                  value: i.id,
                  label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name || i.id,
                }))}
              />
            </Form.Item>
          </Col>

          {/* Transfer Quantity */}
          <Col span={10}>
            <Form.Item
              name="quantity"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>Transfer Quantity <span style={{ color: '#ef4444' }}>*</span></span>
                  {rawFromAvailable !== null && (
                    <span style={{ fontSize: 11, color: isOverTransfer ? '#ef4444' : 'var(--theme-text-muted)' }}>
                      Avail: <strong>{formatNumber(rawFromAvailable, 3)}</strong>
                    </span>
                  )}
                </div>
              }
              rules={[
                { required: true, message: 'Please enter quantity' },
                {
                  validator: (_, value) => {
                    if (!value || Number(value) <= 0) {
                      return Promise.reject(new Error('Quantity must be greater than 0'));
                    }
                    if (rawFromAvailable !== null && Number(value) > rawFromAvailable) {
                      return Promise.reject(new Error(`Exceeds available source stock (${formatNumber(rawFromAvailable, 3)} ${itemUom})`));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber
                min={0.0001}
                step={1}
                style={{ width: '100%' }}
                addonAfter={itemUom}
                placeholder="0.000"
              />
            </Form.Item>
          </Col>

          {/* From Warehouse (Source) */}
          <Col span={12}>
            <Form.Item
              name="fromWarehouseId"
              label={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>From Warehouse (Source) <span style={{ color: '#ef4444' }}>*</span></span>
                  {rawFromAvailable !== null && (
                    <Tag color={rawFromAvailable > 0 ? 'blue' : 'default'} style={{ marginRight: 0, fontSize: 11 }}>
                      Store Avail: {formatNumber(rawFromAvailable, 3)} {itemUom}
                    </Tag>
                  )}
                </div>
              }
              rules={[{ required: true, message: 'Please select source warehouse' }]}
            >
              <Select
                showSearch
                placeholder="Select source warehouse"
                optionFilterProp="label"
                options={warehouses.map((w: any) => {
                  const b = balances[w.id];
                  const availText = b ? ` · (${formatNumber(b.available, 1)} ${itemUom} avail)` : '';
                  return {
                    value: w.id,
                    label: `${w.warehouseCode ? w.warehouseCode + ' — ' : ''}${w.name}${availText}`,
                  };
                })}
              />
            </Form.Item>

            {fromWhId && (
              <div style={{
                marginTop: -16, marginBottom: 16, padding: '6px 10px', borderRadius: 6,
                background: isOverTransfer ? 'rgba(239, 68, 68, 0.08)' : 'rgba(2, 132, 199, 0.06)',
                border: `1px solid ${isOverTransfer ? 'rgba(239, 68, 68, 0.35)' : 'rgba(2, 132, 199, 0.25)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11,
              }}>
                <span>
                  <span style={{ color: 'var(--theme-text-muted)' }}>Source Current: </span>
                  <strong style={{ color: 'var(--theme-text)' }}>
                    {formatNumber(rawFromAvailable ?? 0, 3)} {itemUom}
                  </strong>
                </span>
                <span>
                  <span style={{ color: 'var(--theme-text-muted)' }}>After Transfer: </span>
                  <strong style={{ color: isOverTransfer ? '#ef4444' : '#10b981' }}>
                    {formatNumber(Math.max(0, (rawFromAvailable ?? 0) - qtyNum), 3)} {itemUom}
                  </strong>
                </span>
              </div>
            )}
          </Col>

          {/* To Warehouse (Destination) */}
          <Col span={12}>
            <Form.Item
              name="toWarehouseId"
              label={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>To Warehouse (Destination) <span style={{ color: '#ef4444' }}>*</span></span>
                  {rawToCurrent !== null && (
                    <Tag color="green" style={{ marginRight: 0, fontSize: 11 }}>
                      Store: {formatNumber(rawToCurrent, 3)} {itemUom}
                    </Tag>
                  )}
                </div>
              }
              rules={[{ required: true, message: 'Please select destination warehouse' }]}
            >
              <Select
                showSearch
                placeholder="Select destination warehouse"
                optionFilterProp="label"
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name,
                }))}
              />
            </Form.Item>

            {toWhId && (
              <div style={{
                marginTop: -16, marginBottom: 16, padding: '6px 10px', borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11,
              }}>
                <span>
                  <span style={{ color: 'var(--theme-text-muted)' }}>Dest Current: </span>
                  <strong style={{ color: 'var(--theme-text)' }}>
                    {formatNumber(rawToCurrent ?? 0, 3)} {itemUom}
                  </strong>
                </span>
                <span>
                  <span style={{ color: 'var(--theme-text-muted)' }}>After Transfer: </span>
                  <strong style={{ color: '#10b981' }}>
                    {formatNumber((rawToCurrent ?? 0) + qtyNum, 3)} {itemUom}
                  </strong>
                </span>
              </div>
            )}
          </Col>

          {isSameWarehouse && (
            <Col span={24}>
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 14 }}
                message="Invalid Route: Source and Destination warehouses must be different."
              />
            </Col>
          )}

          {/* Notes */}
          <Col span={24}>
            <Form.Item name="notes" label="Transfer Reason / Notes">
              <Input.TextArea
                rows={2}
                placeholder="Add inter-warehouse relocation reason or instructions..."
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

// ============================================================
// 2. REVIEW & APPROVAL MODAL (StockTransferApprovalModal)
// ============================================================

interface StockTransferApprovalModalProps {
  open: boolean;
  transfer: StockTransfer | null;
  currentUserId?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

const StockTransferApprovalModal: React.FC<StockTransferApprovalModalProps> = ({
  open,
  transfer,
  currentUserId,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [impact, setImpact] = useState<LiveStockTransferImpact | null>(null);
  const [history, setHistory] = useState<StockTransferHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Remarks & Reasons
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectRemarks, setRejectRemarks] = useState('');

  // Sub-modal states
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  const [approving, setApproving] = useState(false);
  const [returning, setReturning] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (open && transfer) {
      setApprovalRemarks('');
      setReturnReason('');
      setReturnRemarks('');
      setRejectReason('');
      setRejectRemarks('');
      setLoading(true);

      Promise.all([
        apiService.get<{ data: LiveStockTransferImpact }>(`/inventory/transfers/${transfer.id}/impact`),
        apiService.get<{ data: StockTransferHistoryItem[] }>(`/inventory/transfers/${transfer.id}/history`),
      ])
        .then(([impRes, histRes]) => {
          setImpact(impRes.data);
          setHistory(histRes.data || []);
        })
        .catch((err) => console.error('Failed to load review details', err))
        .finally(() => setLoading(false));
    }
  }, [open, transfer]);

  if (!transfer) return null;

  // Segregation of duties check:
  const isCreatorOrSubmitter = Boolean(
    currentUserId && (transfer.createdBy === currentUserId || transfer.submittedBy === currentUserId)
  );

  const handleApprove = async () => {
    setApproving(true);
    try {
      await apiService.patch(`/inventory/transfers/${transfer.id}/approve`, {
        remarks: approvalRemarks.trim() || undefined,
      });
      message.success(`Stock transfer ${transfer.transferNumber} approved successfully`);
      setConfirmApproveOpen(false);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Approval failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setApproving(false);
    }
  };

  const handleReturn = async () => {
    if (!returnReason.trim()) {
      message.error('Please select or specify a return reason');
      return;
    }
    setReturning(true);
    try {
      await apiService.patch(`/inventory/transfers/${transfer.id}/return`, {
        reason: returnReason.trim(),
        remarks: returnRemarks.trim() || undefined,
      });
      message.success(`Stock transfer ${transfer.transferNumber} returned to requester`);
      setReturnModalOpen(false);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Return failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setReturning(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      message.error('Please specify a rejection reason');
      return;
    }
    setRejecting(true);
    try {
      await apiService.patch(`/inventory/transfers/${transfer.id}/reject`, {
        reason: rejectReason.trim(),
        remarks: rejectRemarks.trim() || undefined,
      });
      message.success(`Stock transfer ${transfer.transferNumber} rejected`);
      setRejectModalOpen(false);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Rejection failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setRejecting(false);
    }
  };

  return (
    <>
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AuditOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
              <span style={{ fontSize: 16, fontWeight: 700 }}>Review Stock Transfer</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--theme-text-muted)' }}>#{transfer.transferNumber}</span>
            </div>
            <RenderStatusTag status={transfer.status} />
          </div>
        }
        open={open}
        onCancel={onCancel}
        width="min(800px, 98vw)"
        style={{ top: 16, maxWidth: '98vw', margin: '0 auto' }}
        styles={{
          body: {
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
            padding: '12px 14px',
          },
        }}
        destroyOnHidden
        footer={[
          <Button key="close" onClick={onCancel}>
            Close
          </Button>,
          <Button
            key="reject"
            danger
            onClick={() => setRejectModalOpen(true)}
            icon={<CloseCircleOutlined />}
          >
            Reject Transfer
          </Button>,
          <Button
            key="return"
            style={{ color: '#d97706', borderColor: '#d97706' }}
            onClick={() => setReturnModalOpen(true)}
            icon={<RollbackOutlined />}
          >
            Return to Requester
          </Button>,
          <Button
            key="approve"
            type="primary"
            style={{ backgroundColor: '#10b981', borderColor: '#059669' }}
            onClick={() => setConfirmApproveOpen(true)}
            disabled={isCreatorOrSubmitter}
            icon={<CheckCircleOutlined />}
          >
            Approve Transfer
          </Button>,
        ]}
      >
        <Spin spinning={loading}>
          {/* Segregation of duties alert if creator/submitter viewing */}
          {isCreatorOrSubmitter && (
            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              style={{ marginBottom: 12 }}
              message="Segregation of Duties Enforcement"
              description="You requested or submitted this stock transfer and cannot approve your own request. Another authorized manager must review and approve it."
            />
          )}

          {/* Request Information Grid */}
          <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}>
            <Row gutter={[12, 8]}>
              <Col span={12}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Requested By:</span>
                <div style={{ fontWeight: 600 }}>
                  {transfer.createdByUser?.displayName || 'Requester'} ({transfer.createdByUser?.email || '—'})
                </div>
              </Col>
              <Col span={12}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Requested At:</span>
                <div style={{ fontWeight: 600 }}>
                  {transfer.createdAt ? dayjs(transfer.createdAt).format('DD-MMM-YYYY HH:mm') : '—'}
                </div>
              </Col>
              {transfer.submittedByUser && (
                <>
                  <Col span={12}>
                    <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Submitted By:</span>
                    <div style={{ fontWeight: 600 }}>{transfer.submittedByUser.displayName}</div>
                  </Col>
                  <Col span={12}>
                    <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Submitted At:</span>
                    <div style={{ fontWeight: 600 }}>
                      {transfer.submittedAt ? dayjs(transfer.submittedAt).format('DD-MMM-YYYY HH:mm') : '—'}
                    </div>
                  </Col>
                </>
              )}
            </Row>
          </Card>

          {/* Transfer Details Card */}
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                <SwapOutlined style={{ color: '#3b82f6' }} />
                <span>Transfer Movement</span>
              </div>
            }
            style={{ background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}
          >
            <Row gutter={[12, 8]}>
              <Col span={14}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Item:</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {transfer.itemName} {transfer.itemCode ? `(${transfer.itemCode})` : ''}
                </div>
              </Col>
              <Col span={10}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Quantity to Relocate:</span>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#3b82f6', fontFamily: 'monospace' }}>
                  {formatNumber(transfer.quantity, 4)} {transfer.uomCode}
                </div>
              </Col>
              <Col span={12}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>From Warehouse (Source):</span>
                <div style={{ fontWeight: 600 }}>{transfer.fromWarehouseName}</div>
              </Col>
              <Col span={12}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>To Warehouse (Destination):</span>
                <div style={{ fontWeight: 600 }}>{transfer.toWarehouseName}</div>
              </Col>
              {transfer.notes && (
                <Col span={24}>
                  <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Notes / Instructions:</span>
                  <div style={{ fontStyle: 'italic', color: 'var(--theme-text-muted)' }}>{transfer.notes}</div>
                </Col>
              )}
            </Row>
          </Card>

          {/* Live Inventory Impact Cards (Source & Destination) */}
          {impact && impact.hasLine && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ThunderboltOutlined style={{ color: '#10b981' }} />
                <span>Projected Inventory Impact (Live Data)</span>
              </div>
              <Row gutter={12}>
                {/* Source Impact */}
                <Col span={12}>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      background: 'rgba(239, 68, 68, 0.04)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#f87171', marginBottom: 4 }}>
                      Source: {impact.source.warehouseName}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--theme-text-muted)' }}>Current Stock:</span>
                      <span style={{ fontFamily: 'monospace' }}>{formatNumber(impact.source.onHand, 3)} {impact.item.uom}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--theme-text-muted)' }}>Deduction:</span>
                      <span style={{ fontFamily: 'monospace', color: '#ef4444', fontWeight: 600 }}>
                        −{formatNumber(impact.source.transferQty, 3)} {impact.item.uom}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 4 }}>
                      <span style={{ fontWeight: 600 }}>Projected Stock:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: impact.source.projectedBalance < 0 ? '#ef4444' : '#10b981' }}>
                        {formatNumber(impact.source.projectedBalance, 3)} {impact.item.uom}
                      </span>
                    </div>
                  </div>
                </Col>

                {/* Destination Impact */}
                <Col span={12}>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      background: 'rgba(16, 185, 129, 0.04)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#34d399', marginBottom: 4 }}>
                      Destination: {impact.destination.warehouseName}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--theme-text-muted)' }}>Current Stock:</span>
                      <span style={{ fontFamily: 'monospace' }}>{formatNumber(impact.destination.onHand, 3)} {impact.item.uom}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--theme-text-muted)' }}>Addition:</span>
                      <span style={{ fontFamily: 'monospace', color: '#10b981', fontWeight: 600 }}>
                        +{formatNumber(impact.destination.transferQty, 3)} {impact.item.uom}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 4 }}>
                      <span style={{ fontWeight: 600 }}>Projected Stock:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                        {formatNumber(impact.destination.projectedBalance, 3)} {impact.item.uom}
                      </span>
                    </div>
                  </div>
                </Col>
              </Row>
            </div>
          )}

          {/* Workflow Audit Timeline */}
          {history.length > 0 && (
            <Card
              size="small"
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                  <ClockCircleOutlined style={{ color: '#818cf8' }} />
                  <span>Workflow Audit History</span>
                </div>
              }
              style={{ background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}
            >
              <Timeline
                mode="left"
                style={{ marginTop: 10, marginBottom: 0 }}
                items={history.map((h) => {
                  let dotColor = 'gray';
                  if (h.action === 'APPROVED') dotColor = 'green';
                  if (h.action === 'POSTED') dotColor = 'purple';
                  if (h.action === 'RETURNED') dotColor = 'orange';
                  if (h.action === 'REJECTED') dotColor = 'red';
                  if (h.action === 'SUBMITTED') dotColor = 'blue';

                  return {
                    color: dotColor,
                    children: (
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {h.action} —{' '}
                          <span style={{ color: 'var(--theme-text-muted)', fontWeight: 400 }}>
                            {h.performedByUser?.displayName || 'User'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                          {dayjs(h.createdAt).format('DD-MMM-YYYY HH:mm:ss')}
                        </div>
                        {h.reason && (
                          <div style={{ fontSize: 12, color: '#d97706', marginTop: 2 }}>
                            <strong>Reason:</strong> {h.reason}
                          </div>
                        )}
                        {h.remarks && (
                          <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--theme-text-muted)' }}>
                            "{h.remarks}"
                          </div>
                        )}
                      </div>
                    ),
                  };
                })}
              />
            </Card>
          )}

          {/* Approval Remarks Input */}
          <Form.Item label="Approval Remarks (Optional)" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={2}
              value={approvalRemarks}
              onChange={(e) => setApprovalRemarks(e.target.value)}
              placeholder="Enter any approval comments or relocation instructions..."
            />
          </Form.Item>
        </Spin>
      </Modal>

      {/* Confirmation Dialog: Approve */}
      <Modal
        title="Approve Stock Transfer?"
        open={confirmApproveOpen}
        onCancel={() => setConfirmApproveOpen(false)}
        onOk={handleApprove}
        confirmLoading={approving}
        okText="Approve Transfer"
        okButtonProps={{ style: { backgroundColor: '#10b981', borderColor: '#059669' } }}
        destroyOnHidden
      >
        <p>
          Are you sure you want to approve transfer <b>{transfer.transferNumber}</b> of{' '}
          <b>{formatNumber(transfer.quantity, 4)} {transfer.uomCode}</b> from <b>{transfer.fromWarehouseName}</b> to{' '}
          <b>{transfer.toWarehouseName}</b>?
        </p>
        {approvalRemarks && (
          <p style={{ fontStyle: 'italic', color: 'var(--theme-text-muted)' }}>
            Remarks: "{approvalRemarks}"
          </p>
        )}
      </Modal>

      {/* Return Dialog with Mandatory Reason */}
      <Modal
        title="Return Stock Transfer"
        open={returnModalOpen}
        onCancel={() => setReturnModalOpen(false)}
        onOk={handleReturn}
        confirmLoading={returning}
        okText="Return to Requester"
        okButtonProps={{ style: { backgroundColor: '#d97706', borderColor: '#d97706' } }}
        destroyOnHidden
      >
        <p style={{ marginBottom: 12 }}>
          Return transfer <b>{transfer.transferNumber}</b> to requester for corrections.
        </p>
        <Form layout="vertical">
          <Form.Item label="Return Reason *" required>
            <Select
              placeholder="Select a reason"
              value={returnReason}
              onChange={(v) => setReturnReason(v)}
              options={[
                { value: 'Insufficient physical stock in source warehouse', label: 'Insufficient physical stock in source warehouse' },
                { value: 'Destination warehouse storage full / constrained', label: 'Destination warehouse storage full / constrained' },
                { value: 'Wrong quantity requested', label: 'Wrong quantity requested' },
                { value: 'Wrong item code specified', label: 'Wrong item code specified' },
                { value: 'Other / Please see remarks', label: 'Other / Please see remarks' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Return Remarks / Correction Instructions">
            <Input.TextArea
              rows={3}
              value={returnRemarks}
              onChange={(e) => setReturnRemarks(e.target.value)}
              placeholder="Explain required changes for the requester..."
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Reject Dialog with Mandatory Reason */}
      <Modal
        title="Reject Stock Transfer"
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleReject}
        confirmLoading={rejecting}
        okText="Reject Transfer"
        okButtonProps={{ danger: true }}
        destroyOnHidden
      >
        <p style={{ marginBottom: 12 }}>
          Rejecting transfer <b>{transfer.transferNumber}</b> is permanent. It cannot be posted or resubmitted.
        </p>
        <Form layout="vertical">
          <Form.Item label="Rejection Reason *" required>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter mandatory rejection reason..."
            />
          </Form.Item>
          <Form.Item label="Rejection Remarks">
            <Input.TextArea
              rows={3}
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              placeholder="Additional rejection remarks..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ============================================================
// 3. DETAIL & WORKFLOW HISTORY MODAL (StockTransferDetailModal)
// ============================================================

interface StockTransferDetailModalProps {
  open: boolean;
  transfer: StockTransfer | null;
  canApprove: boolean;
  canPost: boolean;
  currentUserId?: string;
  onCancel: () => void;
  onReview: () => void;
  onPost: () => void;
}

const StockTransferDetailModal: React.FC<StockTransferDetailModalProps> = ({
  open,
  transfer,
  canApprove,
  canPost,
  currentUserId,
  onCancel,
  onReview,
  onPost,
}) => {
  const [history, setHistory] = useState<StockTransferHistoryItem[]>([]);
  const [impact, setImpact] = useState<LiveStockTransferImpact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && transfer) {
      setLoading(true);
      Promise.all([
        apiService.get<{ data: StockTransferHistoryItem[] }>(`/inventory/transfers/${transfer.id}/history`),
        apiService.get<{ data: LiveStockTransferImpact }>(`/inventory/transfers/${transfer.id}/impact`),
      ])
        .then(([histRes, impRes]) => {
          setHistory(histRes.data || []);
          setImpact(impRes.data);
        })
        .catch((err) => console.error('Failed to load transfer detail data', err))
        .finally(() => setLoading(false));
    }
  }, [open, transfer]);

  if (!transfer) return null;

  const normStatus = transfer.status === 'SUBMITTED' ? 'PENDING_APPROVAL' : transfer.status;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SwapOutlined style={{ color: '#38bdf8', fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Stock Transfer Details</span>
            <span style={{ fontFamily: 'monospace', color: 'var(--theme-text-muted)' }}>#{transfer.transferNumber}</span>
          </div>
          <RenderStatusTag status={transfer.status} />
        </div>
      }
      open={open}
      onCancel={onCancel}
      width="min(760px, 98vw)"
      style={{ top: 16, maxWidth: '98vw', margin: '0 auto' }}
      styles={{
        body: {
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
          padding: '12px 14px',
        },
      }}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={onCancel}>
          Close
        </Button>,
        normStatus === 'PENDING_APPROVAL' && canApprove && (
          <Button
            key="review"
            type="primary"
            style={{ backgroundColor: '#f59e0b', borderColor: '#d97706' }}
            icon={<AuditOutlined />}
            onClick={onReview}
          >
            Review & Decide
          </Button>
        ),
        normStatus === 'APPROVED' && canPost && (
          <Button
            key="post"
            type="primary"
            style={{ backgroundColor: '#10b981', borderColor: '#059669' }}
            icon={<ThunderboltOutlined />}
            onClick={onPost}
          >
            Post Transfer to Ledger
          </Button>
        ),
      ]}
    >
      <Spin spinning={loading}>
        {/* KPI / Summary Cards */}
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={8}>
            <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Transfer Quantity</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
                {formatNumber(transfer.quantity, 4)} {transfer.uomCode}
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Source Warehouse</div>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {transfer.fromWarehouseName}
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Destination Warehouse</div>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {transfer.toWarehouseName}
              </div>
            </Card>
          </Col>
        </Row>

        {/* Visual Movement Flow Card */}
        <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>FROM (Source)</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{transfer.fromWarehouseName}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8' }}>
                {formatNumber(transfer.quantity, 4)} {transfer.uomCode}
              </span>
              <ArrowRightOutlined style={{ fontSize: 18, color: '#38bdf8' }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>TO (Destination)</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{transfer.toWarehouseName}</div>
            </div>
          </div>
        </Card>

        {/* Live Inventory Impact Display */}
        {impact && impact.hasLine && (
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                <ThunderboltOutlined style={{ color: '#10b981' }} />
                <span>Inventory Impact</span>
              </div>
            }
            style={{ background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}
          >
            <Row gutter={12}>
              <Col span={12}>
                <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <div style={{ fontWeight: 600, color: '#f87171' }}>{impact.source.warehouseName}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                    <span style={{ color: 'var(--theme-text-muted)' }}>Stock Before:</span>
                    <span style={{ fontFamily: 'monospace' }}>{formatNumber(impact.source.onHand, 3)} {impact.item.uom}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--theme-text-muted)' }}>Transfer:</span>
                    <span style={{ fontFamily: 'monospace', color: '#ef4444' }}>−{formatNumber(impact.source.transferQty, 3)} {impact.item.uom}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>Stock After:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                      {formatNumber(impact.source.projectedBalance, 3)} {impact.item.uom}
                    </span>
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ fontWeight: 600, color: '#34d399' }}>{impact.destination.warehouseName}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                    <span style={{ color: 'var(--theme-text-muted)' }}>Stock Before:</span>
                    <span style={{ fontFamily: 'monospace' }}>{formatNumber(impact.destination.onHand, 3)} {impact.item.uom}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--theme-text-muted)' }}>Transfer:</span>
                    <span style={{ fontFamily: 'monospace', color: '#10b981' }}>+{formatNumber(impact.destination.transferQty, 3)} {impact.item.uom}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>Stock After:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                      {formatNumber(impact.destination.projectedBalance, 3)} {impact.item.uom}
                    </span>
                  </div>
                </div>
              </Col>
            </Row>
          </Card>
        )}

        {/* Workflow Audit Trail Timeline */}
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
              <ClockCircleOutlined style={{ color: '#818cf8' }} />
              <span>Full Audit Trail & History</span>
            </div>
          }
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          {history.length === 0 ? (
            <div style={{ color: 'var(--theme-text-muted)', fontStyle: 'italic', padding: 8 }}>
              No history recorded yet.
            </div>
          ) : (
            <Timeline
              mode="left"
              style={{ marginTop: 10, marginBottom: 0 }}
              items={history.map((h) => {
                let dotColor = 'gray';
                if (h.action === 'APPROVED') dotColor = 'green';
                if (h.action === 'POSTED') dotColor = 'purple';
                if (h.action === 'RETURNED') dotColor = 'orange';
                if (h.action === 'REJECTED') dotColor = 'red';
                if (h.action === 'SUBMITTED') dotColor = 'blue';

                return {
                  color: dotColor,
                  children: (
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {h.action} —{' '}
                        <span style={{ color: 'var(--theme-text-muted)', fontWeight: 400 }}>
                          {h.performedByUser?.displayName || 'User'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                        {dayjs(h.createdAt).format('DD-MMM-YYYY HH:mm:ss')}
                      </div>
                      {h.reason && (
                        <div style={{ fontSize: 12, color: '#d97706', marginTop: 2 }}>
                          <strong>Reason:</strong> {h.reason}
                        </div>
                      )}
                      {h.remarks && (
                        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--theme-text-muted)' }}>
                          "{h.remarks}"
                        </div>
                      )}
                    </div>
                  ),
                };
              })}
            />
          )}
        </Card>
      </Spin>
    </Modal>
  );
};

// ============================================================
// 4. POST MODAL (StockTransferPostModal)
// ============================================================

interface StockTransferPostModalProps {
  open: boolean;
  transfer: StockTransfer | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const StockTransferPostModal: React.FC<StockTransferPostModalProps> = ({
  open,
  transfer,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [postingNotes, setPostingNotes] = useState('');
  const [impact, setImpact] = useState<LiveStockTransferImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (open && transfer) {
      setPostingNotes('');
      setLoading(true);
      apiService
        .get<{ data: LiveStockTransferImpact }>(`/inventory/transfers/${transfer.id}/impact`)
        .then((res) => setImpact(res.data))
        .catch((err) => console.error('Failed to load posting impact', err))
        .finally(() => setLoading(false));
    }
  }, [open, transfer]);

  if (!transfer) return null;

  const handleConfirmPost = async () => {
    setPosting(true);
    try {
      await apiService.patch(`/inventory/transfers/${transfer.id}/post`, {
        remarks: postingNotes.trim() || undefined,
      });
      message.success(`Stock transfer ${transfer.transferNumber} posted to inventory ledger successfully`);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Posting failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltOutlined style={{ color: '#10b981', fontSize: 18 }} />
          <span>Post Stock Transfer to Inventory Ledger</span>
        </div>
      }
      open={open}
      onCancel={onCancel}
      confirmLoading={posting}
      onOk={handleConfirmPost}
      okText="Confirm & Post to Inventory"
      okButtonProps={{ style: { backgroundColor: '#10b981', borderColor: '#10b981' } }}
      width="min(680px, 98vw)"
      style={{ top: 16, maxWidth: '98vw', margin: '0 auto' }}
      styles={{
        body: {
          maxHeight: 'calc(100vh - 160px)',
          overflowY: 'auto',
          padding: '12px 14px',
        },
      }}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <p style={{ margin: '0 0 12px 0' }}>
          You are about to post transfer <b>{transfer.transferNumber}</b> to the stock ledger.
        </p>

        <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', marginBottom: 14 }}>
          <div><strong>Item:</strong> {transfer.itemName} ({transfer.itemCode})</div>
          <div><strong>Source Warehouse:</strong> {transfer.fromWarehouseName}</div>
          <div><strong>Destination Warehouse:</strong> {transfer.toWarehouseName}</div>
          <div>
            <strong>Transfer Quantity:</strong>{' '}
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>
              {formatNumber(transfer.quantity, 4)} {transfer.uomCode}
            </span>
          </div>
          <div><strong>Approved By:</strong> {transfer.approvedByUser?.displayName || 'Authorized Approver'}</div>
        </Card>

        {impact && impact.hasLine && (
          <Row gutter={12} style={{ marginBottom: 14 }}>
            <Col span={12}>
              <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <div style={{ fontWeight: 600, color: '#f87171' }}>Source: {impact.source.warehouseName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>Current:</span>
                  <span style={{ fontFamily: 'monospace' }}>{formatNumber(impact.source.onHand, 3)} {impact.item.uom}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>Deduction:</span>
                  <span style={{ fontFamily: 'monospace', color: '#ef4444' }}>−{formatNumber(impact.source.transferQty, 3)} {impact.item.uom}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>Result:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                    {formatNumber(impact.source.projectedBalance, 3)} {impact.item.uom}
                  </span>
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ fontWeight: 600, color: '#34d399' }}>Dest: {impact.destination.warehouseName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>Current:</span>
                  <span style={{ fontFamily: 'monospace' }}>{formatNumber(impact.destination.onHand, 3)} {impact.item.uom}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>Addition:</span>
                  <span style={{ fontFamily: 'monospace', color: '#10b981' }}>+{formatNumber(impact.destination.transferQty, 3)} {impact.item.uom}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>Result:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                    {formatNumber(impact.destination.projectedBalance, 3)} {impact.item.uom}
                  </span>
                </div>
              </div>
            </Col>
          </Row>
        )}

        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          style={{ marginBottom: 14 }}
          message="Atomic Dual-Warehouse Transaction"
          description="Posting atomically generates an OUT movement from the source warehouse and an IN movement to the destination warehouse in the Stock Ledger, and updates inventory balances. Once posted, this transfer becomes immutable."
        />

        <Form.Item label="Posting Remarks (Optional)" style={{ marginBottom: 0 }}>
          <Input.TextArea
            rows={2}
            value={postingNotes}
            onChange={(e) => setPostingNotes(e.target.value)}
            placeholder="Add any inventory posting remarks..."
          />
        </Form.Item>
      </Spin>
    </Modal>
  );
};

// ============================================================
// 5. SUBMIT CONFIRMATION MODAL (StockTransferSubmitModal)
// ============================================================

interface StockTransferSubmitModalProps {
  open: boolean;
  transfer: StockTransfer | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const StockTransferSubmitModal: React.FC<StockTransferSubmitModalProps> = ({
  open,
  transfer,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setRemarks('');
  }, [open]);

  if (!transfer) return null;

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    try {
      await apiService.patch(`/inventory/transfers/${transfer.id}/submit`, {
        remarks: remarks.trim() || undefined,
      });
      message.success(`Stock transfer ${transfer.transferNumber} submitted for approval`);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Submission failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SendOutlined style={{ color: '#3b82f6', fontSize: 18 }} />
          <span>Submit Stock Transfer for Approval</span>
        </div>
      }
      open={open}
      onCancel={onCancel}
      confirmLoading={submitting}
      onOk={handleConfirmSubmit}
      okText="Submit for Review"
      okButtonProps={{ style: { backgroundColor: '#3b82f6', borderColor: '#2563eb' } }}
      destroyOnHidden
    >
      <p>
        Are you ready to submit transfer <b>{transfer.transferNumber}</b> ({formatNumber(transfer.quantity, 4)} {transfer.uomCode} from {transfer.fromWarehouseName} to {transfer.toWarehouseName}) for management review and approval?
      </p>
      <Form.Item label="Submission Remarks (Optional)" style={{ marginTop: 12, marginBottom: 0 }}>
        <Input.TextArea
          rows={2}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Add any remarks for the approver..."
        />
      </Form.Item>
    </Modal>
  );
};

export default StockTransferManagement;
