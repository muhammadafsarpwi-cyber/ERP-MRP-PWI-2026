import React from 'react';
import { StockTransferManagement } from '../inventory';
import PageHeader from '../../components/shared/PageHeader';
import { SwapOutlined } from '@ant-design/icons';

const StoreTransfers: React.FC = () => {
  return (
    <div>
      <PageHeader icon={<SwapOutlined />} title="Store Transfers" />
      <div style={{ padding: '0 24px' }}>
        <StockTransferManagement />
      </div>
    </div>
  );
};

export default StoreTransfers;
