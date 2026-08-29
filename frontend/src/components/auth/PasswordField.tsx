import React, { useState } from 'react';
import { Form, Input } from 'antd';
import type { FormRule } from 'antd';
import { EyeInvisibleOutlined, EyeOutlined, LockOutlined } from '@ant-design/icons';

interface PasswordFieldProps {
  name: string;
  label?: string;
  placeholder?: string;
  autoComplete?: string;
  dependencies?: Array<string | number>;
  rules?: FormRule[];
  extra?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Accessible password input with a real button toggle (Show/Hide password).
 * Toggling visibility only switches the input type — the submitted value is
 * never altered.
 */
const PasswordField: React.FC<PasswordFieldProps> = ({
  name,
  label = 'Password',
  placeholder = 'Password',
  autoComplete = 'current-password',
  dependencies,
  rules,
  extra,
  disabled,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <Form.Item
      name={name}
      label={label}
      dependencies={dependencies}
      rules={rules}
      extra={extra}
    >
      <Input
        prefix={<LockOutlined style={{ color: '#8c94a6' }} />}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        suffix={
          <button
            type="button"
            className="erp-password-toggle"
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </button>
        }
      />
    </Form.Item>
  );
};

export default PasswordField;