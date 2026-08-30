import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, message, Row, Col, Tag, Tabs } from 'antd';
import { PlusOutlined, SearchOutlined, CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';

interface Inspection {
  id: string;
  inspectionNo: string;
  inspectionType: string;
  result: string;
  status: string;
  quantity?: number;
}

const QcPage: React.FC = () => {
  const [data, setData] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [plans, setPlans] = useState<Array<{ id: string; planCode: string; planName: string }>>([]);
  const [items, setItems] = useState<Array<{ id: string; itemCode: string; name: string }>>([]);
  const [ncrData, setNcrData] = useState<any[]>([]);
  const [capaData, setCapaData] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [resultsVisible, setResultsVisible] = useState(false);
  const [resultInspectionId, setResultInspectionId] = useState('');
  const [results, setResults] = useState<Array<{ id: string; characteristicName: string; measuredValue?: number; result: string; remarks?: string }>>([]);

  const fetchData = useCallback(async (pageNum = 1) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await apiService.get<{ data: Inspection[]; total: number }>('/qc/inspections', { companyId, page: pageNum, limit: 20 });
      setData(res.data);
      setTotal(res.total);
      const n = await apiService.get<{ data: any[] }>('/qc/ncr', { companyId, limit: 20 });
      setNcrData(n.data || []);
      const c = await apiService.get<{ data: any[] }>('/qc/capa', { companyId, limit: 20 });
      setCapaData(c.data || []);
    } catch {
      message.error('Failed to fetch QC data');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetchData(page);
    (async () => {
      try {
        const p = await apiService.get<{ data: Array<{ id: string; planCode: string; planName: string }> }>('/qc/plans', { companyId });
        setPlans(p.data || []);
      } catch { /* ignore */ }
      try {
        const it = await apiService.get<{ data: Array<{ id: string; itemCode: string; name: string }> }>('/master-data/items', { limit: 100 });
        setItems(it.data || []);
      } catch { /* ignore */ }
    })();
  }, [companyId, fetchData, page]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await apiService.post('/qc/inspections', { ...values, companyId, inspectionDate: values.inspectionDate ?? new Date().toISOString().slice(0, 10) });
      message.success('Inspection created');
      setModalVisible(false);
      form.resetFields();
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create inspection');
    }
  };

  const columns: ColumnsType<Inspection> = [
    { title: 'Inspection #', dataIndex: 'inspectionNo', key: 'no', width: 130 },
    { title: 'Type', dataIndex: 'inspectionType', key: 'type', width: 110 },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 80 },
    { title: 'Result', dataIndex: 'result', key: 'result', width: 100, render: (r: string) => <Tag color={r === 'PASS' ? 'green' : r === 'FAIL' ? 'red' : 'default'}>{r}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110, render: (s: string) => <Tag color={s === 'COMPLETED' ? 'green' : 'blue'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150,
      render: (_, r) => r.status !== 'COMPLETED' ? (
        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openResults(r.id)}>Enter Results</Button>
      ) : <Tag color="green">Done</Tag>,
    },
  ];

  const openResults = async (id: string) => {
    try {
      const insp = await apiService.get(`/qc/inspections/${id}`);
      const chars = (insp as any).data?.results || [];
      setResultInspectionId(id);
      setResults(chars.map((c: any) => ({ id: c.id, characteristicName: c.characteristic?.characteristicName || c.characteristicName || '', measuredValue: c.measuredValue, result: c.result || 'PASS' })));
      setResultsVisible(true);
    } catch {
      message.error('Failed to load inspection results');
    }
  };

  const saveResults = async () => {
    try {
      await apiService.post(`/qc/inspections/${resultInspectionId}/results`, {
        results: results.map((r) => ({ id: r.id, measuredValue: Number(r.measuredValue || 0), result: r.result, remarks: r.remarks })),
      });
      message.success('Inspection results saved');
      setResultsVisible(false);
      fetchData(page);
    } catch (e) {
      const msg: any = (e as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save results');
    }
  };

  const setNcrDisposition = async (id: string, disposition: string) => {
    try {
      await apiService.patch(`/qc/ncr/${id}/disposition`, { disposition });
      message.success('NCR disposition set');
      fetchData(page);
    } catch (e) {
      const msg: any = (e as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to update NCR');
    }
  };

  const ncrCols = [
    { title: 'NCR #', dataIndex: 'ncrNo', key: 'no', width: 120 },
    { title: 'Description', dataIndex: 'description', key: 'desc', ellipsis: true },
    { title: 'Disposition', dataIndex: 'disposition', key: 'disp', width: 110, render: (d: string) => <Tag>{d}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: (s: string) => <Tag color={s === 'OPEN' ? 'red' : 'green'}>{s}</Tag> },
    {
      title: 'Disposition Action', key: 'actions', width: 260,
      render: (_: unknown, r: any) => (
        <Space size={4} wrap>
          {['ACCEPT', 'REJECT', 'REWORK', 'RETURN', 'SCRAP', 'HOLD'].map((d) => (
            <Button key={d} size="small" disabled={r.disposition === d} onClick={() => setNcrDisposition(r.id, d)}>{d}</Button>
          ))}
        </Space>
      ),
    },
  ];

  const capaCols = [
    { title: 'CAPA #', dataIndex: 'capaNo', key: 'no', width: 120 },
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110, render: (s: string) => <Tag color={s === 'CLOSED' ? 'green' : 'orange'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 160,
      render: (_: unknown, r: any) => r.status !== 'CLOSED' ? (
        <Button size="small" onClick={async () => {
          try { await apiService.patch(`/qc/capa/${r.id}`, { status: 'CLOSED' }); message.success('CAPA closed'); fetchData(page); }
          catch { message.error('Failed to close CAPA'); }
        }}>Close</Button>
      ) : <Tag color="green">Closed</Tag>,
    },
  ];

  const tabs = [
    { key: 'insp', label: 'Inspections', children: <Table size="small" columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ current: page, total, pageSize: 20, onChange: setPage }} /> },
    { key: 'ncr', label: 'NCR', children: <Table size="small" columns={ncrCols} dataSource={ncrData} rowKey="id" pagination={false} /> },
    { key: 'capa', label: 'CAPA', children: <Table size="small" columns={capaCols} dataSource={capaData} rowKey="id" pagination={false} /> },
  ];

  return (
    <div>
      <PageHeader icon={<CheckOutlined />} title="Quality Control" showBreadcrumbs
        subtitle="Inspections, NCR and CAPA"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalVisible(true); }}>New Inspection</Button>} />
      <Card style={{ marginTop: 12 }}>
        <Tabs items={tabs} />
      </Card>
      <Modal title="New Inspection" open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={560}>
        <Form form={form} layout="vertical">
          <Form.Item name="inspectionType" label="Type" rules={[{ required: true }]}>
            <Select options={['INCOMING', 'IN_PROCESS', 'FINAL'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="planId" label="Inspection Plan">
            <Select showSearch optionFilterProp="label" options={plans.map((p) => ({ value: p.id, label: `${p.planCode} — ${p.planName}` }))} />
          </Form.Item>
          <Form.Item name="itemId" label="Item">
            <Select showSearch optionFilterProp="label" options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.name}` }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="quantity" label="Quantity"><Input type="number" /></Form.Item></Col>
            <Col span={12}><Form.Item name="referenceType" label="Reference (e.g. GRN)"><Input placeholder="GRN" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
      <Modal title="Record Inspection Results" open={resultsVisible} onOk={saveResults} onCancel={() => setResultsVisible(false)} width={760}>
        <Table
          size="small" dataSource={results} rowKey="id" pagination={false}
          columns={[
            { title: 'Characteristic', dataIndex: 'characteristicName', key: 'name' },
            {
              title: 'Measured Value', dataIndex: 'measuredValue', key: 'measured',
              render: (v: number | undefined, r) => (
                <InputNumber style={{ width: '100%' }} value={v}
                  onChange={(nv) => setResults(results.map((x) => x.id === r.id ? { ...x, measuredValue: Number(nv || 0) } : x))} />
              ),
            },
            {
              title: 'Result', dataIndex: 'result', key: 'result', width: 160,
              render: (v: string, r) => (
                <Select value={v} style={{ width: '100%' }}
                  onChange={(nv) => setResults(results.map((x) => x.id === r.id ? { ...x, result: nv } : x))}
                  options={['PASS', 'FAIL', 'N_A'].map((s) => ({ value: s, label: s }))} />
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default QcPage;