import React from 'react';
import { Descriptions, Tag } from 'antd';
import EntityBarcodeList from './EntityBarcodeList';
import { BarcodeEntityType } from './types';
import { apiService } from '../../services/api';

const GatePassBarcodes: React.FC = () => {
  const loadGatePassDetail = async (entityId: string) => {
    const res = await apiService.get<any>(`/sales/deliveries/${entityId}`);
    return res?.data || res;
  };

  const renderGatePassDetail = (data: any) => (
    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Gate Pass / DN">{data.deliveryNumber || data.code || '-'}</Descriptions.Item>
      <Descriptions.Item label="Customer">{data.customer?.name || data.customerName || '-'}</Descriptions.Item>
      <Descriptions.Item label="Delivery Date">{data.deliveryDate || '-'}</Descriptions.Item>
      <Descriptions.Item label="Status">
        <Tag
          color={
            data.status === 'DELIVERED'
              ? 'green'
              : data.status === 'SHIPPED'
              ? 'blue'
              : data.status === 'DRAFT'
              ? 'default'
              : 'orange'
          }
        >
          {data.status || '-'}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Vehicle No">{data.vehicleNumber || '-'}</Descriptions.Item>
      <Descriptions.Item label="Driver">{data.driverName || '-'}</Descriptions.Item>
      <Descriptions.Item label="Driver Phone">{data.driverPhone || '-'}</Descriptions.Item>
      <Descriptions.Item label="Total Items">{data.items?.length ?? 0}</Descriptions.Item>
      {data.remarks && (
        <Descriptions.Item label="Remarks" span={2}>
          {data.remarks}
        </Descriptions.Item>
      )}
    </Descriptions>
  );

  return (
    <EntityBarcodeList
      entityType={BarcodeEntityType.GATE_PASS}
      title="Gate Pass Barcodes"
      loadEntityDetail={loadGatePassDetail}
      renderEntityDetail={renderGatePassDetail}
      resolveEntityInfo={(record) => ({
        code: record.entityCode || undefined,
        name: record.entityLabel || undefined,
      })}
    />
  );
};

export default GatePassBarcodes;
