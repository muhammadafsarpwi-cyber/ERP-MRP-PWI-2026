import React, { useEffect, useState } from 'react';
import { Card, Tabs, Typography } from 'antd';
import { BgColorsOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { useLocation, useSearchParams } from 'react-router-dom';
import ThemePreferences from '../../theme/ThemePreferences';
import AudioMusicSettings from '../../components/settings/AudioMusicSettings';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const getInitialTab = (): string => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'audio' || tabParam === 'music' || location.hash === '#audio' || location.hash === '#music') {
      return 'audio';
    }
    return 'themes';
  };

  const [activeTab, setActiveTab] = useState<string>(getInitialTab);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'audio' || tabParam === 'music' || location.hash === '#audio' || location.hash === '#music') {
      setActiveTab('audio');
    }
  }, [searchParams, location.hash]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', key);
      return next;
    });
  };

  return (
    <div style={{ width: '100%', padding: '8px 12px' }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          System Settings & Customization
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Personalize your ERP experience with 34 enterprise themes, dark mode controls, and custom background audio management.
        </Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        type="card"
        size="large"
        items={[
          {
            key: 'themes',
            label: (
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                <BgColorsOutlined style={{ marginRight: 8, color: 'var(--theme-accent, #2563eb)' }} />
                Theme Studio & Appearance
              </span>
            ),
            children: (
              <Card
                bordered
                styles={{ body: { padding: 0 } }}
                style={{ borderRadius: 12, overflow: 'hidden' }}
              >
                <ThemePreferences embedded />
              </Card>
            ),
          },
          {
            key: 'audio',
            label: (
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                <CustomerServiceOutlined style={{ marginRight: 8, color: '#10b981' }} />
                Background Music & Audio Setup (میوزک سیٹنگز)
              </span>
            ),
            children: <AudioMusicSettings />,
          },
        ]}
      />
    </div>
  );
};

export default Settings;
