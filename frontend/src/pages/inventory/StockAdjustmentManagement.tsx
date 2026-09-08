import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Button, Tag, Modal, Form, Input, Select, App,
  InputNumber, Row, Col, Tooltip, Segmented, Spin, Space,
  Tabs, Badge, Card, Alert, Timeline, Typography, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, InfoCircleOutlined,
  ArrowRightOutlined, CheckCircleOutlined,
  CloseCircleOutlined, RollbackOutlined, SendOutlined,
  AuditOutlined, DeleteOutlined, ClockCircleOutlined,
  ThunderboltOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableActions, TableToolbar } from '../../components/shared/ERPTable';
import { usePermission } from '../../hooks/usePermission';
import { useNavBadgeStore } from '../../components/layout/navBadgeStore';

const ADJUSTMENT_TYPES = [
  { value: 'ADJUSTMENT_IN', label: '+ Adjustment In (Stock Surplus)' },
  { value: 'ADJUSTMENT_OUT', label: '- Adjustment Out (Stock Shortage)' },
];

export interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  adjustmentCode?: string;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  warehouseId: string;
  warehouseName?: string;
  adjustmentType: string;
  quantity: number;
  uomCode?: string;
  reason: string;
  status: string;
  countedQuantity?: number;
  currentStock?: number;
  companyId?: string;

  // Audit & Workflow
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

export interface StockAdjustmentHistoryItem {
  id: string;
  adjustmentId: string;
  action: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'POSTED' | 'CANCELLED';
  previousStatus?: string;
  newStatus?: string;
  performedBy?: string;
  performedByUser?: { id: string; displayName: string; email: string };
  reason?: string;
  remarks?: string;
  createdAt: string;
}

export interface LiveStockImpact {
  adjustmentId: string;
  adjustmentCode: string;
  status: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  warehouseId: string;
  warehouseName: string;
  uom: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  adjustmentType: string;
  adjustmentQuantity: number;
  projectedStock: number;
  projectedAvailableStock: number;
  willCauseNegativeStock: boolean;
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

interface AdjustmentCounts {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  returned: number;
  rejected: number;
  posted: number;
}

const statusBadgeConfig: Record<string, { color: string; label: string; icon?: React.ReactNode }> = {
  DRAFT: { color: 'default', label: 'Draft', icon: <EditOutlined /> },
  PENDING_APPROVAL: { color: 'orange', label: 'Pending Approval', icon: <ClockCircleOutlined /> },
  SUBMITTED: { color: 'orange', label: 'Pending Approval', icon: <ClockCircleOutlined /> },
  RETURNED: { color: 'warning', label: 'Returned', icon: <RollbackOutlined /> },
  APPROVED: { color: 'success', label: 'Approved', icon: <CheckCircleOutlined /> },
  REJECTED: { color: 'error', label: 'Rejected', icon: <CloseCircleOutlined /> },
  POSTED: { color: 'processing', label: 'Posted to Ledger', icon: <ThunderboltOutlined /> },
  CANCELLED: { color: 'default', label: 'Cancelled' },
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

interface StockAdjustmentManagementProps {
  defaultTab?: string;
}

const StockAdjustmentManagement: React.FC<StockAdjustmentManagementProps> = ({ defaultTab }) => {
  const { message } = App.useApp();
  const { user, can } = usePermission();
  const location = useLocation();

  const isPendingApprovalRoute = location.pathname.includes('pending-approval') || defaultTab === 'PENDING_APPROVAL';

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [counts, setCounts] = useState<AdjustmentCounts>({
    total: 0,
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
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);

  // Modals state
  const [createEditModalOpen, setCreateEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockAdjustment | null>(null);

  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvingItem, setApprovingItem] = useState<StockAdjustment | null>(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<StockAdjustment | null>(null);

  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postingItem, setPostingItem] = useState<StockAdjustment | null>(null);

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submittingItem, setSubmittingItem] = useState<StockAdjustment | null>(null);

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);

  // Permissions
  const canCreate = can('inventory.adjustment.create');
  const canSubmit = can('inventory.adjustment.submit') || canCreate;
  const canApprove = can('inventory.adjustment.approve');
  const canPost = can('inventory.adjustment.post');

  // Load Counts
  const fetchCounts = useCallback(async () => {
    try {
      const res = await apiService.get<{ data: AdjustmentCounts }>('/inventory/adjustments/counts');
      if (res?.data) {
        setCounts(res.data);
        useNavBadgeStore.getState().setNavBadge('/inventory/adjustments/pending-approval', res.data.pendingApproval);
      }
    } catch (err) {
      console.error('Failed to load adjustment counts', err);
    }
  }, []);

  // Load Adjustments
  const fetchAdjustments = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterWarehouse) params.warehouseId = filterWarehouse;

      if (activeTab !== 'ALL') {
        params.status = activeTab;
      }

