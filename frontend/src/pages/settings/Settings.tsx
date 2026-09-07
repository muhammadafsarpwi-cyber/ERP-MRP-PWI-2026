import React from 'react';
import { Card, Typography } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import ThemePreferences from '../../theme/ThemePreferences';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 4 }}>
          Settings & Visual Studio
        </Title>
        <Text type="secondary">
          Personalize your ERP experience with 34 enterprise themes, real-time live preview, and dark mode controls.
        </Text>
      </div>
      <Card
        title={
          <span>
            <BgColorsOutlined style={{ marginRight: 8, color: 'var(--theme-accent)' }} />
            Theme Studio & Appearance
          </span>
        }
        bordered
        styles={{ body: { padding: 0 } }}
      >
        <ThemePreferences embedded />
      </Card>
    </div>
  );
};

export default Settings;
