import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd';
import { LockOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import apiService from '../../services/api';

const { Title, Text } = Typography;

interface ChangePasswordProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const ChangePassword: React.FC<ChangePasswordProps> = ({ onSuccess, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onFinish = async (values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      await apiService.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      setSuccess(true);
      if (onSuccess) {
        setTimeout(onSuccess, 2000);
      }
    } catch (err: any) {
      const serverMessage = err.response?.data?.message || err.response?.data?.error;
      if (err.response?.status === 401) {
        setError('Current password is incorrect.');
      } else if (err.response?.status === 0 || !err.response) {
        setError('Unable to connect to the server. Please try again later.');
      } else {
        setError(serverMessage || 'Failed to change password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card style={{ maxWidth: 480, margin: '0 auto' }}>
        <Alert
          message="Password Changed Successfully"
          description="Your password has been updated. You may need to log in again on other devices."
          type="success"
          showIcon
        />
        {onCancel && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button onClick={onCancel}>Close</Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 480, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ marginBottom: 4 }}>Change Password</Title>
        <Text type="secondary">Update your account password.</Text>
      </div>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 24 }}
        />
      )}

      <Form name="change-password" onFinish={onFinish} layout="vertical" requiredMark={false}>
        <Form.Item
          name="currentPassword"
          rules={[{ required: true, message: 'Please enter your current password' }]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="Current password"
            size="large"
            autoComplete="current-password"
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
          />
        </Form.Item>

        <Form.Item
          name="newPassword"
          rules={[
            { required: true, message: 'Please enter a new password' },
            { min: 8, message: 'Password must be at least 8 characters' },
            {
              pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
              message: 'Must contain uppercase, lowercase, and a number',
            },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="New password"
            size="large"
            autoComplete="new-password"
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Please confirm your new password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Passwords do not match'));
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="Confirm new password"
            size="large"
            autoComplete="new-password"
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading} size="large">
              Update Password
            </Button>
            {onCancel && (
              <Button onClick={onCancel} size="large">
                Cancel
              </Button>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ChangePassword;
