import React, { useState } from 'react';
import { Modal, Form, Input, Radio, Alert, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import {
  ProductionUnitItem,
  productionUnitService,
} from '../../../services/productionUnitService';

interface ProductionUnitVoidModalProps {
  open: boolean;
  onClose: () => void;
  unit: ProductionUnitItem | null;
  onVoided: (updatedUnit: ProductionUnitItem) => void;
}

export const ProductionUnitVoidModal: React.FC<ProductionUnitVoidModalProps> = ({
  open,
  onClose,
  unit,
  onVoided,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!unit) return;
    try {
      const values = await form.validateFields();
      setLoading(true);

      const res = await productionUnitService.voidUnit(unit.id, {
        status: values.status,
        reason: values.reason,
      });

      message.success(`Unit ${unit.coilNo} (${unit.unitSerialNo}) marked as ${values.status}`);
      onVoided(res.data);
      onClose();
      form.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'Failed to void unit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okButtonProps={{ danger: true, loading }}
      okText="Confirm Void / Cancel"
      title={
        <span>
          <ExclamationCircleOutlined style={{ color: '#ef4444', marginRight: 8 }} />
          Void Production Unit — {unit?.coilNo}
        </span>
      }
    >
      <Alert
        type="warning"
        showIcon
        message="Audit-Safe Voiding"
        description="Production units are NEVER deleted to preserve complete chain-of-custody and prevent serial number reuse. This unit will be marked VOID and blocked from inventory transfer or printing."
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical" initialValues={{ status: 'VOID' }}>
        <Form.Item name="status" label="New Status" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio value="VOID">VOID (Damaged / Quality Rejection)</Radio>
            <Radio value="CANCELLED">CANCELLED (Entry error / Operator error)</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="reason"
          label="Reason for Voiding"
          rules={[{ required: true, message: 'Please provide a clear justification' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="e.g. Wire snapped at 120m, insulation defect on spark tester, or entered duplicate entry..."
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ProductionUnitVoidModal;
