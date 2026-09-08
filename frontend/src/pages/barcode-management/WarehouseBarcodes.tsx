import React from 'react';
import { Descriptions, Tag } from 'antd';
import EntityBarcodeList from './EntityBarcodeList';
import { BarcodeEntityType } from './types';
import { apiService } from '../../services/api';

const WarehouseBarcodes: React.FC = () => {
  const loadWarehouseDetail = async (entityId: string) => {
    const res = await apiService.get<{ success: boolean; data: any }>(`/warehouses/${entityId}`);
    return res.data;
  };

  const renderWarehouseDetail = (data: any) => (
    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Warehouse Code">{data.warehouseCode || '-'}</Descriptions.Item>
      <Descriptions.Item label="Warehouse Name" span={2}>{data.name || '-'}</Descriptions.Item>
      <Descriptions.Item label="Type"><Tag>{data.warehouseType || '-'}</Tag></Descriptions.Item>
      <Descriptions.Item label="Status">
        <Tag color={data.status === 'ACTIVE' ? 'green' : 'red'}>{data.status || '-'}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Address" span={2}>{data.address || '-'}</Descriptions.Item>
      <Descriptions.Item label="City">{data.city || '-'}</Descriptions.Item>
      <Descriptions.Item label="Country">{data.country || '-'}</Descriptions.Item>
    </Descriptions>
  );

  return (
    <EntityBarcodeList
      entityType={BarcodeEntityType.WAREHOUSE}
      title="Warehouse Barcodes"
      loadEntityDetail={loadWarehouseDetail}
      renderEntityDetail={renderWarehouseDetail}
      resolveEntityInfo={(record) => ({
        code: record.entityCode || undefined,
        name: record.entityLabel || undefined,
      })}
    />
  );
};

export default WarehouseBarcodes;
