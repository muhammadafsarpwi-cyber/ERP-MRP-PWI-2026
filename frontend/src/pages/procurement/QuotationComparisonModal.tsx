import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarCircleOutlined,
  ShoppingCartOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { DraggableResizableModal } from '../../components/shared';
import { formatDecimal } from '../../utils/numberFormat';

const { Text } = Typography;

export interface ComparisonSupplierQuote {
  quotationId: string;
  quotationCode: string;
  supplierId: string;
  supplierName: string;
  status: string;
  subtotal: number;
  discountPercent: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
  deliveryLeadTimeDays: number | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  validUntil: string | null;
  isLowestOverall: boolean;
}

export interface ComparisonItemRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  requestedQty: number;
  lowestUnitPrice: number | null;
  lowestSupplierId: string | null;
  quotesBySupplier: Record<
    string,
    {
      quotationId: string;
      unitPrice: number;
      discountPercent: number;
      lineTotal: number;
      leadTimeDays: number | null;
      isLowestUnitPrice: boolean;
    }
  >;
}

export interface ComparisonResponse {
  rfq: {
    id: string;
    rfqCode: string;
    title?: string | null;
    status: string;
    dueDate?: string | null;
    suppliers: Array<{
      supplierId: string;
      supplierName: string;
      status: string;
      sentAt?: string | null;
      quotedAt?: string | null;
    }>;
  };
  quotations: ComparisonSupplierQuote[];
  items: ComparisonItemRow[];
  lowestOverallQuotationId: string | null;
  lowestOverallSupplierId: string | null;
  lowestOverallAmount: number;
}

export interface QuotationComparisonModalProps {
  rfqId: string | null;
  open: boolean;
  onClose: () => void;
  onAwardSuccess?: () => void;
}

