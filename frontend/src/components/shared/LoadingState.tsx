import React from 'react';
import { Spin } from 'antd';

interface LoadingStateProps {
  tip?: string;
  style?: React.CSSProperties;
}

const LoadingState: React.FC<LoadingStateProps> = ({ tip = 'Loading…', style }) => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, ...style }}>
    <Spin size="large" tip={tip}>
      <div style={{ padding: 50 }} />
    </Spin>
  </div>
);

export default LoadingState;
