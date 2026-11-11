import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Tabs,
  App,
  Popconfirm,
  DatePicker,
  Row,
  Col,
  Typography,
  Divider,
  Alert,
  Tooltip,
  theme,
} from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  ExportOutlined,
  RollbackOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  ApartmentOutlined,
  ShopOutlined,
  InfoCircleOutlined,
  CalendarOutlined,
  FileTextOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { isValidUUID } from '../../utils/uuid';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';

interface MaterialIssue {
  id: string;
  issueNumber: string;
  issueDate: string;
  storeId: string;
  storeName?: string;
  requestNumber?: string;
  departmentId?: string;
  divisionId?: string;
  sectionId?: string;
  issuedToDepartmentId?: string;
  purpose?: string;
  referenceDocument?: string;
  remarks?: string;
  status: string;
  createdAt?: string;
  lines?: any[];
}

interface StoreOption {
  id: string;
  storeCode: string;
  storeName: string;
  storeType?: string;
  divisionId?: string | null;
  departmentId?: string | null;
  sectionId?: string | null;
}

interface DivisionOption {
  id: string;
  divisionCode?: string;
  divisionName?: string;
  name?: string;
  code?: string;
}

interface SectionOption {
  id: string;
  sectionCode?: string;
  sectionName?: string;
  name?: string;
  code?: string;
  divisionId?: string;
}

interface DepartmentOption {
  id: string;
  departmentCode?: string;
  departmentName?: string;
  name?: string;
  code?: string;
  divisionId?: string;
  sectionId?: string;
}

interface MachineOption {
  id: string;
  machineCode: string;
  machineName: string;
  machineType?: string;
  departmentId?: string;
  sectionId?: string;
  divisionId?: string;
}