const QuotationComparisonModal: React.FC<QuotationComparisonModalProps> = ({
  rfqId,
  open,
  onClose,
  onAwardSuccess,
}) => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [awardingId, setAwardingId] = useState<string | null>(null);
  const [data, setData] = useState<ComparisonResponse | null>(null);

  useEffect(() => {
    if (!open || !rfqId) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiService.get<{ success?: boolean; data?: ComparisonResponse }>(
          `/procurement/quotations/compare/${rfqId}`,
        );
        const payload = (res as any)?.data ?? res;
        if (!cancelled) {
          setData(payload);
        }
      } catch (err: any) {
        if (!cancelled) {
          message.error(err?.response?.data?.message || 'Failed to load quotation comparison');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rfqId, message]);

  const handleAwardAndConvertToPo = async (quote: ComparisonSupplierQuote) => {
    setAwardingId(quote.quotationId);
    try {
      await apiService.post(`/procurement/quotations/${quote.quotationId}/award`, {});
      const poRes = await apiService.post<{ data?: { id?: string; poCode?: string } }>(
        `/procurement/quotations/${quote.quotationId}/convert-to-po`,
        {},
      );
      const po = (poRes as any)?.data ?? poRes;
      message.success(
        `Awarded ${quote.supplierName} and created Draft PO ${po?.poCode || ''}`.trim(),
      );
      onAwardSuccess?.();
      onClose();
      if (po?.id) {
        navigate(`/procurement/orders?poId=${po.id}`);
      } else {
        navigate('/procurement/orders');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to award & convert quotation to PO');
    } finally {
      setAwardingId(null);
    }
  };

  const matrixColumns: ColumnsType<ComparisonItemRow> = [
    {
      title: 'Item / Specification',
      key: 'item',
      fixed: 'left',
      width: 220,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.itemName}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {row.itemCode} {row.uomCode ? `· ${row.uomCode}` : ''}
          </Text>
        </div>
      ),
    },
    {
      title: 'Req. Qty',
      dataIndex: 'requestedQty',
      key: 'requestedQty',
      width: 95,
      align: 'right',
      render: (val: number, row) => (
        <span style={{ fontWeight: 600 }}>
          {formatDecimal(val, 2)} {row.uomCode}
        </span>
      ),
    },
    ...(data?.quotations ?? []).map((q) => ({
      title: (
        <div style={{ minWidth: 150 }}>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{q.supplierName}</span>
            {q.isLowestOverall && (
              <Tag color="success" style={{ marginInlineEnd: 0 }}>
                Lowest
              </Tag>
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {q.quotationCode}
          </Text>
        </div>
      ),
      key: `sup_${q.supplierId}`,
      width: 175,
      align: 'right' as const,
      render: (_: unknown, row: ComparisonItemRow) => {
        const cell = row.quotesBySupplier?.[q.supplierId];
        if (!cell) {
          return <Text type="secondary">Not quoted</Text>;
        }
        return (
          <div
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              background: cell.isLowestUnitPrice ? token.colorSuccessBg : 'transparent',
              border: cell.isLowestUnitPrice
                ? `1px solid ${token.colorSuccessBorder}`
                : '1px solid transparent',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: cell.isLowestUnitPrice ? token.colorSuccess : token.colorText,
              }}
            >
              Rs {formatDecimal(cell.unitPrice, 2)}
              {cell.isLowestUnitPrice ? ' ★' : ''}
            </div>
            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
              Total: Rs {formatDecimal(cell.lineTotal, 2)}
            </div>
          </div>
        );
      },
    })),
  ];

  return (
    <DraggableResizableModal
      open={open}
      onCancel={onClose}
      title={
        <Space>
          <TrophyOutlined style={{ color: token.colorWarning }} />
          <span>
            Comparative Quotation Matrix{' '}
            {data?.rfq?.rfqCode ? `— ${data.rfq.rfqCode}` : ''}
          </span>
        </Space>
      }
      width={1140}
      height={680}
      footer={
        <Button onClick={onClose}>Close</Button>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : !data || data.quotations.length === 0 ? (
        <Empty
          description="No supplier quotations submitted for this RFQ yet."
          style={{ padding: 36 }}
        />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {data.rfq.suppliers.length > 0 && (
            <Alert
              type="info"
              showIcon
              message={
                <Space wrap size={8}>
                  <span style={{ fontWeight: 600 }}>Invited Suppliers ({data.rfq.suppliers.length}):</span>
                  {data.rfq.suppliers.map((s) => (
                    <Tag
                      key={s.supplierId}
                      color={
                        s.status === 'QUOTED'
                          ? 'success'
                          : s.status === 'DECLINED'
                          ? 'error'
                          : 'default'
                      }
                    >
                      {s.supplierName}: {s.status}
                    </Tag>
                  ))}
                </Space>
              }
            />
          )}

          {/* Supplier Bid Summary Cards */}
          <Row gutter={[12, 12]}>
            {data.quotations.map((q) => {
              const isSelected = q.status === 'SELECTED';
              const isRejected = q.status === 'REJECTED';
              return (
                <Col xs={24} sm={12} lg={Math.max(6, Math.floor(24 / Math.min(data.quotations.length, 4)))} key={q.quotationId}>
                  <Badge.Ribbon
                    text={
                      isSelected
                        ? 'AWARDED'
                        : q.isLowestOverall
                        ? 'LOWEST OVERALL BID'
                        : q.status
                    }
                    color={
                      isSelected
                        ? 'green'
                        : q.isLowestOverall
                        ? 'cyan'
                        : isRejected
                        ? 'red'
                        : 'blue'
                    }
                  >
                    <Card
                      size="small"
                      style={{
                        borderColor: q.isLowestOverall
                          ? token.colorSuccess
                          : isSelected
                          ? token.colorPrimary
                          : token.colorBorderSecondary,
                      }}
                    >
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, paddingRight: 64 }}>
                          {q.supplierName}
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {q.quotationCode}
                        </Text>

                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: q.isLowestOverall ? token.colorSuccess : token.colorPrimary,
                          }}
                        >
                          <DollarCircleOutlined /> Rs {formatDecimal(q.grandTotal, 2)}
                        </div>

                        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                          Subtotal: Rs {formatDecimal(q.subtotal, 2)} · GST: {q.taxPercent}% (Rs{' '}
                          {formatDecimal(q.taxAmount, 2)})
                        </div>

                        <div style={{ fontSize: 12 }}>
                          <ClockCircleOutlined /> Lead Time:{' '}
                          <b>
                            {q.deliveryLeadTimeDays !== null
                              ? `${q.deliveryLeadTimeDays} days`
                              : 'N/A'}
                          </b>{' '}
                          · Terms: <b>{q.paymentTerms || 'N/A'}</b>
                        </div>

                        <Button
                          type={q.isLowestOverall || isSelected ? 'primary' : 'default'}
                          icon={isSelected ? <CheckCircleOutlined /> : <ShoppingCartOutlined />}
                          block
                          loading={awardingId === q.quotationId}
                          disabled={isRejected || awardingId !== null}
                          onClick={() => handleAwardAndConvertToPo(q)}
                        >
                          {isSelected ? 'Generate Draft PO' : 'Award & Generate PO'}
                        </Button>
                      </Space>
                    </Card>
                  </Badge.Ribbon>
                </Col>
              );
            })}
          </Row>

          {/* Item-by-Item Side-by-Side Matrix */}
          <div className="proc-matrix-wrap">
            <Table
              size="small"
              bordered
              pagination={false}
              rowKey="itemId"
              columns={matrixColumns}
              dataSource={data.items}
              scroll={{ x: 'max-content' }}
            />
          </div>
        </Space>
      )}
    </DraggableResizableModal>
  );
};

export default QuotationComparisonModal;
