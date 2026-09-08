import React from 'react';
import { Descriptions, Tag } from 'antd';
import EntityBarcodeList from './EntityBarcodeList';
import { BarcodeEntityType } from './types';
import { apiService } from '../../services/api';

const ProductionBarcodes: React.FC = () => {
  const loadProductionDetail = async (entityId: string) => {
    const res = await apiService.get<{ success: boolean; data: any }>(`/production/entries/${entityId}`);
    return res.data;
  };

  const renderProductionDetail = (data: any) => (
    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Date">{data.entryDate || '-'}</Descriptions.Item>
      <Descriptions.Item label="Item">{data.item?.name || data.itemId || '-'}</Descriptions.Item>
      <Descriptions.Item label="Machine">{data.machine?.name || data.machineNo || '-'}</Descriptions.Item>
      <Descriptions.Item label="Target Qty">{data.targetQuantity ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="Actual Qty">{data.actualQuantity ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="Operator">{data.operatorName || '-'}</Descriptions.Item>
      <Descriptions.Item label="Supervisor">{data.supervisorName || '-'}</Descriptions.Item>
      <Descriptions.Item label="Remarks" span={2}>{data.remarks || '-'}</Descriptions.Item>
    </Descriptions>
  );

  return (
    <EntityBarcodeList
      entityType={BarcodeEntityType.PRODUCTION_ENTRY}
      title="Production Entry Barcodes"
      loadEntityDetail={loadProductionDetail}
      renderEntityDetail={renderProductionDetail}
      resolveEntityInfo={(record) => ({
        code: record.entityCode || undefined,
        name: record.entityLabel || undefined,
      })}
    />
  );
};

export default ProductionBarcodes;
