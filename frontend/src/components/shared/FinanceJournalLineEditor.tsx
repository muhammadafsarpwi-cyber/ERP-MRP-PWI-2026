import React, { useEffect, useState } from 'react';
import { Button, Input, InputNumber, Select, Space, Table, Tag, Typography, theme } from 'antd';
import { DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { formatPkr } from '../../utils/financeHelpers';

const { Text } = Typography;

export interface JournalLineInput {
  key: string;
  accountId?: string;
  debit: number;
  credit: number;
  description?: string;
}

export type JournalLine = JournalLineInput;

interface AccountOption {
  id: string;
  accountCode: string;
  accountName: string;
  accountType?: string;
  normalBalance: string;
}

interface FinanceJournalLineEditorProps {
  companyId: string;
  value?: JournalLineInput[];
  onChange?: (lines: JournalLineInput[]) => void;
}

export const FinanceJournalLineEditor: React.FC<FinanceJournalLineEditorProps> = ({
  companyId,
  value = [],
  onChange,
}) => {
  const { token } = theme.useToken();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiService
      .get<{ data: AccountOption[] }>('/finance/accounts', companyId ? { companyId } : undefined)
      .then((r) => setAccounts(r.data || []))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [companyId]);

  const lines =
    value.length > 0
      ? value
      : [
        { key: '1', debit: 0, credit: 0 },
        { key: '2', debit: 0, credit: 0 },
      ];

  const update = (next: JournalLineInput[]) => onChange?.(next);

  const addLine = () => {
    update([...lines, { key: String(Date.now() + Math.random()), debit: 0, credit: 0 }]);
  };

  const removeLine = (key: string) => {
    if (lines.length <= 2) return;
    update(lines.filter((l) => l.key !== key));
  };

  const setField = <K extends keyof JournalLineInput>(
    key: string,
    field: K,
    val: JournalLineInput[K],
  ) => {
    update(
      lines.map((l) => {
        if (l.key !== key) return l;
        const next: JournalLineInput = { ...l, [field]: val };
        if (field === 'debit' && Number(val) > 0) next.credit = 0;
        if (field === 'credit' && Number(val) > 0) next.debit = 0;
        return next;
      }),
    );
  };

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const diff = Number((totalDebit - totalCredit).toFixed(2));
  const balanced = Math.abs(diff) < 0.01 && totalDebit > 0;

  const autoBalanceLastRow = () => {
    if (lines.length < 2) return;
    const prefix = lines.slice(0, -1);
    const pDr = prefix.reduce((s, l) => s + Number(l.debit || 0), 0);
    const pCr = prefix.reduce((s, l) => s + Number(l.credit || 0), 0);
    const gap = Math.round((pDr - pCr) * 100) / 100;
    const last = lines[lines.length - 1];
    update([
      ...prefix,
      {
        ...last,
        debit: gap < 0 ? Math.abs(gap) : 0,
        credit: gap > 0 ? gap : 0,
      },
    ]);
  };

  return (
    <div>
      <Table
        dataSource={lines}
        rowKey="key"
        pagination={false}
        size="small"
        columns={[
          {
            title: 'Ledger Account (Code & Title)',
            width: 300,
            render: (_, r) => (
              <Select
                showSearch
                loading={loading}
                value={r.accountId}
                onChange={(v) => setField(r.key, 'accountId', v)}
                style={{ width: '100%' }}
                placeholder="Select account..."
                optionFilterProp="label"
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.accountCode} - ${a.accountName} (${a.accountType || a.normalBalance})`,
                }))}
              />
            ),
          },
          {
            title: 'Line Narration',
            width: 220,
            render: (_, r) => (
              <Input
                value={r.description}
                onChange={(e) => setField(r.key, 'description', e.target.value)}
                placeholder="Particulars / line note"
              />
            ),
          },
          {
            title: 'Debit (PKR)',
            width: 140,
            render: (_, r) => (
              <InputNumber
                value={r.debit}
                onChange={(v) => setField(r.key, 'debit', Number(v ?? 0))}
                min={0}
                precision={2}
                prefix="Rs "
                style={{ width: '100%' }}
              />
            ),
          },
          {
            title: 'Credit (PKR)',
            width: 140,
            render: (_, r) => (
              <InputNumber
                value={r.credit}
                onChange={(v) => setField(r.key, 'credit', Number(v ?? 0))}
                min={0}
                precision={2}
                prefix="Rs "
                style={{ width: '100%' }}
              />
            ),
          },
          {
            title: '',
            width: 48,
            render: (_, r) => (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={lines.length <= 2}
                onClick={() => removeLine(r.key)}
              />
            ),
          },
        ]}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 10,
          padding: '10px 14px',
          borderRadius: token.borderRadiusLG,
          border: `1px solid ${balanced ? token.colorSuccessBorder : token.colorBorderSecondary}`,
          background: balanced ? token.colorSuccessBg : token.colorFillAlter,
        }}
      >
        <Space wrap>
          <Button icon={<PlusOutlined />} onClick={addLine} size="small">
            Add Line
          </Button>
          {Math.abs(diff) > 0.01 && (
            <Button icon={<ThunderboltOutlined />} onClick={autoBalanceLastRow} size="small">
              Auto-Balance Last Line ({formatPkr(Math.abs(diff))})
            </Button>
          )}
        </Space>
        <Space size="middle" wrap>
          <Text>
            Total Debit: <Text strong>{formatPkr(totalDebit)}</Text>
          </Text>
          <Text>
            Total Credit: <Text strong>{formatPkr(totalCredit)}</Text>
          </Text>
          {balanced ? (
            <Tag color="success">BALANCED (PKR)</Tag>
          ) : (
            <Tag color="error">Difference: {formatPkr(Math.abs(diff))}</Tag>
          )}
        </Space>
      </div>
    </div>
  );
};

export default FinanceJournalLineEditor;
