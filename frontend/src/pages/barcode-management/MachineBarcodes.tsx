import React from 'react';
import { Descriptions, Tag } from 'antd';
import EntityBarcodeList from './EntityBarcodeList';
import { BarcodeEntityType } from './types';
import { apiService } from '../../services/api';

const MachineBarcodes: React.FC = () => {
  const loadMachineDetail = async (entityId: string) => {
    const res = await apiService.get<{ success: boolean; data: any }>(`/machines/${entityId}`);
    return res.data;
  };

  const renderMachineDetail = (data: any) => (
    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Machine Code">{data.machineCode || data.code || '-'}</Descriptions.Item>
      <Descriptions.Item label="Machine Name" span={2}>{data.machineName || data.name || '-'}</Descriptions.Item>
      <Descriptions.Item label="Type">{data.machineType || data.type || '-'}</Descriptions.Item>
      <Descriptions.Item label="Status">
        <Tag color={data.status === 'ACTIVE' ? 'green' : data.status === 'MAINTENANCE' ? 'orange' : 'red'}>
          {data.status || '-'}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Location">{data.location || '-'}</Descriptions.Item>
      <Descriptions.Item label="Manufacturer">{data.manufacturer || '-'}</Descriptions.Item>
      <Descriptions.Item label="Model">{data.model || '-'}</Descriptions.Item>
      <Descriptions.Item label="Description" span={2}>{data.description || '-'}</Descriptions.Item>
    </Descriptions>
  );

  return (
    <EntityBarcodeList
      entityType={BarcodeEntityType.MACHINE}
      title="Machine Barcodes"
      loadEntityDetail={loadMachineDetail}
      renderEntityDetail={renderMachineDetail}
      resolveEntityInfo={(record) => ({
        code: record.entityCode || undefined,
        name: record.entityLabel || undefined,
      })}
    />
  );
};

export default MachineBarcodes;
