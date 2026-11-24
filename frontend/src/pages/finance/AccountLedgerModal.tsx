import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  Table,
  DatePicker,
  Space,
  Button,
  Tag,
  Typography,
  Statistic,
  Row,
  Col,
  Card,
  theme,
} from 'antd';
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import apiService from '../../services/api';
import { formatPkr, downloadCsvFile } from '../../utils/financeHelpers';
import { printFinancialStatementHtml } from '../../utils/printTemplates';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface AccountLedgerModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  accountId: string | null;
  accountLabel?: string;
  divisionId?: string;
}

const AccountLedgerModal: React.FC<AccountLedgerModalProps> = ({
  open,
  onClose,
  companyId,
  accountId,
  accountLabel,
  divisionId,
}) => {
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [ledgerData, setLedgerData] = useState<any>(null);

  const fetchLedger = useCallback(async () => {
    if (!open || !companyId || !accountId) return;
    setLoading(true);
    try {
      const res = await apiService.get<any>('/finance/reports/general-ledger', {
        companyId,
        accountId,
        from: range ? range[0].format('YYYY-MM-DD') : undefined,
        to: range ? range[1].format('YYYY-MM-DD') : undefined,
        divisionId: divisionId || undefined,
      });
      setLedgerData(res);
    } finally {
      setLoading(false);
    }
  }, [open, companyId, accountId, range, divisionId]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const rows: any[] = ledgerData?.data || [];
  const acct = ledgerData?.account;
  const titleText = acct
    ? `${acct.accountCode} — ${acct.accountName}`
    : accountLabel || 'Account General Ledger';

  const handlePrint = () => {
    printFinancialStatementHtml({
      title: `Account Ledger — ${titleText}`,
      periodLabel: range
        ? `${range[0].format('DD MMM YYYY')} to ${range[1].format('DD MMM YYYY')}`
        : 'All Dates (Cumulative)',
      summaryPairs: [
        { label: 'Opening Balance', value: formatPkr(ledgerData?.openingBalance || 0) },
        { label: 'Total Debit', value: formatPkr(ledgerData?.totalDebit || 0) },
        { label: 'Total Credit', value: formatPkr(ledgerData?.totalCredit || 0) },
        { label: 'Closing Balance', value: formatPkr(ledgerData?.closingBalance || 0) },
      ],
      headers: ['Date', 'Voucher #', 'Type', 'Particulars', 'Division', 'Debit (PKR)', 'Credit (PKR)', 'Running Balance'],
      rows: rows.map((r) => [
        r.journal?.entryDate ? dayjs(r.journal.entryDate).format('DD MMM YYYY') : '-',
        r.journal?.journalNumber || '-',
        r.journal?.voucherType || 'JV',
        r.description || r.journal?.description || '-',
        r.divisionName || '-',
        Number(r.debit || 0) > 0 ? formatPkr(r.debit) : '-',
        Number(r.credit || 0) > 0 ? formatPkr(r.credit) : '-',
        `${formatPkr(Math.abs(r.runningBalance || 0))} ${r.balanceSide || ''}`,
      ]),
      rightAlignCols: [5, 6, 7],
    });
  };

  const handleCsv = () => {
    downloadCsvFile(
      `Account_Ledger_${acct?.accountCode || 'GL'}`,
      ['Date', 'Voucher #', 'Type', 'Description', 'Division', 'Debit', 'Credit', 'Running Balance', 'Side'],
      rows.map((r) => [
        r.journal?.entryDate ? dayjs(r.journal.entryDate).format('YYYY-MM-DD') : '',
        r.journal?.journalNumber || '',
        r.journal?.voucherType || 'JV',
        r.description || r.journal?.description || '',
        r.divisionName || '',
        Number(r.debit || 0),
        Number(r.credit || 0),
        Math.abs(Number(r.runningBalance || 0)),
        r.balanceSide || '',
      ]),
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1020}
      title={
        <Space>
          <span>Account Ledger Statement:</span>
          <Tag color="blue">{titleText}</Tag>
        </Space>
      }
    >
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <RangePicker
          value={range}
          onChange={(vals) => setRange(vals ? [vals[0]!, vals[1]!] : null)}
          allowClear
        />
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
          <Button icon={<PrinterOutlined />} onClick={handlePrint} type="primary">
            Print Ledger
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Opening Balance" value={formatPkr(ledgerData?.openingBalance || 0)} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Period Debits"
              value={formatPkr(ledgerData?.totalDebit || 0)}
              valueStyle={{ color: token.colorSuccess }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Period Credits"
              value={formatPkr(ledgerData?.totalCredit || 0)}
              valueStyle={{ color: token.colorWarning }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Closing Balance"
              value={formatPkr(ledgerData?.closingBalance || 0)}
              valueStyle={{ color: token.colorPrimary }}
            />
          </Card>
        </Col>
      </Row>

      <Table
        dataSource={rows}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 25 }}
        scroll={{ x: 760 }}
        columns={[
          {
            title: 'Date',
            key: 'date',
            width: 110,
            render: (_, r) => (r.journal?.entryDate ? dayjs(r.journal.entryDate).format('DD MMM YYYY') : '-'),
          },
          {
            title: 'Voucher #',
            key: 'journalNumber',
            width: 145,
            render: (_, r) => (
              <Text code strong>
                {r.journal?.journalNumber || '-'}
              </Text>
            ),
          },
          {
            title: 'Particulars',
            key: 'desc',
            render: (_, r) => r.description || r.journal?.description || '-',
          },
          {
            title: 'Division',
            dataIndex: 'divisionName',
            key: 'divisionName',
            width: 140,
            render: (v) => v || <Text type="secondary">-</Text>,
          },
          {
            title: 'Debit',
            dataIndex: 'debit',
            key: 'debit',
            align: 'right',
            width: 120,
            render: (v) => (Number(v) > 0 ? formatPkr(v) : '-'),
          },
          {
            title: 'Credit',
            dataIndex: 'credit',
            key: 'credit',
            align: 'right',
            width: 120,
            render: (v) => (Number(v) > 0 ? formatPkr(v) : '-'),
          },
          {
            title: 'Running Balance',
            key: 'runningBalance',
            align: 'right',
            width: 150,
            render: (_, r) => (
              <Text strong>
                {formatPkr(Math.abs(r.runningBalance || 0))} <Tag>{r.balanceSide || ''}</Tag>
              </Text>
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default AccountLedgerModal;
