import React, { useState, useMemo } from 'react';
import {
  Modal,
  Button,
  Input,
  Radio,
  Space,
  Tag,
  Tooltip,
  message,
  Switch,
  Divider,
} from 'antd';
import {
  WhatsAppOutlined,
  CopyOutlined,
  CheckOutlined,
  SendOutlined,
  DownloadOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import {
  DailyProductionReport,
  WhatsAppReportMode,
  buildDailyProductionWhatsApp,
} from './dailyProductionReport';

export interface DailyProductionWhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  reportModel: DailyProductionReport | null;
}

export const DailyProductionWhatsAppModal: React.FC<DailyProductionWhatsAppModalProps> = ({
  open,
  onClose,
  reportModel,
}) => {
  const [reportMode, setReportMode] = useState<WhatsAppReportMode>('full');
  const [phone, setPhone] = useState('');
  const [includeRuntime, setIncludeRuntime] = useState(true);
  const [includeItems, setIncludeItems] = useState(true);
  const [copied, setCopied] = useState(false);

  // Generate the formatted text in real-time
  const formattedText = useMemo(() => {
    if (!reportModel) return '';
    return buildDailyProductionWhatsApp(reportModel, {
      mode: reportMode,
      includeItems,
      includeRuntime,
    });
  }, [reportModel, reportMode, includeItems, includeRuntime]);

  const cleanPhone = phone.replace(/[^0-9]/g, '');

  const handleCopy = async () => {
    if (!formattedText) return;
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopied(true);
      message.success('Report copied to clipboard! You can now paste it into WhatsApp.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      message.error('Failed to copy to clipboard');
    }
  };

  const handleOpenWhatsApp = () => {
    if (!formattedText) return;
    const baseUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(formattedText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(formattedText)}`;
    window.open(baseUrl, '_blank');
  };

  const handleOpenWhatsAppWeb = () => {
    if (!formattedText) return;
    const baseUrl = cleanPhone
      ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(formattedText)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(formattedText)}`;
    window.open(baseUrl, '_blank');
  };

  const handleDownloadTxt = () => {
    if (!formattedText) return;
    const blob = new Blob([formattedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = reportModel?.dateLabel.replace(/[^a-zA-Z0-9-_]/g, '_') || 'report';
    link.href = url;
    link.download = `PWI_Daily_Production_Report_${dateStr}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Text file downloaded successfully');
  };

  if (!reportModel) return null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={780}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              background: '#dcfce7',
              color: '#25D366',
              width: 40,
              height: 40,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              boxShadow: '0 2px 6px rgba(37,211,102,0.25)',
            }}
          >
            <WhatsAppOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#065f46' }}>
              Share Daily Production Report via WhatsApp
            </div>
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)', fontWeight: 400 }}>
              {reportModel.divisionName} • {reportModel.dateLabel} • {reportModel.grand.machines} Machines
            </div>
          </div>
        </div>
      }
      footer={[
        <Button key="close" onClick={onClose} style={{ borderRadius: 6 }}>
          Close
        </Button>,
        <Button
          key="download"
          icon={<DownloadOutlined />}
          onClick={handleDownloadTxt}
          style={{ borderRadius: 6 }}
        >
          Download .txt
        </Button>,
        <Button
          key="copy"
          icon={copied ? <CheckOutlined style={{ color: '#10b981' }} /> : <CopyOutlined />}
          onClick={handleCopy}
          style={{ fontWeight: 600, borderRadius: 6 }}
        >
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </Button>,
        <Button
          key="wa-web"
          icon={<GlobalOutlined />}
          onClick={handleOpenWhatsAppWeb}
          style={{ borderRadius: 6, fontWeight: 600 }}
          title="Open in WhatsApp Web"
        >
          WhatsApp Web
        </Button>,
        <Button
          key="send"
          type="primary"
          icon={<SendOutlined />}
          onClick={handleOpenWhatsApp}
          style={{
            background: '#25D366',
            borderColor: '#25D366',
            fontWeight: 700,
            borderRadius: 6,
            boxShadow: '0 2px 6px rgba(37,211,102,0.4)',
          }}
        >
          Send via WhatsApp
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
        {/* Report Scope Selector */}
        <div style={{ background: 'var(--theme-surface-subtle, #f8fafc)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--theme-border, #e2e8f0)' }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8, color: 'var(--theme-text, #1e293b)' }}>
            Report Format & Scope:
          </div>
          <Radio.Group
            value={reportMode}
            onChange={(e) => setReportMode(e.target.value)}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
          >
            <Radio value="full">
              <strong>Full Report</strong> (Executive Summary + Machine Breakdown + Totals)
            </Radio>
            <Radio value="executive">
              <strong>Executive Summary Only</strong> (Department Summary Only)
            </Radio>
            <Radio value="machine">
              <strong>Machine-Wise Only</strong> (Detailed Machine Breakdown)
            </Radio>
          </Radio.Group>

          <Divider style={{ margin: '10px 0 8px' }} />

          <Space size={18} wrap direction="horizontal">
            <span style={{ fontSize: 12 }}>
              <Switch
                size="small"
                checked={includeRuntime}
                onChange={setIncludeRuntime}
                style={{ marginRight: 6 }}
              />
              Show Machine Runtime & Downtime
            </span>
            <span style={{ fontSize: 12 }}>
              <Switch
                size="small"
                checked={includeItems}
                onChange={setIncludeItems}
                style={{ marginRight: 6 }}
              />
              Show Item-wise Output Breakdown
            </span>
          </Space>
        </div>

        {/* Optional Recipient Phone Number */}
        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, marginBottom: 4, color: 'var(--theme-text, #334155)' }}>
            Recipient WhatsApp Number (Optional: Enter phone number or leave blank)
          </label>
          <Input
            placeholder="e.g. 923001234567 (with country code, no + or spaces) or leave blank"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
            allowClear
            style={{ borderRadius: 6 }}
          />
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4 }}>
            💡 If left blank, WhatsApp will automatically prompt you to select any contact or group.
          </div>
        </div>

        {/* Live Formatted Message Preview */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--theme-text, #334155)' }}>
              Live WhatsApp Message Preview
            </span>
            <Space size={6}>
              <Tag color="cyan">{formattedText.length} characters</Tag>
              <Tag color="success">Ready to Send</Tag>
            </Space>
          </div>
          <div
            style={{
              background: '#0b141a',
              color: '#e9edef',
              padding: '14px 16px',
              borderRadius: 8,
              maxHeight: 340,
              overflowY: 'auto',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              border: '1px solid #1f2c34',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
            }}
          >
            {formattedText}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DailyProductionWhatsAppModal;
