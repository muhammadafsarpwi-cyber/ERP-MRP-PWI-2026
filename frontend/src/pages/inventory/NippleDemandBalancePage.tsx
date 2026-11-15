import React from 'react';
import { BuildOutlined } from '@ant-design/icons';
import { PageHeader } from '../../components/shared';
import { NippleDemandStockBalanceCard } from '../../components/analytics/NippleDemandStockBalanceCard';

const NippleDemandBalancePage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <PageHeader
        title="Nipple Demand & Stock Balance"
        subtitle="Auto-calculated from Spoke Set Sales Orders & Finished Goods Inventory (Net of Packed Cartons)"
        icon={<BuildOutlined />}
      />
      <NippleDemandStockBalanceCard marginTop={12} />
    </div>
  );
};

export default NippleDemandBalancePage;
