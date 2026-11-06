import React, { useState, useMemo } from 'react';
import {
  Modal,
  Button,
  Input,
  Space,
  Tag,
  message,
  theme,
} from 'antd';
import {
  WhatsAppOutlined,
  CopyOutlined,
  CheckOutlined,
  SendOutlined,
  GlobalOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import {
  DeptFleetWhatsAppParams,
  buildDepartmentFleetWhatsAppText,
  openWhatsAppDirect,
} from './deptFleetWhatsApp';

export interface DeptFleetWhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  params: DeptFleetWhatsAppParams | null;
}

export const DeptFleetWhatsAppModal: React.FC<DeptFleetWhatsAppModalProps> = ({
  open,
  onClose,
  params,
}) => {
  const { token } = theme.useToken();
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);

  const formattedText = useMemo(() => {
    if (!params) return '';
    return buildDepartmentFleetWhatsAppText(params);
  }, [params]);

  const cleanPhone = phone.replace(/[^0-9]/g, '');

  const handleCopy = async () => {
    if (!formattedText) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formattedText);
        setCopied(true);
        message.success('Report copied to clipboard! You can now paste it into WhatsApp.');
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      message.error('Failed to copy to clipboard');
    }
  };

  const handleSendWhatsApp = () => {
    if (!formattedText) return;
    openWhatsAppDirect(formattedText, cleanPhone);
    message.success('Opening WhatsApp with department report!');
    onClose();
  };

  const handleSendWhatsAppWeb = () => {
    if (!formattedText) return;
    const baseUrl = cleanPhone
      ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(formattedText)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(formattedText)}`;
    window.open(baseUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const handleDownloadTxt = () => {
    if (!formattedText) return;
    const blob = new Blob([formattedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const deptName = params?.department.name.replace(/[^a-zA-Z0-9-_]/g, '_') || 'Dept';
    link.href = url;
    link.download = `PWI_${deptName}_Fleet_Report_${params?.dateStr || 'today'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Text file downloaded successfully');
  };

  if (!params) return null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={700}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              backgroundColor: '#25D366',
              color: '#ffffff',
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              boxShadow: '0 2px 6px rgba(37,211,102,0.3)',
            }}
          >
            <WhatsAppOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: token.colorText }}>
              Share {params.department.name} Fleet Report via WhatsApp
            </div>
            <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
              {params.divisionName || 'Manufacturing'} • {params.dateStr} • {params.shiftName || 'Shift'}
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
          {copied ? 'Copied!' : 'Copy Text'}
        </Button>,
        <Button
          key="web"
          icon={<GlobalOutlined />}
          onClick={handleSendWhatsAppWeb}
          style={{ borderRadius: 6, fontWeight: 600 }}
        >
          WhatsApp Web
        </Button>,
        <Button
          key="send"
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSendWhatsApp}
          style={{
            backgroundColor: '#25D366',
            borderColor: '#25D366',
            color: '#ffffff',
            fontWeight: 700,
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(37,211,102,0.35)',
          }}
        >
          Send via WhatsApp
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
        {/* Optional Phone Number */}
        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, marginBottom: 4, color: token.colorText }}>
            Recipient WhatsApp Number (Optional)
          </label>
          <Input
            placeholder="e.g. 923001234567 (with country code, no + or dashes) or leave empty"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
            allowClear
            style={{ borderRadius: 6 }}
          />
          <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 4 }}>
            💡 If left blank, WhatsApp opens directly and prompts you to pick any recipient or group.
          </div>
        </div>

        {/* Live Formatted WhatsApp Text Preview */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: token.colorText }}>
              Live WhatsApp Message Preview
            </span>
            <Space size={6}>
              <Tag color="cyan">{formattedText.length} characters</Tag>
              <Tag color="success">Ready to Send</Tag>
            </Space>
          </div>
          <div
            style={{
              backgroundColor: token.colorFillAlter,
              color: token.colorText,
              padding: '12px 14px',
              borderRadius: 8,
              maxHeight: 320,
              overflowY: 'auto',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            {formattedText}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DeptFleetWhatsAppModal;

