import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Card,
  Table,
  Tabs,
  Row,
  Col,
  Statistic,
  Select,
  DatePicker,
  Button,
  Space,
  Tag,
  Typography,
  Alert,
  Spin,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  PrinterOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import apiService, { describeRequestError } from '../../services/api';
import { matchesTabRefresh, markManualRefreshWindow, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { PageHeader, TableColumnSelector, useColumnVisibility } from '../../components/shared';
import {
  formatPkr,
  downloadCsvFile,
  FISCAL_PRESETS,
  resolveFiscalPresetRange,
  FiscalPresetKey,
} from '../../utils/financeHelpers';
import { printFinancialStatementHtml } from '../../utils/printTemplates';
import AccountLedgerModal from './AccountLedgerModal';
import { usePermission } from '../../hooks/usePermission';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const REPORT_PERM_BY_TAB: Record<string, string> = {
  tb: 'finance.report.trial_balance',
  gl: 'finance.report.general_ledger',
  cb: 'finance.report.cash_bank_book',
  pl: 'finance.report.pl',
  bs: 'finance.report.balance_sheet',
  ar: 'finance.report.ar',
  ap: 'finance.report.ap',
};

const FinanceReports: React.FC = () => {
  const { token } = theme.useToken();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'tb';
  const permittedTabKeys = useMemo(
    () => Object.keys(REPORT_PERM_BY_TAB).filter((k) => can(REPORT_PERM_BY_TAB[k])),
    [can],
  );
  const activeTab = permittedTabKeys.includes(requestedTab)
    ? requestedTab
    : (permittedTabKeys[0] || requestedTab);
  const activePermPrefix = REPORT_PERM_BY_TAB[activeTab] || 'finance.report.trial_balance';
  const canViewActiveTab = can(activePermPrefix);
  const canExportActiveTab = can(`${activePermPrefix}.export`);
  const canPrintActiveTab = can(`${activePermPrefix}.print`);

  const [companyId] = useState<string>(() => {
    try {
      const erpUser = localStorage.getItem('erp_user');
      if (erpUser) {
        const parsed = JSON.parse(erpUser);
        if (parsed?.defaultCompanyId) return String(parsed.defaultCompanyId);
      }
    } catch {
      // ignore invalid storage payload
    }
    return '';
  });
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<Array<{ id: string; name: string }>>([]);
  const glDefaultedRef = useRef(false);
  const requestSeqRef = useRef(0);

  // Shared report filters
  const [preset, setPreset] = useState<FiscalPresetKey>('ALL');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [asOfDate, setAsOfDate] = useState<Dayjs>(dayjs());
  const [divisionId, setDivisionId] = useState<string | undefined>();
  const [glAccountId, setGlAccountId] = useState<string | undefined>();
  const [cbAccountId, setCbAccountId] = useState<string | undefined>();

  // Report state (lazy per active tab)
  const [tb, setTb] = useState<any>(null);
  const [gl, setGl] = useState<any>(null);
  const [cb, setCb] = useState<any>(null);
  const [pl, setPl] = useState<any>(null);
  const [bs, setBs] = useState<any>(null);
  const [ar, setAr] = useState<any>(null);
  const [ap, setAp] = useState<any>(null);

  // Drill-down modal
  const [drillAccount, setDrillAccount] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    apiService
      .get<any>('/dashboard/divisions')
      .then((res) => setDivisions(res?.data || []))
      .catch(() => { });
  }, []);

  useEffect(() => {
    apiService
      .get<{ data: any[] }>('/finance/accounts', companyId ? { companyId } : undefined)
      .then((res) => {
        const list = res.data || [];
        setAccounts(list);
        if (!glDefaultedRef.current && list.length > 0) {
          glDefaultedRef.current = true;
          const preferred = list.find((a) => a.accountCode === '1000') || list[0];
          setGlAccountId((prev) => prev ?? preferred.id);
        }
      })
      .catch(() => { });
  }, [companyId]);

  const fromStr = dateRange ? dateRange[0].format('YYYY-MM-DD') : undefined;
  const toStr = dateRange ? dateRange[1].format('YYYY-MM-DD') : undefined;
  const asOfStr = asOfDate ? asOfDate.format('YYYY-MM-DD') : undefined;
  const activeAccountParam =
    activeTab === 'gl' ? glAccountId : activeTab === 'cb' ? cbAccountId : undefined;
  const activeFromParam =
    activeTab === 'bs' || activeTab === 'ar' || activeTab === 'ap' ? undefined : fromStr;
  const activeToParam =
    activeTab === 'bs' || activeTab === 'ar' || activeTab === 'ap' ? undefined : toStr;
  const activeAsOfParam =
    activeTab === 'bs' || activeTab === 'ar' || activeTab === 'ap' ? asOfStr : undefined;

  const loadActiveReport = useCallback(async (forceRefresh = false) => {
    if (!canViewActiveTab) return;
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setReportError(null);
    const reqConfig = forceRefresh ? { forceRefresh: true } : undefined;
    try {
      const common = {
        companyId: companyId || undefined,
        divisionId: divisionId || undefined,
      };
      if (activeTab === 'tb') {
        const res = await apiService.get('/finance/reports/trial-balance', { ...common, from: activeFromParam, to: activeToParam }, reqConfig);
        if (requestSeqRef.current === seq) setTb(res);
      } else if (activeTab === 'gl') {
        const res = await apiService.get(
          '/finance/reports/general-ledger',
          {
            ...common,
            accountId: activeAccountParam || undefined,
            from: activeFromParam,
            to: activeToParam,
          },
          reqConfig,
        );
        if (requestSeqRef.current === seq) setGl(res);
      } else if (activeTab === 'cb') {
        const res = await apiService.get(
          '/finance/reports/cash-bank-book',
          {
            ...common,
            accountId: activeAccountParam || undefined,
            from: activeFromParam,
            to: activeToParam,
          },
          reqConfig,
        );
        if (requestSeqRef.current === seq) setCb(res);
      } else if (activeTab === 'pl') {
        const res = await apiService.get('/finance/reports/pl', { ...common, from: activeFromParam, to: activeToParam }, reqConfig);
        if (requestSeqRef.current === seq) setPl(res);
      } else if (activeTab === 'bs') {
        const res = await apiService.get('/finance/reports/balance-sheet', { ...common, asOf: activeAsOfParam }, reqConfig);
        if (requestSeqRef.current === seq) setBs(res);
      } else if (activeTab === 'ar') {
        const res = await apiService.get('/finance/reports/ar', { ...common, asOf: activeAsOfParam }, reqConfig);
        if (requestSeqRef.current === seq) setAr(res);
      } else if (activeTab === 'ap') {
        const res = await apiService.get('/finance/reports/ap', { ...common, asOf: activeAsOfParam }, reqConfig);
        if (requestSeqRef.current === seq) setAp(res);
      }
    } catch (err) {
      if (requestSeqRef.current === seq) {
        setReportError(describeRequestError(err));
      }
    } finally {
      if (requestSeqRef.current === seq) {
        setLoading(false);
      }
    }
  }, [activeTab, canViewActiveTab, companyId, divisionId, activeFromParam, activeToParam, activeAsOfParam, activeAccountParam]);

  useEffect(() => {
    void loadActiveReport(false);
  }, [loadActiveReport]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      if (matchesTabRefresh(e, '/finance/reports')) {
        markManualRefreshWindow(800);
        void loadActiveReport(true);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [loadActiveReport]);

  const handlePresetChange = (val: FiscalPresetKey) => {
    setPreset(val);
    setDateRange(resolveFiscalPresetRange(val));
  };

  const isPointInTimeTab = activeTab === 'bs' || activeTab === 'ar' || activeTab === 'ap';
  const divisionLabel = divisions.find((d) => d.id === divisionId)?.name || 'All Divisions';
  const periodLabel = isPointInTimeTab
    ? `As of ${asOfDate.format('DD MMM YYYY')}`
    : dateRange
      ? `${dateRange[0].format('DD MMM YYYY')} to ${dateRange[1].format('DD MMM YYYY')}`
      : 'All Dates (FY Cumulative)';

  const handlePrintActive = () => {
    if (activeTab === 'tb' && tb) {
      printFinancialStatementHtml({
        title: 'Trial Balance (6-Column)',
        periodLabel,
        divisionLabel,
        summaryPairs: [
          { label: 'Period Debit', value: formatPkr(tb.totalDebit || 0) },
          { label: 'Period Credit', value: formatPkr(tb.totalCredit || 0) },
          { label: 'Closing Debit', value: formatPkr(tb.totalClosingDebit || 0) },
          { label: 'Closing Credit', value: formatPkr(tb.totalClosingCredit || 0) },
        ],
        headers: ['Code', 'Account Title', 'Type', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr'],
        rows: (tb.data || []).map((r: any) => [
          r.accountCode,
          r.accountName,
          r.accountType,
          formatPkr(r.openingDebit),
          formatPkr(r.openingCredit),
          formatPkr(r.periodDebit),
          formatPkr(r.periodCredit),
          formatPkr(r.closingDebit),
          formatPkr(r.closingCredit),
        ]),
        rightAlignCols: [3, 4, 5, 6, 7, 8],
        totalsRow: [
          '',
          'TOTAL',
          '',
          formatPkr(tb.totalOpeningDebit || 0),
          formatPkr(tb.totalOpeningCredit || 0),
          formatPkr(tb.totalDebit || 0),
          formatPkr(tb.totalCredit || 0),
          formatPkr(tb.totalClosingDebit || 0),
          formatPkr(tb.totalClosingCredit || 0),
        ],
      });
    } else if (activeTab === 'gl' && gl) {
      const acct = gl.account;
      printFinancialStatementHtml({
        title: acct ? `General Ledger — ${acct.accountCode} ${acct.accountName}` : 'General Ledger',
        periodLabel,
        divisionLabel,
        summaryPairs: [
          { label: 'Opening Balance', value: formatPkr(gl.openingBalance || 0) },
          { label: 'Period Debit', value: formatPkr(gl.totalDebit || 0) },
          { label: 'Period Credit', value: formatPkr(gl.totalCredit || 0) },
          { label: 'Closing Balance', value: formatPkr(gl.closingBalance || 0) },
        ],
        headers: ['Date', 'Voucher #', 'Particulars', 'Division', 'Debit (PKR)', 'Credit (PKR)', 'Running Balance'],
        rows: (gl.data || []).map((r: any) => [
          r.journal?.entryDate ? dayjs(r.journal.entryDate).format('DD MMM YYYY') : '-',
          r.journal?.journalNumber || '-',
          r.description || r.journal?.description || '-',
          r.divisionName || '-',
          Number(r.debit) > 0 ? formatPkr(r.debit) : '-',
          Number(r.credit) > 0 ? formatPkr(r.credit) : '-',
          `${formatPkr(Math.abs(r.runningBalance || 0))} ${r.balanceSide || ''}`,
        ]),
        rightAlignCols: [4, 5, 6],
      });
    } else if (activeTab === 'pl' && pl) {
      printFinancialStatementHtml({
        title: 'Profit & Loss Statement (Income Statement)',
        periodLabel,
        divisionLabel,
        summaryPairs: [
          { label: 'Operating Revenue', value: formatPkr(pl.operatingRevenue || 0) },
          { label: 'Direct Costs / COGS', value: formatPkr(pl.directCosts || 0) },
          { label: 'Gross Profit', value: formatPkr(pl.grossProfit || 0) },
          { label: 'Net Profit / (Loss)', value: formatPkr(pl.netProfit || 0) },
        ],
        headers: ['Code', 'Account Title', 'Section', 'Amount (PKR)'],
        rows: (pl.data || []).map((r: any) => [
          r.accountCode,
          r.accountName,
          String(r.section || '').replace(/_/g, ' '),
          formatPkr(r.balance),
        ]),
        rightAlignCols: [3],
        totalsRow: ['', 'NET PROFIT / (LOSS)', '', formatPkr(pl.netProfit || 0)],
      });
    } else if (activeTab === 'bs' && bs) {
      printFinancialStatementHtml({
        title: 'Balance Sheet (Statement of Financial Position)',
        periodLabel,
        divisionLabel,
        summaryPairs: [
          { label: 'Total Assets', value: formatPkr(bs.assets || 0) },
          { label: 'Total Liabilities', value: formatPkr(bs.liabilities || 0) },
          { label: 'Total Equity (Incl. Current Profit)', value: formatPkr(bs.equity || 0) },
          { label: 'Reconciliation', value: bs.balanced ? 'BALANCED' : 'UNBALANCED' },
        ],
        headers: ['Code', 'Account Title', 'Category', 'Balance (PKR)'],
        rows: (bs.data || []).map((r: any) => [
          r.accountCode,
          r.accountName,
          r.accountType,
          formatPkr(r.balance),
        ]),
        rightAlignCols: [3],
      });
    } else if (activeTab === 'ar' && ar) {
      printFinancialStatementHtml({
        title: 'Customer Accounts Receivable (AR) Aging Report',
        periodLabel,
        divisionLabel,
        summaryPairs: [
          { label: 'Total Receivables', value: formatPkr(ar.summary?.totalOutstanding || 0) },
          { label: 'Customer Advances', value: formatPkr(ar.summary?.totalAdvances || 0) },
          { label: 'GL Control (1100)', value: formatPkr(ar.summary?.glControlBalance || 0) },
          { label: 'Variance', value: formatPkr(ar.summary?.reconciliationDiff || 0) },
        ],
        headers: ['Code', 'Customer Name', 'Total Outstanding', 'Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days'],
        rows: (ar.data || []).map((r: any) => [
          r.customerCode,
          r.customerName,
          formatPkr(r.outstanding),
          formatPkr(r.current),
          formatPkr(r.days1to30),
          formatPkr(r.days31to60),
          formatPkr(r.days61to90),
          formatPkr(r.days90plus),
        ]),
        rightAlignCols: [2, 3, 4, 5, 6, 7],
      });
    } else if (activeTab === 'ap' && ap) {
      printFinancialStatementHtml({
        title: 'Supplier Accounts Payable & Unbilled GRN Aging Report',
        periodLabel,
        divisionLabel,
        summaryPairs: [
          { label: 'Billed AP (2000)', value: formatPkr(ap.summary?.totalPayables || 0) },
          { label: 'Unbilled GRNs (2010)', value: formatPkr(ap.summary?.totalUnbilledGrn || 0) },
          { label: 'Total Liability', value: formatPkr(ap.summary?.totalLiability || 0) },
          { label: 'GL 2010 Balance', value: formatPkr(ap.summary?.glGrnClearingBalance || 0) },
        ],
        headers: ['Code', 'Supplier Name', 'Billed AP', 'Unbilled GRN', 'Total Liability', 'Current', '1–30 Days', '31–60 Days', '61+ Days'],
        rows: (ap.data || []).map((r: any) => [
          r.supplierCode,
          r.supplierName,
          formatPkr(r.billedPayable),
          formatPkr(r.unbilledGrnAmount),
          formatPkr(r.totalLiability),
          formatPkr(r.current),
          formatPkr(r.days1to30),
          formatPkr(r.days31to60),
          formatPkr(Number(r.days61to90 || 0) + Number(r.days90plus || 0)),
        ]),
        rightAlignCols: [2, 3, 4, 5, 6, 7, 8],
      });
    } else if (activeTab === 'cb' && cb) {
      printFinancialStatementHtml({
        title: 'Cash & Bank Book',
        periodLabel,
        divisionLabel,
        summaryPairs: [
          { label: 'Cash in Hand (1000)', value: formatPkr(cb.summary?.totalCash || 0) },
          { label: 'Bank Balances', value: formatPkr(cb.summary?.totalBank || 0) },
          { label: 'Inflows (Dr)', value: formatPkr(cb.totalInflow || 0) },
          { label: 'Closing Balance', value: formatPkr(cb.closingBalance || 0) },
        ],
        headers: ['Date', 'Voucher #', 'Account', 'Particulars', 'Inflow (Dr)', 'Outflow (Cr)', 'Balance (PKR)'],
        rows: (cb.transactions || []).map((t: any) => [
          t.entryDate ? dayjs(t.entryDate).format('DD MMM YYYY') : '-',
          t.journalNumber || '-',
          `${t.accountCode} ${t.accountName}`,
          t.description || '-',
          t.inflow > 0 ? formatPkr(t.inflow) : '-',
          t.outflow > 0 ? formatPkr(t.outflow) : '-',
          formatPkr(t.runningBalance),
        ]),
        rightAlignCols: [4, 5, 6],
      });
    }
  };

  const handleExportCsv = () => {
    if (activeTab === 'tb' && tb) {
      downloadCsvFile(
        'PWI_Trial_Balance',
        ['Code', 'Account', 'Type', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr'],
        (tb.data || []).map((r: any) => [
          r.accountCode,
          r.accountName,
          r.accountType,
          r.openingDebit,
          r.openingCredit,
          r.periodDebit,
          r.periodCredit,
          r.closingDebit,
          r.closingCredit,
        ]),
      );
    } else if (activeTab === 'gl' && gl) {
      downloadCsvFile(
        'PWI_General_Ledger',
        ['Date', 'Voucher #', 'Account Code', 'Account Name', 'Description', 'Division', 'Debit', 'Credit', 'Running Balance'],
        (gl.data || []).map((r: any) => [
          r.journal?.entryDate ? dayjs(r.journal.entryDate).format('YYYY-MM-DD') : '',
          r.journal?.journalNumber || '',
          r.account?.accountCode || '',
          r.account?.accountName || '',
          r.description || r.journal?.description || '',
          r.divisionName || '',
          r.debit || 0,
          r.credit || 0,
          r.runningBalance || 0,
        ]),
      );
    } else if (activeTab === 'pl' && pl) {
      downloadCsvFile(
        'PWI_Profit_Loss',
        ['Code', 'Account', 'Section', 'Amount (PKR)'],
        (pl.data || []).map((r: any) => [r.accountCode, r.accountName, r.section, r.balance]),
      );
    } else if (activeTab === 'bs' && bs) {
      downloadCsvFile(
        'PWI_Balance_Sheet',
        ['Code', 'Account', 'Category', 'Balance (PKR)'],
        (bs.data || []).map((r: any) => [r.accountCode, r.accountName, r.accountType, r.balance]),
      );
    } else if (activeTab === 'ar' && ar) {
      downloadCsvFile(
        'PWI_AR_Aging',
        ['Code', 'Customer', 'Outstanding', 'Advances', 'Net AR', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days'],
        (ar.data || []).map((r: any) => [
          r.customerCode,
          r.customerName,
          r.outstanding,
          r.unallocatedAdvance,
          r.netReceivable,
          r.current,
          r.days1to30,
          r.days31to60,
          r.days61to90,
          r.days90plus,
        ]),
      );
    } else if (activeTab === 'ap' && ap) {
      downloadCsvFile(
        'PWI_AP_Aging',
        ['Code', 'Supplier', 'Billed AP', 'Unbilled GRNs', 'Total Liability', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days'],
        (ap.data || []).map((r: any) => [
          r.supplierCode,
          r.supplierName,
          r.billedPayable,
          r.unbilledGrnAmount,
          r.totalLiability,
          r.current,
          r.days1to30,
          r.days31to60,
          r.days61to90,
          r.days90plus,
        ]),
      );
    } else if (activeTab === 'cb' && cb) {
      downloadCsvFile(
        'PWI_Cash_Bank_Book',
        ['Date', 'Voucher #', 'Account', 'Description', 'Inflow', 'Outflow', 'Balance'],
        (cb.transactions || []).map((t: any) => [
          t.entryDate ? dayjs(t.entryDate).format('YYYY-MM-DD') : '',
          t.journalNumber || '',
          `${t.accountCode} ${t.accountName}`,
          t.description || '',
          t.inflow || 0,
          t.outflow || 0,
          t.runningBalance || 0,
        ]),
      );
    }
  };

  const tbColumns = useMemo<ColumnsType<any>>(
    () => [
      {
        title: 'Code',
        dataIndex: 'accountCode',
        key: 'accountCode',
        render: (c: any) => <Text code strong>{c}</Text>,
      },
      {
        title: 'Account Title',
        dataIndex: 'accountName',
        key: 'accountName',
        render: (name: any, r: any) => (
          <Button
            type="link"
            style={{ padding: 0, fontWeight: 600 }}
            onClick={() => setDrillAccount({ id: r.accountId, label: `${r.accountCode} — ${r.accountName}` })}
          >
            {name}
          </Button>
        ),
      },
      { title: 'Type', dataIndex: 'accountType', key: 'accountType', render: (t: any) => <Tag>{t}</Tag> },
      { title: 'Opening Dr', dataIndex: 'openingDebit', key: 'openingDebit', align: 'right' as const, render: (v: any) => (Number(v) > 0 ? formatPkr(v) : '-') },
      { title: 'Opening Cr', dataIndex: 'openingCredit', key: 'openingCredit', align: 'right' as const, render: (v: any) => (Number(v) > 0 ? formatPkr(v) : '-') },
      { title: 'Period Dr', dataIndex: 'periodDebit', key: 'periodDebit', align: 'right' as const, render: (v: any) => (Number(v) > 0 ? formatPkr(v) : '-') },
      { title: 'Period Cr', dataIndex: 'periodCredit', key: 'periodCredit', align: 'right' as const, render: (v: any) => (Number(v) > 0 ? formatPkr(v) : '-') },
      { title: 'Closing Dr', dataIndex: 'closingDebit', key: 'closingDebit', align: 'right' as const, render: (v: any) => (Number(v) > 0 ? <Text strong>{formatPkr(v)}</Text> : '-') },
      { title: 'Closing Cr', dataIndex: 'closingCredit', key: 'closingCredit', align: 'right' as const, render: (v: any) => (Number(v) > 0 ? <Text strong>{formatPkr(v)}</Text> : '-') },
    ],
    [],
  );

  const glColumns = useMemo<ColumnsType<any>>(
    () => [
      {
        title: 'Date',
        key: 'entryDate',
        render: (_: any, r: any) => (r.journal?.entryDate ? dayjs(r.journal.entryDate).format('DD MMM YYYY') : '-'),
      },
      {
        title: 'Voucher #',
        key: 'journalNumber',
        render: (_: any, r: any) => (
          <Space size={4}>
            <Tag>{r.journal?.voucherType || 'JV'}</Tag>
            <Text code strong>{r.journal?.journalNumber || '-'}</Text>
          </Space>
        ),
      },
      {
        title: 'Account',
        key: 'account',
        render: (_: any, r: any) => `${r.account?.accountCode || ''} - ${r.account?.accountName || ''}`,
      },
      {
        title: 'Particulars',
        key: 'description',
        render: (_: any, r: any) => r.description || r.journal?.description || '-',
      },
      {
        title: 'Division',
        dataIndex: 'divisionName',
        key: 'divisionName',
        render: (v: any) => v || '-',
      },
      {
        title: 'Debit',
        dataIndex: 'debit',
        key: 'debit',
        align: 'right' as const,
        render: (v: any) => (Number(v) > 0 ? formatPkr(v) : '-'),
      },
      {
        title: 'Credit',
        dataIndex: 'credit',
        key: 'credit',
        align: 'right' as const,
        render: (v: any) => (Number(v) > 0 ? formatPkr(v) : '-'),
      },
      {
        title: 'Running Balance',
        key: 'runningBalance',
        align: 'right' as const,
        render: (_: any, r: any) => (
          <Text strong>
            {formatPkr(Math.abs(r.runningBalance || 0))} <Tag>{r.balanceSide || ''}</Tag>
          </Text>
        ),
      },
    ],
    [],
  );

  const cbColumns = useMemo<ColumnsType<any>>(
    () => [
      { title: 'Date', dataIndex: 'entryDate', key: 'entryDate', render: (d: any) => (d ? dayjs(d).format('DD MMM YYYY') : '-') },
      { title: 'Voucher #', dataIndex: 'journalNumber', key: 'journalNumber', render: (v: any) => <Text code>{v}</Text> },
      { title: 'Account', key: 'account', render: (_: any, r: any) => `${r.accountCode} - ${r.accountName}` },
      { title: 'Particulars', dataIndex: 'description', key: 'description' },
      { title: 'Inflow (Dr)', dataIndex: 'inflow', key: 'inflow', align: 'right' as const, render: (v: any) => (Number(v) > 0 ? formatPkr(v) : '-') },
      { title: 'Outflow (Cr)', dataIndex: 'outflow', key: 'outflow', align: 'right' as const, render: (v: any) => (Number(v) > 0 ? formatPkr(v) : '-') },
      { title: 'Balance (PKR)', dataIndex: 'runningBalance', key: 'runningBalance', align: 'right' as const, render: (v: any) => <Text strong>{formatPkr(v)}</Text> },
    ],
    [],
  );

  const plColumns = useMemo<ColumnsType<any>>(
    () => [
      { title: 'Code', dataIndex: 'accountCode', key: 'accountCode', render: (c: any) => <Text code>{c}</Text> },
      {
        title: 'Account Title',
        dataIndex: 'accountName',
        key: 'accountName',
        render: (name: any, r: any) => (
          <Button
            type="link"
            style={{ padding: 0 }}
            onClick={() => setDrillAccount({ id: r.accountId, label: `${r.accountCode} — ${r.accountName}` })}
          >
            {name}
          </Button>
        ),
      },
      { title: 'Section', dataIndex: 'section', key: 'section', render: (s: any) => <Tag>{String(s).replace(/_/g, ' ')}</Tag> },
      { title: 'Amount (PKR)', dataIndex: 'balance', key: 'balance', align: 'right' as const, render: (v: any) => <Text strong>{formatPkr(v)}</Text> },
    ],
    [],
  );

  const bsColumns = useMemo<ColumnsType<any>>(
    () => [
      { title: 'Code', dataIndex: 'accountCode', key: 'accountCode', render: (c: any) => <Text code strong>{c}</Text> },
      {
        title: 'Account / Line Item',
        dataIndex: 'accountName',
        key: 'accountName',
        render: (name: any, r: any) =>
          r.accountId ? (
            <Button
              type="link"
              style={{ padding: 0 }}
              onClick={() => setDrillAccount({ id: r.accountId, label: `${r.accountCode} — ${r.accountName}` })}
            >
              {name}
            </Button>
          ) : (
            <Text strong>{name} (Computed from P&L)</Text>
          ),
      },
      { title: 'Category', dataIndex: 'accountType', key: 'accountType', render: (t: any) => <Tag>{t}</Tag> },
      { title: 'Balance (PKR)', dataIndex: 'balance', key: 'balance', align: 'right' as const, render: (v: any) => <Text strong>{formatPkr(v)}</Text> },
    ],
    [],
  );

  const arColumns = useMemo<ColumnsType<any>>(
    () => [
      { title: 'Code', dataIndex: 'customerCode', key: 'customerCode', render: (c: any) => <Text code>{c}</Text> },
      { title: 'Customer', dataIndex: 'customerName', key: 'customerName' },
      { title: 'Division', dataIndex: 'divisionName', key: 'divisionName' },
      { title: 'Outstanding', dataIndex: 'outstanding', key: 'outstanding', align: 'right' as const, render: (v: any) => <Text strong>{formatPkr(v)}</Text> },
      { title: 'Current', dataIndex: 'current', key: 'current', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: '1–30 Days', dataIndex: 'days1to30', key: 'days1to30', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: '31–60 Days', dataIndex: 'days31to60', key: 'days31to60', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: '61–90 Days', dataIndex: 'days61to90', key: 'days61to90', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: '90+ Days', dataIndex: 'days90plus', key: 'days90plus', align: 'right' as const, render: (v: any) => formatPkr(v) },
    ],
    [],
  );

  const apColumns = useMemo<ColumnsType<any>>(
    () => [
      { title: 'Code', dataIndex: 'supplierCode', key: 'supplierCode', render: (c: any) => <Text code>{c}</Text> },
      { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName' },
      { title: 'Billed AP', dataIndex: 'billedPayable', key: 'billedPayable', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: 'Unbilled GRNs', dataIndex: 'unbilledGrnAmount', key: 'unbilledGrnAmount', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: 'Total Liability', dataIndex: 'totalLiability', key: 'totalLiability', align: 'right' as const, render: (v: any) => <Text strong>{formatPkr(v)}</Text> },
      { title: 'Current', dataIndex: 'current', key: 'current', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: '1–30 Days', dataIndex: 'days1to30', key: 'days1to30', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: '31–60 Days', dataIndex: 'days31to60', key: 'days31to60', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: '61–90 Days', dataIndex: 'days61to90', key: 'days61to90', align: 'right' as const, render: (v: any) => formatPkr(v) },
      { title: '90+ Days', dataIndex: 'days90plus', key: 'days90plus', align: 'right' as const, render: (v: any) => formatPkr(v) },
    ],
    [],
  );

  const activeReportColumns = useMemo<ColumnsType<any>>(() => {
    switch (activeTab) {
      case 'gl':
        return glColumns;
      case 'cb':
        return cbColumns;
      case 'pl':
        return plColumns;
      case 'bs':
        return bsColumns;
      case 'ar':
        return arColumns;
      case 'ap':
        return apColumns;
      case 'tb':
      default:
        return tbColumns;
    }
  }, [activeTab, tbColumns, glColumns, cbColumns, plColumns, bsColumns, arColumns, apColumns]);

  const { visibleColumns, hiddenKeys, selectorProps } = useColumnVisibility(
    `pwi_cols_fin_reports_${activeTab}`,
    activeReportColumns,
  );

  const tabs = [
    {
      key: 'tb',
      label: 'Trial Balance',
      children: (
        <Spin spinning={loading && activeTab === 'tb'}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="Period Debits" value={formatPkr(tb?.totalDebit ?? 0)} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="Period Credits" value={formatPkr(tb?.totalCredit ?? 0)} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="Closing Debits" value={formatPkr(tb?.totalClosingDebit ?? 0)} valueStyle={{ color: token.colorPrimary }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="Trial Balance Status"
                  value={tb?.balanced ? 'BALANCED' : 'UNBALANCED'}
                  prefix={tb?.balanced ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
                  valueStyle={{ color: tb?.balanced ? token.colorSuccess : token.colorError }}
                />
              </Card>
            </Col>
          </Row>
          <Table
            dataSource={tb?.data || []}
            rowKey={(r: any, idx?: number) => r.accountId || r.accountCode || `tb-${idx}`}
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={activeTab === 'tb' ? visibleColumns : tbColumns}
            summary={() => {
              if (!tb) return null;
              const prefixCols = ['accountCode', 'accountName', 'accountType'].filter((k) => !hiddenKeys.includes(k));
              const numericFields: Array<{ key: string; field: string }> = [
                { key: 'openingDebit', field: 'totalOpeningDebit' },
                { key: 'openingCredit', field: 'totalOpeningCredit' },
                { key: 'periodDebit', field: 'totalDebit' },
                { key: 'periodCredit', field: 'totalCredit' },
                { key: 'closingDebit', field: 'totalClosingDebit' },
                { key: 'closingCredit', field: 'totalClosingCredit' },
              ].filter((item) => !hiddenKeys.includes(item.key));
              let cellIndex = 0;
              return (
                <Table.Summary.Row>
                  {prefixCols.length > 0 && (
                    <Table.Summary.Cell index={0} colSpan={prefixCols.length} align="right">
                      <Text strong>TOTAL (PKR)</Text>
                    </Table.Summary.Cell>
                  )}
                  {(() => {
                    cellIndex = prefixCols.length;
                    return numericFields.map((item) => {
                      const currentIdx = cellIndex++;
                      return (
                        <Table.Summary.Cell key={item.key} index={currentIdx} align="right">
                          <Text strong>{formatPkr(tb[item.field] ?? 0)}</Text>
                        </Table.Summary.Cell>
                      );
                    });
                  })()}
                </Table.Summary.Row>
              );
            }}
          />
        </Spin>
      ),
    },
    {
      key: 'gl',
      label: 'General Ledger',
      children: (
        <Spin spinning={loading && activeTab === 'gl'}>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }} align="middle">
            <Col xs={24} md={10}>
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                placeholder="Select ledger account for running-balance statement"
                value={glAccountId}
                onChange={setGlAccountId}
                allowClear
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.accountCode} - ${a.accountName} (${formatPkr(a.balance || 0)})`,
                }))}
              />
            </Col>
            <Col xs={24} md={14}>
              <Row gutter={12}>
                <Col span={6}><Card size="small"><Statistic title="Opening (B/F)" value={formatPkr(gl?.openingBalance ?? 0)} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="Total Debit" value={formatPkr(gl?.totalDebit ?? 0)} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="Total Credit" value={formatPkr(gl?.totalCredit ?? 0)} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="Closing Balance" value={formatPkr(gl?.closingBalance ?? 0)} valueStyle={{ color: token.colorPrimary }} /></Card></Col>
              </Row>
            </Col>
          </Row>

          <Table
            dataSource={gl?.data || []}
            rowKey={(r: any, idx?: number) => r.id || `gl-${idx}`}
            size="small"
            pagination={{ pageSize: 50 }}
            scroll={{ x: 'max-content' }}
            columns={activeTab === 'gl' ? visibleColumns : glColumns}
          />
        </Spin>
      ),
    },
    {
      key: 'cb',
      label: 'Cash & Bank Book',
      children: (
        <Spin spinning={loading && activeTab === 'cb'}>
          <Row gutter={[12, 12]} style={{ marginBottom: 14 }} align="middle">
            <Col xs={24} md={8}>
              <Select
                allowClear
                placeholder="All Cash & Bank Accounts"
                style={{ width: '100%' }}
                value={cbAccountId}
                onChange={setCbAccountId}
                options={(cb?.accounts || []).map((a: any) => ({
                  value: a.id,
                  label: `${a.accountCode} - ${a.accountName}`,
                }))}
              />
            </Col>
            <Col xs={24} md={16}>
              <Row gutter={12}>
                <Col span={8}><Card size="small"><Statistic title="Cash in Hand (1000)" value={formatPkr(cb?.summary?.totalCash ?? 0)} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="Bank Accounts" value={formatPkr(cb?.summary?.totalBank ?? 0)} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="Grand Liquid Total" value={formatPkr(cb?.summary?.grandTotal ?? 0)} valueStyle={{ color: token.colorPrimary }} /></Card></Col>
              </Row>
            </Col>
          </Row>
          <Table
            dataSource={cb?.transactions || []}
            rowKey={(r: any, idx?: number) => r.id || `${r.journalId || 'cb'}-${idx}`}
            size="small"
            pagination={{ pageSize: 25 }}
            scroll={{ x: 'max-content' }}
            columns={activeTab === 'cb' ? visibleColumns : cbColumns}
          />
        </Spin>
      ),
    },
    {
      key: 'pl',
      label: 'Profit & Loss',
      children: (
        <Spin spinning={loading && activeTab === 'pl'}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Operating Revenue" value={formatPkr(pl?.operatingRevenue ?? 0)} valueStyle={{ color: token.colorSuccess }} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Direct Costs / COGS" value={formatPkr(pl?.directCosts ?? 0)} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Gross Profit" value={formatPkr(pl?.grossProfit ?? 0)} valueStyle={{ color: token.colorPrimary }} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Net Profit / (Loss)" value={formatPkr(pl?.netProfit ?? 0)} valueStyle={{ color: (pl?.netProfit ?? 0) >= 0 ? token.colorSuccess : token.colorError }} /></Card></Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={15}>
              <Card title="Statement of Profit & Loss (PKR)" size="small">
                <Table
                  dataSource={pl?.data || []}
                  rowKey={(r: any, idx?: number) => r.accountId || r.accountCode || `pl-${idx}`}
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  columns={activeTab === 'pl' ? visibleColumns : plColumns}
                />
              </Card>
            </Col>
            <Col xs={24} lg={9}>
              <Card title="Division-Wise Profitability" size="small">
                <Table
                  dataSource={pl?.divisionBreakdown || []}
                  rowKey={(r: any, idx?: number) => r.divisionId || r.divisionName || `div-${idx}`}
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    { title: 'Division', dataIndex: 'divisionName', key: 'divisionName' },
                    { title: 'Revenue', dataIndex: 'revenue', key: 'revenue', align: 'right', render: (v) => formatPkr(v) },
                    { title: 'Expense', dataIndex: 'expenses', key: 'expenses', align: 'right', render: (v) => formatPkr(v) },
                    { title: 'Net Profit', dataIndex: 'netProfit', key: 'netProfit', align: 'right', render: (v) => <Text strong>{formatPkr(v)}</Text> },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </Spin>
      ),
    },
    {
      key: 'bs',
      label: 'Balance Sheet',
      children: (
        <Spin spinning={loading && activeTab === 'bs'}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Total Assets" value={formatPkr(bs?.assets ?? 0)} valueStyle={{ color: token.colorPrimary }} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Total Liabilities" value={formatPkr(bs?.liabilities ?? 0)} valueStyle={{ color: token.colorWarning }} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Total Equity (Incl. Net Profit)" value={formatPkr(bs?.equity ?? 0)} valueStyle={{ color: token.colorSuccess }} /></Card></Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="Accounting Equation"
                  value={bs?.balanced ? 'BALANCED' : 'CHECK'}
                  valueStyle={{ color: bs?.balanced ? token.colorSuccess : token.colorError }}
                />
              </Card>
            </Col>
          </Row>
          <Table
            dataSource={bs?.data || []}
            rowKey={(r: any) => `${r.accountCode}-${r.accountName}`}
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={activeTab === 'bs' ? visibleColumns : bsColumns}
          />
        </Spin>
      ),
    },
    {
      key: 'ar',
      label: 'Customer AR Aging',
      children: (
        <Spin spinning={loading && activeTab === 'ar'}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Open Invoices (AR)" value={formatPkr(ar?.summary?.totalOutstanding ?? ar?.total ?? 0)} valueStyle={{ color: token.colorPrimary }} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Unallocated Advances" value={formatPkr(ar?.summary?.totalAdvances ?? 0)} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="GL 1100 Control" value={formatPkr(ar?.summary?.glControlBalance ?? 0)} /></Card></Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="Sub-Ledger Reconciliation"
                  value={formatPkr(ar?.summary?.reconciliationDiff ?? 0)}
                  valueStyle={{ color: Math.abs(ar?.summary?.reconciliationDiff ?? 0) < 1 ? token.colorSuccess : token.colorWarning }}
                />
              </Card>
            </Col>
          </Row>
          <Table
            dataSource={ar?.data || []}
            rowKey={(r: any) => r.customerId || r.accountCode}
            size="small"
            pagination={{ pageSize: 25 }}
            scroll={{ x: 'max-content' }}
            expandable={{
              expandedRowRender: (rec: any) => (
                <Table
                  dataSource={rec.invoices || []}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    { title: 'Invoice #', dataIndex: 'invoiceNo', render: (v) => <Text code>{v}</Text> },
                    { title: 'Date', dataIndex: 'invoiceDate', render: (d) => (d ? dayjs(d).format('DD MMM YYYY') : '-') },
                    { title: 'Due Date', dataIndex: 'dueDate', render: (d) => (d ? dayjs(d).format('DD MMM YYYY') : '-') },
                    { title: 'Total', dataIndex: 'totalAmount', align: 'right', render: (v) => formatPkr(v) },
                    { title: 'Paid', dataIndex: 'paidAmount', align: 'right', render: (v) => formatPkr(v) },
                    { title: 'Balance Due', dataIndex: 'balance', align: 'right', render: (v) => <Text strong>{formatPkr(v)}</Text> },
                    { title: 'Age (Days)', dataIndex: 'daysOverdue', align: 'right' },
                  ]}
                />
              ),
              rowExpandable: (rec: any) => Array.isArray(rec.invoices) && rec.invoices.length > 0,
            }}
            columns={activeTab === 'ar' ? visibleColumns : arColumns}
          />
        </Spin>
      ),
    },
    {
      key: 'ap',
      label: 'Supplier AP & GRN Aging',
      children: (
        <Spin spinning={loading && activeTab === 'ap'}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Includes both Billed Purchase Invoices (2000 Accounts Payable) and Posted Unbilled GRNs (2010 GRN Clearing) so supplier obligations match General Ledger accruals."
          />
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Billed AP (2000)" value={formatPkr(ap?.summary?.totalPayables ?? 0)} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Unbilled GRNs (2010)" value={formatPkr(ap?.summary?.totalUnbilledGrn ?? 0)} valueStyle={{ color: token.colorWarning }} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Total Supplier Liability" value={formatPkr(ap?.summary?.totalLiability ?? ap?.total ?? 0)} valueStyle={{ color: token.colorPrimary }} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="GL 2010 Clearing Control" value={formatPkr(ap?.summary?.glGrnClearingBalance ?? 0)} /></Card></Col>
          </Row>
          <Table
            dataSource={ap?.data || []}
            rowKey={(r: any) => r.supplierId || r.accountCode}
            size="small"
            pagination={{ pageSize: 25 }}
            scroll={{ x: 'max-content' }}
            expandable={{
              expandedRowRender: (rec: any) => (
                <Table
                  dataSource={rec.documents || []}
                  rowKey="docNo"
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    { title: 'Doc Type', dataIndex: 'type', render: (v) => <Tag>{String(v).replace(/_/g, ' ')}</Tag> },
                    { title: 'Document #', dataIndex: 'docNo', render: (v) => <Text code>{v}</Text> },
                    { title: 'Date', dataIndex: 'date', render: (d) => (d ? dayjs(d).format('DD MMM YYYY') : '-') },
                    { title: 'Amount (PKR)', dataIndex: 'amount', align: 'right', render: (v) => <Text strong>{formatPkr(v)}</Text> },
                    { title: 'Age (Days)', dataIndex: 'ageDays', align: 'right' },
                  ]}
                />
              ),
              rowExpandable: (rec: any) => Array.isArray(rec.documents) && rec.documents.length > 0,
            }}
            columns={activeTab === 'ap' ? visibleColumns : apColumns}
          />
        </Spin>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px 24px 64px 24px' }}>
      <PageHeader
        title="Financial Statements & Management Reports"
        subtitle="Audit-ready Trial Balance, General Ledger, Profit & Loss, Balance Sheet, and AR/AP Aging in PKR"
        icon={<BarChartOutlined />}
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                markManualRefreshWindow(800);
                void loadActiveReport(true);
              }}
              loading={loading}
            >
              Refresh
            </Button>
            {canExportActiveTab && (
            <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
              Export CSV
            </Button>
            )}
            {canPrintActiveTab && (
            <Button icon={<PrinterOutlined />} type="primary" onClick={handlePrintActive}>
              Print Statement
            </Button>
            )}
          </Space>
        }
      />

      <Card style={{ marginBottom: 16 }} size="small">
        <Row gutter={[12, 12]} align="middle">
          {!isPointInTimeTab ? (
            <>
              <Col xs={24} sm={12} md={6}>
                <Select
                  value={preset}
                  onChange={handlePresetChange}
                  style={{ width: '100%' }}
                  options={FISCAL_PRESETS}
                />
              </Col>
              <Col xs={24} sm={12} md={7}>
                <RangePicker
                  style={{ width: '100%' }}
                  value={dateRange}
                  onChange={(vals) => {
                    setPreset(vals ? 'CUSTOM' : 'ALL');
                    setDateRange(vals ? [vals[0]!, vals[1]!] : null);
                  }}
                />
              </Col>
            </>
          ) : (
            <Col xs={24} sm={12} md={7}>
              <Space>
                <Text strong>As-Of Date:</Text>
                <DatePicker
                  value={asOfDate}
                  onChange={(d) => setAsOfDate(d || dayjs())}
                  allowClear={false}
                />
              </Space>
            </Col>
          )}
          <Col xs={24} sm={12} md={6}>
            <Select
              allowClear
              placeholder="All Divisions"
              style={{ width: '100%' }}
              value={divisionId}
              onChange={setDivisionId}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={24} md={5} style={{ textAlign: 'right' }}>
            <Space size={8} wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Tag color="blue" style={{ margin: 0 }}>{periodLabel}</Tag>
              <TableColumnSelector {...selectorProps} size="small" />
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        {reportError && (
          <Alert
            type="error"
            showIcon
            closable
            style={{ marginBottom: 12 }}
            message="Failed to load financial report"
            description={reportError}
            onClose={() => setReportError(null)}
          />
        )}
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setSearchParams({ tab: k })}
          items={tabs.filter((t) => can(REPORT_PERM_BY_TAB[t.key]))}
        />
      </Card>

      <AccountLedgerModal
        open={Boolean(drillAccount)}
        onClose={() => setDrillAccount(null)}
        companyId={companyId}
        accountId={drillAccount?.id || null}
        accountLabel={drillAccount?.label}
        divisionId={divisionId}
      />
    </div>
  );
};

export default FinanceReports;