      const response = await apiService.get<{ data: StockAdjustment[]; total: number }>(
        '/inventory/adjustments',
        params
      );
      setAdjustments(response.data || []);
      setTotal(response.total || 0);
    } catch (error) {
      message.error('Failed to fetch stock adjustments');
    } finally {
      setLoading(false);
    }
  }, [search, filterWarehouse, activeTab, pageSize, message]);

  // Load Dropdowns
  const fetchDropdowns = useCallback(async () => {
    try {
      const [itemRes, warehouseRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 500 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
      ]);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
    } catch (error: any) {
      console.error('Failed to load adjustment dropdowns', error);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    fetchAdjustments(page);
  }, [page, fetchAdjustments]);

  // Handle Tab Change
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setPage(1);
  };

  // Actions
  const handleCreate = () => {
    setEditingItem(null);
    setCreateEditModalOpen(true);
  };

  const handleEdit = (record: StockAdjustment) => {
    setEditingItem(record);
    setCreateEditModalOpen(true);
  };

  const handleView = (record: StockAdjustment) => {
    setDetailItem(record);
    setDetailModalOpen(true);
  };

  const handleOpenApproval = (record: StockAdjustment) => {
    setApprovingItem(record);
    setApprovalModalOpen(true);
  };

  const handleOpenPost = (record: StockAdjustment) => {
    setPostingItem(record);
    setPostModalOpen(true);
  };

  const handleOpenSubmit = (record: StockAdjustment) => {
    setSubmittingItem(record);
    setSubmitModalOpen(true);
  };

  const handleDelete = async (record: StockAdjustment) => {
    try {
      await apiService.delete(`/inventory/adjustments/${record.id}`);
      message.success(`Stock adjustment ${record.adjustmentNumber} deleted successfully`);
      fetchAdjustments(page);
      fetchCounts();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete adjustment';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    }
  };

  const refreshAll = () => {
    fetchAdjustments(page);
    fetchCounts();
  };

  // Table Columns
  const columns: ColumnsType<StockAdjustment> = [
    {
      title: 'Adjustment #',
      dataIndex: 'adjustmentNumber',
      key: 'adjustmentNumber',
      width: 140,
      render: (v: string, record) => (
        <span
          style={{ fontWeight: 600, color: 'var(--theme-primary, #3b82f6)', cursor: 'pointer' }}
          onClick={() => handleView(record)}
        >
          {v || record.adjustmentCode}
        </span>
      ),
    },
    {
      title: 'Item',
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
      render: (name: string, record: StockAdjustment) => (
        <div>
          <span style={{ fontWeight: 600 }}>{name || record.itemId}</span>
          {record.itemCode && (
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--theme-text-muted)' }}>
              ({record.itemCode})
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 140,
      render: (wName: string) => <span>{wName || '—'}</span>,
    },
    {
      title: 'Type',
      dataIndex: 'adjustmentType',
      key: 'adjustmentType',
      width: 140,
      render: (v: string) => {
        const isIn = v === 'ADJUSTMENT_IN' || v === 'INCREASE';
        return (
          <Tag color={isIn ? 'green' : 'red'} className="erp-table-tag">
            {isIn ? '+ Adjustment In' : '- Adjustment Out'}
          </Tag>
        );
      },
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      align: 'right' as const,
      render: (v: unknown, record: StockAdjustment) => {
        const isIn = record.adjustmentType === 'ADJUSTMENT_IN' || record.adjustmentType === 'INCREASE';
        return (
          <span
            style={{
              fontWeight: 600,
              fontFamily: 'monospace',
              color: isIn ? '#10b981' : '#ef4444',
            }}
          >
            {isIn ? '+' : '-'}{formatNumber(v, 4)}
          </span>
        );
      },
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      key: 'uomCode',
      width: 70,
      render: (v: string) => <span style={{ color: 'var(--theme-text-muted)' }}>{v || '—'}</span>,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 140,
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Requested By',
      key: 'requestedBy',
      width: 140,
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
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (d: string, r) => {
        const dateVal = r.submittedAt || d;
        return (
          <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>
            {dateVal ? dayjs(dateVal).format('DD-MMM HH:mm') : '—'}
          </span>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (s: string) => <RenderStatusTag status={s} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      fixed: 'right',
      align: 'center',
      render: (_, record) => {
        const normStatus = record.status === 'SUBMITTED' ? 'PENDING_APPROVAL' : record.status;
        const isCreator = user?.id && (record.createdBy === user.id || record.submittedBy === user.id);

        return (
          <TableActions>
            {/* View Details always available */}
            <Tooltip title="View Adjustment Details & Workflow History">
              <Button
                type="text"
                size="small"
                aria-label="View Adjustment Details"
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
                    title="Delete Draft Adjustment?"
                    description="Are you sure you want to delete this draft adjustment?"
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
              <Tooltip
                title={
                  isCreator
                    ? 'Review Adjustment (Creator cannot approve due to Segregation of Duties)'
                    : 'Review & Decide (Approve, Return, or Reject)'
                }
              >
                <Button
                  type="primary"
                  size="small"
                  style={{
                    backgroundColor: '#f59e0b',
                    borderColor: '#f59e0b',
                    fontWeight: 600,
                    padding: '0 8px',
                    fontSize: 12,
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
                  <Tooltip title="Edit and Correct Adjustment">
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
                    title="Delete Returned Adjustment?"
                    description="Are you sure you want to delete this returned adjustment?"
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
              <Tooltip title="Post Adjustment to Inventory Ledger">
                <Button
                  type="primary"
                  size="small"
                  style={{
                    backgroundColor: '#10b981',
                    borderColor: '#10b981',
                    fontWeight: 600,
                    padding: '0 8px',
                    fontSize: 12,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header with Title & Quick Description */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--theme-text)' }}>
            Stock Adjustments & Reconciliation
          </h2>
          <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
            Reconcile physical stock variances, manage approval lifecycle, and atomically post to inventory ledger.
          </span>
        </div>
      </div>

      {/* Tabs Queue with Live Badges */}
      <Card
        bodyStyle={{ padding: '8px 16px 0 16px' }}
        style={{
          border: '1px solid var(--theme-border, #374151)',
          background: 'var(--theme-card-bg, rgba(255, 255, 255, 0.02))',
          borderRadius: 8,
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          tabBarStyle={{ marginBottom: 0 }}
          items={[
            {
              key: 'ALL',
              label: <span>All Adjustments ({counts.total})</span>,
            },
            {
              key: 'PENDING_APPROVAL',
              label: (
                <Badge
                  count={counts.pendingApproval}
                  offset={[10, 0]}
                  color="#f59e0b"
                  size="small"
                  overflowCount={999}
                >
                  <span
                    style={{
                      fontWeight: activeTab === 'PENDING_APPROVAL' || counts.pendingApproval > 0 ? 700 : 500,
                      color: counts.pendingApproval > 0 ? '#f59e0b' : undefined,
                    }}
                  >
                    Pending Approval
                  </span>
                </Badge>
              ),
            },
            {
              key: 'DRAFT',
              label: <span>Drafts ({counts.draft})</span>,
            },
            {
              key: 'APPROVED',
              label: (
                <Badge
                  count={counts.approved}
                  offset={[10, 0]}
                  color="#10b981"
                  size="small"
                  overflowCount={999}
                >
                  <span
                    style={{
                      fontWeight: activeTab === 'APPROVED' ? 700 : 500,
                      color: counts.approved > 0 ? '#10b981' : undefined,
                    }}
                  >
                    Approved
                  </span>
                </Badge>
              ),
            },
            {
              key: 'RETURNED',
              label: <span>Returned ({counts.returned})</span>,
            },
            {
              key: 'REJECTED',
              label: <span>Rejected ({counts.rejected})</span>,
            },
            {
              key: 'POSTED',
              label: <span>Posted ({counts.posted})</span>,
            },
          ]}
        />
      </Card>

      {/* Table Toolbar */}
      <TableToolbar
        searchPlaceholder="Search adjustment #, item, reason..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        filters={[
          {
            key: 'warehouse',
            placeholder: 'Warehouse',
            value: filterWarehouse,
            onChange: (v) => {
              setFilterWarehouse(v);
              setPage(1);
            },
            options: warehouses.map((w: any) => ({
              value: w.id,
              label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name || w.id,
            })),
          },
        ]}
        onRefresh={refreshAll}
        primaryAction={
          canCreate
            ? {
                label: 'New Adjustment',
                icon: <PlusOutlined />,
                onClick: handleCreate,
              }
            : undefined
        }
      />

      {/* Main ERP Table */}
      <ERPTable
        columns={columns}
        dataSource={adjustments}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        emptyTitle={
          activeTab === 'PENDING_APPROVAL'
            ? 'No pending adjustments'
            : 'No stock adjustments found'
        }
        emptyDescription={
          activeTab === 'PENDING_APPROVAL'
            ? 'Great! There are currently no stock adjustments waiting for your review.'
            : 'No adjustment records match your current criteria.'
        }
        emptyActionLabel={canCreate ? 'Create Adjustment' : undefined}
        onEmptyAction={canCreate ? handleCreate : undefined}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
        }}
      />

      {/* Modals */}
      {/* 1. Create / Edit Form Modal */}
      <StockAdjustmentModal
        open={createEditModalOpen}
        editingItem={editingItem}
        items={items}
        warehouses={warehouses}
        canSubmit={canSubmit}
        onCancel={() => setCreateEditModalOpen(false)}
        onSuccess={() => {
          setCreateEditModalOpen(false);
          refreshAll();
        }}
      />

      {/* 2. Submit for Approval Confirmation Modal */}
      <StockAdjustmentSubmitModal
        open={submitModalOpen}
        adjustment={submittingItem}
        onCancel={() => setSubmitModalOpen(false)}
        onSuccess={() => {
          setSubmitModalOpen(false);
          refreshAll();
        }}
      />

      {/* 3. Dedicated Review & Approval Modal */}
      <StockAdjustmentApprovalModal
        open={approvalModalOpen}
        adjustment={approvingItem}
        currentUser={user}
        onCancel={() => setApprovalModalOpen(false)}
        onSuccess={() => {
          setApprovalModalOpen(false);
          refreshAll();
        }}
      />

      {/* 4. Detailed Audit / View Modal */}
      <StockAdjustmentDetailModal
        open={detailModalOpen}
        adjustment={detailItem}
        currentUser={user}
        canApprove={canApprove}
        canPost={canPost}
        onCancel={() => setDetailModalOpen(false)}
        onOpenApproval={(adj) => {
          setDetailModalOpen(false);
          setApprovingItem(adj);
          setApprovalModalOpen(true);
        }}
        onOpenPost={(adj) => {
          setDetailModalOpen(false);
          setPostingItem(adj);
          setPostModalOpen(true);
        }}
      />

      {/* 5. Inventory Posting Modal */}
      <StockAdjustmentPostModal
        open={postModalOpen}
        adjustment={postingItem}
        onCancel={() => setPostModalOpen(false)}
        onSuccess={() => {
          setPostModalOpen(false);
          refreshAll();
        }}
      />
    </div>
  );
};

// ============================================================
// 1. CREATE / EDIT ADJUSTMENT MODAL
// ============================================================

interface StockAdjustmentModalProps {
  open: boolean;
  editingItem: StockAdjustment | null;
  items: DropdownOption[];
  warehouses: DropdownOption[];
  canSubmit: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  open,
  editingItem,
  items,
  warehouses,
  canSubmit,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitAction, setIsSubmitAction] = useState(false);

  // Live item balance tracking
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>(undefined);
  const [itemBalances, setItemBalances] = useState<any[]>([]);
  const [fetchingBalances, setFetchingBalances] = useState(false);

  // Dual mode: PHYSICAL_COUNT (default) vs DIRECT
  const [adjustmentMode, setAdjustmentMode] = useState<'PHYSICAL_COUNT' | 'DIRECT'>('PHYSICAL_COUNT');
  const [countedQty, setCountedQty] = useState<number | null>(null);
  const [directQty, setDirectQty] = useState<number | null>(null);
  const [directType, setDirectType] = useState<string>('ADJUSTMENT_IN');

  const isReturned = editingItem?.status === 'RETURNED';

  useEffect(() => {
    if (open) {
      if (editingItem) {
        setSelectedItemId(editingItem.itemId);
        setSelectedWarehouseId(editingItem.warehouseId);
        setAdjustmentMode('DIRECT');
        const isOut = editingItem.adjustmentType === 'DECREASE' || editingItem.adjustmentType === 'ADJUSTMENT_OUT';
        setDirectType(isOut ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN');
        setDirectQty(Number(editingItem.quantity || 0));
        setCountedQty(null);

        form.setFieldsValue({
          itemId: editingItem.itemId,
          warehouseId: editingItem.warehouseId,
          adjustmentType: isOut ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
          quantity: Number(editingItem.quantity || 0),
          reason: editingItem.reason ?? '',
        });
      } else {
        form.resetFields();
        setSelectedItemId(undefined);
        setSelectedWarehouseId(undefined);
        setItemBalances([]);
        setAdjustmentMode('PHYSICAL_COUNT');
        setCountedQty(null);
        setDirectQty(null);
        setDirectType('ADJUSTMENT_IN');
        form.setFieldsValue({
          adjustmentType: 'ADJUSTMENT_IN',
          quantity: 0,
        });
      }
    }
  }, [open, editingItem, form]);

  // Fetch balances whenever selected item changes
  useEffect(() => {
    if (!open || !selectedItemId) {
      setItemBalances([]);
      return;
    }
    let active = true;
    setFetchingBalances(true);
    apiService
      .get<{ data: any[] }>('/inventory/balances', {
        itemId: selectedItemId,
        limit: 100,
      })
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        setItemBalances(list);

        const currentWh = form.getFieldValue('warehouseId');
        if (!currentWh && list.length > 0 && list[0]?.warehouseId) {
          form.setFieldValue('warehouseId', list[0].warehouseId);
          setSelectedWarehouseId(list[0].warehouseId);
        }
      })
      .catch((err) => {
        console.error('Failed to load item balances', err);
        if (active) setItemBalances([]);
      })
      .finally(() => {
        if (active) setFetchingBalances(false);
      });

    return () => {
      active = false;
    };
  }, [open, selectedItemId, form]);

  const currentBalance = useMemo(() => {
    if (!selectedWarehouseId || !itemBalances.length) return null;
    return itemBalances.find((b) => b.warehouseId === selectedWarehouseId) || null;
  }, [selectedWarehouseId, itemBalances]);

  const currentStock = currentBalance ? Number(currentBalance.onHand || 0) : 0;
  const reservedStock = currentBalance ? Number(currentBalance.reserved || 0) : 0;
  const availableStock = currentBalance ? Number(currentBalance.available ?? (currentStock - reservedStock)) : 0;

  const currentUom = useMemo(() => {
    if (currentBalance?.uom?.code) return currentBalance.uom.code;
    if (currentBalance?.uom?.symbol) return currentBalance.uom.symbol;
    const itemObj: any = items.find((i: any) => i.id === selectedItemId);
    return itemObj?.baseUom?.code || itemObj?.baseUom?.symbol || itemObj?.uom || '';
  }, [currentBalance, items, selectedItemId]);

  const otherWarehouseBalances = useMemo(() => {
    if (!itemBalances.length) return [];
    return itemBalances.filter(
      (b) => b.warehouseId !== selectedWarehouseId && (Number(b.onHand) !== 0 || Number(b.reserved) !== 0)
    );
  }, [itemBalances, selectedWarehouseId]);

  // Physical Count Mode calculations
  const variance = useMemo(() => {
    if (countedQty === null || countedQty === undefined || isNaN(countedQty)) return null;
    return Number(countedQty) - currentStock;
  }, [countedQty, currentStock]);

  const countAdjQty = variance !== null ? Math.abs(variance) : 0;

  // Direct Mode calculations
  const computedDirectAdjType = useMemo(() => {
    if (directQty !== null && directQty < 0) {
      return 'ADJUSTMENT_OUT';
    }
    return directType;
  }, [directQty, directType]);

  const computedDirectQty = useMemo(() => {
    if (directQty === null || directQty === undefined || isNaN(directQty)) return 0;
    return Math.abs(directQty);
  }, [directQty]);

  const projectedBalance = useMemo(() => {
    if (computedDirectAdjType === 'ADJUSTMENT_OUT') {
      return currentStock - computedDirectQty;
    } else {
      return currentStock + computedDirectQty;
    }
  }, [currentStock, computedDirectAdjType, computedDirectQty]);

  const handleSaveOrSubmit = async (shouldSubmit: boolean) => {
    try {
      const values = await form.validateFields();

      let finalType: string;
      let finalQty: number;
      let finalCounted: number | undefined = undefined;
      let finalCurrent: number | undefined = undefined;

      if (adjustmentMode === 'PHYSICAL_COUNT') {
        if (countedQty === null || countedQty === undefined || isNaN(countedQty)) {
          message.error('Please enter the physical counted quantity');
          return;
        }
        const diff = Number(countedQty) - currentStock;
        if (diff === 0) {
          message.warning('Physical count matches system stock. No adjustment needed.');
          return;
        }
        finalType = diff >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        finalQty = Math.abs(diff);
        finalCounted = Number(countedQty);
        finalCurrent = Number(currentStock);
      } else {
        const rawQty = Number(values.quantity);
        if (isNaN(rawQty) || rawQty === 0) {
          message.error('Please enter a valid non-zero adjustment quantity');
          return;
        }
        if (rawQty < 0) {
          finalType = 'ADJUSTMENT_OUT';
          finalQty = Math.abs(rawQty);
        } else {
          finalType = values.adjustmentType || 'ADJUSTMENT_IN';
          finalQty = rawQty;
        }
      }

      setSubmitting(true);
      setIsSubmitAction(shouldSubmit);

      let recordId: string;
      if (editingItem) {
        await apiService.patch(`/inventory/adjustments/${editingItem.id}`, {
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          adjustmentType: finalType,
          quantity: finalQty,
          countedQuantity: finalCounted,
          currentStock: finalCurrent,
          reason: values.reason,
        });
        recordId = editingItem.id;
      } else {
        const res = await apiService.post<{ data: StockAdjustment }>('/inventory/adjustments', {
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          adjustmentType: finalType,
          quantity: finalQty,
          countedQuantity: finalCounted,
          currentStock: finalCurrent,
          reason: values.reason,
        });
        recordId = res.data.id;
      }

      if (shouldSubmit) {
        await apiService.patch(`/inventory/adjustments/${recordId}/submit`, {
          remarks: 'Submitted upon saving',
        });
        message.success('Stock adjustment saved and submitted for approval successfully');
      } else {
        message.success(editingItem ? 'Adjustment updated as draft' : 'Stock adjustment draft created successfully');
      }

      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Operation failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
      setIsSubmitAction(false);
    }
  };

  return (
    <Modal
      title={
        editingItem
          ? isReturned
            ? 'Correct & Resubmit Adjustment'
            : 'Edit Draft Adjustment'
          : 'Create Stock Adjustment'
      }
      open={open}
      onCancel={onCancel}
      width={720}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="saveDraft"
          loading={submitting && !isSubmitAction}
          disabled={submitting}
          onClick={() => handleSaveOrSubmit(false)}
        >
          {editingItem ? 'Save Draft' : 'Save as Draft'}
        </Button>,
        canSubmit && (
          <Button
            key="submit"
            type="primary"
            loading={submitting && isSubmitAction}
            disabled={submitting}
            icon={<SendOutlined />}
            onClick={() => handleSaveOrSubmit(true)}
          >
            {isReturned ? 'Correct & Submit for Approval' : 'Submit for Approval'}
          </Button>
        ),
      ]}
    >
      {/* If RETURNED: Prominently show return reason and approver */}
      {isReturned && (
        <Alert
          type="warning"
          showIcon
          icon={<RollbackOutlined />}
          style={{ marginBottom: 16 }}
          message={
            <b>
              Adjustment Returned by {editingItem.returnedByUser?.displayName || 'Approver'} on{' '}
              {editingItem.returnedAt ? dayjs(editingItem.returnedAt).format('DD-MMM-YYYY HH:mm') : '—'}
            </b>
          }
          description={
            <div>
              <div style={{ marginTop: 4 }}>
                <strong>Return Reason:</strong> {editingItem.returnReason}
              </div>
              {editingItem.returnRemarks && (
                <div style={{ marginTop: 2 }}>
                  <strong>Remarks:</strong> {editingItem.returnRemarks}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--theme-text-muted)' }}>
                Please review the feedback above, update the details accordingly, and resubmit for approval.
              </div>
            </div>
          }
        />
      )}

      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="itemId"
              label="Item"
              rules={[{ required: true, message: 'Please select an item' }]}
            >
              <Select
                showSearch
                placeholder="Search and select item"
                optionFilterProp="label"
                onChange={(val) => setSelectedItemId(val)}
                options={items.map((i: any) => ({
                  value: i.id,
                  label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name || i.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="warehouseId"
              label="Warehouse"
              rules={[{ required: true, message: 'Please select warehouse' }]}
            >
              <Select
                showSearch
                placeholder="Select warehouse"
                optionFilterProp="label"
                onChange={(val) => setSelectedWarehouseId(val)}
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name || w.id,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Live Inventory Status Report */}
        {selectedItemId ? (
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--theme-border, #374151)',
              borderRadius: 8,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <InfoCircleOutlined style={{ color: '#3b82f6', fontSize: 16 }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--theme-text)' }}>
                  Current Inventory Position
                </span>
              </div>
              {fetchingBalances ? (
                <Spin size="small" />
              ) : (
                <div>
                  {currentStock > 0 && <Tag color="success">In Stock</Tag>}
                  {currentStock < 0 && <Tag color="error">Negative Stock</Tag>}
                  {currentStock === 0 && <Tag color="default">Zero Stock</Tag>}
                </div>
              )}
            </div>

            <Row gutter={12}>
              <Col span={8}>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.15)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginBottom: 2 }}>
                    On-Hand
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: currentStock < 0 ? '#ef4444' : currentStock > 0 ? '#10b981' : 'var(--theme-text)',
                    }}
                  >
                    {formatNumber(currentStock, 4)} {currentUom}
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.15)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginBottom: 2 }}>
                    Reserved
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--theme-text)' }}>
                    {formatNumber(reservedStock, 4)} {currentUom}
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.15)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginBottom: 2 }}>
                    Available
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: availableStock < 0 ? '#ef4444' : '#3b82f6',
                    }}
                  >
                    {formatNumber(availableStock, 4)} {currentUom}
                  </div>
                </div>
              </Col>
            </Row>

            {otherWarehouseBalances.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginRight: 8 }}>
                  Other Warehouses:
                </span>
                <Space size={[4, 6]} wrap style={{ marginTop: 4 }}>
                  {otherWarehouseBalances.map((b) => (
                    <Tooltip key={b.warehouseId} title="Click to select this warehouse">
                      <Tag
                        color="cyan"
                        style={{ cursor: 'pointer', borderRadius: 4 }}
                        onClick={() => {
                          form.setFieldValue('warehouseId', b.warehouseId);
                          setSelectedWarehouseId(b.warehouseId);
                        }}
                      >
                        {b.warehouse?.warehouseCode || b.warehouse?.name}: <b>{formatNumber(b.onHand, 2)} {currentUom}</b>
                      </Tag>
                    </Tooltip>
                  ))}
                </Space>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed var(--theme-border, #374151)',
              color: 'var(--theme-text-muted)',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            Select an item above to view its current inventory position and warehouse balances.
          </div>
        )}

        {/* Mode Selector */}
        <div style={{ marginBottom: 16 }}>
          <Segmented
            block
            value={adjustmentMode}
            onChange={(val) => setAdjustmentMode(val as 'PHYSICAL_COUNT' | 'DIRECT')}
            options={[
              {
                label: (
                  <div style={{ padding: '4px 0' }}>
                    <span style={{ fontWeight: 600 }}>Physical Count Reconciliation</span>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>Enter physical count (variance auto-calculated)</div>
                  </div>
                ),
                value: 'PHYSICAL_COUNT',
              },
              {
                label: (
                  <div style={{ padding: '4px 0' }}>
                    <span style={{ fontWeight: 600 }}>Direct Quantity Adjustment</span>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>Directly enter quantity (+ or -)</div>
                  </div>
                ),
                value: 'DIRECT',
              },
            ]}
          />
        </div>

        {/* Mode 1: Physical Count Reconciliation */}
        {adjustmentMode === 'PHYSICAL_COUNT' && (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: 'rgba(59, 130, 246, 0.04)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              marginBottom: 16,
            }}
          >
            <Form.Item
              label={<b>Counted / Target Stock in Warehouse</b>}
              required
              style={{ marginBottom: 12 }}
            >
              <InputNumber
                placeholder="Enter total physical stock counted in warehouse..."
                style={{ width: '100%' }}
                step={1}
                value={countedQty}
                onChange={(val) => {
                  setCountedQty(val);
                  if (val !== null && selectedItemId) {
                    const diff = Number(val) - currentStock;
                    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                    form.setFieldValue(
                      'reason',
                      `Physical count reconciliation: system stock was ${currentStock} ${currentUom}, physical count is ${val} ${currentUom} (adjustment: ${diffStr} ${currentUom})`
                    );
                  }
                }}
              />
            </Form.Item>

            {variance !== null && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 6,
                  background:
                    variance > 0
                      ? 'rgba(16, 185, 129, 0.1)'
                      : variance < 0
                      ? 'rgba(239, 68, 68, 0.1)'
                      : 'rgba(59, 130, 246, 0.1)',
                  border: `1px solid ${
                    variance > 0 ? '#10b981' : variance < 0 ? '#ef4444' : '#3b82f6'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      color: variance > 0 ? '#10b981' : variance < 0 ? '#ef4444' : '#3b82f6',
                    }}
                  >
                    {variance > 0
                      ? `Surplus Detected: +${formatNumber(variance, 4)} ${currentUom}`
                      : variance < 0
                      ? `Shortage Detected: -${formatNumber(Math.abs(variance), 4)} ${currentUom}`
                      : 'Exact Match: No Stock Difference'}
                  </span>
                  <Tag color={variance > 0 ? 'green' : variance < 0 ? 'red' : 'blue'}>
                    {variance > 0 ? '+ Adjustment In' : variance < 0 ? '- Adjustment Out' : 'Balanced'}
                  </Tag>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                  <span>Current: <b>{formatNumber(currentStock, 4)}</b></span>
                  <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} />
                  <span>Counted: <b>{formatNumber(countedQty, 4)}</b></span>
                  <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} />
                  <span>
                    Action:{' '}
                    <b style={{ color: variance >= 0 ? '#10b981' : '#ef4444' }}>
                      {variance >= 0 ? `+${formatNumber(countAdjQty, 4)} (In)` : `-${formatNumber(countAdjQty, 4)} (Out)`}
                    </b>
                  </span>
                  <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} />
                  <span>Resulting Stock: <b style={{ color: '#10b981' }}>{formatNumber(countedQty, 4)} {currentUom}</b></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode 2: Direct Adjustment */}
        {adjustmentMode === 'DIRECT' && (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--theme-border, #374151)',
              marginBottom: 16,
            }}
          >
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="adjustmentType"
                  label="Adjustment Type"
                  rules={[{ required: true, message: 'Select adjustment type' }]}
                >
                  <Select
                    options={ADJUSTMENT_TYPES}
                    value={directType}
                    onChange={(val) => setDirectType(val)}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="quantity"
                  label="Quantity"
                  rules={[{ required: true, message: 'Please enter quantity' }]}
                >
                  <InputNumber
                    step={1}
                    style={{ width: '100%' }}
                    placeholder="e.g. 5 or -5"
                    value={directQty}
                    onChange={(val) => setDirectQty(val)}
                  />
                </Form.Item>
              </Col>
            </Row>

            {directQty !== null && directQty !== 0 && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 6,
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  flexWrap: 'wrap',
                }}
              >
                <span>Current: <b>{formatNumber(currentStock, 4)}</b></span>
                <span>{computedDirectAdjType === 'ADJUSTMENT_OUT' ? '-' : '+'}</span>
                <span>
                  Qty:{' '}
                  <b style={{ color: computedDirectAdjType === 'ADJUSTMENT_OUT' ? '#ef4444' : '#10b981' }}>
                    {formatNumber(computedDirectQty, 4)}
                  </b>
                </span>
                <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} />
                <span>
                  Projected Balance:{' '}
                  <b style={{ color: projectedBalance < 0 ? '#ef4444' : '#10b981' }}>
                    {formatNumber(projectedBalance, 4)} {currentUom}
                  </b>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Reason Field */}
        <Form.Item
          name="reason"
          label="Reason for Adjustment"
          rules={[{ required: true, message: 'Reason is required' }]}
        >
          <Input.TextArea rows={2} placeholder="Explain business reason for stock adjustment..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

// ============================================================
// 2. SUBMIT FOR APPROVAL CONFIRMATION MODAL
// ============================================================

interface StockAdjustmentSubmitModalProps {
  open: boolean;
  adjustment: StockAdjustment | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const StockAdjustmentSubmitModal: React.FC<StockAdjustmentSubmitModalProps> = ({
  open,
  adjustment,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setRemarks('');
  }, [open]);

  if (!adjustment) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await apiService.patch(`/inventory/adjustments/${adjustment.id}/submit`, {
        remarks: remarks || undefined,
      });
      message.success(`Adjustment ${adjustment.adjustmentNumber} submitted for approval`);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to submit adjustment';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Submit Stock Adjustment for Approval"
      open={open}
      onCancel={onCancel}
      confirmLoading={submitting}
      onOk={handleSubmit}
      okText="Submit for Approval"
      okButtonProps={{ icon: <SendOutlined /> }}
      destroyOnHidden
    >
      <div style={{ marginBottom: 14 }}>
        <p style={{ margin: '0 0 10px 0' }}>
          Are you ready to submit stock adjustment <b>{adjustment.adjustmentNumber}</b> for authorized review?
        </p>
        <Card size="small" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div><strong>Item:</strong> {adjustment.itemName} ({adjustment.itemCode})</div>
          <div><strong>Warehouse:</strong> {adjustment.warehouseName}</div>
          <div>
            <strong>Quantity:</strong>{' '}
            <span style={{ fontWeight: 600, color: adjustment.adjustmentType === 'ADJUSTMENT_IN' ? '#10b981' : '#ef4444' }}>
              {adjustment.adjustmentType === 'ADJUSTMENT_IN' ? '+' : '-'}{formatNumber(adjustment.quantity, 4)} {adjustment.uomCode}
            </span>
          </div>
          <div><strong>Reason:</strong> {adjustment.reason}</div>
        </Card>
      </div>

      <Form.Item label="Submission Remarks (Optional)" style={{ marginBottom: 0 }}>
        <Input.TextArea
          rows={2}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Add any notes or context for the approver..."
        />
      </Form.Item>
    </Modal>
  );
};

// ============================================================
// 3. DEDICATED REVIEW & APPROVAL MODAL (StockAdjustmentApprovalModal)
// ============================================================

interface StockAdjustmentApprovalModalProps {
  open: boolean;
  adjustment: StockAdjustment | null;
  currentUser: any;
  onCancel: () => void;
  onSuccess: () => void;
}

const StockAdjustmentApprovalModal: React.FC<StockAdjustmentApprovalModalProps> = ({
  open,
  adjustment,
  currentUser,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [impact, setImpact] = useState<LiveStockImpact | null>(null);
  const [history, setHistory] = useState<StockAdjustmentHistoryItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [approvalRemarks, setApprovalRemarks] = useState('');

  // Sub-dialogs
  const [approveConfirmVisible, setApproveConfirmVisible] = useState(false);
  const [returnDialogVisible, setReturnDialogVisible] = useState(false);
  const [rejectDialogVisible, setRejectDialogVisible] = useState(false);

  const [returnReason, setReturnReason] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionRemarks, setRejectionRemarks] = useState('');

  const [actionLoading, setActionLoading] = useState(false);

  // Load live stock impact and workflow history on open
  useEffect(() => {
    if (open && adjustment) {
      setLoadingDetails(true);
      setApprovalRemarks('');
      Promise.all([
        apiService.get<{ data: LiveStockImpact }>(`/inventory/adjustments/${adjustment.id}/impact`),
        apiService.get<{ data: StockAdjustmentHistoryItem[] }>(`/inventory/adjustments/${adjustment.id}/history`),
      ])
        .then(([impactRes, historyRes]) => {
          setImpact(impactRes.data);
          setHistory(historyRes.data || []);
        })
        .catch((err) => {
          console.error('Failed to load approval details', err);
        })
        .finally(() => {
          setLoadingDetails(false);
        });
    }
  }, [open, adjustment]);

  if (!adjustment) return null;

  // Segregation of Duties Check
  const isCreatorOrSubmitter =
    currentUser?.id &&
    (adjustment.createdBy === currentUser.id || adjustment.submittedBy === currentUser.id);

  // Handle Approve
  const handleConfirmApprove = async () => {
    setActionLoading(true);
    try {
      await apiService.patch(`/inventory/adjustments/${adjustment.id}/approve`, {
        remarks: approvalRemarks || undefined,
      });
      message.success(`Stock adjustment ${adjustment.adjustmentNumber} approved successfully`);
      setApproveConfirmVisible(false);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Approval failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Return
  const handleConfirmReturn = async () => {
    if (!returnReason.trim()) {
      message.error('Return reason is required');
      return;
    }
    setActionLoading(true);
    try {
      await apiService.patch(`/inventory/adjustments/${adjustment.id}/return`, {
        returnReason: returnReason.trim(),
        returnRemarks: returnRemarks.trim() || undefined,
      });
      message.success(`Stock adjustment ${adjustment.adjustmentNumber} returned to creator`);
      setReturnDialogVisible(false);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Return failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject
  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      message.error('Rejection reason is required');
      return;
    }
    setActionLoading(true);
    try {
      await apiService.patch(`/inventory/adjustments/${adjustment.id}/reject`, {
        rejectionReason: rejectionReason.trim(),
        rejectionRemarks: rejectionRemarks.trim() || undefined,
      });
      message.success(`Stock adjustment ${adjustment.adjustmentNumber} rejected permanently`);
      setRejectDialogVisible(false);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Rejection failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setActionLoading(false);
    }
  };

  const isIn = adjustment.adjustmentType === 'ADJUSTMENT_IN' || adjustment.adjustmentType === 'INCREASE';

  return (
    <>
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AuditOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
            <span>Stock Adjustment Approval — {adjustment.adjustmentNumber}</span>
          </div>
        }
        open={open}
        onCancel={onCancel}
        width={800}
        destroyOnHidden
        footer={[
          <Button key="close" onClick={onCancel}>
            Close
          </Button>,
          <Button
            key="return"
            style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
            icon={<RollbackOutlined />}
            onClick={() => {
              setReturnReason('');
              setReturnRemarks('');
              setReturnDialogVisible(true);
            }}
          >
            Return to Creator
          </Button>,
          <Button
            key="reject"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => {
              setRejectionReason('');
              setRejectionRemarks('');
              setRejectDialogVisible(true);
            }}
          >
            Reject Adjustment
          </Button>,
          <Tooltip
            key="approve-tip"
            title={
              isCreatorOrSubmitter
                ? 'Segregation of duties: You created/submitted this adjustment and cannot approve it.'
                : undefined
            }
          >
            <Button
              type="primary"
              style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
              icon={<CheckCircleOutlined />}
              disabled={Boolean(isCreatorOrSubmitter)}
              onClick={() => setApproveConfirmVisible(true)}
            >
              Approve Adjustment
            </Button>
          </Tooltip>,
        ]}
      >
        <Spin spinning={loadingDetails}>
          {/* Segregation of Duties Warning */}
          {isCreatorOrSubmitter && (
            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              style={{ marginBottom: 14 }}
              message={<b>Segregation of Duties Enforcement</b>}
              description="You are the creator/submitter of this adjustment. As per enterprise audit controls, a different authorized user must review and approve this transaction."
            />
          )}

          {/* Request Header Card */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--theme-border, #374151)',
              marginBottom: 16,
            }}
          >
            <Row gutter={[16, 8]}>
              <Col span={8}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Status:</span>
                <div><RenderStatusTag status={adjustment.status} /></div>
              </Col>
              <Col span={8}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Requested By:</span>
                <div style={{ fontWeight: 600 }}>
                  {adjustment.submittedByUser?.displayName || adjustment.createdByUser?.displayName || '—'}
                </div>
              </Col>
              <Col span={8}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Submission Date:</span>
                <div style={{ fontWeight: 600 }}>
                  {adjustment.submittedAt
                    ? dayjs(adjustment.submittedAt).format('DD-MMM-YYYY HH:mm')
                    : dayjs(adjustment.createdAt).format('DD-MMM-YYYY HH:mm')}
                </div>
              </Col>
            </Row>
          </div>

          {/* Adjustment Details Card */}
          <Card
            size="small"
            title={<span style={{ fontWeight: 600 }}>Adjustment Details</span>}
            style={{ marginBottom: 16 }}
          >
            <Row gutter={[16, 10]}>
              <Col span={12}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Item:</span>
                <div style={{ fontWeight: 600 }}>
                  {adjustment.itemName || adjustment.itemId}
                  {adjustment.itemCode && <span style={{ color: 'var(--theme-text-muted)' }}> ({adjustment.itemCode})</span>}
                </div>
              </Col>
              <Col span={12}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Warehouse:</span>
                <div style={{ fontWeight: 600 }}>{adjustment.warehouseName || '—'}</div>
              </Col>
              <Col span={12}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Adjustment Type:</span>
                <div>
                  <Tag color={isIn ? 'green' : 'red'}>
                    {isIn ? '+ Adjustment In (Surplus)' : '- Adjustment Out (Shortage)'}
                  </Tag>
                </div>
              </Col>
              <Col span={12}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Adjustment Quantity:</span>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', color: isIn ? '#10b981' : '#ef4444' }}>
                  {isIn ? '+' : '-'}{formatNumber(adjustment.quantity, 4)} {adjustment.uomCode}
                </div>
              </Col>
              <Col span={24}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Reason for Adjustment:</span>
                <div style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: 4, marginTop: 4 }}>
                  {adjustment.reason || '—'}
                </div>
              </Col>
            </Row>
          </Card>

          {/* Live Inventory Impact Card */}
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Live Stock Impact</span>
                {impact && (
                  <Tag color={impact.willCauseNegativeStock ? 'error' : 'success'}>
                    {impact.willCauseNegativeStock ? 'Negative Stock Impact' : 'Safe Balance'}
                  </Tag>
                )}
              </div>
            }
            style={{ marginBottom: 16 }}
          >
            {impact ? (
              <>
                <Row gutter={12}>
                  <Col span={8}>
                    <div
                      style={{
                        background: 'rgba(0,0,0,0.2)',
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.06)',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Current Stock</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>
                        {formatNumber(impact.currentStock, 4)} {impact.uom}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                        Available: {formatNumber(impact.availableStock, 2)}
                      </div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div
                      style={{
                        background: 'rgba(0,0,0,0.2)',
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.06)',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Adjustment Movement</div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: isIn ? '#10b981' : '#ef4444',
                        }}
                      >
                        {isIn ? '+' : '-'}{formatNumber(impact.adjustmentQuantity, 4)} {impact.uom}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                        {isIn ? 'Stock In' : 'Stock Out'}
                      </div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div
                      style={{
                        background: 'rgba(0,0,0,0.2)',
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.06)',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Projected Stock</div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: impact.projectedStock < 0 ? '#ef4444' : '#10b981',
                        }}
                      >
                        {formatNumber(impact.projectedStock, 4)} {impact.uom}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                        After Ledger Posting
                      </div>
                    </div>
                  </Col>
                </Row>

                {impact.willCauseNegativeStock && !impact.negativeStockAllowed && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginTop: 12 }}
                    message="Policy Warning: Insufficient Available Stock"
                    description={`Posting this adjustment will result in negative stock (${formatNumber(
                      impact.projectedStock,
                      4
                    )} ${impact.uom}). Company policy strictly disallows negative stock.`}
                  />
                )}
              </>
            ) : (
              <Spin size="small" />
            )}
          </Card>

          {/* Workflow History Timeline */}
          <Card
            size="small"
            title={<span style={{ fontWeight: 600 }}>Workflow History</span>}
            style={{ marginBottom: 16 }}
          >
            {history.length > 0 ? (
              <Timeline
                mode="left"
                style={{ marginTop: 10 }}
                items={history.map((h) => {
                  let color = 'blue';
                  if (h.action === 'APPROVED') color = 'green';
                  if (h.action === 'RETURNED') color = 'orange';
                  if (h.action === 'REJECTED') color = 'red';
                  if (h.action === 'POSTED') color = 'cyan';

                  return {
                    color,
                    label: (
                      <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                        {dayjs(h.createdAt).format('DD-MMM HH:mm')}
                      </span>
                    ),
                    children: (
                      <div>
                        <div>
                          <Tag color={color} style={{ fontSize: 11, marginRight: 6 }}>{h.action}</Tag>
                          <span style={{ fontWeight: 600 }}>{h.performedByUser?.displayName || 'Authorized User'}</span>
                        </div>
                        {h.reason && (
                          <div style={{ fontSize: 12, marginTop: 2, color: 'var(--theme-text)' }}>
                            <strong>Reason:</strong> {h.reason}
                          </div>
                        )}
                        {h.remarks && (
                          <div style={{ fontSize: 12, marginTop: 2, color: 'var(--theme-text-muted)' }}>
                            {h.remarks}
                          </div>
                        )}
                      </div>
                    ),
                  };
                })}
              />
            ) : (
              <div style={{ color: 'var(--theme-text-muted)', textAlign: 'center', padding: 8 }}>
                No prior workflow history recorded.
              </div>
            )}
          </Card>

          {/* Approver Remarks */}
          <Form.Item label={<b>Approval Remarks (Optional)</b>} style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={2}
              value={approvalRemarks}
              onChange={(e) => setApprovalRemarks(e.target.value)}
              placeholder="Add any verification remarks or approval notes..."
            />
          </Form.Item>
        </Spin>
      </Modal>

      {/* Approve Confirmation Dialog */}
      <Modal
        title="Approve Stock Adjustment?"
        open={approveConfirmVisible}
        onCancel={() => setApproveConfirmVisible(false)}
        confirmLoading={actionLoading}
        onOk={handleConfirmApprove}
        okText="Confirm Approval"
        okButtonProps={{ style: { backgroundColor: '#10b981', borderColor: '#10b981' } }}
      >
        <p>You are approving stock adjustment <b>{adjustment.adjustmentNumber}</b>:</p>
        <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}>
          <div><strong>Item:</strong> {adjustment.itemName} ({adjustment.itemCode})</div>
          <div><strong>Warehouse:</strong> {adjustment.warehouseName}</div>
          <div>
            <strong>Quantity:</strong>{' '}
            <span style={{ fontWeight: 600, color: isIn ? '#10b981' : '#ef4444' }}>
              {isIn ? '+' : '-'}{formatNumber(adjustment.quantity, 4)} {adjustment.uomCode}
            </span>
          </div>
        </Card>
        <p style={{ fontSize: 13, color: 'var(--theme-text-muted)', margin: 0 }}>
          After approval, the adjustment status will become <b>APPROVED</b> and will be queued for inventory posting.
        </p>
      </Modal>

      {/* Return Dialog */}
      <Modal
        title="Return Stock Adjustment to Creator"
        open={returnDialogVisible}
        onCancel={() => setReturnDialogVisible(false)}
        confirmLoading={actionLoading}
        onOk={handleConfirmReturn}
        okText="Return to Creator"
        okButtonProps={{ style: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' } }}
      >
        <p>The adjustment will be sent back to the creator for revision and correction.</p>
        <Form.Item label={<b>Return Reason *</b>} required style={{ marginBottom: 12 }}>
          <Input
            placeholder="e.g. Quantity discrepancy, wrong warehouse selected..."
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />
        </Form.Item>
        <Form.Item label="Additional Remarks" style={{ marginBottom: 0 }}>
          <Input.TextArea
            rows={2}
            placeholder="Provide specific instructions for what to correct..."
            value={returnRemarks}
            onChange={(e) => setReturnRemarks(e.target.value)}
          />
        </Form.Item>
      </Modal>

      {/* Reject Dialog */}
      <Modal
        title="Reject Stock Adjustment Permanently"
        open={rejectDialogVisible}
        onCancel={() => setRejectDialogVisible(false)}
        confirmLoading={actionLoading}
        onOk={handleConfirmReject}
        okText="Reject Adjustment"
        okButtonProps={{ danger: true }}
      >
        <p>
          This will permanently mark the stock adjustment as <b>REJECTED</b>. Rejected adjustments cannot be posted to
          the inventory ledger.
        </p>
        <Form.Item label={<b>Rejection Reason *</b>} required style={{ marginBottom: 12 }}>
          <Input
            placeholder="State why this adjustment is permanently rejected..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </Form.Item>
        <Form.Item label="Additional Remarks" style={{ marginBottom: 0 }}>
          <Input.TextArea
            rows={2}
            placeholder="Any supplementary remarks..."
            value={rejectionRemarks}
            onChange={(e) => setRejectionRemarks(e.target.value)}
          />
        </Form.Item>
      </Modal>
    </>
  );
};

// ============================================================
// 4. DETAIL / AUDIT VIEW MODAL (StockAdjustmentDetailModal)
// ============================================================

interface StockAdjustmentDetailModalProps {
  open: boolean;
  adjustment: StockAdjustment | null;
  currentUser: any;
  canApprove: boolean;
  canPost: boolean;
  onCancel: () => void;
  onOpenApproval: (adj: StockAdjustment) => void;
  onOpenPost: (adj: StockAdjustment) => void;
}

const StockAdjustmentDetailModal: React.FC<StockAdjustmentDetailModalProps> = ({
  open,
  adjustment,
  currentUser,
  canApprove,
  canPost,
  onCancel,
  onOpenApproval,
  onOpenPost,
}) => {
  const [history, setHistory] = useState<StockAdjustmentHistoryItem[]>([]);
  const [impact, setImpact] = useState<LiveStockImpact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && adjustment) {
      setLoading(true);
      Promise.all([
        apiService.get<{ data: StockAdjustmentHistoryItem[] }>(`/inventory/adjustments/${adjustment.id}/history`),
        apiService.get<{ data: LiveStockImpact }>(`/inventory/adjustments/${adjustment.id}/impact`),
      ])
        .then(([histRes, impactRes]) => {
          setHistory(histRes.data || []);
          setImpact(impactRes.data || null);
        })
        .catch((err) => console.error('Failed to load detail info', err))
        .finally(() => setLoading(false));
    }
  }, [open, adjustment]);

  if (!adjustment) return null;

  const isIn = adjustment.adjustmentType === 'ADJUSTMENT_IN' || adjustment.adjustmentType === 'INCREASE';
  const normStatus = adjustment.status === 'SUBMITTED' ? 'PENDING_APPROVAL' : adjustment.status;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
          <span style={{ fontWeight: 700, fontSize: 17 }}>
            Adjustment Details — {adjustment.adjustmentNumber}
          </span>
          <RenderStatusTag status={adjustment.status} />
        </div>
      }
      open={open}
      onCancel={onCancel}
      width={780}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={onCancel}>
          Close
        </Button>,
        normStatus === 'PENDING_APPROVAL' && canApprove && (
          <Button
            key="review"
            type="primary"
            style={{ backgroundColor: '#f59e0b', borderColor: '#f59e0b' }}
            icon={<AuditOutlined />}
            onClick={() => onOpenApproval(adjustment)}
          >
            Review & Decide
          </Button>
        ),
        normStatus === 'APPROVED' && canPost && (
          <Button
            key="post"
            type="primary"
            style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
            icon={<ThunderboltOutlined />}
            onClick={() => onOpenPost(adjustment)}
          >
            Post to Inventory
          </Button>
        ),
      ]}
    >
      <Spin spinning={loading}>
        {/* User / Participant Summary Grid */}
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 8,
            border: '1px solid var(--theme-border, #374151)',
            marginBottom: 16,
          }}
        >
          <Row gutter={[16, 10]}>
            <Col span={6}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Created By:</span>
              <div style={{ fontWeight: 600 }}>{adjustment.createdByUser?.displayName || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                {adjustment.createdAt ? dayjs(adjustment.createdAt).format('DD-MMM-YY HH:mm') : '—'}
              </div>
            </Col>
            <Col span={6}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Submitted By:</span>
              <div style={{ fontWeight: 600 }}>{adjustment.submittedByUser?.displayName || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                {adjustment.submittedAt ? dayjs(adjustment.submittedAt).format('DD-MMM-YY HH:mm') : '—'}
              </div>
            </Col>
            <Col span={6}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                {normStatus === 'RETURNED' ? 'Returned By:' : normStatus === 'REJECTED' ? 'Rejected By:' : 'Approved By:'}
              </span>
              <div style={{ fontWeight: 600 }}>
                {adjustment.approvedByUser?.displayName ||
                  adjustment.returnedByUser?.displayName ||
                  adjustment.rejectedByUser?.displayName ||
                  '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                {(adjustment.approvedAt || adjustment.returnedAt || adjustment.rejectedAt)
                  ? dayjs(adjustment.approvedAt || adjustment.returnedAt || adjustment.rejectedAt).format('DD-MMM-YY HH:mm')
                  : '—'}
              </div>
            </Col>
            <Col span={6}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Posted By:</span>
              <div style={{ fontWeight: 600 }}>{adjustment.postedByUser?.displayName || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                {adjustment.postedAt ? dayjs(adjustment.postedAt).format('DD-MMM-YY HH:mm') : '—'}
              </div>
            </Col>
          </Row>
        </div>

        {/* Reason / Remarks if returned or rejected */}
        {adjustment.returnReason && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 14 }}
            message={<b>Return Reason: {adjustment.returnReason}</b>}
            description={adjustment.returnRemarks}
          />
        )}
        {adjustment.rejectionReason && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 14 }}
            message={<b>Rejection Reason: {adjustment.rejectionReason}</b>}
            description={adjustment.rejectionRemarks}
          />
        )}
        {adjustment.approvalRemarks && (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 14 }}
            message={<b>Approval Remarks: {adjustment.approvalRemarks}</b>}
          />
        )}

        {/* Adjustment Details */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 8]}>
            <Col span={12}>
              <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Item:</span>
              <div style={{ fontWeight: 600 }}>
                {adjustment.itemName || adjustment.itemId}
                {adjustment.itemCode && <span style={{ color: 'var(--theme-text-muted)' }}> ({adjustment.itemCode})</span>}
              </div>
            </Col>
            <Col span={12}>
              <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Warehouse:</span>
              <div style={{ fontWeight: 600 }}>{adjustment.warehouseName || '—'}</div>
            </Col>
            <Col span={12}>
              <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Adjustment Type:</span>
              <div>
                <Tag color={isIn ? 'green' : 'red'}>
                  {isIn ? '+ Adjustment In' : '- Adjustment Out'}
                </Tag>
              </div>
            </Col>
            <Col span={12}>
              <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Quantity:</span>
              <div style={{ fontWeight: 700, fontFamily: 'monospace', color: isIn ? '#10b981' : '#ef4444' }}>
                {isIn ? '+' : '-'}{formatNumber(adjustment.quantity, 4)} {adjustment.uomCode}
              </div>
            </Col>
            <Col span={24}>
              <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Reason:</span>
              <div style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: 4, marginTop: 4 }}>
                {adjustment.reason || '—'}
              </div>
            </Col>
          </Row>
        </Card>

        {/* Stock Impact Card */}
        {impact && (
          <Card size="small" title={<span style={{ fontWeight: 600 }}>Inventory Impact</span>} style={{ marginBottom: 16 }}>
            <Row gutter={12}>
              <Col span={8}>
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '8px 10px', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Current Stock</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 16 }}>
                    {formatNumber(impact.currentStock, 4)} {impact.uom}
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '8px 10px', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Movement</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 16, color: isIn ? '#10b981' : '#ef4444' }}>
                    {isIn ? '+' : '-'}{formatNumber(impact.adjustmentQuantity, 4)} {impact.uom}
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '8px 10px', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Expected Balance</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 16, color: impact.projectedStock < 0 ? '#ef4444' : '#10b981' }}>
                    {formatNumber(impact.projectedStock, 4)} {impact.uom}
                  </div>
                </div>
              </Col>
            </Row>
          </Card>
        )}

        {/* Workflow History Timeline */}
        <Card size="small" title={<span style={{ fontWeight: 600 }}>Workflow & Audit History</span>}>
          {history.length > 0 ? (
            <Timeline
              mode="left"
              style={{ marginTop: 10 }}
              items={history.map((h) => {
                let color = 'blue';
                if (h.action === 'APPROVED') color = 'green';
                if (h.action === 'RETURNED') color = 'orange';
                if (h.action === 'REJECTED') color = 'red';
                if (h.action === 'POSTED') color = 'cyan';

                return {
                  color,
                  label: (
                    <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                      {dayjs(h.createdAt).format('DD-MMM-YY HH:mm')}
                    </span>
                  ),
                  children: (
                    <div>
                      <div>
                        <Tag color={color} style={{ fontSize: 11, marginRight: 6 }}>{h.action}</Tag>
                        <span style={{ fontWeight: 600 }}>{h.performedByUser?.displayName || 'Authorized User'}</span>
                      </div>
                      {h.reason && (
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                          <strong>Reason:</strong> {h.reason}
                        </div>
                      )}
                      {h.remarks && (
                        <div style={{ fontSize: 12, marginTop: 2, color: 'var(--theme-text-muted)' }}>
                          {h.remarks}
                        </div>
                      )}
                    </div>
                  ),
                };
              })}
            />
          ) : (
            <div style={{ color: 'var(--theme-text-muted)', textAlign: 'center', padding: 8 }}>
              No workflow history recorded.
            </div>
          )}
        </Card>
      </Spin>
    </Modal>
  );
};

// ============================================================
// 5. INVENTORY POSTING CONFIRMATION MODAL (StockAdjustmentPostModal)
// ============================================================

interface StockAdjustmentPostModalProps {
  open: boolean;
  adjustment: StockAdjustment | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const StockAdjustmentPostModal: React.FC<StockAdjustmentPostModalProps> = ({
  open,
  adjustment,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [postingNotes, setPostingNotes] = useState('');
  const [impact, setImpact] = useState<LiveStockImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (open && adjustment) {
      setPostingNotes('');
      setLoading(true);
      apiService
        .get<{ data: LiveStockImpact }>(`/inventory/adjustments/${adjustment.id}/impact`)
        .then((res) => setImpact(res.data))
        .catch((err) => console.error('Failed to load posting impact', err))
        .finally(() => setLoading(false));
    }
  }, [open, adjustment]);

  if (!adjustment) return null;

  const isIn = adjustment.adjustmentType === 'ADJUSTMENT_IN' || adjustment.adjustmentType === 'INCREASE';

  const handleConfirmPost = async () => {
    setPosting(true);
    try {
      await apiService.patch(`/inventory/adjustments/${adjustment.id}/post`, {
        postingNotes: postingNotes.trim() || undefined,
      });
      message.success(`Stock adjustment ${adjustment.adjustmentNumber} posted to inventory successfully`);
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
          <span>Post Stock Adjustment to Inventory</span>
        </div>
      }
      open={open}
      onCancel={onCancel}
      confirmLoading={posting}
      onOk={handleConfirmPost}
      okText="Confirm & Post to Inventory"
      okButtonProps={{ style: { backgroundColor: '#10b981', borderColor: '#10b981' } }}
      width={650}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <p style={{ margin: '0 0 12px 0' }}>
          You are about to post adjustment <b>{adjustment.adjustmentNumber}</b> to the stock ledger.
        </p>

        <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', marginBottom: 14 }}>
          <div><strong>Item:</strong> {adjustment.itemName} ({adjustment.itemCode})</div>
          <div><strong>Warehouse:</strong> {adjustment.warehouseName}</div>
          <div>
            <strong>Quantity:</strong>{' '}
            <span style={{ fontWeight: 600, color: isIn ? '#10b981' : '#ef4444' }}>
              {isIn ? '+' : '-'}{formatNumber(adjustment.quantity, 4)} {adjustment.uomCode}
            </span>
          </div>
          <div><strong>Approved By:</strong> {adjustment.approvedByUser?.displayName || 'Authorized Approver'}</div>
        </Card>

        {impact && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 6,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Current Stock:</span>
                <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                  {formatNumber(impact.currentStock, 4)} {impact.uom}
                </div>
              </div>
              <ArrowRightOutlined style={{ color: 'var(--theme-text-muted)' }} />
              <div>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Movement:</span>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', color: isIn ? '#10b981' : '#ef4444' }}>
                  {isIn ? '+' : '-'}{formatNumber(impact.adjustmentQuantity, 4)} {impact.uom}
                </div>
              </div>
              <ArrowRightOutlined style={{ color: 'var(--theme-text-muted)' }} />
              <div>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Expected Stock:</span>
                <div
                  style={{
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: impact.projectedStock < 0 ? '#ef4444' : '#10b981',
                  }}
                >
                  {formatNumber(impact.projectedStock, 4)} {impact.uom}
                </div>
              </div>
            </div>
          </div>
        )}

        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          style={{ marginBottom: 14 }}
          message="Atomic Ledger Transaction"
          description="Posting atomically creates an auditable stock ledger movement and updates the physical inventory balance. Once posted, this record becomes immutable."
        />

        <Form.Item label="Posting Notes / Remarks (Optional)" style={{ marginBottom: 0 }}>
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

export default StockAdjustmentManagement;
