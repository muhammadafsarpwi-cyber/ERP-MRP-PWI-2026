import React from 'react';
import { Descriptions, Tag } from 'antd';
import EntityBarcodeList from './EntityBarcodeList';
import { BarcodeEntityType } from './types';
import { apiService } from '../../services/api';

const JobCardBarcodes: React.FC = () => {
  const loadJobCardDetail = async (entityId: string) => {
    const res = await apiService.get<{ success: boolean; data: any }>(`/master-data/maintenance/job-cards/${entityId}`);
    return res.data;
  };

  const renderJobCardDetail = (data: any) => (
    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Job Card No">{data.jobCardNo || '-'}</Descriptions.Item>
      <Descriptions.Item label="Machine">{data.machine?.name || '-'}</Descriptions.Item>
      <Descriptions.Item label="Type"><Tag>{data.maintenanceType || '-'}</Tag></Descriptions.Item>
      <Descriptions.Item label="Priority">
        <Tag color={data.priority === 'HIGH' ? 'red' : data.priority === 'MEDIUM' ? 'orange' : 'blue'}>
          {data.priority || '-'}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Status">
        <Tag color={data.currentStatus === 'COMPLETED' ? 'green' : data.currentStatus === 'IN_PROGRESS' ? 'blue' : 'default'}>
          {data.currentStatus || '-'}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Complaint" span={2}>{data.complaint || '-'}</Descriptions.Item>
      <Descriptions.Item label="Description" span={2}>{data.description || '-'}</Descriptions.Item>
    </Descriptions>
  );

  return (
    <EntityBarcodeList
      entityType={BarcodeEntityType.JOB_CARD}
      title="Job Card Barcodes"
      loadEntityDetail={loadJobCardDetail}
      renderEntityDetail={renderJobCardDetail}
      resolveEntityInfo={(record) => ({
        code: record.entityCode || undefined,
        name: record.entityLabel || undefined,
      })}
    />
  );
};

export default JobCardBarcodes;
