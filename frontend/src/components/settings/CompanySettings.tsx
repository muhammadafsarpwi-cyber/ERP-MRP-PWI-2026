import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Input,
  Select,
  Button,
  Tag,
  Tooltip,
  message,
  Space,
  Spin,
} from 'antd';
import {
  BankOutlined,
  MailOutlined,
  PhoneOutlined,
  FileProtectOutlined,
  EnvironmentOutlined,
  DollarOutlined,
  DollarCircleOutlined,
  GlobalOutlined,
  CalendarOutlined,
  UploadOutlined,
  CloudUploadOutlined,
  InfoCircleOutlined,
  DeleteOutlined,
  SaveOutlined,
  UndoOutlined,
  CrownOutlined,
  PictureOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import './companySettings.css';

const { TextArea } = Input;

const CURRENCY_OPTIONS = [
  { value: 'PKR', label: 'PKR — Pakistani Rupee', symbol: 'Rs' },
  { value: 'USD', label: 'USD — US Dollar', symbol: '$' },
  { value: 'EUR', label: 'EUR — Euro', symbol: '€' },
  { value: 'GBP', label: 'GBP — British Pound', symbol: '£' },
  { value: 'AED', label: 'AED — UAE Dirham', symbol: 'AED' },
  { value: 'SAR', label: 'SAR — Saudi Riyal', symbol: 'SAR' },
  { value: 'CNY', label: 'CNY — Chinese Yuan', symbol: '¥' },
  { value: 'INR', label: 'INR — Indian Rupee', symbol: '₹' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT +05:00)' },
  { value: 'UTC', label: 'UTC (+00:00)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST +04:00)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST +03:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'America/New_York', label: 'America/New York (EST/EDT)' },
];

export interface CompanySettingsData {
  id?: string;
  companyName: string;
  billingEmail: string;
  phone: string;
  taxNumber: string;
  address: string;
  currency: string;
  currencySymbol: string;
  logoUrl: string | null;
  website: string;
  fiscalYearStart: string;
  timezone: string;
}

const DEFAULT_SETTINGS: CompanySettingsData = {
  companyName: 'Pakistan Wire Industries (Pvt.) LTD',
  billingEmail: 'admin1@demo.com',
  phone: '03001000000',
  taxNumber: 'TAX-0001',
  address: 'Suite 1, Demo Plaza, Demo City',
  currency: 'PKR',
  currencySymbol: 'Rs',
  logoUrl: null,
  website: 'https://demo.pwi-erp.com',
  fiscalYearStart: '01-01',
  timezone: 'Asia/Karachi',
};

const DEFAULT_COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
const STORAGE_KEY = 'erp_company_settings_v1';

export const CompanySettings: React.FC = () => {
  const { user, can } = usePermission();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [logoFileName, setLogoFileName] = useState<string>('');
  const [settings, setSettings] = useState<CompanySettingsData>(DEFAULT_SETTINGS);
  const [initialSettings, setInitialSettings] = useState<CompanySettingsData>(DEFAULT_SETTINGS);

  // Load existing company details from local storage and backend API
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);

      // Check localStorage first for saved customized settings
      const cached = localStorage.getItem(STORAGE_KEY);
      let localData: CompanySettingsData | null = null;
      if (cached) {
        try {
          localData = JSON.parse(cached);
        } catch {
          // ignore parsing error
        }
      }

      try {
        const companyId = user?.defaultCompanyId || (user as any)?.defaultCompany?.id || DEFAULT_COMPANY_ID;
        let apiCompany: any = null;

        if (companyId) {
          const res: any = await apiService.get<any>(`/companies/${companyId}`);
          if (res?.data?.success && res.data.data) {
            apiCompany = res.data.data;
          }
        }

        if (!apiCompany) {
          // fallback to list first company
          const listRes: any = await apiService.get<any>('/companies', { params: { limit: 1 } });
          if (listRes?.data?.success && listRes.data.data?.length > 0) {
            apiCompany = listRes.data.data[0];
          }
        }

        if (apiCompany && isMounted) {
          // localData takes precedence for user-modified values so saved changes never revert
          const mapped: CompanySettingsData = {
            id: apiCompany.id,
            companyName: localData?.companyName || apiCompany.legalName || apiCompany.tradeName || DEFAULT_SETTINGS.companyName,
            billingEmail: localData?.billingEmail || apiCompany.email || DEFAULT_SETTINGS.billingEmail,
            phone: localData?.phone || apiCompany.phone || DEFAULT_SETTINGS.phone,
            taxNumber: localData?.taxNumber || apiCompany.taxRegistrationNumber || DEFAULT_SETTINGS.taxNumber,
            address: localData?.address || apiCompany.addressLine1 || DEFAULT_SETTINGS.address,
            currency: localData?.currency || apiCompany.baseCurrency || DEFAULT_SETTINGS.currency,
            currencySymbol: localData?.currencySymbol || (apiCompany.baseCurrency === 'PKR' ? 'Rs' : '$'),
            logoUrl: (localData?.logoUrl !== undefined && localData?.logoUrl !== null) ? localData.logoUrl : (apiCompany.logoUrl || null),
            website: localData?.website || apiCompany.website || DEFAULT_SETTINGS.website,
            fiscalYearStart: localData?.fiscalYearStart || apiCompany.fiscalYearStart || DEFAULT_SETTINGS.fiscalYearStart,
            timezone: localData?.timezone || apiCompany.timezone || DEFAULT_SETTINGS.timezone,
          };
          setSettings(mapped);
          setInitialSettings(mapped);
          setLoading(false);
          return;
        }
      } catch (err) {
        // Backend offline or error -> fallback to local cached/default
      }

      if (isMounted) {
        const fallback = localData || {
          ...DEFAULT_SETTINGS,
          companyName: (user as any)?.defaultCompany?.name || DEFAULT_SETTINGS.companyName,
        };
        setSettings(fallback);
        setInitialSettings(fallback);
        setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Derive initials for the top avatar (e.g. "Demo Traders" -> "DT")
  const initials = useMemo(() => {
    const name = settings.companyName.trim();
    if (!name) return 'CO';
    const words = name.split(/\s+/);
    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }, [settings.companyName]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(settings) !== JSON.stringify(initialSettings);
  }, [settings, initialSettings]);

  const handleChange = (key: keyof CompanySettingsData, value: any) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      // auto-fill symbol when currency changes if symbol was default
      if (key === 'currency') {
        const option = CURRENCY_OPTIONS.find((c) => c.value === value);
        if (option) {
          next.currencySymbol = option.symbol;
        }
      }
      return next;
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      message.error('Logo file size must be less than 2 MB.');
      return;
    }

    setLogoFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      handleChange('logoUrl', result);
      message.success('Company logo updated (preview). Click Save Changes to apply.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    handleChange('logoUrl', null);
    setLogoFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    message.info('Logo removed.');
  };

  const handleReset = () => {
    setSettings(initialSettings);
    message.info('Changes discarded.');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Save to local storage for instant persistence across reloads
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

      // 2. Try persisting to backend if company ID exists
      const targetCompanyId = settings.id || user?.defaultCompanyId || (user as any)?.defaultCompany?.id || DEFAULT_COMPANY_ID;
      if (targetCompanyId) {
        try {
          await apiService.patch(`/companies/${targetCompanyId}`, {
            legalName: settings.companyName,
            tradeName: settings.companyName,
            email: settings.billingEmail,
            phone: settings.phone,
            taxRegistrationNumber: settings.taxNumber,
            addressLine1: settings.address,
            baseCurrency: settings.currency,
            website: settings.website,
            fiscalYearStart: settings.fiscalYearStart,
            timezone: settings.timezone,
            logoUrl: settings.logoUrl,
          });
        } catch (apiErr) {
          console.warn('Backend update error, saved in local cache:', apiErr);
        }
      }

      setInitialSettings(settings);
      window.dispatchEvent(new CustomEvent('erp-company-settings-updated', { detail: settings }));
      message.success({
        content: 'Company Settings saved successfully!',
        icon: <CheckCircleOutlined style={{ color: '#10b981' }} />,
      });
    } catch (err: any) {
      message.error('Failed to save company settings: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const DATE_FORMAT_OPTIONS = [
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-10-01)' },
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (01/10/2026)' },
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (10/01/2026)' },
    { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY (01-Oct-2026)' },
  ];

  return (
    <div
      className="company-settings-container"
      data-testid="company-settings"
      data-settings-section="company"
    >
      {/* ── 3-Column Grid Layout Matching Reference Design ── */}
      <div className="company-settings-grid-layout">
        {/* ── Column 1: Business Identity ── */}
        <div className="company-settings-column-card">
          <div className="company-settings-card-header">
            <h3 className="company-settings-section-title">Business identity</h3>
          </div>

          <div className="company-settings-form-body">
            <div className="company-settings-input-group">
              <label className="company-settings-field-label">Company Name</label>
              <Input
                value={settings.companyName}
                onChange={(e) => handleChange('companyName', e.target.value)}
                placeholder="Company Name"
                className="company-settings-glowing-input"
              />
            </div>

            <div className="company-settings-input-group">
              <label className="company-settings-field-label">Registration Number</label>
              <Input
                value={settings.taxNumber}
                onChange={(e) => handleChange('taxNumber', e.target.value)}
                placeholder="Registration Number"
                className="company-settings-glowing-input"
              />
            </div>

            <div className="company-settings-input-group">
              <label className="company-settings-field-label">Address</label>
              <Input
                value={settings.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Address, Attam Name"
                className="company-settings-glowing-input"
              />
            </div>

            <div className="company-settings-input-group">
              <label className="company-settings-field-label">Email</label>
              <Input
                type="email"
                value={settings.billingEmail}
                onChange={(e) => handleChange('billingEmail', e.target.value)}
                placeholder="Email"
                className="company-settings-glowing-input"
              />
            </div>

            <div className="company-settings-input-group">
              <label className="company-settings-field-label">Phone</label>
              <Input
                value={settings.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="Phone"
                className="company-settings-glowing-input"
              />
            </div>
          </div>
        </div>

        {/* ── Column 2: Currency & Localization + Logo ── */}
        <div className="company-settings-column-card">
          <div className="company-settings-card-header">
            <h3 className="company-settings-section-title">Currency & Localization</h3>
          </div>

          <div className="company-settings-form-body">
            <div className="company-settings-input-group">
              <label className="company-settings-field-label">Currency</label>
              <Select
                value={settings.currency}
                onChange={(val) => handleChange('currency', val)}
                options={CURRENCY_OPTIONS}
                className="company-settings-dark-select"
                style={{ width: '100%' }}
              />
            </div>

            <div className="company-settings-input-group">
              <label className="company-settings-field-label">Time Zone</label>
              <Select
                value={settings.timezone}
                onChange={(val) => handleChange('timezone', val)}
                options={TIMEZONE_OPTIONS}
                className="company-settings-dark-select"
                style={{ width: '100%' }}
              />
            </div>

            <div className="company-settings-input-group">
              <label className="company-settings-field-label">Date Format</label>
              <Select
                defaultValue="YYYY-MM-DD"
                options={DATE_FORMAT_OPTIONS}
                className="company-settings-dark-select"
                style={{ width: '100%' }}
              />
            </div>

            <div className="company-settings-card-header" style={{ marginTop: 12 }}>
              <h3 className="company-settings-section-title">Logo & preview</h3>
              <label className="company-settings-field-label" style={{ marginTop: 4 }}>Logo Upload</label>
            </div>

            <div className="company-settings-logo-dropzone">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoUpload}
                accept="image/png, image/jpeg, image/webp, image/gif, image/svg+xml"
                style={{ display: 'none' }}
              />

              <div className="company-settings-dropzone-left">
                <div className="company-settings-dropzone-label">
                  <span className="company-settings-plus-icon">+</span> Drag & drop zone
                </div>
                <Button
                  type="primary"
                  className="company-settings-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload New Logo
                </Button>
              </div>

              <div className="company-settings-preview-card">
                <div className="company-settings-preview-thumb">
                  {settings.logoUrl ? (
                    <img src={settings.logoUrl} alt="Logo preview" />
                  ) : (
                    <span className="company-settings-default-p-icon">P</span>
                  )}
                </div>
                <span className="company-settings-thumb-caption">PWI Logo</span>
              </div>
            </div>

            {settings.logoUrl && (
              <Button
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={handleRemoveLogo}
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
              >
                Remove Logo
              </Button>
            )}
          </div>
        </div>

        {/* ── Column 3: Live Invoice Header Preview ── */}
        <div className="company-settings-column-card company-settings-preview-column">
          <div className="company-settings-card-header">
            <h3 className="company-settings-section-title">Live Invoice Header Preview</h3>
            <p className="company-settings-section-desc">
              Live preview of your invoice header.
            </p>
          </div>

          <div className="company-settings-invoice-card-modern">
            <div className="company-settings-inv-head-row">
              <div>
                <div className="company-settings-inv-title">INVOICE</div>
                <div className="company-settings-inv-subtitle">Header</div>
              </div>
              {settings.logoUrl && (
                <div className="company-settings-inv-logo-box">
                  <img src={settings.logoUrl} alt="Company logo" />
                </div>
              )}
            </div>

            <div className="company-settings-inv-divider" />

            <div className="company-settings-inv-body">
              <div className="company-settings-inv-company">
                {settings.companyName || 'PWI ERP SYSTEM'}
              </div>
              <div className="company-settings-inv-meta-label">Company Name</div>
              <div className="company-settings-inv-address">
                {settings.address || '123 Tech Lane, NY 10001'}
              </div>
              <div className="company-settings-inv-contact">
                {settings.billingEmail || 'info@pwierp.com'}
              </div>
              <div className="company-settings-inv-contact">
                Phone: {settings.phone || '+1 555-0100'}
              </div>

              <div className="company-settings-inv-footer-row">
                <span>Invoice Date</span>
                <span>Invoice Number</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer Action Bar ── */}
      <div className="company-settings-action-bar">
        <Button
          icon={<UndoOutlined />}
          size="large"
          disabled={!hasChanges || saving}
          onClick={handleReset}
          className="company-settings-discard-btn"
        >
          Discard Changes
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          size="large"
          loading={saving}
          onClick={handleSave}
          className="company-settings-save-btn"
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default CompanySettings;
