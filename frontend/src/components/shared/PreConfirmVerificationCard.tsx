import React from 'react';
import { Button, Tag, theme } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleFilled,
  PercentageOutlined,
} from '@ant-design/icons';
import { formatDecimal, formatSmartCurrency } from '../../utils/numberFormat';
import type { DocumentTaxVerificationSummary } from '../../utils/salesTaxVerification';

export interface VerificationHeaderItem {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
}

export interface PreConfirmVerificationCardProps {
  summary: DocumentTaxVerificationSummary;
  headerItems?: VerificationHeaderItem[];
  currency?: string;
  showSocColumn?: boolean;
  onApplyStandardTax?: () => void | Promise<void>;
  applyingTax?: boolean;
  emptyText?: string;
}

const CODE_NAME_PATTERN = /^\s*\[([^\]]+)\]\s*(.+)$/;

/** Renders "[CODE] NAME" strings as a stacked code pill (top) and full bold name (bottom). */
const renderHeaderValue = (
  value: React.ReactNode,
  token: ReturnType<typeof theme.useToken>['token'],
): React.ReactNode => {
  if (typeof value !== 'string') return value;
  const match = value.match(CODE_NAME_PATTERN);
  if (!match) return value;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          fontFamily: 'monospace',
          padding: '1px 6px',
          borderRadius: 4,
          backgroundColor: token.colorFillAlter,
          border: `1px solid ${token.colorBorder}`,
          color: token.colorPrimary,
          whiteSpace: 'nowrap',
        }}
      >
        {match[1].trim()}
      </span>
      <span style={{ fontWeight: 800, color: token.colorText, lineHeight: 1.3, overflowWrap: 'break-word' }}>
        {match[2].trim()}
      </span>
    </div>
  );
};

