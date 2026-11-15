import React, { useEffect, useState } from 'react';
import { Alert, Button, Space, Tag, Typography, theme } from 'antd';
import { WarningOutlined, ShoppingCartOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { fetchNippleImportAlerts, type NippleImportAlert } from '../../services/nippleAlertsService';
import { formatDecimal } from '../../utils/numberFormat';

const { Text } = Typography;

const DISMISS_KEY = 'pwi_nipple_import_alert_dismissed_session';

export interface NippleImportAlertBannerProps {
  marginBottom?: number;
}

export const NippleImportAlertBanner: React.FC<NippleImportAlertBannerProps> = ({ marginBottom = 16 }) => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<NippleImportAlert[]>([]);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let active = true;
    fetchNippleImportAlerts().then((data) => {
      if (active) setAlerts(data);
    });
    return () => {
      active = false;
    };
  }, []);

  if (dismissed || alerts.length === 0) return null;

  const totalOrderToday = alerts.reduce((s, a) => s + Number(a.orderTodayQty || 0), 0);
  const hasCritical = alerts.some((a) => Number(a.coverageMonths) < Number(a.importLeadTimeMonths || 4));

  return (
    <Alert
      type={hasCritical ? 'error' : 'warning'}
      showIcon
      icon={<WarningOutlined />}
      closable
      onClose={() => {
        setDismissed(true);
        try {
          sessionStorage.setItem(DISMISS_KEY, '1');
        } catch {
          // ignore
        }
      }}
      style={{ marginBottom, borderRadius: token.borderRadiusLG }}
      message={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Space size={8} wrap>
            <Text strong style={{ fontSize: 13 }}>
              Import Lead-Time Alert: {alerts.length} Nipple Item{alerts.length > 1 ? 's' : ''} Require Order Today
            </Text>
            <Tag color="red" style={{ margin: 0, fontWeight: 700 }}>
              Order Today: {formatDecimal(totalOrderToday, 0)} GRS
            </Tag>
          </Space>
          <Button
            type="primary"
            danger
            size="small"
            icon={<ShoppingCartOutlined />}
            onClick={() => navigate('/inventory/nipple-demand')}
          >
            Review &amp; Place PO <ArrowRightOutlined />
          </Button>
        </div>
      }
      description={
        <Space size={[6, 6]} wrap style={{ marginTop: 4 }}>
          {alerts.map((a) => (
            <Tag
              key={a.itemId || a.itemCode}
              color={a.coverageMonths < a.importLeadTimeMonths ? 'volcano' : 'gold'}
              style={{ margin: 0, cursor: 'pointer' }}
              onClick={() => navigate('/inventory/nipple-demand')}
            >
              <strong>{a.itemName}</strong> ({a.itemCode}) ·{' '}
              {a.coverageMonths >= 999 ? '999M' : `${a.coverageMonths.toFixed(1)}M left`}
              {a.projectedStockoutDate ? ` · Stockout ${a.projectedStockoutDate}` : ''} ·{' '}
              <strong>Order {formatDecimal(a.orderTodayQty, 0)} GRS</strong>
            </Tag>
          ))}
        </Space>
      }
    />
  );
};

export default NippleImportAlertBanner;
