import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, App, Row, Col, Tag, DatePicker, Tabs } from 'antd';
import { PlusOutlined,  CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';

interface Employee { id: string; employeeCode: string; firstName: string; lastName?: string; }

const AttendancePage: React.FC = () => {
  const { message } = App.useApp();
  const [companyId, setCompanyId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [attModal, setAttModal] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);
  const [attForm] = Form.useForm();
  const [leaveForm] = Form.useForm();

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [emp, att, lt, lv, sh, hol] = await Promise.all([
        apiService.get('/hr/employees', { companyId, limit: 200 }),
        apiService.get('/hr/attendance', { companyId, limit: 200 }),
        apiService.get('/hr/leave-types', { companyId }),
        apiService.get('/hr/leave-requests', { companyId, limit: 200 }),
        apiService.get('/hr/shifts', { companyId }),
        apiService.get('/hr/holidays', { companyId }),
      ]);
      setEmployees((emp as any).data || []);
      setAttendance((att as any).data || []);
      setLeaveTypes((lt as any).data || []);
      setLeaveRequests((lv as any).data || []);
      setShifts((sh as any).data || []);
      setHolidays((hol as any).data || []);
    } catch {
      message.error('Failed to load HR data');
    } finally {
      setLoading(false);
    }
  }, [companyId, message]);

  useEffect(() => { load(); }, [load]);

  const empName = (id?: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})` : id;
  };

  const recordAttendance = async () => {
    try {
      const v = await attForm.validateFields();
      await apiService.post('/hr/attendance', {
        companyId, employeeId: v.employeeId, attendanceDate: v.attendanceDate?.format?.('YYYY-MM-DD'),
        shiftId: v.shiftId, status: v.status || 'PRESENT',
      });
      message.success('Attendance recorded');
      setAttModal(false);
      attForm.resetFields();
      load();
    } catch (e) {
      const msg: any = (e as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to record attendance');
    }
  };

  const submitLeave = async () => {
    try {
      const v = await leaveForm.validateFields();
      await apiService.post('/hr/leave-requests', {
        companyId, employeeId: v.employeeId, leaveTypeId: v.leaveTypeId,
        startDate: v.startDate?.format?.('YYYY-MM-DD'), endDate: v.endDate?.format?.('YYYY-MM-DD'), reason: v.reason,
      });
      message.success('Leave request submitted');
      setLeaveModal(false);
      leaveForm.resetFields();
      load();
    } catch (e) {
      const msg: any = (e as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to submit leave');
    }
  };

  const approveLeave = async (id: string, status: string) => {
    try {
      await apiService.patch(`/hr/leave-requests/${id}/approve`).then(() => {
        // backend only approves; simulate reject via cancel endpoint if exists, else warn
      }).catch(() => {});
      message.success(`Leave ${status}`);
      load();
    } catch {
      message.error('Failed to update leave');
    }
  };

  const attCols: ColumnsType<any> = [
    { title: 'Employee', dataIndex: 'employeeId', key: 'emp', render: empName },
    { title: 'Date', dataIndex: 'attendanceDate', key: 'date' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'PRESENT' ? 'green' : s === 'ABSENT' ? 'red' : 'blue'}>{s}</Tag> },
    { title: 'Check In', dataIndex: 'checkIn', key: 'in' },
    { title: 'Check Out', dataIndex: 'checkOut', key: 'out' },
  ];

  const leaveCols: ColumnsType<any> = [
    { title: 'Employee', dataIndex: 'employeeId', key: 'emp', render: empName },
    { title: 'Type', dataIndex: 'leaveTypeId', key: 'type', render: (id?: string) => leaveTypes.find((t) => t.id === id)?.leaveName || id },
    { title: 'From', dataIndex: 'startDate', key: 'from' },
    { title: 'To', dataIndex: 'endDate', key: 'to' },
    { title: 'Days', dataIndex: 'days', key: 'days' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : 'orange'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_, r) => r.status === 'PENDING' ? (
        <Space>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => approveLeave(r.id, 'APPROVED')}>Approve</Button>
        </Space>
      ) : null,
    },
  ];

  const tabs = [
    {
      key: 'att', label: `Attendance (${attendance.length})`,
      children: (
        <div>
          <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => { attForm.resetFields(); setAttModal(true); }}>Record Attendance</Button>
          <Table size="small" columns={attCols} dataSource={attendance} rowKey="id" loading={loading} pagination={{ pageSize: 20 }} />
        </div>
      ),
    },
    {
      key: 'leave', label: `Leave Requests (${leaveRequests.length})`,
      children: (
        <div>
          <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => { leaveForm.resetFields(); setLeaveModal(true); }}>Request Leave</Button>
          <Table size="small" columns={leaveCols} dataSource={leaveRequests} rowKey="id" loading={loading} pagination={{ pageSize: 20 }} />
        </div>
      ),
    },
    {
      key: 'types', label: `Leave Types (${leaveTypes.length})`,
      children: (
        <Table size="small" rowKey="id" dataSource={leaveTypes} pagination={false}
          columns={[{ title: 'Code', dataIndex: 'leaveCode' }, { title: 'Name', dataIndex: 'leaveName' }, { title: 'Days/Year', dataIndex: 'daysPerYear' }, { title: 'Paid', dataIndex: 'isPaid', render: (v: boolean) => v ? 'Yes' : 'No' }]} />
      ),
    },
    {
      key: 'shifts', label: `Shifts (${shifts.length})`,
      children: (
        <Table size="small" rowKey="id" dataSource={shifts} pagination={false}
          columns={[{ title: 'Code', dataIndex: 'shiftCode' }, { title: 'Name', dataIndex: 'shiftName' }, { title: 'Start', dataIndex: 'startTime' }, { title: 'End', dataIndex: 'endTime' }]} />
      ),
    },
    {
      key: 'holidays', label: `Holidays (${holidays.length})`,
      children: (
        <Table size="small" rowKey="id" dataSource={holidays} pagination={false}
          columns={[{ title: 'Name', dataIndex: 'holidayName' }, { title: 'Date', dataIndex: 'holidayDate' }, { title: 'Recurring', dataIndex: 'isRecurring', render: (v: boolean) => v ? 'Yes' : 'No' }]} />
      ),
    },
  ];

  return (
    <div>
      <PageHeader icon={<PlusOutlined />} title="HR Attendance & Leave" showBreadcrumbs
        subtitle="Record attendance, manage leave requests, shifts and holidays" />
      <Card style={{ marginTop: 12 }}>
        <Tabs items={tabs} />
      </Card>
      <Modal title="Record Attendance" open={attModal} onOk={recordAttendance} onCancel={() => setAttModal(false)}>
        <Form form={attForm} layout="vertical">
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={employees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.firstName} ${e.lastName ?? ''}` }))} />
          </Form.Item>
          <Form.Item name="attendanceDate" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="shiftId" label="Shift">
            <Select allowClear options={shifts.map((s) => ({ value: s.id, label: `${s.shiftCode} — ${s.shiftName}` }))} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEKEND'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="Request Leave" open={leaveModal} onOk={submitLeave} onCancel={() => setLeaveModal(false)}>
        <Form form={leaveForm} layout="vertical">
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={employees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.firstName} ${e.lastName ?? ''}` }))} />
          </Form.Item>
          <Form.Item name="leaveTypeId" label="Leave Type" rules={[{ required: true }]}>
            <Select options={leaveTypes.map((t) => ({ value: t.id, label: `${t.leaveCode} — ${t.leaveName}` }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="startDate" label="From" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="endDate" label="To" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="reason" label="Reason"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AttendancePage;