const StoreIssues: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('store.issue.create');
  const canPost = can('store.issue.post');

  // Main data states
  const [data, setData] = useState<MaterialIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog & Form states
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<StoreLineItem[]>([]);

  // Selected store and active division for scoping items
  const [selectedSourceStoreId, setSelectedSourceStoreId] = useState<string | undefined>(undefined);
  const [activeDivisionId, setActiveDivisionId] = useState<string | undefined>(undefined);

  // Lookups
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [divisionMap, setDivisionMap] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});

  // Dynamic Machines list for selected department
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(false);

  // Form Cascading Filter States
  const [destDivisionId, setDestDivisionId] = useState<string | undefined>(undefined);
  const [destSectionId, setDestSectionId] = useState<string | undefined>(undefined);
  const [destDepartmentId, setDestDepartmentId] = useState<string | undefined>(undefined);

  // Responsive state
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Initial Load of Master Data & Stores
  useEffect(() => {
    (async () => {
      try {
        const s = await apiService.get<any>('/store/stores', { status: 'ACTIVE' });
        const arr: StoreOption[] = Array.isArray(s) ? s : s?.data || [];
        setStores(arr);
        setStoreMap(Object.fromEntries(arr.map((st) => [st.id, `${st.storeCode} — ${st.storeName}`])));
      } catch {
        /* ignore */
      }

      try {
        const [divRes, secRes, deptRes] = await Promise.allSettled([
          apiService.get<any>('/divisions', { limit: 100, status: 'ACTIVE' }),
          apiService.get<any>('/sections', { limit: 200, status: 'ACTIVE' }),
          apiService.get<any>('/departments', { limit: 500, status: 'ACTIVE' }),
        ]);

        if (divRes.status === 'fulfilled') {
          const raw = divRes.value;
          const dList: DivisionOption[] = Array.isArray(raw) ? raw : raw?.data || [];
          setDivisions(dList);
          const dMap: Record<string, string> = {};
          dList.forEach((d) => {
            dMap[d.id] = d.name || d.divisionName || d.code || d.divisionCode || 'Division';
          });
          setDivisionMap(dMap);
        }
        if (secRes.status === 'fulfilled') {
          const raw = secRes.value;
          setSections(Array.isArray(raw) ? raw : raw?.data || []);
        }
        if (deptRes.status === 'fulfilled') {
          const raw = deptRes.value;
          const dList = Array.isArray(raw) ? raw : raw?.data || [];
          setDepartments(dList);
          const map: Record<string, string> = {};
          dList.forEach((d: DepartmentOption) => {
            const name = d.name || d.departmentName || d.code || d.departmentCode || 'Dept';
            map[d.id] = name;
          });
          setDeptMap(map);
        }
      } catch {
        console.warn('[StoreIssues] Failed to load organizational master data');
      }
    })();
  }, []);

  // 2. Fetch issues list
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<MaterialIssue[]>('/store/material-issues');
      setData(Array.isArray(response) ? response : []);
    } catch {
      message.error('Failed to load material issues');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 3. Dynamic machine loader when Destination Department changes
  const loadMachinesForDepartment = useCallback(async (deptId?: string) => {
    if (!deptId || !isValidUUID(deptId)) {
      setMachines([]);
      return;
    }
    setLoadingMachines(true);
    try {
      const res = await apiService.get<any>('/machines', {
        departmentId: deptId,
        limit: 100,
        status: 'ACTIVE',
      });
      const list = Array.isArray(res) ? res : res?.data || [];
      setMachines(list);
    } catch {
      setMachines([]);
    } finally {
      setLoadingMachines(false);
    }
  }, []);

  // Cascaded sections based on destination division
  const filteredSections = useMemo(() => {
    if (!destDivisionId) return sections;
    return sections.filter((s) => s.divisionId === destDivisionId);
  }, [sections, destDivisionId]);

  // Cascaded departments based on destination section & division
  const filteredDepartments = useMemo(() => {
    return departments.filter((d) => {
      if (destDivisionId && d.divisionId && d.divisionId !== destDivisionId) return false;
      if (destSectionId && d.sectionId && d.sectionId !== destSectionId) return false;
      return true;
    });
  }, [departments, destDivisionId, destSectionId]);

  // Filtered stores strictly based on active division
  const filteredStores = useMemo(() => {
    if (!activeDivisionId) return stores;
    return stores.filter((s) => !s.divisionId || s.divisionId === activeDivisionId);
  }, [stores, activeDivisionId]);

  // Open Create Dialog
  const handleCreate = () => {
    form.resetFields();
    const autoIssueNum = `MI-${dayjs().format('YYYYMMDD')}-${Math.floor(1000 + Math.random() * 9000)}`;
    form.setFieldsValue({
      issueNumber: autoIssueNum,
      issueDate: dayjs(),
      machineSelection: 'OTHER_GENERAL',
    });
    setDestDivisionId(undefined);
    setDestSectionId(undefined);
    setDestDepartmentId(undefined);
    setSelectedSourceStoreId(undefined);
    setActiveDivisionId(undefined);
    setMachines([]);
    setLineItems([]);
    setModalOpen(true);
  };

  // When Primary Division changes
  const handleDivisionChange = (divId?: string) => {
    setActiveDivisionId(divId);
    setDestDivisionId(divId);
    setDestSectionId(undefined);
    setDestDepartmentId(undefined);
    form.setFieldsValue({
      sectionId: undefined,
      departmentId: undefined,
      machineSelection: 'OTHER_GENERAL',
    });
    setMachines([]);

    // Align source store to the newly selected division
    const matchingStores = divId ? stores.filter((s) => !s.divisionId || s.divisionId === divId) : stores;
    if (selectedSourceStoreId && !matchingStores.some((s) => s.id === selectedSourceStoreId)) {
      if (matchingStores.length > 0) {
        setSelectedSourceStoreId(matchingStores[0].id);
        form.setFieldsValue({ storeId: matchingStores[0].id });
      } else {
        setSelectedSourceStoreId(undefined);
        form.setFieldsValue({ storeId: undefined });
      }
    } else if (!selectedSourceStoreId && matchingStores.length > 0) {
      setSelectedSourceStoreId(matchingStores[0].id);
      form.setFieldsValue({ storeId: matchingStores[0].id });
    }
  };

  const handleSectionChange = (secId?: string) => {
    setDestSectionId(secId);
    setDestDepartmentId(undefined);
    form.setFieldsValue({ departmentId: undefined, machineSelection: 'OTHER_GENERAL' });
    setMachines([]);
  };

  const handleDepartmentChange = (deptId?: string) => {
    setDestDepartmentId(deptId);
    form.setFieldsValue({ machineSelection: 'OTHER_GENERAL' });
    if (deptId) {
      loadMachinesForDepartment(deptId);
    } else {
      setMachines([]);
    }
  };

  const handleSourceStoreChange = (storeId?: string) => {
    setSelectedSourceStoreId(storeId);
    const storeObj = stores.find((s) => s.id === storeId);
    // If store has division and user hasn't set division yet, auto-set division
    if (storeObj?.divisionId && !activeDivisionId) {
      setActiveDivisionId(storeObj.divisionId);
      setDestDivisionId(storeObj.divisionId);
      form.setFieldsValue({ divisionId: storeObj.divisionId });
    }
  };

  // Submit / Save Material Issue
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Please add at least one line item');
        return;
      }
      if (values.storeId && !isValidUUID(values.storeId)) {
        message.error('Please select a valid source store');
        return;
      }

      for (const line of lineItems) {
        if (!line.itemId || !isValidUUID(line.itemId)) {
          message.error(`Please select a valid item for line "${line.itemName || 'unknown'}"`);
          return;
        }
        if (!line.uomId || !isValidUUID(line.uomId)) {
          message.error(`Please select a valid UOM for line "${line.itemCode || line.itemName || 'item'}"`);
          return;
        }
        const qty = Number(line.quantity || 0);
        const avail = Number(line.availableStock ?? 0);
        if (qty <= 0) {
          message.error(`Quantity must be greater than zero for line "${line.itemCode || 'item'}"`);
          return;
        }
        if (avail <= 0) {
          message.error(`Cannot issue item "${line.itemCode}": This item is currently Out of Stock (0 available in store).`);
          return;
        }
        if (qty > avail) {
          message.error(`Cannot issue item "${line.itemCode}": Requested quantity (${qty}) exceeds available stock (${avail}) in store.`);
          return;
        }
      }

      // Resolve machine name for reference document
      let machineRef = 'General / Plant Allocation';
      if (values.machineSelection && values.machineSelection !== 'OTHER_GENERAL') {
        const found = machines.find((m) => m.id === values.machineSelection);
        if (found) {
          machineRef = `Machine: ${found.machineCode} — ${found.machineName}`;
        }
      }

      const payload = {
        issueNumber: values.issueNumber,
        issueDate: values.issueDate ? values.issueDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        storeId: values.storeId,
        divisionId: values.divisionId || activeDivisionId || undefined,
        sectionId: values.sectionId || undefined,
        departmentId: values.departmentId || undefined,
        issuedToDepartmentId: values.departmentId || undefined,
        purpose: values.purpose || undefined,
        referenceDocument: machineRef,
        remarks: values.remarks ? `${values.remarks} [${machineRef}]` : machineRef,
        lines: lineItems.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity || 0),
          uomId: l.uomId,
          remarks: l.remarks || undefined,
        })),
      };

      setSubmitting(true);
      await apiService.post('/store/material-issues', payload);
      message.success('Material issue created successfully');
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create material issue');
    } finally {
      setSubmitting(false);
    }
  };

  // Post Issue (deducts stock)
  const handlePost = async (id: string) => {
    try {
      await apiService.post(`/store/material-issues/${id}/post`);
      message.success('Issue posted successfully and stock deducted');
      fetchData();
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to post issue');
    }
  };

  // Cancel Issue
  const handleCancel = async (id: string) => {
    try {
      await apiService.post(`/store/material-issues/${id}/cancel`);
      message.success('Issue cancelled');
      fetchData();
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to cancel issue');
    }
  };

  // Delete Issue
  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/store/material-issues/${id}`);
      message.success('Material issue deleted successfully');
      fetchData();
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to delete material issue');
    }
  };

  // Filtered list based on status and search query
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (activeTab !== 'ALL' && item.status !== activeTab) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const matchNum = item.issueNumber?.toLowerCase().includes(q);
      const matchPurpose = item.purpose?.toLowerCase().includes(q);
      const matchRef = item.referenceDocument?.toLowerCase().includes(q);
      const matchStore = storeMap[item.storeId]?.toLowerCase().includes(q);
      const matchRemarks = item.remarks?.toLowerCase().includes(q);
      return matchNum || matchPurpose || matchRef || matchStore || matchRemarks;
    });
  }, [data, activeTab, searchQuery, storeMap]);

  // Statistics
  const draftCount = data.filter((d) => d.status === 'DRAFT').length;
  const postedCount = data.filter((d) => d.status === 'POSTED').length;
  const cancelledCount = data.filter((d) => d.status === 'CANCELLED').length;

  const columns: ColumnsType<MaterialIssue> = [
    {
      title: 'Issue #',
      dataIndex: 'issueNumber',
      key: 'issueNumber',
      width: 170,
      render: (v: string, r) => (
        <div>
          <Typography.Text strong style={{ color: token.colorPrimary, display: 'block' }}>
            {v}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: '11px' }}>
            {r.issueDate ? dayjs(r.issueDate).format('YYYY-MM-DD') : '—'}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Source Store',
      dataIndex: 'storeId',
      key: 'storeId',
      width: 220,
      render: (id: string, r) => {
        const name = storeMap[id] || r.storeName || id;
        const isGeneral = name.toLowerCase().includes('general') || name.toLowerCase().includes('gs');
        return (
          <Space direction="vertical" size={2}>
            <span style={{ fontWeight: 500 }}>{name}</span>
            {isGeneral && (
              <Tag color="cyan" style={{ fontSize: '10px', width: 'fit-content' }}>
                General Store
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Destination Dept & Machine',
      key: 'destination',
      width: 260,
      render: (_: any, r: MaterialIssue) => {
        const deptId = r.issuedToDepartmentId || r.departmentId;
        const deptName = deptId ? deptMap[deptId] || 'Department' : 'Factory Dept';
        const machineRef = r.referenceDocument || 'General Allocation';
        const isSpecificMachine = machineRef.toLowerCase().includes('machine:');

        return (
          <Space direction="vertical" size={4}>
            <Space size={4}>
              <ApartmentOutlined style={{ color: token.colorPrimary }} />
              <Typography.Text strong style={{ fontSize: '13px' }}>
                {deptName}
              </Typography.Text>
            </Space>
            {isSpecificMachine ? (
              <Tag color="geekblue" icon={<SettingOutlined />} style={{ fontSize: '11px', margin: 0 }}>
                {machineRef.replace(/^Machine:\s*/i, '')}
              </Tag>
            ) : (
              <Tag style={{ fontSize: '11px', margin: 0 }}>
                {machineRef}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Purpose / Remarks',
      dataIndex: 'purpose',
      key: 'purpose',
      width: 200,
      ellipsis: true,
      render: (v: string, r) => (
        <Tooltip title={r.remarks ? `${v || 'No purpose'} | Remarks: ${r.remarks}` : v}>
          <span>{v || r.remarks || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: string) => {
        const colors: Record<string, string> = { DRAFT: 'blue', POSTED: 'success', CANCELLED: 'volcano' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_: any, record: MaterialIssue) => (
        <Space size="small">
          {record.status === 'DRAFT' && canPost && (
            <Popconfirm
              title="Post this material issue?"
              description="Posting will finalize the issue and deduct inventory stock."
              onConfirm={() => handlePost(record.id)}
              okText="Post"
            >
              <Button type="primary" size="small" icon={<CheckOutlined />}>
                Post
              </Button>
            </Popconfirm>
          )}
          {record.status === 'DRAFT' && (
            <Popconfirm
              title="Cancel this issue?"
              description="Are you sure you want to cancel this draft issue?"
              onConfirm={() => handleCancel(record.id)}
              okText="Cancel Issue"
            >
              <Button size="small" icon={<RollbackOutlined />}>
                Cancel
              </Button>
            </Popconfirm>
          )}
          {(record.status === 'DRAFT' || record.status === 'CANCELLED') && (
            <Popconfirm
              title="Delete this material issue?"
              description="Are you sure you want to permanently delete this issue record?"
              onConfirm={() => handleDelete(record.id)}
              okText="Delete"
              cancelText="Keep"
              okButtonProps={{ danger: true }}
            >
              <Button danger size="small" icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    { key: 'ALL', label: `All Issues (${data.length})` },
    { key: 'DRAFT', label: `Draft (${draftCount})` },
    { key: 'POSTED', label: `Posted (${postedCount})` },
    { key: 'CANCELLED', label: `Cancelled (${cancelledCount})` },
  ];

  const activeDivisionName = activeDivisionId ? divisionMap[activeDivisionId] : undefined;

  return (
    <div>
      <PageHeader
        icon={<ExportOutlined />}
        title="Material Issues"
        subtitle="Issue spare parts, tools, and consumables to factory departments and machines"
        extra={
          canCreate ? (
            <Button type="primary" size="middle" icon={<PlusOutlined />} onClick={handleCreate}>
              New Material Issue
            </Button>
          ) : undefined
        }
      />

      <div style={{ padding: '0 24px 24px' }}>
        {/* Quick summary tiles */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Total Issues</Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0' }}>{data.length}</Typography.Title>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Draft / Pending Post</Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0', color: token.colorPrimary }}>{draftCount}</Typography.Title>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Posted to Stock</Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0', color: token.colorSuccess }}>{postedCount}</Typography.Title>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Configured Stores</Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0' }}>{stores.length}</Typography.Title>
            </Card>
          </Col>
        </Row>

        <Card styles={{ body: { padding: 16 } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ marginBottom: 0 }} />
            <Space wrap>
              <Input
                placeholder="Search Issue #, Machine, Purpose..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 260 }}
              />
              <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                Refresh
              </Button>
              {canCreate && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                  New Material Issue
                </Button>
              )}
            </Space>
          </div>

          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 12, showTotal: (t) => `Total ${t} issues` }}
            scroll={{ x: 1100 }}
            size="middle"
          />
        </Card>
      </div>

      {/* CREATE MATERIAL ISSUE MODAL */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 28 }}>
            <Space>
              <ExportOutlined style={{ color: token.colorPrimary }} />
              <span style={{ fontWeight: 600, fontSize: 16 }}>Create Material Issue</span>
            </Space>
            <Tooltip title={isMaximized ? "Restore Default Size" : "Maximize / Fullscreen"}>
              <Button
                type="text"
                size="small"
                icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={() => setIsMaximized(!isMaximized)}
                style={{ color: token.colorTextSecondary }}
              />
            </Tooltip>
          </div>
        }
        open={modalOpen}
        zIndex={1050}
        onOk={handleSave}
        confirmLoading={submitting}
        onCancel={() => setModalOpen(false)}
        width={isMaximized ? '98vw' : isMobile ? '100%' : 1060}
        style={
          isMaximized
            ? { top: 10, margin: '0 auto', maxWidth: '98vw', padding: 0 }
            : isMobile
            ? { top: 10, margin: '0 auto', maxWidth: '100vw' }
            : { top: 24, maxWidth: 1100 }
        }
        styles={{
          body: {
            maxHeight: isMaximized ? 'calc(94vh - 110px)' : 'calc(85vh - 110px)',
            overflowY: 'auto',
            paddingRight: 8,
          },
        }}
        destroyOnHidden
        okText="Create Material Issue"
        cancelText="Cancel"
      >
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="Factory Material & Spare Parts Issue"
          description="Select the source store and destination department/machine. Item selection is strictly scoped to the chosen division to prevent catalog clutter."
          style={{ marginBottom: 16 }}
        />

        <Form form={form} layout="vertical">
          {/* SECTION 1: DIVISION & SOURCE STORE HEADER */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorFillAlter,
              marginBottom: 16,
            }}
          >
            <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: token.colorPrimary }}>
              <ShopOutlined style={{ marginRight: 6 }} />
              1. Division & Source Store Header
            </Typography.Text>
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12} md={6}>
                <Form.Item
                  name="divisionId"
                  label="Division"
                  rules={[{ required: true, message: 'Please select division' }]}
                >
                  <Select
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="Select Division"
                    onChange={handleDivisionChange}
                    options={divisions.map((d) => ({
                      value: d.id,
                      label: `${d.code || d.divisionCode || 'DIV'} — ${d.name || d.divisionName}`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Form.Item
                  name="storeId"
                  label="Source Store"
                  rules={[{ required: true, message: 'Select source store' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder={activeDivisionId ? "Select Store" : "Select Division first"}
                    onChange={handleSourceStoreChange}
                    disabled={!activeDivisionId && stores.length > 0}
                    options={filteredStores.map((s) => ({
                      value: s.id,
                      label: `${s.storeCode} — ${s.storeName}`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Form.Item name="issueNumber" label="Issue Number" rules={[{ required: true, message: 'Issue # is required' }]}>
                  <Input prefix={<FileTextOutlined style={{ color: token.colorTextTertiary }} />} placeholder="MI-2026-0001" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Form.Item name="issueDate" label="Issue Date" rules={[{ required: true, message: 'Date is required' }]}>
                  <DatePicker prefix={<CalendarOutlined style={{ color: token.colorTextTertiary }} />} style={{ width: '100%' }} format="YYYY-MM-DD" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* SECTION 2: DESTINATION HIERARCHY & MACHINE */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorFillAlter,
              marginBottom: 16,
            }}
          >
            <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: token.colorPrimary }}>
              <ApartmentOutlined style={{ marginRight: 6 }} />
              2. Destination Department & Machine Allocation
            </Typography.Text>
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12}>
                <Form.Item name="sectionId" label="Destination Section">
                  <Select
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="Select Section"
                    onChange={handleSectionChange}
                    disabled={!activeDivisionId && filteredSections.length === 0}
                    options={filteredSections.map((s) => ({
                      value: s.id,
                      label: `${s.code || s.sectionCode || 'SEC'} — ${s.name || s.sectionName}`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="departmentId"
                  label="Issued To Department"
                  rules={[{ required: true, message: 'Please select destination department' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select Department"
                    onChange={handleDepartmentChange}
                    disabled={!activeDivisionId && filteredDepartments.length === 0}
                    options={filteredDepartments.map((d) => ({
                      value: d.id,
                      label: `${d.code || d.departmentCode || 'DEPT'} — ${d.name || d.departmentName}`,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* DYNAMIC MACHINE SELECTION */}
            <Row gutter={[16, 12]}>
              <Col xs={24}>
                <Form.Item
                  name="machineSelection"
                  label={
                    <Space size={6}>
                      <SettingOutlined style={{ color: token.colorPrimary }} />
                      <span>Machine / Equipment Selection</span>
                      <Typography.Text type="secondary" style={{ fontSize: '11px' }}>
                        (Allocated to specific factory machine, or General Allocation if non-machine)
                      </Typography.Text>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Please select a machine or General' }]}
                >
                  <Select
                    showSearch
                    loading={loadingMachines}
                    placeholder="Select machine (e.g. SPK-01, FT-01) or General Allocation"
                    optionFilterProp="label"
                    options={[
                      {
                        value: 'OTHER_GENERAL',
                        label: '⚙️ General / Plant Allocation (No Specific Machine)',
                      },
                      ...machines.map((m) => ({
                        value: m.id,
                        label: `⚙️ ${m.machineCode} — ${m.machineName} (${m.machineType || 'Machine'})`,
                      })),
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* SECTION 3: PURPOSE & REMARKS */}
          <Row gutter={[16, 12]}>
            <Col xs={24} sm={12}>
              <Form.Item name="purpose" label="Purpose / Reason for Issue">
                <Input placeholder="e.g. Preventive maintenance, Bearing replacement, Tool changeover" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="remarks" label="Remarks / Special Instructions">
                <Input placeholder="Optional additional remarks" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '14px 0 16px' }} />

          {/* SECTION 4: ISSUED ITEMS STRICTLY FILTERED BY DIVISION */}
          <StoreLineItemsEditor
            mode="issue"
            value={lineItems}
            onChange={setLineItems}
            storeId={selectedSourceStoreId}
            divisionId={activeDivisionId}
            divisionName={activeDivisionName}
            excludeFinishedGoods={true}
            label="Issued Store Items"
          />
        </Form>
      </Modal>
    </div>
  );
};

export default StoreIssues;
