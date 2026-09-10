import React from 'react';
import { StockAdjustmentManagement } from '../inventory';
import PageHeader from '../../components/shared/PageHeader';
import { EditOutlined } from '@ant-design/icons';

const StoreAdjustments: React.FC = () => {
  return (
    <div>
      <PageHeader icon={<EditOutlined />} title="Store Adjustments" />
      <div style={{ padding: '0 24px' }}>
        <StockAdjustmentManagement />
      </div>
    </div>
  );
};

export default StoreAdjustments;
