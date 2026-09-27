import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Input,
  Select,
  Modal,
  Form,
  Card,
  Row,
  Col,
  Statistic,
  Tooltip,
  Popconfirm,
  notification,
  Divider,
  Badge,
  Alert,
} from 'antd';
import {
  ScanOutlined,
  PlusOutlined,
  PrinterOutlined,
  LockOutlined,
  CarOutlined,
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  QrcodeOutlined,
  HistoryOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import {
  DispatchPackage,
  DispatchPackageStatus,
  dispatchPackageService,
  CreateDispatchPackagePayload,
} from '../../services/dispatchPackageService';
import { apiService } from '../../services/api';
import { MobilePackageBuilder } from './MobilePackageBuilder';
import { DispatchPackagePrintModal } from './DispatchPackagePrint';
import { GatePassExitModal } from './GatePassExitModal';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';

const { Title, Text } = Typography;

const DISPATCH_PACKAGES_TAB_ID = '/dispatch/packages';

export const DispatchPackagesPage: React.FC = () => {
  const [packages, setPackages] = useState<DispatchPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<DispatchPackageStatus | undefined>(undefined);
  const [searchText, setSearchText] = useState('');

  // Modals & Drawers state
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const [printPkg, setPrintPkg] = useState<DispatchPackage | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const [gatePassPkg, setGatePassPkg] = useState<DispatchPackage | null>(null);
  const [gatePassModalOpen, setGatePassModalOpen] = useState(false);
  const [gateScanMode, setGateScanMode] = useState(false);

  const [newPkgModalOpen, setNewPkgModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [traceSearchKey, setTraceSearchKey] = useState('');
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceResult, setTraceResult] = useState<any>(null);

  // Reference data for New Package Modal
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [newPackageForm] = Form.useForm();

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dispatchPackageService.list({
        status: statusFilter,
        search: searchText.trim() || undefined,
        page,
        limit: 20,
      });
      setPackages(res.data);
      setTotal(res.total);
    } catch (err: any) {
      notification.error({
        message: 'Failed to load packages',
        description: err?.message || 'Error occurred while loading packages',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchText, page]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // Tab refresh listener
  useEffect(() => {
    const handleTabRefresh = (e: any) => {
      if (!e.detail?.tabId || e.detail.tabId === DISPATCH_PACKAGES_TAB_ID) {
        loadPackages();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleTabRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleTabRefresh);
  }, [loadPackages]);

  // Load customers & warehouses once for creation
  useEffect(() => {
    apiService
      .get<{ data: any[] }>('/customer/customers', { limit: 100 })
      .then((res) => {
        if (Array.isArray(res.data)) setCustomers(res.data);
      })
      .catch(() => {});

    apiService
      .get<{ data: any[] }>('/organization/warehouses', { limit: 50 })
      .then((res) => {
        if (Array.isArray(res.data)) setWarehouses(res.data);
      })
      .catch(() => {});
  }, []);

  const handleCreatePackage = async (values: any) => {
    setCreateLoading(true);
    try {
      const payload: CreateDispatchPackagePayload = {
        customerId: values.customerId || null,
        customerName:
          customers.find((c) => c.id === values.customerId)?.name || values.customerName || null,
        salesOrderNo: values.salesOrderNo || null,
        warehouseId: values.warehouseId || null,
        warehouseName:
          warehouses.find((w) => w.id === values.warehouseId)?.name || null,
        dispatchLocation: values.dispatchLocation || null,
        vehicleNo: values.vehicleNo || null,
        driverName: values.driverName || null,
        remarks: values.remarks || null,
      };

      const res = await dispatchPackageService.create(payload);
      notification.success({
        message: 'Package Created',
        description: `Package ${res.data.packageNo} opened. Ready for mobile QR scanning.`,
      });
      setNewPkgModalOpen(false);
      newPackageForm.resetFields();
      loadPackages();
      // Immediately open builder for this new package
      setSelectedPkgId(res.data.id);
      setBuilderOpen(true);
    } catch (err: any) {
      notification.error({
        message: 'Package Creation Failed',
        description: err?.message || 'Could not start new package',
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleTraceLookup = async () => {
    if (!traceSearchKey.trim()) return;
    setTraceLoading(true);
    setTraceResult(null);
    try {
      const res = await dispatchPackageService.traceLookup(traceSearchKey.trim());
      setTraceResult(res.data);
    } catch (err: any) {
      notification.error({
        message: 'Trace Lookup Failed',
        description: err?.response?.data?.message || err?.message || 'No record found',
      });
    } finally {
      setTraceLoading(false);
    }
  };

  const getStatusBadge = (status: DispatchPackageStatus) => {
    switch (status) {
      case DispatchPackageStatus.OPEN:
        return <Tag color="blue">OPEN (Scanning)</Tag>;
      case DispatchPackageStatus.FINALIZED:
        return <Tag color="green">FINALIZED (Locked)</Tag>;
      case DispatchPackageStatus.DISPATCHED:
        return <Tag color="purple">DISPATCHED (Exited)</Tag>;
      case DispatchPackageStatus.CANCELLED:
        return <Tag color="red">CANCELLED</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  // Summary counts
  const openCount = packages.filter((p) => p.status === DispatchPackageStatus.OPEN).length;
  const finalizedCount = packages.filter((p) => p.status === DispatchPackageStatus.FINALIZED).length;
  const dispatchedCount = packages.filter((p) => p.status === DispatchPackageStatus.DISPATCHED).length;

  const columns = [
    {
      title: 'Package No',
      key: 'packageNo',
      render: (_: any, r: DispatchPackage) => (
        <div>
          <a
            onClick={() => {
              setSelectedPkgId(r.id);
              setBuilderOpen(true);
            }}
            style={{ fontWeight: 800, fontSize: 14, color: 'var(--theme-primary, #0284c7)' }}
          >
            {r.packageNo}
          </a>
          <div style={{ marginTop: 2 }}>{getStatusBadge(r.status)}</div>
        </div>
      ),
    },
    {
      title: 'Customer & SO',
      key: 'customer',
      render: (_: any, r: DispatchPackage) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.customerName || 'General Dispatch'}</div>
          {r.salesOrderNo && (
            <div style={{ fontSize: 11, color: '#64748b' }}>SO: {r.salesOrderNo}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Units',
      key: 'totalUnits',
      align: 'center' as const,
      render: (_: any, r: DispatchPackage) => (
        <Badge
          count={r.totalUnits}
          overflowCount={999}
          style={{ backgroundColor: '#0284c7', fontWeight: 800 }}
        />
      ),
    },
    {
      title: 'Weight (KG)',
      key: 'totalWeight',
      align: 'right' as const,
      render: (_: any, r: DispatchPackage) => (
        <strong style={{ color: '#059669' }}>{Number(r.totalWeight || 0).toFixed(2)} KG</strong>
      ),
    },
    {
      title: 'Length (M)',
      key: 'totalLength',
      align: 'right' as const,
      render: (_: any, r: DispatchPackage) => (
        <span>{Number(r.totalLength || 0).toLocaleString()} M</span>
      ),
    },
    {
      title: 'Gate Pass / Vehicle',
      key: 'gatePass',
      render: (_: any, r: DispatchPackage) => (
        <div>
          {r.gatePassNo ? (
            <Tag color="cyan">{r.gatePassNo}</Tag>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Not Linked
            </Text>
          )}
          {r.vehicleNo && <div style={{ fontSize: 11, color: '#475569' }}>{r.vehicleNo}</div>}
        </div>
      ),
    },
    {
      title: 'Date',
      key: 'packageDate',
      render: (_: any, r: DispatchPackage) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {new Date(r.packageDate || r.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: DispatchPackage) => (
        <Space size="small">
          <Button
            size="small"
            type={r.status === DispatchPackageStatus.OPEN ? 'primary' : 'default'}
            icon={<ScanOutlined />}
            onClick={() => {
              setSelectedPkgId(r.id);
              setBuilderOpen(true);
            }}
          >
            {r.status === DispatchPackageStatus.OPEN ? 'Scan & Pack' : 'View'}
          </Button>

          {r.status !== DispatchPackageStatus.OPEN && (
            <Tooltip title="Print Package Document">
              <Button
                size="small"
                icon={<PrinterOutlined />}
                onClick={() => {
                  setPrintPkg(r);
                  setPrintModalOpen(true);
                }}
              />
            </Tooltip>
          )}

          {r.status === DispatchPackageStatus.FINALIZED && (
            <Tooltip title="Link Gate Pass / Exit">
              <Button
                size="small"
                icon={<CarOutlined />}
                style={{ color: '#7c3aed', borderColor: '#a78bfa' }}
                onClick={() => {
                  setGatePassPkg(r);
                  setGateScanMode(false);
                  setGatePassModalOpen(true);
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 20px', minHeight: '100%' }}>
      {/* 1. Header Bar with Actions */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ScanOutlined style={{ color: 'var(--theme-primary, #0284c7)' }} />
            <span>Dispatch Packages &amp; Mobile QR Scanning</span>
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Mobile QR production unit scanning, package aggregation, Gate Pass verification &amp; factory dispatch
          </Text>
        </div>

        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setNewPkgModalOpen(true)}
            style={{ fontWeight: 700 }}
          >
            New Package
          </Button>
          <Button
            icon={<CarOutlined />}
            onClick={() => {
              setGatePassPkg(null);
              setGateScanMode(true);
              setGatePassModalOpen(true);
            }}
          >
            Scan Package at Gate
          </Button>
          <Button
            icon={<HistoryOutlined />}
            onClick={() => {
              setTraceSearchKey('');
              setTraceResult(null);
              setTraceModalOpen(true);
            }}
          >
            Traceability Search
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadPackages} loading={loading} />
        </Space>
      </div>

      {/* 2. Top Metric Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--theme-surface-alt, #f8fafc)' }}>
            <Statistic
              title="Open Packages (Scanning)"
              value={openCount}
              valueStyle={{ color: '#0284c7', fontWeight: 800 }}
              prefix={<ScanOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--theme-surface-alt, #f8fafc)' }}>
            <Statistic
              title="Finalized (Ready For Gate)"
              value={finalizedCount}
              valueStyle={{ color: '#16a34a', fontWeight: 800 }}
              prefix={<LockOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--theme-surface-alt, #f8fafc)' }}>
            <Statistic
              title="Dispatched / Exited"
              value={dispatchedCount}
              valueStyle={{ color: '#9333ea', fontWeight: 800 }}
              prefix={<CarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--theme-surface-alt, #f8fafc)' }}>
            <Statistic
              title="Total Registered Packages"
              value={total}
              valueStyle={{ color: '#475569', fontWeight: 800 }}
              prefix={<InboxOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 3. Filters & Search */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <Space wrap>
          <Input
            placeholder="Search Package #, Customer, SO, Vehicle, Coil, Serial..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={() => {
              setPage(1);
              loadPackages();
            }}
            style={{ width: 320 }}
            allowClear
          />
          <Select
            placeholder="Filter by Status"
            allowClear
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            style={{ width: 180 }}
          >
            <Select.Option value={DispatchPackageStatus.OPEN}>OPEN (Scanning)</Select.Option>
            <Select.Option value={DispatchPackageStatus.FINALIZED}>FINALIZED (Locked)</Select.Option>
            <Select.Option value={DispatchPackageStatus.DISPATCHED}>DISPATCHED (Exited)</Select.Option>
            <Select.Option value={DispatchPackageStatus.CANCELLED}>CANCELLED</Select.Option>
          </Select>
        </Space>
      </div>

      {/* 4. Table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={packages}
        loading={loading}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          onChange: (p) => setPage(p),
          showTotal: (tot) => `Total ${tot} packages`,
        }}
        scroll={{ x: 800 }}
      />

      {/* 5. Mobile Package Builder Drawer */}
      <MobilePackageBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        pkgId={selectedPkgId}
        onPackageUpdated={(updated) => {
          setPackages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }}
        onOpenGatePassModal={(targetPkg) => {
          setGatePassPkg(targetPkg);
          setGateScanMode(false);
          setGatePassModalOpen(true);
        }}
      />

      {/* 6. Package Print Modal */}
      <DispatchPackagePrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        pkg={printPkg}
        onPrintRecorded={() => {
          loadPackages();
        }}
      />

      {/* 7. Gate Pass / Factory Exit Modal */}
      <GatePassExitModal
        open={gatePassModalOpen}
        onClose={() => setGatePassModalOpen(false)}
        pkg={gatePassPkg}
        gateScanMode={gateScanMode}
        onPackageUpdated={() => {
          loadPackages();
        }}
      />

      {/* 8. Start New Package Modal */}
      <Modal
        open={newPkgModalOpen}
        onCancel={() => setNewPkgModalOpen(false)}
        title={
          <Space>
            <PlusOutlined style={{ color: 'var(--theme-primary, #0284c7)' }} />
            <span>Start New Dispatch Package</span>
          </Space>
        }
        footer={null}
      >
        <Form form={newPackageForm} layout="vertical" onFinish={handleCreatePackage}>
          <Form.Item name="customerId" label="Customer (Optional)">
            <Select
              showSearch
              placeholder="Select Customer or leave for General Dispatch"
              allowClear
              optionFilterProp="children"
            >
              {customers.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} {c.customerCode ? `(${c.customerCode})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="salesOrderNo" label="Sales Order No">
              <Input placeholder="e.g. SO-2026-00123" />
            </Form.Item>

            <Form.Item name="warehouseId" label="Origin Warehouse">
              <Select placeholder="Select Warehouse" allowClear>
                {warehouses.map((w) => (
                  <Select.Option key={w.id} value={w.id}>
                    {w.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="vehicleNo" label="Vehicle No">
              <Input placeholder="e.g. LEA-1234" />
            </Form.Item>

            <Form.Item name="driverName" label="Driver Name">
              <Input placeholder="e.g. Tariq Mehmood" />
            </Form.Item>
          </div>

          <Form.Item name="remarks" label="Package Notes / Instructions">
            <Input.TextArea rows={2} placeholder="Optional package instructions..." />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={() => setNewPkgModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={createLoading} style={{ fontWeight: 700 }}>
              Create Package &amp; Open Scanner
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 9. Full Traceability Lookup Modal */}
      <Modal
        open={traceModalOpen}
        onCancel={() => setTraceModalOpen(false)}
        title={
          <Space>
            <HistoryOutlined style={{ color: '#0284c7' }} />
            <span>End-to-End Production &bull; Package &bull; Dispatch Traceability</span>
          </Space>
        }
        footer={[
          <Button key="close" onClick={() => setTraceModalOpen(false)}>
            Close
          </Button>,
        ]}
      >
        <div style={{ padding: '8px 0' }}>
          <Space style={{ width: '100%', marginBottom: 14 }}>
            <Input
              size="large"
              placeholder="Enter PU Serial (PWI-PU-...), Coil No (CN-011), or Package (PKG-...)"
              value={traceSearchKey}
              onChange={(e) => setTraceSearchKey(e.target.value)}
              onPressEnter={handleTraceLookup}
              prefix={<SearchOutlined />}
            />
            <Button type="primary" size="large" onClick={handleTraceLookup} loading={traceLoading}>
              Trace
            </Button>
          </Space>

          {traceResult && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                Trace Type: <Tag color="blue">{traceResult.type}</Tag>
              </div>

              {traceResult.productionUnit && (
                <div style={{ marginBottom: 10, padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#0284c7', fontWeight: 800, fontSize: 14 }}>
                    Coil: {traceResult.productionUnit.coilNo} ({traceResult.productionUnit.unitSerialNo})
                  </div>
                  <div>Item: {traceResult.productionUnit.item?.name || 'Item'}</div>
                  <div>
                    Weight: {traceResult.productionUnit.weightKg} KG &bull; Length: {traceResult.productionUnit.lengthMeters} M
                  </div>
                  <div>Date: {traceResult.productionUnit.productionDate} &bull; Batch: {traceResult.productionUnit.batchNo || '-'}</div>
                </div>
              )}

              {traceResult.dispatchPackage ? (
                <div style={{ padding: 8, background: '#f0fdf4', borderRadius: 6, border: '1px solid #86efac' }}>
                  <div style={{ color: '#15803d', fontWeight: 800, fontSize: 14 }}>
                    Assigned Package: {traceResult.dispatchPackage.packageNo}
                  </div>
                  <div>Customer: {traceResult.dispatchPackage.customerName || 'N/A'}</div>
                  <div>Status: <Tag color="green">{traceResult.dispatchPackage.status}</Tag></div>
                  <div>Gate Pass: {traceResult.dispatchPackage.gatePassNo || 'Not linked'}</div>
                  <div>Vehicle: {traceResult.dispatchPackage.vehicleNo || 'N/A'}</div>
                </div>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="Not Yet Assigned to any Package"
                  description="This production unit is currently in finished goods inventory and has not been packed for dispatch."
                />
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default DispatchPackagesPage;
