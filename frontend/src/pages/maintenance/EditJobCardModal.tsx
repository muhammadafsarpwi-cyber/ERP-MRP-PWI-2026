import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Button, Row, Col } from 'antd';
import { EditOutlined } from '@ant-design/icons';
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
      title={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EditOutlined style={{ color: '#2563eb', fontSize: 18 }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            Edit Job Card: {card.jobCardNo || card.id}
          </span>
        </div>
      )}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={submitting}
          style={{ backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#ffffff', fontWeight: 600 }}
          onClick={handleSubmit}
        >
          Save Changes
        </Button>,
      ]}
      width={560}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="complaint"
          label="Complaint / Problem Reported"
          rules={[{ required: true, message: 'Please enter complaint' }]}
        >
          <Input placeholder="Enter complaint details..." />
        </Form.Item>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
              <Select
                options={JOB_CARD_PRIORITIES.map(p => ({
                  value: p,
                  label: label(p),
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
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

        <Form.Item name="description" label="Detailed Description / Notes">
          <Input.TextArea rows={3} placeholder="Additional technical notes or symptoms..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
