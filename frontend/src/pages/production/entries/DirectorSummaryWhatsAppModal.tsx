import React, { useState, useMemo } from 'react';
import { Modal, Button, Input, Space, Tag, message, theme } from 'antd';
import {
  WhatsAppOutlined,
  CopyOutlined,
  CheckOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  DailyProductionReport,
  buildDirectorSummaryWhatsApp,
} from './dailyProductionReport';
import {
  formatWhatsAppPhoneWithCountryCode,
  useWhatsAppSettingsVersion,
} from '../../../utils/whatsappSettingsStore';

export interface DirectorSummaryWhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  reportModel: DailyProductionReport | null;
}

export const DirectorSummaryWhatsAppModal: React.FC<DirectorSummaryWhatsAppModalProps> = ({
  open,
  onClose,
  reportModel,
}) => {
  const { token } = theme.useToken();
  const settingsVersion = useWhatsAppSettingsVersion();
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);

  const formattedText = useMemo(() => {
    if (!reportModel || !open) return '';
    return buildDirectorSummaryWhatsApp(reportModel);
  }, [reportModel, open, settingsVersion]);

  const cleanPhone = formatWhatsAppPhoneWithCountryCode(phone);

  const handleCopy = async () => {
    if (!formattedText) return;
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopied(true);
      message.success('Executive summary copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      message.error('Failed to copy message to clipboard');
    }
  };

  const handleOpenWhatsApp = () => {
    if (!formattedText) return;
    const baseUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(formattedText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(formattedText)}`;
    window.open(baseUrl, '_blank');
  };

  if (!reportModel) return null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={700}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              background: token.colorSuccessBg,
              color: '#25D366',
              border: `1px solid ${token.colorSuccessBorder}`,
              width: 38,
              height: 38,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            <WhatsAppOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: token.colorTextHeading }}>
              Director WhatsApp Summary Preview
            </div>
            <div style={{ fontSize: 12, color: token.colorTextSecondary, fontWeight: 400 }}>
              {reportModel.divisionName} &bull; {reportModel.dateLabel} &bull; {reportModel.sections.length} Department{reportModel.sections.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      }
      footer={[
        <Button key="close" onClick={onClose} style={{ borderRadius: 6 }}>
          Close
        </Button>,
        <Button
          key="copy"
          icon={copied ? <CheckOutlined style={{ color: token.colorSuccess }} /> : <CopyOutlined />}
          onClick={handleCopy}
          style={{ fontWeight: 600, borderRadius: 6 }}
        >
          {copied ? 'Copied!' : 'Copy Message'}
        </Button>,
        <Button
          key="send"
          type="primary"
          icon={<SendOutlined />}
          onClick={handleOpenWhatsApp}
          style={{
            background: '#25D366',
            borderColor: '#25D366',
            color: '#ffffff',
            fontWeight: 700,
            borderRadius: 6,
          }}
        >
          Open in WhatsApp
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
        <div>
          <label
            style={{
              display: 'block',
              fontWeight: 700,
              fontSize: 12.5,
              marginBottom: 4,
              color: token.colorText,
            }}
          >
            Recipient WhatsApp Number (Optional)
          </label>
          <Input
            placeholder="e.g. 923001234567 (with country code, no + or spaces) or leave blank to choose in WhatsApp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
            allowClear
            style={{ borderRadius: 6 }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: token.colorText }}>
              Executive Department Summary Message
            </span>
            <Space size={6}>
              <Tag color="blue">{reportModel.sections.length} Depts</Tag>
              <Tag color="cyan">{formattedText.length} chars</Tag>
            </Space>
          </div>
          <div
            style={{
              background: 'var(--theme-surface-alt, #f8fafc)',
              color: 'var(--theme-text, #0f172a)',
              border: '1px solid var(--theme-border, #e2e8f0)',
              padding: '14px 16px',
              borderRadius: 8,
              maxHeight: 420,
              overflowY: 'auto',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 12.5,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {formattedText}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DirectorSummaryWhatsAppModal;
