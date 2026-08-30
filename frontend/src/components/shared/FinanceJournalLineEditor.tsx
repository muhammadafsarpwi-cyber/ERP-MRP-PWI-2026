import React, { useState, useEffect } from 'react';
import { Table, Button, Select, InputNumber, Input, Space, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

export interface JournalLine {
  id: string;
  accountId?: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string;
}

interface Props {
  companyId: string;
  value: JournalLine[];
  onChange: (lines: JournalLine[]) => void;
  disabled?: boolean;
}

let counter = 0;
const nextId = () => `jl-${++counter}-${Date.now()}`;

const FinanceJournalLineEditor: React.FC<Props> = ({ companyId, value, onChange, disabled = false }) => {
  const [accounts, setAccounts] = useState<Array<{ id: string; accountCode: string; accountName: string; normalBalance: string }>>([]);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const r = await apiService.get<{ data: Array<{ id: string; accountCode: string; accountName: string; normalBalance: string }> }>('/finance/accounts', { companyId, limit: 200 });
        setAccounts(r.data || []);
      } catch { /* ignore */ }
    })();
  }, [companyId]);

  const addLine = () => onChange([...value, { id: nextId(), debit: 0, credit: 0 }]);

  const update = (id: string, patch: Partial<JournalLine>) => {
    onChange(value.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      if (patch.accountId) {
        const acct = accounts.find((a) => a.id === patch.accountId);
        if (acct) { next.accountCode = acct.accountCode; next.accountName = acct.accountName; }
      }
      return next;
    }));
  };

  const remove = (id: string) => onChange(value.filter((l) => l.id !== id));

  const totals = value.reduce((acc, l) => ({ debit: acc.debit + Number(l.debit || 0), credit: acc.credit + Number(l.credit || 0) }), { debit: 0, credit: 0 });
  const balanced = Math.abs(totals.debit - totals.credit) < 0.0001;

  const columns: ColumnsType<JournalLine> = [
    {
      title: 'Account', key: 'account', width: 280,
      render: (_, record) => (
        <Select
          showSearch optionFilterProp="label" placeholder="Select account" value={record.accountId} disabled={disabled}
          onChange={(v) => update(record.id, { accountId: v })}
          options={accounts.map((a) => ({ value: a.id, label: `${a.accountCode} — ${a.accountName}` }))}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Debit', key: 'debit', width: 130,
      render: (_, record) => (
        <InputNumber min={0} value={record.debit} disabled={disabled} style={{ width: '100%' }}
          onChange={(v) => update(record.id, { debit: Number(v || 0), credit: 0 })} />
      ),
    },
    {
      title: 'Credit', key: 'credit', width: 130,
      render: (_, record) => (
        <InputNumber min={0} value={record.credit} disabled={disabled} style={{ width: '100%' }}
          onChange={(v) => update(record.id, { credit: Number(v || 0), debit: 0 })} />
      ),
    },
    {
      title: 'Description', key: 'desc',
      render: (_, record) => (
        <Input value={record.description} disabled={disabled} placeholder="Description / reference"
          onChange={(e) => update(record.id, { description: e.target.value })} />
      ),
    },
    {
      title: '', key: 'actions', width: 50,
      render: (_, record) => (
        <Button type="text" danger icon={<DeleteOutlined />} disabled={disabled} aria-label="Remove line" onClick={() => remove(record.id)} />
      ),
    },
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Typography.Text strong>Journal Lines</Typography.Text>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addLine} disabled={disabled}>Add Line</Button>
      </Space>
      <Table size="small" columns={columns} dataSource={value} rowKey="id" pagination={false}
        locale={{ emptyText: 'Add at least two lines. Total debit must equal total credit.' }} />
      <Divider style={{ margin: '12px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, alignItems: 'center' }}>
        <div><Typography.Text type="secondary">Total Debit: </Typography.Text><Typography.Text strong>${totals.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography.Text></div>
        <div><Typography.Text type="secondary">Total Credit: </Typography.Text><Typography.Text strong>${totals.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography.Text></div>
        <Typography.Text style={{ color: balanced ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
          {balanced ? 'BALANCED' : `UNBALANCED (${(totals.debit - totals.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })})`}
        </Typography.Text>
      </div>
    </div>
  );
};

export default FinanceJournalLineEditor;