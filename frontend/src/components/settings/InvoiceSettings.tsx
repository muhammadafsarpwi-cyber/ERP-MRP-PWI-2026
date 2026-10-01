import React, { useState, useEffect, useMemo } from 'react';
import {
  Input,
  InputNumber,
  Select,
  Button,
  Switch,
  message,
} from 'antd';
import {
  FileTextOutlined,
  CalendarOutlined,
  PercentageOutlined,
  CheckOutlined,
  SaveOutlined,
  UndoOutlined,
  InfoCircleOutlined,
  QrcodeOutlined,
  EditOutlined,
  PictureOutlined,
  ShopOutlined,
  IdcardOutlined,
  ContactsOutlined,
  FileProtectOutlined,
  AccountBookOutlined,
  BarcodeOutlined,
  TranslationOutlined,
  FormOutlined,
  HighlightOutlined,
  SafetyCertificateOutlined,
  BorderBottomOutlined,
  BankOutlined,
  DollarOutlined,
  SwapOutlined,
  CreditCardOutlined,
  AuditOutlined,
  GlobalOutlined,
  EllipsisOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { usePermission } from '../../hooks/usePermission';
import './invoiceSettings.css';

const { TextArea } = Input;

export type InvoiceDesignPattern = 'modern' | 'classic' | 'corporate' | 'elegant' | 'bold';

export interface InvoiceShowOptions {
  logo: boolean;
  yourTaxNumber: boolean;
  customerCode: boolean;
  customerPhoneEmail: boolean;
  customerTaxNumber: boolean;
  invoiceDetailsBox: boolean;
  balanceDueBox: boolean;
  productSku: boolean;
  amountInWords: boolean;
  notes: boolean;
  termsConditions: boolean;
  signatureLines: boolean;
  statusWatermark: boolean;
  footer: boolean;
}

export interface PaymentMethodItem {
  id: string;
  name: string;
  subtext: string;
  enabled: boolean;
  hasLink?: boolean;
}

export interface InvoiceSettingsData {
  // Terms & Tax
  paymentTermsDays: number;
  defaultTaxRate: string;
  // Default wording
  invoiceNotes: string;
  termsConditions: string;
  // Design Pattern
  designPattern: InvoiceDesignPattern;
  // Document
  documentTitle: string;
  taxColumnMode: 'only_tax' | 'always' | 'never';
  footerLine: string;
  documentPrefix: string;
  nextInvoiceNumber: number;
  // Show on invoice toggles
  show: InvoiceShowOptions;
  // Payment options
  paymentMethods: PaymentMethodItem[];
  // QR code
  printQrCode: boolean;
  qrOpens: string;
  qrCaption: string;
  // Bank details
  bankName: string;
  bankAccount: string;
  bankAccountTitle: string;
}

const DEFAULT_INVOICE_SETTINGS: InvoiceSettingsData = {
  paymentTermsDays: 15,
  defaultTaxRate: '17',
  invoiceNotes: 'Thank you for your business.',
  termsConditions: 'Payment is due within the agreed terms.',
  designPattern: 'modern',
  documentTitle: 'Invoice',
  taxColumnMode: 'only_tax',
  footerLine: 'Demo Traders',
  documentPrefix: 'INV-2026-',
  nextInvoiceNumber: 11,
  show: {
    logo: true,
    yourTaxNumber: true,
    customerCode: true,
    customerPhoneEmail: true,
    customerTaxNumber: true,
    invoiceDetailsBox: true,
    balanceDueBox: true,
    productSku: true,
    amountInWords: true,
    notes: true,
    termsConditions: true,
    signatureLines: true,
    statusWatermark: true,
    footer: true,
  },
  paymentMethods: [
    { id: 'bank', name: 'Bank details', subtext: 'From Payment Details', enabled: true, hasLink: true },
    { id: 'cash', name: 'Cash', subtext: 'No instructions yet — only the name will print', enabled: false },
    { id: 'transfer', name: 'Bank Transfer', subtext: 'No instructions yet — only the name will print', enabled: false },
    { id: 'card', name: 'Card', subtext: 'No instructions yet — only the name will print', enabled: false },
    { id: 'cheque', name: 'Cheque', subtext: 'No instructions yet — only the name will print', enabled: false },
    { id: 'online', name: 'Online', subtext: 'No instructions yet — only the name will print', enabled: false },
    { id: 'other', name: 'Other', subtext: 'No instructions yet — only the name will print', enabled: false },
  ],
  printQrCode: true,
  qrOpens: 'public_link',
  qrCaption: 'Scan to view this invoice online',
  bankName: 'Demo Bank',
  bankAccount: '0000-1111-2222',
  bankAccountTitle: 'Demo Traders',
};

const STORAGE_KEY = 'erp_invoice_settings_v1';
const COMPANY_STORAGE_KEY = 'erp_company_settings_v1';

const TAX_RATE_OPTIONS = [
  { value: 'none', label: 'No tax (0%)', percent: 0 },
  { value: '17', label: 'Standard GST 17%', percent: 17 },
  { value: '18', label: 'Standard GST 18%', percent: 18 },
  { value: '16', label: 'PST / Services 16%', percent: 16 },
  { value: '5', label: 'Reduced Rate 5%', percent: 5 },
  { value: 'exempt', label: 'Exempt 0%', percent: 0 },
];

const TAX_COLUMN_OPTIONS = [
  { value: 'only_tax', label: 'Only when a line has tax' },
  { value: 'always', label: 'Always show' },
  { value: 'never', label: 'Never show' },
];

const QR_OPENS_OPTIONS = [
  { value: 'public_link', label: "This invoice's public link" },
  { value: 'custom', label: 'Custom text or link' },
  { value: 'iban', label: 'Bank / IBAN details' },
];

interface DesignPatternMeta {
  id: InvoiceDesignPattern;
  name: string;
  summary: string;
}

const DESIGN_PATTERNS: DesignPatternMeta[] = [
  {
    id: 'modern',
    name: 'Modern',
    summary: 'Navy header, info cards, highlighted balance',
  },
  {
    id: 'classic',
    name: 'Classic',
    summary: 'Plain black & white, bordered item grid',
  },
  {
    id: 'corporate',
    name: 'Corporate',
    summary: 'Spreadsheet look with coloured header bars',
  },
  {
    id: 'elegant',
    name: 'Elegant',
    summary: 'Framed page, serif name, lots of white space',
  },
  {
    id: 'bold',
    name: 'Bold',
    summary: 'Black bars, big title, footer banner',
  },
];

export const InvoiceSettings: React.FC = () => {
  const { can } = usePermission();
  const canEdit = can('settings.edit');

  const [settings, setSettings] = useState<InvoiceSettingsData>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...DEFAULT_INVOICE_SETTINGS,
          ...parsed,
          show: { ...DEFAULT_INVOICE_SETTINGS.show, ...(parsed.show || {}) },
          paymentMethods: parsed.paymentMethods || DEFAULT_INVOICE_SETTINGS.paymentMethods,
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_INVOICE_SETTINGS;
  });

  const [initialSettings, setInitialSettings] = useState<InvoiceSettingsData>(settings);
  const [saving, setSaving] = useState<boolean>(false);

  // Read company identity from CompanySettings storage for live preview sync
  const [companyProfile, setCompanyProfile] = useState<{
    name: string;
    email: string;
    phone: string;
    taxId: string;
    address: string;
    currency: string;
    symbol: string;
    logoUrl: string | null;
  }>({
    name: 'Demo Traders',
    email: 'admin1@demo.com',
    phone: '03001000000',
    taxId: 'TAX-0001',
    address: 'Suite 1, Demo Plaza, Demo City',
    currency: 'PKR',
    symbol: 'Rs',
    logoUrl: null,
  });

  useEffect(() => {
    try {
      const companyCached = localStorage.getItem(COMPANY_STORAGE_KEY);
      if (companyCached) {
        const parsed = JSON.parse(companyCached);
        setCompanyProfile({
          name: parsed.companyName || 'Demo Traders',
          email: parsed.billingEmail || 'admin1@demo.com',
          phone: parsed.phone || '03001000000',
          taxId: parsed.taxNumber || 'TAX-0001',
          address: parsed.address || 'Suite 1, Demo Plaza, Demo City',
          currency: parsed.currency || 'PKR',
          symbol: parsed.currencySymbol || 'Rs',
          logoUrl: parsed.logoUrl || null,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const hasChanges = useMemo(() => {
    return JSON.stringify(settings) !== JSON.stringify(initialSettings);
  }, [settings, initialSettings]);

  const handleChange = <K extends keyof InvoiceSettingsData>(
    field: K,
    value: InvoiceSettingsData[K]
  ) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleShow = (key: keyof InvoiceShowOptions, val: boolean) => {
    setSettings((prev) => ({
      ...prev,
      show: { ...prev.show, [key]: val },
    }));
  };

  const handleTogglePaymentMethod = (id: string, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.map((m) =>
        m.id === id ? { ...m, enabled } : m
      ),
    }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setInitialSettings(settings);
      message.success('Invoice settings saved successfully');
    } catch (err: any) {
      message.error(err?.message || 'Failed to save invoice settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(initialSettings);
    message.info('Changes discarded');
  };

  // Live calculation of tax & total for sample invoice
  const taxRateObj = TAX_RATE_OPTIONS.find((t) => t.value === settings.defaultTaxRate) || TAX_RATE_OPTIONS[1];
  const sampleSubtotal = 4500;
  const sampleTaxAmount = (sampleSubtotal * taxRateObj.percent) / 100;
  const sampleTotal = sampleSubtotal + sampleTaxAmount;

  // Due date calculation
  const sampleDueDate = useMemo(() => {
    if (settings.paymentTermsDays === 0) {
      return 'Due on receipt';
    }
    const d = new Date();
    d.setDate(d.getDate() + settings.paymentTermsDays);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [settings.paymentTermsDays]);

  const initials = useMemo(() => {
    return companyProfile.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }, [companyProfile.name]);

  const showTaxCol = settings.taxColumnMode !== 'never';
  const enabledPaymentMethods = settings.paymentMethods.filter((m) => m.enabled);

  return (
    <div className="invoice-settings-container" data-testid="invoice-settings">
      <div className="invoice-settings-grid">
        {/* ── Left Column: Form Controls ── */}
        <div className="invoice-settings-form-column">
          {/* 1. Terms & tax */}
          <div className="invoice-settings-card">
            <div className="invoice-settings-card-header">
              <h3 className="invoice-settings-card-title">
                <CalendarOutlined className="invoice-settings-card-title-icon" />
                Terms &amp; tax
              </h3>
              <p className="invoice-settings-card-desc">
                Applied to every new invoice. A customer's own payment terms still win.
              </p>
            </div>

            <div className="invoice-settings-form-row">
              <div className="invoice-settings-field-group">
                <label className="invoice-settings-field-label">
                  <CalendarOutlined style={{ color: 'var(--inv-accent)' }} />
                  Payment terms (days)
                </label>
                <InputNumber
                  min={0}
                  max={365}
                  value={settings.paymentTermsDays}
                  onChange={(val) => handleChange('paymentTermsDays', Number(val) || 0)}
                  size="large"
                  style={{ width: '100%' }}
                />
                <div className="invoice-settings-field-hint">
                  <span>0 = due on receipt</span>
                </div>
              </div>

              <div className="invoice-settings-field-group">
                <label className="invoice-settings-field-label">
                  <PercentageOutlined style={{ color: 'var(--inv-accent)' }} />
                  Default tax rate
                </label>
                <Select
                  value={settings.defaultTaxRate}
                  onChange={(val) => handleChange('defaultTaxRate', val)}
                  options={TAX_RATE_OPTIONS}
                  size="large"
                  style={{ width: '100%' }}
                />
                <div className="invoice-settings-field-hint">
                  <span>Standard billing rate</span>
                  <span className="invoice-settings-field-link">Manage rates in Tax Rates</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Default wording */}
          <div className="invoice-settings-card">
            <div className="invoice-settings-card-header">
              <h3 className="invoice-settings-card-title">
                <EditOutlined className="invoice-settings-card-title-icon" />
                Default wording
              </h3>
              <p className="invoice-settings-card-desc">
                Pre-filled on new invoices — can still be edited per invoice.
              </p>
            </div>

            <div className="invoice-settings-field-group">
              <label className="invoice-settings-field-label">
                <FileTextOutlined style={{ color: 'var(--inv-accent)' }} />
                Invoice notes
              </label>
              <TextArea
                rows={2}
                value={settings.invoiceNotes}
                onChange={(e) => handleChange('invoiceNotes', e.target.value)}
                placeholder="Thank you for your business."
              />
            </div>

            <div className="invoice-settings-field-group" style={{ marginBottom: 0 }}>
              <label className="invoice-settings-field-label">
                <FileTextOutlined style={{ color: 'var(--inv-accent)' }} />
                Terms &amp; conditions
              </label>
              <TextArea
                rows={2}
                value={settings.termsConditions}
                onChange={(e) => handleChange('termsConditions', e.target.value)}
                placeholder="Payment is due within the agreed terms."
              />
            </div>
          </div>

          {/* 3. Invoice design (5 Design Patterns) */}
          <div className="invoice-settings-card">
            <div className="invoice-settings-card-header">
              <h3 className="invoice-settings-card-title">
                <FileTextOutlined className="invoice-settings-card-title-icon" />
                Invoice design
              </h3>
              <p className="invoice-settings-card-desc">
                The look of every printed invoice, PDF and public link. Staff can still switch design for a single print from the invoice page.
              </p>
            </div>

            <div className="invoice-design-cards-row">
              {DESIGN_PATTERNS.map((pattern) => {
                const isSelected = settings.designPattern === pattern.id;
                return (
                  <div
                    key={pattern.id}
                    className={`invoice-design-card ${isSelected ? 'invoice-design-card--active' : ''}`}
                    onClick={() => handleChange('designPattern', pattern.id)}
                    data-testid={`invoice-pattern-${pattern.id}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <div className="invoice-design-badge">
                        <CheckOutlined />
                      </div>
                    )}

                    <div className="invoice-design-thumbnail">
                      {pattern.id === 'modern' && (
                        <svg className="thumb-svg" viewBox="0 0 100 65" fill="none">
                          <rect x="0" y="0" width="100" height="14" fill="#0f172a" />
                          <rect x="6" y="4" width="24" height="6" rx="1" fill="#38bdf8" />
                          <rect x="74" y="4" width="20" height="6" rx="1" fill="#ffffff" />
                          <rect x="4" y="18" width="28" height="10" rx="1" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.5" />
                          <rect x="36" y="18" width="28" height="10" rx="1" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.5" />
                          <rect x="68" y="18" width="28" height="10" rx="1" fill="#ecfdf5" stroke="#10b981" strokeWidth="0.5" />
                          <rect x="4" y="32" width="92" height="6" fill="#1e293b" />
                          <rect x="4" y="41" width="92" height="5" fill="#f8fafc" />
                          <rect x="4" y="48" width="92" height="5" fill="#ffffff" />
                          <rect x="54" y="56" width="42" height="6" fill="#0f172a" rx="1" />
                        </svg>
                      )}

                      {pattern.id === 'classic' && (
                        <svg className="thumb-svg" viewBox="0 0 100 65" fill="none">
                          <rect x="2" y="2" width="96" height="61" stroke="#000000" strokeWidth="1" />
                          <rect x="6" y="6" width="30" height="4" fill="#000000" />
                          <line x1="6" y1="16" x2="94" y2="16" stroke="#000000" strokeWidth="1" />
                          <line x1="6" y1="26" x2="94" y2="26" stroke="#000000" strokeWidth="1" />
                          <line x1="6" y1="36" x2="94" y2="36" stroke="#000000" strokeWidth="1" />
                          <line x1="6" y1="46" x2="94" y2="46" stroke="#000000" strokeWidth="1" />
                          <line x1="30" y1="16" x2="30" y2="46" stroke="#000000" strokeWidth="1" />
                          <line x1="65" y1="16" x2="65" y2="46" stroke="#000000" strokeWidth="1" />
                          <rect x="55" y="50" width="39" height="7" stroke="#000000" strokeWidth="1" />
                        </svg>
                      )}

                      {pattern.id === 'corporate' && (
                        <svg className="thumb-svg" viewBox="0 0 100 65" fill="none">
                          <rect x="0" y="0" width="100" height="12" fill="#1d4ed8" />
                          <rect x="6" y="3" width="28" height="6" rx="1" fill="#ffffff" />
                          <rect x="4" y="16" width="92" height="7" fill="#1e40af" />
                          <rect x="4" y="25" width="92" height="6" fill="#f1f5f9" />
                          <rect x="4" y="33" width="92" height="6" fill="#ffffff" />
                          <rect x="4" y="41" width="92" height="6" fill="#f1f5f9" />
                          <rect x="4" y="49" width="92" height="6" fill="#ffffff" />
                          <rect x="58" y="57" width="38" height="6" fill="#1d4ed8" rx="1" />
                        </svg>
                      )}

                      {pattern.id === 'elegant' && (
                        <svg className="thumb-svg" viewBox="0 0 100 65" fill="none">
                          <rect x="2" y="2" width="96" height="61" stroke="#475569" strokeWidth="1" />
                          <rect x="4" y="4" width="92" height="57" stroke="#475569" strokeWidth="0.5" strokeDasharray="1 1" />
                          <text x="50" y="14" textAnchor="middle" fontSize="6" fontFamily="serif" fill="#0f172a" fontWeight="bold">INVOICE</text>
                          <line x1="30" y1="17" x2="70" y2="17" stroke="#94a3b8" strokeWidth="0.5" />
                          <rect x="10" y="22" width="80" height="6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.5" />
                          <line x1="10" y1="34" x2="90" y2="34" stroke="#e2e8f0" strokeWidth="0.5" />
                          <line x1="10" y1="42" x2="90" y2="42" stroke="#e2e8f0" strokeWidth="0.5" />
                          <line x1="10" y1="50" x2="90" y2="50" stroke="#cbd5e1" strokeWidth="0.5" />
                        </svg>
                      )}

                      {pattern.id === 'bold' && (
                        <svg className="thumb-svg" viewBox="0 0 100 65" fill="none">
                          <rect x="0" y="0" width="100" height="8" fill="#000000" />
                          <rect x="4" y="12" width="38" height="8" fill="#000000" />
                          <rect x="4" y="24" width="92" height="7" fill="#000000" />
                          <rect x="4" y="33" width="92" height="5" fill="#f1f5f9" />
                          <rect x="4" y="40" width="92" height="5" fill="#ffffff" />
                          <rect x="4" y="47" width="92" height="5" fill="#f1f5f9" />
                          <rect x="0" y="58" width="100" height="7" fill="#000000" />
                        </svg>
                      )}
                    </div>

                    <div className="invoice-design-name">{pattern.name}</div>
                    <div className="invoice-design-summary">{pattern.summary}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Document */}
          <div className="invoice-settings-card">
            <div className="invoice-settings-card-header">
              <h3 className="invoice-settings-card-title">
                <FileTextOutlined className="invoice-settings-card-title-icon" />
                Document
              </h3>
              <p className="invoice-settings-card-desc">
                How the invoice is titled and closed. Purchase bills keep their own title.
              </p>
            </div>

            <div className="invoice-settings-form-row">
              <div className="invoice-settings-field-group">
                <label className="invoice-settings-field-label">
                  <EditOutlined style={{ color: 'var(--inv-accent)' }} />
                  Invoice title
                </label>
                <Input
                  value={settings.documentTitle}
                  onChange={(e) => handleChange('documentTitle', e.target.value)}
                  placeholder="Invoice"
                  size="large"
                />
                <div className="invoice-settings-field-hint">
                  <span>e.g. Invoice, Tax Invoice, Sales Invoice, Bill</span>
                </div>
              </div>

              <div className="invoice-settings-field-group">
                <label className="invoice-settings-field-label">
                  <PercentageOutlined style={{ color: 'var(--inv-accent)' }} />
                  Tax column
                </label>
                <Select
                  value={settings.taxColumnMode}
                  onChange={(val) => handleChange('taxColumnMode', val)}
                  options={TAX_COLUMN_OPTIONS}
                  size="large"
                  style={{ width: '100%' }}
                />
                <div className="invoice-settings-field-hint">
                  <span>The tax total still prints when there is tax</span>
                </div>
              </div>
            </div>

            <div className="invoice-settings-field-group" style={{ marginBottom: 0 }}>
              <label className="invoice-settings-field-label">
                <FormOutlined style={{ color: 'var(--inv-accent)' }} />
                Footer line
              </label>
              <Input
                value={settings.footerLine}
                onChange={(e) => handleChange('footerLine', e.target.value)}
                placeholder="Demo Traders"
                size="large"
              />
              <div className="invoice-settings-field-hint">
                <span>Blank = your company name. e.g. Thank you for choosing us!</span>
              </div>
            </div>
          </div>

          {/* 5. Show on invoice (14 Toggles) */}
          <div className="invoice-settings-card">
            <div className="invoice-settings-card-header">
              <h3 className="invoice-settings-card-title">
                <FileProtectOutlined className="invoice-settings-card-title-icon" />
                Show on invoice
              </h3>
              <p className="invoice-settings-card-desc">
                Switch any block off and it disappears from the printout, the PDF and the customer's public link.
              </p>
            </div>

            <div className="invoice-toggles-grid">
              {/* Logo */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <PictureOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Logo</div>
                    <div className="invoice-toggle-desc">Your logo, or initials when none is uploaded</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.logo}
                  onChange={(val) => handleToggleShow('logo', val)}
                />
              </div>

              {/* Your tax number */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <ShopOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Your tax number</div>
                    <div className="invoice-toggle-desc">Tax / NTN under your address</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.yourTaxNumber}
                  onChange={(val) => handleToggleShow('yourTaxNumber', val)}
                />
              </div>

              {/* Customer code */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <IdcardOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Customer code</div>
                    <div className="invoice-toggle-desc">The CUS-0001 tag beside the name</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.customerCode}
                  onChange={(val) => handleToggleShow('customerCode', val)}
                />
              </div>

              {/* Customer phone & email */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <ContactsOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Customer phone &amp; email</div>
                    <div className="invoice-toggle-desc">Contact lines in Bill To</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.customerPhoneEmail}
                  onChange={(val) => handleToggleShow('customerPhoneEmail', val)}
                />
              </div>

              {/* Customer tax number */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <FileProtectOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Customer tax number</div>
                    <div className="invoice-toggle-desc">Their Tax / NTN in Bill To</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.customerTaxNumber}
                  onChange={(val) => handleToggleShow('customerTaxNumber', val)}
                />
              </div>

              {/* Invoice details box */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <InfoCircleOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Invoice details box</div>
                    <div className="invoice-toggle-desc">Terms, currency, line count, prepared by</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.invoiceDetailsBox}
                  onChange={(val) => handleToggleShow('invoiceDetailsBox', val)}
                />
              </div>

              {/* Balance due box */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <AccountBookOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Balance due box</div>
                    <div className="invoice-toggle-desc">The big highlighted amount at the top</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.balanceDueBox}
                  onChange={(val) => handleToggleShow('balanceDueBox', val)}
                />
              </div>

              {/* Product SKU */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <BarcodeOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Product SKU</div>
                    <div className="invoice-toggle-desc">Small code under each line item</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.productSku}
                  onChange={(val) => handleToggleShow('productSku', val)}
                />
              </div>

              {/* Amount in words */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <TranslationOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Amount in words</div>
                    <div className="invoice-toggle-desc">e.g. PKR Fifteen Thousand Only</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.amountInWords}
                  onChange={(val) => handleToggleShow('amountInWords', val)}
                />
              </div>

              {/* Notes */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <FormOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Notes</div>
                    <div className="invoice-toggle-desc">The notes typed on the invoice</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.notes}
                  onChange={(val) => handleToggleShow('notes', val)}
                />
              </div>

              {/* Terms & conditions */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <FileTextOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Terms &amp; conditions</div>
                    <div className="invoice-toggle-desc">The terms typed on the invoice</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.termsConditions}
                  onChange={(val) => handleToggleShow('termsConditions', val)}
                />
              </div>

              {/* Signature lines */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <HighlightOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Signature lines</div>
                    <div className="invoice-toggle-desc">Prepared by, authorised, received by</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.signatureLines}
                  onChange={(val) => handleToggleShow('signatureLines', val)}
                />
              </div>

              {/* Status watermark */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <SafetyCertificateOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Status watermark</div>
                    <div className="invoice-toggle-desc">Faint PAID / DRAFT / CANCELLED stamp</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.statusWatermark}
                  onChange={(val) => handleToggleShow('statusWatermark', val)}
                />
              </div>

              {/* Footer */}
              <div className="invoice-toggle-card">
                <div className="invoice-toggle-left">
                  <div className="invoice-toggle-icon-wrap">
                    <BorderBottomOutlined />
                  </div>
                  <div className="invoice-toggle-meta">
                    <div className="invoice-toggle-title">Footer</div>
                    <div className="invoice-toggle-desc">Closing line, contacts and print time</div>
                  </div>
                </div>
                <Switch
                  checked={settings.show.footer}
                  onChange={(val) => handleToggleShow('footer', val)}
                />
              </div>
            </div>
          </div>

          {/* 6. Payment options on invoice */}
          <div className="invoice-settings-card">
            <div className="invoice-settings-card-header">
              <h3 className="invoice-settings-card-title">
                <BankOutlined className="invoice-settings-card-title-icon" />
                Payment options on invoice
              </h3>
              <p className="invoice-settings-card-desc">
                Pick how customers can pay — each method prints with its own instructions in a "How to pay" box. Invoices only.
              </p>
            </div>

            <div className="payment-options-list">
              {settings.paymentMethods.map((method) => {
                const getMethodIcon = () => {
                  switch (method.id) {
                    case 'bank': return <BankOutlined />;
                    case 'cash': return <DollarOutlined />;
                    case 'transfer': return <SwapOutlined />;
                    case 'card': return <CreditCardOutlined />;
                    case 'cheque': return <AuditOutlined />;
                    case 'online': return <GlobalOutlined />;
                    default: return <EllipsisOutlined />;
                  }
                };

                return (
                  <div
                    key={method.id}
                    className={`payment-option-card ${method.enabled ? 'payment-option-card--active' : ''}`}
                  >
                    <div className="invoice-toggle-left">
                      <div
                        className="invoice-toggle-icon-wrap"
                        style={{
                          background: method.enabled ? 'var(--inv-accent-soft)' : undefined,
                          color: method.enabled ? 'var(--inv-accent)' : undefined,
                        }}
                      >
                        {getMethodIcon()}
                      </div>
                      <div className="invoice-toggle-meta">
                        <div className="invoice-toggle-title">{method.name}</div>
                        <div className="invoice-toggle-desc">
                          {method.hasLink ? (
                            <span>
                              From <span className="invoice-settings-field-link">Payment Details</span>
                            </span>
                          ) : (
                            method.subtext
                          )}
                        </div>
                      </div>
                    </div>

                    <Switch
                      checked={method.enabled}
                      onChange={(val) => handleTogglePaymentMethod(method.id, val)}
                    />
                  </div>
                );
              })}
            </div>

            <div className="payment-option-helper-note">
              <InfoCircleOutlined />
              <span>Add, rename or write instructions for methods in <strong>Payment Methods</strong>. Only active methods are listed.</span>
            </div>
          </div>

          {/* 7. QR code */}
          <div className="invoice-settings-card">
            <div className="invoice-settings-card-header">
              <h3 className="invoice-settings-card-title">
                <QrcodeOutlined className="invoice-settings-card-title-icon" />
                QR code
              </h3>
              <p className="invoice-settings-card-desc">
                A scannable code in the "How to pay" box. Link mode opens the invoice online; custom mode encodes anything you type — a payment link, wallet or IBAN.
              </p>
            </div>

            <div className="qr-settings-toggle-card">
              <div className="invoice-toggle-left">
                <div
                  className="invoice-toggle-icon-wrap"
                  style={{
                    background: settings.printQrCode ? 'var(--inv-accent-soft)' : undefined,
                    color: settings.printQrCode ? 'var(--inv-accent)' : undefined,
                  }}
                >
                  <QrcodeOutlined />
                </div>
                <div className="invoice-toggle-meta">
                  <div className="invoice-toggle-title">Print a QR code on invoices</div>
                  <div className="invoice-toggle-desc">Skipped on drafts and cancelled invoices in link mode</div>
                </div>
              </div>

              <Switch
                checked={settings.printQrCode}
                onChange={(val) => handleChange('printQrCode', val)}
              />
            </div>

            {settings.printQrCode && (
              <div className="qr-sub-options-row">
                <div className="invoice-settings-field-group">
                  <label className="invoice-settings-field-label">
                    <LinkOutlined style={{ color: 'var(--inv-accent)' }} />
                    QR opens
                  </label>
                  <Select
                    value={settings.qrOpens}
                    onChange={(val) => handleChange('qrOpens', val)}
                    options={QR_OPENS_OPTIONS}
                    size="large"
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="invoice-settings-field-group">
                  <label className="invoice-settings-field-label">Caption under the code</label>
                  <Input
                    value={settings.qrCaption}
                    onChange={(e) => handleChange('qrCaption', e.target.value)}
                    placeholder="Scan to view this invoice online"
                    size="large"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer action buttons */}
          <div className="invoice-settings-action-bar">
            <Button
              icon={<UndoOutlined />}
              size="large"
              disabled={!hasChanges || saving}
              onClick={handleReset}
            >
              Discard Changes
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              size="large"
              loading={saving}
              onClick={handleSave}
              className="invoice-save-btn"
              style={{
                minWidth: 160,
              }}
            >
              Save Invoice Settings
            </Button>
          </div>
        </div>

        {/* ── Right Column: Live Invoice Preview ── */}
        <div className="invoice-settings-preview-column">
          <div className="invoice-preview-wrapper">
            <div className="invoice-preview-top-bar">
              <div className="invoice-preview-status">
                <div className="invoice-preview-pulse" />
                <span>Live Preview</span>
              </div>
              <div className="invoice-preview-ref">
                Showing {settings.documentPrefix}{String(settings.nextInvoiceNumber).padStart(4, '0')}
              </div>
            </div>

            {/* The White Paper Invoice Sheet */}
            <div className={`invoice-sheet invoice-sheet--${settings.designPattern}`}>
              {/* PAID Watermark */}
              {settings.show.statusWatermark && (
                <div className="invoice-sheet-watermark">PAID</div>
              )}

              {/* Sheet Header */}
              <div className="invoice-sheet-header">
                <div className="invoice-sheet-brand">
                  {settings.show.logo && (
                    <div className="invoice-sheet-logo">
                      {companyProfile.logoUrl ? (
                        <img src={companyProfile.logoUrl} alt={companyProfile.name} />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>
                  )}
                  <div>
                    <div className="invoice-sheet-company-name">{companyProfile.name}</div>
                    <div className="invoice-sheet-company-meta">
                      {companyProfile.address}
                      <br />
                      {companyProfile.email} · {companyProfile.phone}
                      {settings.show.yourTaxNumber && (
                        <span> · Tax / NTN: {companyProfile.taxId}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="invoice-sheet-title-col">
                  <div className="invoice-sheet-doc-title">{settings.documentTitle || 'INVOICE'}</div>
                  <div className="invoice-sheet-doc-number">
                    #{settings.documentPrefix}{String(settings.nextInvoiceNumber).padStart(4, '0')}
                  </div>
                  <div className="invoice-sheet-doc-dates">
                    Issue date: <strong>28 Sep 2026</strong>
                    <br />
                    Due date: <strong>{sampleDueDate}</strong>
                    <br />
                    Status: <span style={{ color: '#10b981', fontWeight: 600 }}>PAID</span>
                  </div>
                </div>
              </div>

              {/* Metadata Cards Grid: Bill To, Details, Balance */}
              <div className="invoice-sheet-meta-grid">
                <div className="invoice-sheet-card">
                  <div className="invoice-sheet-card-title">Bill To</div>
                  <div className="invoice-sheet-card-client-name">
                    Client 1 {settings.show.customerCode && <span style={{ fontSize: 10, color: '#64748b' }}>(DEM-0001)</span>}
                  </div>
                  <div className="invoice-sheet-card-body">
                    House 1, Street 1, Demo City
                    {settings.show.customerPhoneEmail && (
                      <div>03001000001 · client1@demo.com</div>
                    )}
                    {settings.show.customerTaxNumber && (
                      <div>Tax / NTN: 0320210000001</div>
                    )}
                  </div>
                </div>

                {settings.show.invoiceDetailsBox && (
                  <div className="invoice-sheet-card">
                    <div className="invoice-sheet-card-title">Invoice Details</div>
                    <div className="invoice-sheet-card-body">
                      <strong>Payment terms:</strong> {settings.paymentTermsDays === 0 ? 'Due on receipt' : `Net ${settings.paymentTermsDays} days`}
                      <br />
                      <strong>Currency:</strong> {companyProfile.currency}
                      <br />
                      <strong>Line items:</strong> 2
                      <br />
                      <strong>Prepared by:</strong> admin1
                    </div>
                  </div>
                )}

                {settings.show.balanceDueBox && (
                  <div className="invoice-sheet-card invoice-sheet-balance-card">
                    <div className="invoice-sheet-balance-label">Balance</div>
                    <div className="invoice-sheet-balance-amount">
                      {companyProfile.symbol} 0.00
                    </div>
                    <div className="invoice-sheet-balance-status">Paid in full — thank you</div>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="invoice-sheet-table-wrapper">
                <table className="invoice-sheet-table">
                  <thead>
                    <tr>
                      <th style={{ width: 28 }} className="col-center">#</th>
                      <th>ITEM &amp; DESCRIPTION</th>
                      <th style={{ width: 45 }} className="col-center">QTY</th>
                      <th style={{ width: 75 }} className="col-right">UNIT PRICE</th>
                      {showTaxCol && <th style={{ width: 50 }} className="col-center">TAX</th>}
                      <th style={{ width: 80 }} className="col-right">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="col-center">01</td>
                      <td>
                        <div className="invoice-item-name">Demo line 1</div>
                        {settings.show.productSku && (
                          <div className="invoice-item-subtext">SKU: AP-001 · Batch 01 (exp: 10/26) · HSN/SAC 4802</div>
                        )}
                      </td>
                      <td className="col-center">1 box</td>
                      <td className="col-right">1,000.00</td>
                      {showTaxCol && <td className="col-center">{taxRateObj.percent}%</td>}
                      <td className="col-right">900.00</td>
                    </tr>
                    <tr>
                      <td className="col-center">02</td>
                      <td>
                        <div className="invoice-item-name">Demo line 2</div>
                        {settings.show.productSku && (
                          <div className="invoice-item-subtext">SKU: AP-005 · HSN/SAC 4802</div>
                        )}
                      </td>
                      <td className="col-center">2 box</td>
                      <td className="col-right">2,000.00</td>
                      {showTaxCol && <td className="col-center">{taxRateObj.percent}%</td>}
                      <td className="col-right">3,600.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals & Summary Row */}
              <div className="invoice-sheet-summary-row">
                {settings.show.amountInWords ? (
                  <div className="invoice-sheet-amount-words">
                    <strong>AMOUNT IN WORDS:</strong>
                    <br />
                    PKR Four Thousand Five Hundred Only
                  </div>
                ) : (
                  <div />
                )}

                <div className="invoice-sheet-totals-box">
                  <div className="invoice-totals-line">
                    <span>Subtotal:</span>
                    <span>{companyProfile.symbol} {sampleSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="invoice-totals-line">
                    <span>Tax ({taxRateObj.label}):</span>
                    <span>{companyProfile.symbol} {sampleTaxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="invoice-totals-line grand-total">
                    <span>Total:</span>
                    <span>{companyProfile.symbol} {sampleTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="invoice-totals-line">
                    <span>Amount paid:</span>
                    <span>- {companyProfile.symbol} {sampleTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="invoice-totals-line balance-line">
                    <span>Balance due:</span>
                    <span>{companyProfile.symbol} 0.00</span>
                  </div>
                </div>
              </div>

              {/* Payment Details & QR Code */}
              {(settings.printQrCode || enabledPaymentMethods.length > 0) && (
                <div className="invoice-sheet-payment-box">
                  {settings.printQrCode && (
                    <div style={{ textAlign: 'center' }}>
                      <div className="invoice-sheet-qr">
                        <QrcodeOutlined style={{ fontSize: 38, color: '#0f172a' }} />
                      </div>
                      {settings.qrCaption && (
                        <div style={{ fontSize: 7.5, color: '#64748b', marginTop: 2, maxWidth: 64 }}>
                          {settings.qrCaption}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="invoice-sheet-payment-text">
                    <div className="invoice-sheet-payment-title">How To Pay</div>
                    <div>
                      {settings.bankName} · A/C {settings.bankAccount} · Title: {settings.bankAccountTitle}
                    </div>
                    {enabledPaymentMethods.filter((m) => m.id !== 'bank').length > 0 && (
                      <div style={{ color: '#047857', marginTop: 2 }}>
                        Accepted: <strong>{enabledPaymentMethods.map((m) => m.name).join(', ')}</strong>
                      </div>
                    )}
                    <div style={{ color: '#64748b', fontSize: 9, marginTop: 2 }}>
                      Please quote <strong>{settings.documentPrefix}{String(settings.nextInvoiceNumber).padStart(4, '0')}</strong> as the payment reference.
                    </div>
                  </div>
                </div>
              )}

              {/* Notes & Terms */}
              {(settings.show.notes || settings.show.termsConditions) && (
                <div className="invoice-sheet-notes-terms">
                  {settings.show.notes && (
                    <div>
                      <div className="invoice-sheet-section-title">Notes</div>
                      <div>{settings.invoiceNotes || 'Thank you for your business.'}</div>
                    </div>
                  )}
                  {settings.show.termsConditions && (
                    <div>
                      <div className="invoice-sheet-section-title">Terms &amp; Conditions</div>
                      <div>{settings.termsConditions || 'Payment is due within the agreed terms.'}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Signatures */}
              {settings.show.signatureLines && (
                <div className="invoice-sheet-signatures">
                  <div className="invoice-signature-block">
                    <div className="invoice-signature-line" />
                    <strong>admin1</strong>
                    <div>Prepared By</div>
                  </div>
                  <div className="invoice-signature-block">
                    <div className="invoice-signature-line" />
                    <strong>Manager Signature</strong>
                    <div>Authorised Signature</div>
                  </div>
                  <div className="invoice-signature-block">
                    <div className="invoice-signature-line" />
                    <strong>Customer Stamp / Sign</strong>
                    <div>Received By (Customer)</div>
                  </div>
                </div>
              )}

              {/* Footer */}
              {settings.show.footer && (
                <div style={{ marginTop: 14, paddingTop: 8, borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: 9, color: '#64748b' }}>
                  {settings.footerLine || companyProfile.name} · Generated electronically on 28 Sep 2026
                </div>
              )}
            </div>

            <div className="invoice-sheet-caption">
              <InfoCircleOutlined />
              <span>Unsaved changes show here first — press Save to apply them to every invoice.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceSettings;
