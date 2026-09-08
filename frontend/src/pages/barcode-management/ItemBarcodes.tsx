import React from 'react';
import { Descriptions, Tag } from 'antd';
import EntityBarcodeList from './EntityBarcodeList';
import { BarcodeEntityType } from './types';
import { apiService } from '../../services/api';

const ItemBarcodes: React.FC = () => {
  const loadItemDetail = async (entityId: string) => {
    const res = await apiService.get<{ success: boolean; data: any }>(`/master-data/items/${entityId}`);
    return res.data;
  };

  const renderItemDetail = (data: any) => (
    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Item Code">{data.itemCode || '-'}</Descriptions.Item>
      <Descriptions.Item label="Item Name" span={2}>{data.name || '-'}</Descriptions.Item>
      <Descriptions.Item label="SKU">{data.sku || '-'}</Descriptions.Item>
      <Descriptions.Item label="Type"><Tag color="blue">{data.itemType || '-'}</Tag></Descriptions.Item>
      <Descriptions.Item label="Status">
        <Tag color={data.status === 'ACTIVE' ? 'green' : data.status === 'INACTIVE' ? 'red' : 'default'}>
          {data.status || '-'}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Base UOM">{data.baseUom?.name || data.baseUomId || '-'}</Descriptions.Item>
      <Descriptions.Item label="Category">{data.category?.name || '-'}</Descriptions.Item>
      <Descriptions.Item label="Description" span={2}>{data.description || '-'}</Descriptions.Item>
      <Descriptions.Item label="Min Stock Level">{data.minimumStockLevel ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="Reorder Level">{data.reorderLevel ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="Barcode">{data.barcode || '-'}</Descriptions.Item>
      <Descriptions.Item label="Wire Size (mm)">{data.wireSizeMm || '-'}</Descriptions.Item>
      <Descriptions.Item label="Production Input">{data.productionInItem?.name || '-'}</Descriptions.Item>
    </Descriptions>
  );

  return (
    <EntityBarcodeList
      entityType={BarcodeEntityType.ITEM}
      title="Item Barcodes"
      loadEntityDetail={loadItemDetail}
      renderEntityDetail={renderItemDetail}
      resolveEntityInfo={(record) => ({
        code: record.entityCode || undefined,
        name: record.entityLabel || undefined,
      })}
    />
  );
};

export default ItemBarcodes;
