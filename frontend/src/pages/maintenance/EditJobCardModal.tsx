import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Button, Row, Col, Tag } from 'antd';
import { EditOutlined, BuildOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { JobCard, JOB_CARD_BASE, JOB_CARD_PRIORITIES, MAINTENANCE_TYPES, label, errorText } from './jobCards.types';

interface EditJobCardModalProps {
  open: boolean;
  card: JobCard | null;
  onClose: () => void;
  onSuccess: (updatedCardId: string) => void;
}

export const EditJobCardModal: React.FC<EditJobCardModalProps> = ({
  open,
  card,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && card) {
      form.setFieldsValue({
        complaint: card.complaint,
        priority: card.priority,
        maintenanceType: card.maintenanceType,
        description: card.description,
      });
    }
  }, [open, card, form]);

  if (!open || !card) return null;

  const machineName = card.machine?.name || card.machine?.machineName || card.machineName || 'Machine Asset';
  const machineCode = card.machine?.machineCode || card.machineCode || '—';

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await apiService.patch(`${JOB_CARD_BASE}/${card.id}`, values);
      onSuccess(card.id);
      onClose();
    } catch (e) {
      alert(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      title={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EditOutlined style={{ color: '#2563eb', fontSize: 18 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Edit Job Card: {card.jobCardNo || card.id}
          </span>
        </div>
      )}
      footer={(
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <Button key="cancel" onClick={onClose} style={{ height: 38, borderRadius: 8 }}>
            Cancel
          </Button>
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            style={{
              backgroundColor: '#2563eb',
              borderColor: '#2563eb',
              color: '#ffffff',
              fontWeight: 700,
              height: 38,
              borderRadius: 8,
              flex: '1 1 auto',
              maxWidth: 200,
            }}
            onClick={handleSubmit}
          >
            Save Changes
          </Button>
        </div>
      )}
      width={560}
      styles={{
        body: {
          maxHeight: 'calc(100dvh - 140px)',
          overflowY: 'auto',
          paddingRight: 4,
        },
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: 'var(--theme-surface-alt)',
          border: '1px solid var(--theme-border)',
          marginBottom: 14,
          marginTop: 8,
          fontSize: 12,
          color: 'var(--theme-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <span>
          <BuildOutlined style={{ marginRight: 6, color: 'var(--maint-info-fg)' }} />
          <strong style={{ color: 'var(--theme-text)' }}>{machineName}</strong>
        </span>
        <Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>
          {machineCode}
        </Tag>
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="complaint"
          label="Complaint / Problem Reported"
          rules={[{ required: true, message: 'Please enter complaint' }]}
        >
          <Input placeholder="Enter complaint details..." />
        </Form.Item>

        <Row gutter={[12, 4]}>
          <Col xs={24} sm={12}>
            <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
              <Select
                options={JOB_CARD_PRIORITIES.map(p => ({
                  value: p,
                  label: label(p),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="maintenanceType" label="Maintenance Type" rules={[{ required: true }]}>
              <Select
                options={MAINTENANCE_TYPES.map(t => ({
                  value: t,
                  label: label(t),
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="Detailed Description / Notes" style={{ marginBottom: 4 }}>
          <Input.TextArea rows={3} placeholder="Additional technical notes or symptoms..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
