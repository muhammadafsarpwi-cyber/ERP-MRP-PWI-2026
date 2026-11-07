import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, App, Row, Col, Tag, Tabs, Statistic, Typography, theme } from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  PrinterOutlined,
  WhatsAppOutlined,
  SettingOutlined,
  FilterOutlined,
  ReloadOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';
import { QmsInProcessInspection, ItemQcSpecification } from './types';
import {
  loadInProcessInspections,
  saveInProcessInspections,
  loadAllSpecs,
  saveAllSpecs,
} from './qcSpecsStore';
import { InProcessInspectionModal } from './InProcessInspectionModal';
import { QmsPrintableSheet } from './QmsPrintableSheet';
import { ItemQcSpecsMaster } from './ItemQcSpecsMaster';
import { exportQmsToPdf } from './exportQmsPdf';

interface LegacyInspection {
  id: string;
  inspectionNo: string;
  inspectionType: string;
  result: string;
  status: string;
  quantity?: number;
}

// Known divisions and departments fallback
const PWI_DIVISIONS = [
  { id: 'd1000000-0000-0000-0000-000000000001', code: 'DIV-SPD', name: 'Spoke Division' },
  { id: 'd1000000-0000-0000-0000-000000000002', code: 'DIV-CCD', name: 'Control Cable Division' },
  { id: '50824516-9c24-4122-86e7-c8e6fa1c5869', code: 'DIV-001', name: 'Manufacturing Division' },
];

const PWI_DEPARTMENTS: Record<string, Array<{ id: string; code: string; name: string }>> = {
  'DIV-SPD': [
    { id: 'd3000000-0000-0000-0000-000000000003', code: 'SPD-DEPT003', name: 'Spoke' },
    { id: 'd3000000-0000-0000-0000-000000000004', code: 'SPD-DEPT004', name: 'Header' },
    { id: 'd3000000-0000-0000-0000-000000000001', code: 'SPD-DEPT001', name: 'Straightener' },
    { id: 'd3000000-0000-0000-0000-000000000002', code: 'SPD-DEPT002', name: 'Swagging' },
    { id: 'd3000000-0000-0000-0000-000000000005', code: 'SPD-DEPT005', name: 'Nipple' },
    { id: 'd3000000-0000-0000-0000-000000000006', code: 'SPD-DEPT006', name: 'Spoke Plating' },
    { id: 'd3000000-0000-0000-0000-000000000008', code: 'SPD-DEPT008', name: 'Spoke Packing' },
  ],
  'DIV-CCD': [
    { id: 'd3000000-0000-0000-0000-000000000010', code: 'CCD-DEPT001', name: 'Flattening' },
    { id: 'd3000000-0000-0000-0000-000000000011', code: 'CCD-DEPT002', name: 'Spiral' },
    { id: 'd3000000-0000-0000-0000-000000000012', code: 'CCD-DEPT003', name: 'PVC' },
    { id: '5676c09a-f334-43a8-8309-f43d99e01320', code: 'CCD-DEPT005', name: 'Cutting & Packing' },
  ],
  'DIV-001': [
    { id: 'cfac6089-9a19-403a-b37d-7b2622c2d01c', code: 'DEPT-001', name: 'Production' },
    { id: '8a7f2b26-194d-4e78-af3b-4a851fb1719e', code: 'DEPT-005', name: 'Quality Control' },
  ],
};

const QcPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  // Cascading Division & Department state
  const [selectedDivisionCode, setSelectedDivisionCode] = useState<string>('DIV-SPD');
  const [selectedDepartmentCode, setSelectedDepartmentCode] = useState<string>('SPD-DEPT003');

  // Specs & In-Process Inspections
  const [specs, setSpecs] = useState<ItemQcSpecification[]>([]);
  const [inProcessInspections, setInProcessInspections] = useState<QmsInProcessInspection[]>([]);
  const [runningModalVisible, setRunningModalVisible] = useState(false);
  const [sheetModalVisible, setSheetModalVisible] = useState(false);
  const [selectedInspectionForSheet, setSelectedInspectionForSheet] = useState<QmsInProcessInspection | null>(null);

  // Filter state for In-Process inspections
  const [filterShift, setFilterShift] = useState<string>('ALL');
  const [filterMachine, setFilterMachine] = useState<string>('ALL');
  const [filterResult, setFilterResult] = useState<string>('ALL');

  // Legacy data state (Incoming / GRN inspections, NCR, CAPA)
  const [legacyData, setLegacyData] = useState<LegacyInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [plans, setPlans] = useState<Array<{ id: string; planCode: string; planName: string }>>([]);
  const [items, setItems] = useState<Array<{ id: string; itemCode: string; name: string }>>([]);
  const [ncrData, setNcrData] = useState<any[]>([]);
  const [capaData, setCapaData] = useState<any[]>([]);

  // Load user & initialize store
  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
      } catch {
        /* ignore */
      }
    }
    setSpecs(loadAllSpecs());
    setInProcessInspections(loadInProcessInspections());
  }, []);

  // Fetch legacy backend QC data
  const fetchData = useCallback(
    async (pageNum = 1) => {
      if (!companyId) return;
      setLoading(true);
      try {
        const res = await apiService.get<{ data: LegacyInspection[]; total: number }>('/qc/inspections', {
          companyId,
          page: pageNum,
          limit: 20,
        });
        setLegacyData(res.data || []);
        setTotal(res.total || 0);

        const n = await apiService.get<{ data: any[] }>('/qc/ncr', { companyId, limit: 20 });
        setNcrData(n.data || []);

        const c = await apiService.get<{ data: any[] }>('/qc/capa', { companyId, limit: 20 });
        setCapaData(c.data || []);
      } catch {
        // Soft fallback
      } finally {
        setLoading(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    if (!companyId) return;
    fetchData(page);

    (async () => {
      try {
        const p = await apiService.get<{ data: Array<{ id: string; planCode: string; planName: string }> }>('/qc/plans', { companyId });
        setPlans(p.data || []);
      } catch {
        /* ignore */
      }
      try {
        const it = await apiService.get<{ data: Array<{ id: string; itemCode: string; name: string }> }>('/master-data/items', { limit: 100 });
        setItems(it.data || []);
      } catch {
        /* ignore */
      }
    })();
  }, [companyId, fetchData, page]);

  // Active division & department names
  const activeDivision = useMemo(() => {
    return PWI_DIVISIONS.find((d) => d.code === selectedDivisionCode) || PWI_DIVISIONS[0];
  }, [selectedDivisionCode]);

  const activeDepartmentsList = useMemo(() => {
    return PWI_DEPARTMENTS[selectedDivisionCode] || [];
  }, [selectedDivisionCode]);

  const activeDepartment = useMemo(() => {
    return activeDepartmentsList.find((d) => d.code === selectedDepartmentCode) || activeDepartmentsList[0];
  }, [activeDepartmentsList, selectedDepartmentCode]);

  // Handle cascading division change
  const handleDivisionChange = (divCode: string) => {
    setSelectedDivisionCode(divCode);
    const depts = PWI_DEPARTMENTS[divCode] || [];
    if (depts.length > 0) {
      setSelectedDepartmentCode(depts[0].code);
    }
  };

  // Filtered in-process inspections
  const filteredInspections = useMemo(() => {
    return inProcessInspections.filter((insp) => {
      if (filterShift !== 'ALL' && insp.shift !== filterShift) return false;
      if (filterMachine !== 'ALL' && !insp.machineNo.includes(filterMachine)) return false;
      if (filterResult !== 'ALL' && insp.overallResult !== filterResult) return false;
      return true;
    });
  }, [inProcessInspections, filterShift, filterMachine, filterResult]);

  // Key KPI metrics
  const kpiStats = useMemo(() => {
    const totalCount = filteredInspections.length;
    const passCount = filteredInspections.filter((i) => i.overallResult === 'PASS').length;
    const failCount = filteredInspections.filter((i) => i.overallResult === 'FAIL').length;
    const passRate = totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : '100.0';
    return { totalCount, passCount, failCount, passRate };
  }, [filteredInspections]);

  // Save new/edited inspection
  const handleSaveInspection = (newInsp: QmsInProcessInspection) => {
    const existingIdx = inProcessInspections.findIndex((i) => i.id === newInsp.id);
    let updated: QmsInProcessInspection[];
    if (existingIdx >= 0) {
      updated = inProcessInspections.map((i) => (i.id === newInsp.id ? newInsp : i));
    } else {
      updated = [newInsp, ...inProcessInspections];
    }
    setInProcessInspections(updated);
    saveInProcessInspections(updated);

    // Also attempt saving to backend /qc/inspections so it is auditable in backend
    if (companyId) {
      apiService
        .post('/qc/inspections', {
          companyId,
          inspectionType: 'IN_PROCESS',
          inspectionDate: newInsp.inspectionDate,
          remarks: JSON.stringify({
            docRef: newInsp.docRef,
            revNo: newInsp.revNo,
            shift: newInsp.shift,
            machineNo: newInsp.machineNo,
            operatorName: newInsp.operatorName,
            itemCode: newInsp.itemCode,
            itemName: newInsp.itemName,
            inspectorName: newInsp.inspectorName,
            overallResult: newInsp.overallResult,
            samplesCount: newInsp.samples.length,
          }),
        })
        .catch(() => {
          /* soft fallback */
        });
    }
  };

  // Open QMS printable sheet
  const handleOpenSheet = (insp: QmsInProcessInspection | null) => {
    if (!insp) return;
    setSelectedInspectionForSheet(insp);
    setSheetModalVisible(true);
  };

  // Columns for In-Process Inspection Register
  const inProcessColumns: ColumnsType<QmsInProcessInspection> = [
    {
      title: 'Inspection #',
      dataIndex: 'inspectionNo',
      key: 'inspectionNo',
      width: 120,
      render: (no: string, r) => (
        <a style={{ fontWeight: 700, color: token.colorPrimary }} onClick={() => handleOpenSheet(r)}>
          {no}
        </a>
      ),
    },
    {
      title: 'Date & Shift',
      key: 'dateTime',
      width: 140,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: token.colorText }}>{r.inspectionDate}</div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Shift {r.shift}</div>
        </div>
      ),
    },
    {
      title: 'Machine & Operator',
      key: 'machineOp',
      width: 160,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: token.colorText }}>Machine {r.machineNo}</div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Op: {r.operatorName}</div>
        </div>
      ),
    },
    {
      title: 'Part / Item',
      key: 'item',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 700, color: token.colorPrimary }}>{r.itemName}</div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>{r.itemCode}</div>
        </div>
      ),
    },
    {
      title: 'Dimensional Samples (Avg)',
      key: 'samples',
      render: (_, r) => (
        <Space size={[4, 4]} wrap>
          {r.samples.slice(0, 3).map((s, idx) => (
            <Tag key={idx} color={s.status === 'PASS' ? 'default' : 'error'}>
              {s.charName}: {s.average ? `${s.average}${s.unit}` : '-'}
            </Tag>
          ))}
          {r.samples.length > 3 && (
            <span style={{ fontSize: '10px', color: token.colorTextSecondary }}>+{r.samples.length - 3} more</span>
          )}
        </Space>
      ),
    },
    {
      title: 'Visual (10/0)',
      key: 'attrs',
      width: 120,
      render: (_, r) => (
        <Space size={2} wrap>
          {r.attributes.map((a, idx) => (
            <Tag key={idx} color={a.status === 'PASS' ? 'green' : 'red'}>
              {a.status === 'PASS' ? 'OK' : 'DEV'}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Overall Result',
      dataIndex: 'overallResult',
      key: 'result',
      width: 110,
      render: (res: string) => (
        <Tag color={res === 'PASS' ? 'success' : 'error'} style={{ fontWeight: 700, padding: '2px 8px' }}>
          {res}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => handleOpenSheet(r)}>
            QMS Sheet
          </Button>
          <Button
            size="small"
            danger
            icon={<FilePdfOutlined />}
            onClick={() => {
              try {
                const fname = exportQmsToPdf(r);
                message.success(`Downloaded ${fname}`);
              } catch {
                message.error('Failed to generate PDF');
              }
            }}
          >
            PDF
          </Button>
          <Button
            size="small"
            style={{ color: '#25D366' }}
            icon={<WhatsAppOutlined />}
            onClick={() => handleOpenSheet(r)}
          />
        </Space>
      ),
    },
  ];

  // Tab definitions
  const tabItems = [
    {
      key: 'running',
      label: (
        <span>
          <CheckCircleOutlined /> Running Production Inspections (SPD/QMS/05)
        </span>
      ),
      children: (
        <div>
          {/* Executive KPI Summary Cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: '8px' }}>
                <Statistic
                  title={<span style={{ fontSize: '12px', color: token.colorTextSecondary }}>Total Running Audits</span>}
                  value={kpiStats.totalCount}
                  valueStyle={{ fontSize: '20px', fontWeight: 800, color: token.colorText }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: '8px' }}>
                <Statistic
                  title={<span style={{ fontSize: '12px', color: token.colorTextSecondary }}>Passed Inspections</span>}
                  value={kpiStats.passCount}
                  valueStyle={{ fontSize: '20px', fontWeight: 800, color: token.colorSuccess }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: '8px' }}>
                <Statistic
                  title={<span style={{ fontSize: '12px', color: token.colorTextSecondary }}>Out of Spec / Deviations</span>}
                  value={kpiStats.failCount}
                  valueStyle={{ fontSize: '20px', fontWeight: 800, color: kpiStats.failCount > 0 ? token.colorError : token.colorTextTertiary }}
                  prefix={<CloseCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: '8px' }}>
                <Statistic
                  title={<span style={{ fontSize: '12px', color: token.colorTextSecondary }}>Overall Compliance Rate</span>}
                  value={kpiStats.passRate}
                  suffix="%"
                  valueStyle={{ fontSize: '20px', fontWeight: 800, color: token.colorPrimary }}
                />
              </Card>
            </Col>
          </Row>

          {/* Action & Filter Strip */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <Space wrap>
              <span style={{ fontSize: '12px', color: token.colorTextSecondary }}>Filter:</span>
              <Select
                size="small"
                style={{ width: '120px' }}
                value={filterShift}
                onChange={setFilterShift}
                options={[
                  { value: 'ALL', label: 'All Shifts' },
                  { value: 'G', label: 'Shift G' },
                  { value: 'A', label: 'Shift A' },
                  { value: 'B', label: 'Shift B' },
                  { value: 'C', label: 'Shift C' },
                ]}
              />
              <Select
                size="small"
                style={{ width: '140px' }}
                value={filterMachine}
                onChange={setFilterMachine}
                options={[
                  { value: 'ALL', label: 'All Machines' },
                  { value: '01', label: 'Machine 01' },
                  { value: '02', label: 'Machine 02' },
                  { value: '03', label: 'Machine 03' },
                  { value: '04', label: 'Machine 04' },
                  { value: '05', label: 'Machine 05' },
                  { value: '06', label: 'Machine 06' },
                ]}
              />
              <Select
                size="small"
                style={{ width: '120px' }}
                value={filterResult}
                onChange={setFilterResult}
                options={[
                  { value: 'ALL', label: 'All Results' },
                  { value: 'PASS', label: 'PASS' },
                  { value: 'FAIL', label: 'FAIL' },
                ]}
              />
            </Space>

            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => setInProcessInspections(loadInProcessInspections())}>
                Refresh
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setRunningModalVisible(true)}>
                + New Running Inspection
              </Button>
            </Space>
          </div>

          {/* Table */}
          <Table
            size="small"
            columns={inProcessColumns}
            dataSource={filteredInspections}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        </div>
      ),
    },
    {
      key: 'specs',
      label: (
        <span>
          <SettingOutlined /> Item QC Specs Master (Excel Import / Export)
        </span>
      ),
      children: (
        <ItemQcSpecsMaster
          specs={specs}
          onSpecsChange={setSpecs}
          divisionName={activeDivision.name}
          departmentName={activeDepartment?.name || 'Spoke'}
          divisionCode={activeDivision.code}
          departmentCode={activeDepartment?.code || 'SPD-DEPT003'}
          itemsList={items}
        />
      ),
    },
    {
      key: 'general',
      label: 'General Inspections (GRN / Incoming / Final)',
      children: (
        <Table
          size="small"
          columns={[
            { title: 'Inspection #', dataIndex: 'inspectionNo', key: 'no', width: 130 },
            { title: 'Type', dataIndex: 'inspectionType', key: 'type', width: 110 },
            { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 80 },
            {
              title: 'Result',
              dataIndex: 'result',
              key: 'result',
              width: 100,
              render: (r: string) => (
                <Tag color={r === 'PASS' ? 'green' : r === 'FAIL' ? 'red' : 'default'}>{r}</Tag>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 110,
              render: (s: string) => <Tag color={s === 'COMPLETED' ? 'green' : 'blue'}>{s}</Tag>,
            },
          ]}
          dataSource={legacyData}
          rowKey="id"
          loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
        />
      ),
    },
    {
      key: 'ncr',
      label: 'NCR & CAPA',
      children: (
        <div>
          <Typography.Title level={5}>Non-Conformance Reports (NCR)</Typography.Title>
          <Table
            size="small"
            columns={[
              { title: 'NCR #', dataIndex: 'ncrNo', key: 'no', width: 120 },
              { title: 'Description', dataIndex: 'description', key: 'desc', ellipsis: true },
              {
                title: 'Disposition',
                dataIndex: 'disposition',
                key: 'disp',
                width: 110,
                render: (d: string) => <Tag>{d}</Tag>,
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                width: 90,
                render: (s: string) => <Tag color={s === 'OPEN' ? 'red' : 'green'}>{s}</Tag>,
              },
            ]}
            dataSource={ncrData}
            rowKey="id"
            pagination={false}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<CheckOutlined />}
        title="Quality Control &amp; Assurance"
        showBreadcrumbs
        subtitle="In-Process Manufacturing QMS, Dimensional Inspections &amp; Defect Analysis"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setRunningModalVisible(true)}>
            New Running Inspection
          </Button>
        }
      />

      {/* Top Scope Selector: Cascading Division & Department Bar */}
      <Card
        size="small"
        style={{
          marginTop: 12,
          marginBottom: 12,
          borderRadius: '8px',
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <Space size="middle" wrap>
            <div>
              <span style={{ fontSize: '11px', color: token.colorTextSecondary, display: 'block', marginBottom: '2px' }}>
                Active Division:
              </span>
              <Select
                value={selectedDivisionCode}
                onChange={handleDivisionChange}
                style={{ width: '220px', fontWeight: 600 }}
                options={PWI_DIVISIONS.map((d) => ({ value: d.code, label: d.name }))}
              />
            </div>

            <div>
              <span style={{ fontSize: '11px', color: token.colorTextSecondary, display: 'block', marginBottom: '2px' }}>
                Department (Filtered to {activeDivision.name}):
              </span>
              <Select
                value={selectedDepartmentCode}
                onChange={setSelectedDepartmentCode}
                style={{ width: '200px', fontWeight: 600 }}
                options={activeDepartmentsList.map((dept) => ({
                  value: dept.code,
                  label: dept.name,
                }))}
              />
            </div>

            <div style={{ paddingTop: '16px' }}>
              <Tag color="cyan" style={{ fontSize: '12px', padding: '3px 8px' }}>
                QMS Doc: <strong>SPD/QMS/05 (Rev: 02)</strong>
              </Tag>
            </div>
          </Space>

          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => handleOpenSheet(inProcessInspections[0] || null)}>
              Print Active QMS Sheet
            </Button>
          </Space>
        </div>
      </Card>

      {/* Main Tabs Card */}
      <Card style={{ borderRadius: '8px', backgroundColor: token.colorBgContainer }}>
        <Tabs items={tabItems} defaultActiveKey="running" />
      </Card>

      {/* In-Process Inspection Modal */}
      <InProcessInspectionModal
        visible={runningModalVisible}
        onClose={() => setRunningModalVisible(false)}
        onSave={handleSaveInspection}
        divisionName={activeDivision.name}
        departmentName={activeDepartment?.name || 'Spoke'}
        divisionCode={activeDivision.code}
        departmentCode={activeDepartment?.code || 'SPD-DEPT003'}
        itemsList={items}
      />

      {/* QMS Printable Sheet Modal */}
      <QmsPrintableSheet
        visible={sheetModalVisible}
        onClose={() => setSheetModalVisible(false)}
        inspection={selectedInspectionForSheet}
      />
    </div>
  );
};

export default QcPage;
