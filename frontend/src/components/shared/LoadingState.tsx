import React from 'react';
import { Spin, Typography } from 'antd';

interface LoadingStateProps {
  tip?: string;
  style?: React.CSSProperties;
}

const LoadingState: React.FC<LoadingStateProps> = ({ tip = 'Loading…', style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12, minHeight: 200, ...style }}>
    <Spin size="large" />
    <Typography.Text type="secondary">{tip}</Typography.Text>
  </div>
);

export default LoadingState;
