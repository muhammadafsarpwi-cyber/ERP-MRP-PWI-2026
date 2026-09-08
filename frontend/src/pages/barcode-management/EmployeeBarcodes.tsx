import React from 'react';
import { Descriptions, Tag } from 'antd';
import EntityBarcodeList from './EntityBarcodeList';
import { BarcodeEntityType } from './types';
import { apiService } from '../../services/api';

const EmployeeBarcodes: React.FC = () => {
  const loadEmployeeDetail = async (entityId: string) => {
    const res = await apiService.get<{ success: boolean; data: any }>(`/hr/employees/${entityId}`);
    return res.data;
  };

  const renderEmployeeDetail = (data: any) => (
    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Employee Code">{data.employeeCode || '-'}</Descriptions.Item>
      <Descriptions.Item label="Full Name">{[data.firstName, data.lastName].filter(Boolean).join(' ') || '-'}</Descriptions.Item>
      <Descriptions.Item label="Department">{data.departmentId || '-'}</Descriptions.Item>
      <Descriptions.Item label="Designation">{data.designation?.name || data.designationId || '-'}</Descriptions.Item>
      <Descriptions.Item label="Phone">{data.phone || '-'}</Descriptions.Item>
      <Descriptions.Item label="Email">{data.email || '-'}</Descriptions.Item>
      <Descriptions.Item label="Status">
        <Tag color={data.status === 'ACTIVE' ? 'green' : 'red'}>{data.status || '-'}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Join Date">{data.joinDate || '-'}</Descriptions.Item>
    </Descriptions>
  );

  return (
    <EntityBarcodeList
      entityType={BarcodeEntityType.EMPLOYEE}
      title="Employee Barcodes"
      loadEntityDetail={loadEmployeeDetail}
      renderEntityDetail={renderEmployeeDetail}
      resolveEntityInfo={(record) => ({
        code: record.entityCode || undefined,
        name: record.entityLabel || undefined,
      })}
    />
  );
};

export default EmployeeBarcodes;
