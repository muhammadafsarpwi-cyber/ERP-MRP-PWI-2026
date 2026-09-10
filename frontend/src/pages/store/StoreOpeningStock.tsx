import React from 'react';
import { OpeningStock } from '../inventory';
import PageHeader from '../../components/shared/PageHeader';
import { PlusOutlined } from '@ant-design/icons';

const StoreOpeningStock: React.FC = () => {
  return (
    <div>
      <PageHeader icon={<PlusOutlined />} title="Store Opening Stock" />
      <div style={{ padding: '0 24px' }}>
        <OpeningStock />
      </div>
    </div>
  );
};

export default StoreOpeningStock;
