import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Space, Tag, Typography, theme } from 'antd';
import { WarningOutlined, ShoppingCartOutlined, ArrowRightOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { fetchNippleImportAlerts, type NippleImportAlert } from '../../services/nippleAlertsService';
import { formatDecimal } from '../../utils/numberFormat';

const { Text } = Typography;

const DISMISS_KEY = 'pwi_nipple_import_alert_dismissed_session';

export interface NippleImportAlertBannerProps {
  marginBottom?: number;
  variant?: 'banner' | 'card';
}

export const NippleImportAlertBanner: React.FC<NippleImportAlertBannerProps> = ({
  marginBottom = 16,
  variant = 'banner',
}) => {
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

  const sortedAlerts = useMemo(
    () =>
      [...alerts].sort((a, b) =>
        String(a.itemCode || '').localeCompare(String(b.itemCode || ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      ),
    [alerts],
  );

  const totalOrderToday = sortedAlerts.reduce((s, a) => s + Number(a.orderTodayQty || 0), 0);
  const hasCritical = sortedAlerts.some(
    (a) => Number(a.coverageMonths) < Number(a.importLeadTimeMonths || 4),
  );

  if (variant === 'card') {
    const accentColor = hasCritical ? token.colorError : sortedAlerts.length > 0 ? token.colorWarning : token.colorSuccess;

    return (
      <Card
        size="small"
        style={{
          height: '100%',
          marginBottom,
          borderRadius: token.borderRadiusLG,
          borderColor: sortedAlerts.length > 0 ? accentColor : token.colorBorderSecondary,
        }}
        styles={{
          body: {
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            gap: 8,
          },
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: token.borderRadius,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: sortedAlerts.length > 0 ? token.colorErrorBg : token.colorSuccessBg,
                color: accentColor,
                fontSize: 15,
                flexShrink: 0,
              }}
            >
              {sortedAlerts.length > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.2, color: token.colorText }}>
                Import Lead-Time Alert
              </div>
              <div style={{ fontSize: 11.5, color: token.colorTextSecondary }}>
                {sortedAlerts.length > 0
                  ? `${sortedAlerts.length} Nipple Item${sortedAlerts.length > 1 ? 's' : ''} · Order Today: ${formatDecimal(totalOrderToday, 0)} GRS`
                  : 'All nipple stocks healthy'}
              </div>
            </div>
          </div>

          <Button
            type="primary"
            danger={sortedAlerts.length > 0}
            size="small"
            icon={<ShoppingCartOutlined />}
            onClick={() => navigate('/inventory/nipple-demand')}
            style={{ fontWeight: 600, fontSize: 11.5 }}
          >
            Place PO <ArrowRightOutlined />
          </Button>
        </div>

        {sortedAlerts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1, justifyContent: 'space-between' }}>
            {sortedAlerts.map((a, idx) => {
              const isCrit = Number(a.coverageMonths) < Number(a.importLeadTimeMonths || 4);
              return (
                <div
                  key={a.itemId || a.itemCode}
                  onClick={() => navigate('/inventory/nipple-demand')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: token.borderRadius,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderLeft: `3px solid ${isCrit ? token.colorError : token.colorWarning}`,
                    background: token.colorFillAlter,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: isCrit ? token.colorErrorBg : token.colorWarningBg,
                        color: isCrit ? token.colorError : token.colorWarning,
                        fontWeight: 700,
                        fontSize: 11,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                        <Tag color="blue" style={{ margin: 0, fontWeight: 700, fontSize: 10.5, padding: '0 5px', flexShrink: 0 }}>
                          {a.itemCode}
                        </Tag>
                        <Text strong style={{ fontSize: 12, color: token.colorText }} ellipsis>
                          {a.itemName}
                        </Text>
                      </div>
                      <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 1 }}>
                        {a.coverageMonths >= 999 ? '999M' : `${a.coverageMonths.toFixed(1)}M left`}
                        {a.projectedStockoutDate ? ` · Stockout ${a.projectedStockoutDate}` : ''}
                      </div>
                    </div>
                  </div>

                  <Tag
                    color={isCrit ? 'volcano' : 'gold'}
                    style={{ margin: 0, fontWeight: 700, fontSize: 11, padding: '1px 7px', flexShrink: 0 }}
                  >
                    {formatDecimal(a.orderTodayQty, 0)} GRS
                  </Tag>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: token.colorTextSecondary, padding: '12px 0' }}>
            No urgent nipple import orders required today.
          </div>
        )}
      </Card>
    );
  }

  if (dismissed || sortedAlerts.length === 0) return null;

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
              Import Lead-Time Alert: {sortedAlerts.length} Nipple Item{sortedAlerts.length > 1 ? 's' : ''} Require Order Today
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
          {sortedAlerts.map((a) => (
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
