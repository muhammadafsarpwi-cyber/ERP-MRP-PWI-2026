import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Card, Form, Input, Button, Typography, Alert, Divider, Row, Col, Space,
  Tag, Spin, Skeleton,
} from 'antd';
import {
  MailOutlined, PhoneOutlined, IdcardOutlined, UserOutlined,
  CameraOutlined, DeleteOutlined, CheckOutlined, CloseOutlined,
  SaveOutlined, IdcardFilled,
} from '@ant-design/icons';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';
import { useUserStore } from '../../store/userStore';
import UserAvatar, { getInitials } from '../../components/layout/UserAvatar';
import './profile.css';

const { Title, Text } = Typography;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

const ProfilePage: React.FC = () => {
  const [form] = Form.useForm();
  const { user, setUser } = useUserStore();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = user?.displayName || user?.firstName || user?.email || 'User';
  const roleName = Array.isArray(user?.userRoles) && user.userRoles.length > 0
    ? user.userRoles[0]?.role?.name || user.userRoles[0]?.role?.roleCode
    : undefined;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.get<{ data: any }>('/auth/me');
      const fresh = response.data;
      setUser(fresh);
      form.setFieldsValue({
        displayName: fresh.displayName ?? '',
        firstName: fresh.firstName ?? '',
        lastName: fresh.lastName ?? '',
        username: fresh.username ?? '',
        phone: fresh.phone ?? '',
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load your profile.');
    } finally {
      setLoading(false);
    }
  }, [form, setUser]);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        displayName: user.displayName ?? '',
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        username: user.username ?? '',
        phone: user.phone ?? '',
      });
    }
  }, [user, form]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setSuccess(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Invalid file type. Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large. Maximum size is 5 MB.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      setPreview(dataUrl);
      setSelectedFile(file);
    } catch {
      setError('Could not read the selected image. Please try again.');
    }
  };

  const cancelUpload = () => {
    setPreview(null);
    setSelectedFile(null);
  };

  const uploadAvatar = async () => {
    if (!selectedFile || !preview) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const base64 = preview.replace(/^data:image\/[^;]+;base64,/, '');
      const response = await apiService.post<{ data: any; message?: string }>('/auth/me/avatar', {
        data: base64,
        mime: selectedFile.type,
      });
      setUser(response.data);
      setPreview(null);
      setSelectedFile(null);
      setSuccess(response.message || 'Profile picture updated.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to upload profile picture.');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!user?.avatarUrl) return;
    setRemoving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiService.delete<{ data: any; message?: string }>('/auth/me/avatar');
      setUser(response.data);
      setPreview(null);
      setSelectedFile(null);
      setSuccess(response.message || 'Profile picture removed.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to remove profile picture.');
    } finally {
      setRemoving(false);
    }
  };

  const onSave = async (values: {
    displayName: string; firstName: string; lastName: string; username: string; phone: string;
  }) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiService.patch<{ data: any; message?: string }>('/auth/me', {
        displayName: values.displayName?.trim() || undefined,
        firstName: values.firstName?.trim() || undefined,
        lastName: values.lastName?.trim() || undefined,
        username: values.username?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
      });
      setUser(response.data);
      setIsEditing(false);
      setSuccess(response.message || 'Profile updated successfully.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (user) {
      form.setFieldsValue({
        displayName: user.displayName ?? '',
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        username: user.username ?? '',
        phone: user.phone ?? '',
      });
    }
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader
        icon={<UserOutlined />}
        title="My Profile"
        subtitle="View and update your personal account information"
        showBreadcrumbs
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
          data-testid="profile-error"
        />
      )}
      {success && (
        <Alert
          type="success"
          showIcon
          message={success}
          closable
          onClose={() => setSuccess(null)}
          style={{ marginBottom: 16 }}
          data-testid="profile-success"
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="erp-profile-card" styles={{ body: { padding: 20 } }}>
            {loading ? (
              <Skeleton avatar paragraph={{ rows: 2 }} active />
            ) : (
              <div className="erp-profile-avatar-wrap">
                <div className="erp-profile-avatar">
                  {preview ? (
                    <img src={preview} alt="Profile preview" data-testid="avatar-preview" />                  ) : user?.avatarUrl ? (
                    <UserAvatar avatarUrl={user.avatarUrl} displayName={displayName} size={96} />
                  ) : (
                    <span className="erp-profile-avatar-initials">{getInitials(displayName)}</span>
                  )}
                  <button
                    type="button"
                    className="erp-profile-avatar-edit"
                    aria-label="Upload profile photo"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || removing}
                  >
                    <CameraOutlined />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                    data-testid="avatar-input"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                </div>

                <Title level={5} style={{ margin: '14px 0 2px', textAlign: 'center' }}>
                  {displayName}
                </Title>
                <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 13 }}>
                  {user?.email || '—'}
                </Text>
                {roleName && (
                  <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <Tag color="blue">{roleName}</Tag>
                  </div>
                )}

                {preview ? (
                  <div className="erp-profile-avatar-actions">
                    <Button type="primary" size="small" loading={uploading} icon={<CheckOutlined />} onClick={uploadAvatar}>
                      Save Photo
                    </Button>
                    <Button size="small" icon={<CloseOutlined />} onClick={cancelUpload} disabled={uploading}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="erp-profile-avatar-actions">
                    <Button size="small" icon={<CameraOutlined />} onClick={() => fileInputRef.current?.click()} disabled={uploading || removing}>
                      Upload Photo
                    </Button>
                    {user?.avatarUrl && (
                      <Button size="small" danger icon={<DeleteOutlined />} loading={removing} onClick={removeAvatar}>
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="erp-profile-card" styles={{ body: { padding: '16px 20px' } }} style={{ marginTop: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>Account Details</Text>
            <div className="erp-profile-detail-row">
              <IdcardFilled style={{ color: 'var(--theme-accent)' }} />
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Employee ID</Text>
                <Text>{user?.employeeId || '—'}</Text>
              </div>
            </div>
            <div className="erp-profile-detail-row">
              <MailOutlined style={{ color: 'var(--theme-accent)' }} />
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Email</Text>
                <Text>{user?.email || '—'}</Text>
              </div>
            </div>
            <div className="erp-profile-detail-row">
              <PhoneOutlined style={{ color: 'var(--theme-accent)' }} />
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Phone</Text>
                <Text>{user?.phone || '—'}</Text>
              </div>
            </div>
            <div className="erp-profile-detail-row">
              <IdcardOutlined style={{ color: 'var(--theme-accent)' }} />
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Username</Text>
                <Text>{user?.username || '—'}</Text>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card className="erp-profile-card" styles={{ body: { padding: 20 } }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <Title level={5} style={{ marginBottom: 2 }}>Profile Information</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Keep your personal details up to date.
                </Text>
              </div>
              {!isEditing && (
                <Button icon={<IdcardOutlined />} onClick={() => setIsEditing(true)}>
                  Edit Profile
                </Button>
              )}
            </div>

            <Divider style={{ margin: '0 0 20px' }} />

            <Spin spinning={loading}>
              <Form
                form={form}
                layout="vertical"
                requiredMark={false}
                disabled={!isEditing || saving}
                onFinish={onSave}
                data-testid="profile-form"
              >
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="firstName"
                      label="First Name"
                      rules={[{ max: 100, message: 'First name must be 100 characters or fewer' }]}
                    >
                      <Input placeholder="First name" autoComplete="given-name" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="lastName"
                      label="Last Name"
                      rules={[{ max: 100, message: 'Last name must be 100 characters or fewer' }]}
                    >
                      <Input placeholder="Last name" autoComplete="family-name" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="displayName"
                      label="Display Name"
                      rules={[
                        { required: true, message: 'Display name is required' },
                        { max: 255, message: 'Display name must be 255 characters or fewer' },
                      ]}
                    >
                      <Input placeholder="How your name appears in the ERP" autoComplete="name" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="username" label="Username" rules={[{ max: 100 }]}>
                      <Input placeholder="Username" autoComplete="username" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="phone"
                      label="Phone"
                      rules={[{ max: 20, message: 'Phone must be 20 characters or fewer' }]}
                    >
                      <Input prefix={<PhoneOutlined style={{ color: 'var(--theme-text-muted)' }} />} placeholder="Phone number" autoComplete="tel" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Email">
                      <Input value={user?.email || ''} disabled prefix={<MailOutlined style={{ color: 'var(--theme-text-muted)' }} />} />
                    </Form.Item>
                  </Col>
                </Row>

                {isEditing && (
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                      Save Changes
                    </Button>
                    <Button icon={<CloseOutlined />} onClick={handleCancel} disabled={saving}>
                      Cancel
                    </Button>
                  </Space>
                )}
              </Form>
            </Spin>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ProfilePage;