const PreConfirmVerificationCard: React.FC<PreConfirmVerificationCardProps> = ({
  summary,
  headerItems = [],
  currency = 'Rs',
  showSocColumn = true,
  onApplyStandardTax,
  applyingTax = false,
  emptyText = 'No line items found on this document.',
}) => {
  const { token } = theme.useToken();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header Strip */}
      {headerItems.length > 0 && (
        <div
          style={{
            backgroundColor: token.colorFillAlter,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 10,
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px 16px',
          }}
        >
          {headerItems.map((item, idx) => (
            <div key={idx} style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  color: token.colorTextTertiary,
                  marginBottom: 2,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: token.colorText,
                  wordBreak: 'break-word',
                }}
              >
                {renderHeaderValue(item.value, token)}
              </div>
              {item.subtext && (
                <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 1 }}>
                  {item.subtext}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Compact Line-Item Verification Table */}
      <div
        style={{
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ maxHeight: 250, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr
                style={{
                  backgroundColor: token.colorFillAlter,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  color: token.colorTextSecondary,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}
              >
                <th style={{ padding: '9px 12px', textAlign: 'left' }}>
                  {showSocColumn ? 'SOC # & Item Code & Name' : 'Item Code & Name'}
                </th>
                <th style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  Quantity
                </th>
                <th style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  Rate
                </th>
                <th style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  Tax
                </th>
                <th style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: '18px 12px',
                      textAlign: 'center',
                      color: token.colorTextTertiary,
                      fontSize: 12.5,
                    }}
                  >
                    {emptyText}
                  </td>
                </tr>
              ) : (
                summary.lines.map((line) => (
                  <tr
                    key={line.key}
                    style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}
                  >
                    <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {showSocColumn && line.socNumber && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              padding: '1px 6px',
                              borderRadius: 4,
                              backgroundColor: 'rgba(37, 99, 235, 0.12)',
                              border: '1px solid rgba(37, 99, 235, 0.28)',
                              color: '#2563eb',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {line.socNumber}
                          </span>
                        )}
                        {line.itemCode && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              padding: '1px 6px',
                              borderRadius: 4,
                              backgroundColor: 'rgba(234, 88, 12, 0.12)',
                              border: '1px solid rgba(234, 88, 12, 0.30)',
                              color: '#ea580c',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {line.itemCode}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const nameParts = String(line.itemName || '')
                          .split('__')
                          .map((p) => p.trim())
                          .filter(Boolean);
                        const primaryName = nameParts[0] || line.itemName;
                        const subName = nameParts.slice(1).join(' ');
                        return (
                          <>
                            <div style={{ fontWeight: 600, color: token.colorText, lineHeight: 1.35 }}>
                              {primaryName}
                            </div>
                            {subName && (
                              <div style={{ fontSize: 11.5, color: token.colorTextSecondary, lineHeight: 1.3, marginTop: 1 }}>
                                {subName}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>

                    <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <span style={{ fontWeight: 700, color: token.colorText }}>
                        {formatDecimal(line.quantity, 2)} {line.uomCode}
                      </span>
                      {line.cartons > 0 && (
                        <span style={{ color: token.colorTextSecondary, marginLeft: 4, fontSize: 11.5 }}>
                          · {formatDecimal(line.cartons, 2)} {line.packagingUnit}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {line.isZeroRate ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 5,
                            backgroundColor: 'rgba(220, 38, 38, 0.12)',
                            border: '1px solid rgba(220, 38, 38, 0.35)',
                            color: '#dc2626',
                            fontWeight: 800,
                            fontSize: 12,
                          }}
                        >
                          {currency} 0
                        </span>
                      ) : (
                        <span style={{ fontWeight: 600, color: token.colorText, fontVariantNumeric: 'tabular-nums' }}>
                          {currency} {formatSmartCurrency(line.unitPrice)}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {line.isTaxFree ? (
                        <Tag
                          color="warning"
                          style={{ margin: 0, fontWeight: 700, fontSize: 11, borderRadius: 5 }}
                        >
                          0% (Tax-Free)
                        </Tag>
                      ) : (
                        <Tag
                          color="success"
                          style={{ margin: 0, fontWeight: 700, fontSize: 11, borderRadius: 5 }}
                        >
                          <CheckCircleOutlined style={{ marginRight: 4 }} />
                          {line.taxPercent}% Tax
                        </Tag>
                      )}
                    </td>

                    <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle', fontWeight: 700, color: token.colorText, fontVariantNumeric: 'tabular-nums' }}>
                      {currency} {formatSmartCurrency(line.lineTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero Rate Safeguard Prompt */}
      {summary.hasZeroRateLine && (
        <div
          style={{
            backgroundColor: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.30)',
            borderRadius: 8,
            padding: '9px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: '#dc2626',
            fontWeight: 600,
          }}
        >
          <ExclamationCircleFilled style={{ fontSize: 15, flexShrink: 0 }} />
          <span>
            One or more items show a unit rate of {currency} 0. Please verify pricing or return to Edit before confirming.
          </span>
        </div>
      )}

      {/* Tax-Free Safeguard Prompt */}
      {summary.hasTaxFreeLine && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.10)',
            border: '1px solid rgba(245, 158, 11, 0.38)',
            borderRadius: 9,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 220 }}>
            <ExclamationCircleFilled style={{ color: '#d97706', fontSize: 16, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: token.colorText, lineHeight: 1.4 }}>
              Tax is currently 0% (Tax-Free). Confirm as Tax-Free, or apply standard 18% Tax before confirming?
            </span>
          </div>
          {onApplyStandardTax && (
            <Button
              size="small"
              type="primary"
              icon={<PercentageOutlined />}
              loading={applyingTax}
              onClick={onApplyStandardTax}
              style={{
                backgroundColor: '#d97706',
                borderColor: '#d97706',
                fontWeight: 700,
                borderRadius: 6,
                height: 30,
              }}
            >
              Apply 18% Tax
            </Button>
          )}
        </div>
      )}

      {/* Financial Summary Totals Strip */}
      <div
        style={{
          backgroundColor: token.colorFillAlter,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 10,
          padding: '11px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: token.colorTextTertiary, textTransform: 'uppercase' }}>
            Subtotal
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: token.colorText, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {currency} {formatSmartCurrency(summary.subtotal)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: token.colorTextTertiary, textTransform: 'uppercase' }}>
            {summary.effectiveTaxLabel}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: summary.taxAmount > 0 ? '#059669' : '#d97706',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            {currency} {formatSmartCurrency(summary.taxAmount)}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: token.colorTextTertiary, textTransform: 'uppercase' }}>
            Grand Total
          </div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: '#10b981', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {currency} {formatSmartCurrency(summary.grandTotal)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreConfirmVerificationCard;
