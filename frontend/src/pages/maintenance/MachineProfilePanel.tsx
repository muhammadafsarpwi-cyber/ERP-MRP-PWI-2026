import React, { useEffect, useState } from 'react';
import { Card, Descriptions, Statistic, Row, Col, Tag, Space, Typography } from 'antd';
import { ToolOutlined, WarningOutlined, CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { StatusBadge } from '../../components/shared';
import { errorText, label } from './jobCards.types';

const { Text } = Typography;

type MachineStats = {
  machine: Record<string, any>;
  total: number;
  approved: number;
  inProgress: number;
  completed: number;
  totalDowntimeMinutes: number;
  avgDowntimeMinutes: number;
  mtbfHours: number;
  byType: { breakdown: number; preventive: number; corrective: number; inspection: number; emergency: number };
  recentCards: Record<string, any>[];
};

const formatDuration = (minutes: number): string => {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
};

export const MachineProfilePanel: React.FC<{ machineId: string; compact?: boolean }> = ({ machineId, compact }) => {
  const [stats, setStats] = useState<MachineStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!machineId) return;
    setLoading(true);
    apiService.get<any>(`/master-data/maintenance/job-cards/machine/${machineId}/stats`)
      .then(r => setStats(r))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [machineId]);

  if (loading || !stats) return null;
  const { machine, total, approved, inProgress, completed, totalDowntimeMinutes, avgDowntimeMinutes, mtbfHours, byType } = stats;

  if (compact) {
    return (
      <Card size="small" title={<Space><ToolOutlined /> Machine Profile</Space>} style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Machine">{machine.machineCode || machine.machineNumber || machine.machineId} - {machine.name || machine.machineName}</Descriptions.Item>
          {machine.machineType && <Descriptions.Item label="Type">{machine.machineType}</Descriptions.Item>}
          {machine.location && <Descriptions.Item label="Location">{machine.location}</Descriptions.Item>}
          <Descriptions.Item label="Status"><StatusBadge status={machine.status} /></Descriptions.Item>
          <Descriptions.Item label="Criticality"><Tag color={machine.criticality === 'CRITICAL' ? 'red' : machine.criticality === 'HIGH' ? 'orange' : machine.criticality === 'LOW' ? 'green' : 'blue'}>{label(machine.criticality)}</Tag></Descriptions.Item>
        </Descriptions>
      </Card>
    );
  }

  return (
    <Card title={<Space><ToolOutlined /> Machine Profile</Space>} style={{ marginBottom: 16 }}>
      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Machine">{machine.machineCode || machine.machineNumber || machine.machineId}</Descriptions.Item>
        <Descriptions.Item label="Name">{machine.name || machine.machineName}</Descriptions.Item>
        {machine.machineType && <Descriptions.Item label="Type">{machine.machineType}</Descriptions.Item>}
        {machine.model && <Descriptions.Item label="Model">{machine.model}</Descriptions.Item>}
        {machine.manufacturer && <Descriptions.Item label="Manufacturer">{machine.manufacturer}</Descriptions.Item>}
        {machine.serialNumber && <Descriptions.Item label="Serial No">{machine.serialNumber}</Descriptions.Item>}
        {machine.location && <Descriptions.Item label="Location">{machine.location}</Descriptions.Item>}
        <Descriptions.Item label="Status"><StatusBadge status={machine.status} /></Descriptions.Item>
        <Descriptions.Item label="Criticality"><Tag color={machine.criticality === 'CRITICAL' ? 'red' : machine.criticality === 'HIGH' ? 'orange' : machine.criticality === 'LOW' ? 'green' : 'blue'}>{label(machine.criticality)}</Tag></Descriptions.Item>
      </Descriptions>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Statistic title="Total Jobs" value={total} prefix={<ToolOutlined />} /></Col>
        <Col span={6}><Statistic title="In Progress" value={inProgress} valueStyle={{ color: '#1890ff' }} prefix={<ClockCircleOutlined />} /></Col>
        <Col span={6}><Statistic title="Completed" value={completed} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Col>
        <Col span={6}><Statistic title="Approved" value={approved} valueStyle={{ color: '#722ed1' }} prefix={<CheckCircleOutlined />} /></Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Statistic title="MTBF" value={mtbfHours} suffix="hrs" prefix={<ThunderboltOutlined />} /></Col>
        <Col span={6}><Statistic title="Total Downtime" value={formatDuration(totalDowntimeMinutes)} prefix={<WarningOutlined />} /></Col>
        <Col span={6}><Statistic title="Avg Downtime" value={formatDuration(avgDowntimeMinutes)} /></Col>
        <Col span={6}>
          <Space direction="vertical" size={2}>
            <Text type="secondary" style={{ fontSize: 12 }}>By Type</Text>
            <Space wrap size={4}>
              {byType.breakdown > 0 && <Tag color="red">Breakdown: {byType.breakdown}</Tag>}
              {byType.preventive > 0 && <Tag color="green">Preventive: {byType.preventive}</Tag>}
              {byType.corrective > 0 && <Tag color="orange">Corrective: {byType.corrective}</Tag>}
              {byType.inspection > 0 && <Tag color="blue">Inspection: {byType.inspection}</Tag>}
              {byType.emergency > 0 && <Tag color="volcano">Emergency: {byType.emergency}</Tag>}
            </Space>
          </Space>
        </Col>
      </Row>
    </Card>
  );
};

export default MachineProfilePanel;
