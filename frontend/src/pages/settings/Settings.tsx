import React from 'react';
import { Card, Typography } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import ThemePreferences from '../../theme/ThemePreferences';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 4 }}>
          Settings
        </Title>
        <Text type="secondary">
          Personal preferences for your account. Changes are previewed instantly and
          saved only when you apply them.
        </Text>
      </div>
      <Card
        title={
          <span>
            <BgColorsOutlined style={{ marginRight: 8, color: 'var(--theme-accent)' }} />
            Appearance
          </span>
        }
        bordered
        styles={{ body: { display: 'flex', justifyContent: 'center' } }}
      >
        <ThemePreferences embedded />
      </Card>
    </div>
  );
};

export default Settings;
