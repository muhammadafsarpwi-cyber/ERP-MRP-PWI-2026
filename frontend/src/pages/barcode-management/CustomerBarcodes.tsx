import React from 'react';
import { Descriptions, Tag } from 'antd';
import EntityBarcodeList from './EntityBarcodeList';
import { BarcodeEntityType } from './types';
import { apiService } from '../../services/api';

const CustomerBarcodes: React.FC = () => {
  const loadCustomerDetail = async (entityId: string) => {
    const res = await apiService.get<{ success: boolean; data: any }>(`/customer/customers/${entityId}`);
    return res.data;
  };

  const renderCustomerDetail = (data: any) => (
    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Customer Code">{data.customerCode || '-'}</Descriptions.Item>
      <Descriptions.Item label="Customer Name" span={2}>{data.name || '-'}</Descriptions.Item>
      <Descriptions.Item label="Contact Person">{data.contactPerson || '-'}</Descriptions.Item>
      <Descriptions.Item label="Phone">{data.phone || '-'}</Descriptions.Item>
      <Descriptions.Item label="Email">{data.email || '-'}</Descriptions.Item>
      <Descriptions.Item label="Address" span={2}>{data.addressLine1 || '-'}</Descriptions.Item>
      <Descriptions.Item label="City">{data.city || '-'}</Descriptions.Item>
      <Descriptions.Item label="Status">
        <Tag color={data.status === 'ACTIVE' ? 'green' : 'red'}>{data.status || '-'}</Tag>
      </Descriptions.Item>
    </Descriptions>
  );

  return (
    <EntityBarcodeList
      entityType={BarcodeEntityType.CUSTOMER}
      title="Customer Barcodes"
      loadEntityDetail={loadCustomerDetail}
      renderEntityDetail={renderCustomerDetail}
      resolveEntityInfo={(record) => ({
        code: record.entityCode || undefined,
        name: record.entityLabel || undefined,
      })}
    />
  );
};

export default CustomerBarcodes;
