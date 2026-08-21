import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col, Descriptions, DatePicker, Tabs, List, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, DeleteOutlined, EyeOutlined,
  UserOutlined, EnvironmentOutlined, PhoneOutlined, MailOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import dayjs from 'dayjs';

const { TabPane } = Tabs;

interface Customer {
  id: string;
  customerCode: string;
  name: string;
  shortName?: string;
  customerType: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  currencyCode: string;
  paymentTerms?: string;
  creditLimit: number;
  creditDays: number;
  discountPercent: number;
  customerTier: string;
  leadSource?: string;
  totalOrders: number;
  totalRevenue: number;
  status: string;
  lastContactDate?: string;
  nextFollowUpDate?: string;
  notes?: string;
  contacts?: CustomerContact[];
  addresses?: CustomerAddress[];
}

interface CustomerContact {
  id: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  isPrimary: boolean;
  status: string;
}

interface CustomerAddress {
  id: string;
  addressType: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
  isDefault: boolean;
  status: string;
}

const CUSTOMER_TYPES = ['RETAIL', 'WHOLESALE', 'DISTRIBUTOR', 'GOVERNMENT', 'CORPORATE'];
const CUSTOMER_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED', 'LEAD'];
const LEAD_SOURCES = ['WEBSITE', 'REFERRAL', 'TRADE_SHOW', 'COLD_CALL', 'SOCIAL_MEDIA', 'ADVERTISEMENT', 'OTHER'];
const ADDRESS_TYPES = ['BILLING', 'SHIPPING', 'BOTH'];

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  SUSPENDED: 'orange',
  BLACKLISTED: 'red',
  LEAD: 'blue',
};

const tierColorMap: Record<string, string> = {
  BRONZE: 'default',
  SILVER: 'processing',
  GOLD: 'warning',
  PLATINUM: 'success',
};

const CustomerManagement: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const [contactForm] = Form.useForm();
  const [addressForm] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const [filterTier, setFilterTier] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);

  const fetchCustomers = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.customerType = filterType;
      if (filterTier) params.customerTier = filterTier;
      const response = await apiService.get<{ data: Customer[]; total: number }>('/customer/customers', params);
      setCustomers(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterType, filterTier, pageSize]);

  useEffect(() => { fetchCustomers(page); }, [page, fetchCustomers]);

  const handleCreate = () => {
    setEditingCustomer(null);
    form.resetFields();
    form.setFieldsValue({
      currencyCode: 'PKR',
      creditLimit: 0,
      creditDays: 30,
      discountPercent: 0,
      customerType: 'WHOLESALE',
      customerTier: 'BRONZE',
    });
    setModalVisible(true);
  };

  const handleEdit = (record: Customer) => {
    setEditingCustomer(record);
    form.setFieldsValue({
      ...record,
      lastContactDate: record.lastContactDate ? dayjs(record.lastContactDate) : null,
      nextFollowUpDate: record.nextFollowUpDate ? dayjs(record.nextFollowUpDate) : null,
    });
    setModalVisible(true);
  };

  const handleView = async (record: Customer) => {
    try {
      const res = await apiService.get<{ data: Customer }>(`/customer/customers/${record.id}`);
      setSelectedCustomer(res.data);
      setDetailVisible(true);
    } catch (error) {
      message.error('Failed to load customer details');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        lastContactDate: values.lastContactDate?.toISOString() || null,
        nextFollowUpDate: values.nextFollowUpDate?.toISOString() || null,
      };
      if (editingCustomer) {
        await apiService.patch(`/customer/customers/${editingCustomer.id}`, payload);
        message.success('Customer updated successfully');
      } else {
        await apiService.post('/customer/customers', payload);
        message.success('Customer created successfully');
      }
      setModalVisible(false);
      fetchCustomers(page);
    } catch (error) {
      message.error('Failed to save customer');
    }
  };

  const handleDelete = async (record: Customer) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: `Are you sure you want to delete customer "${record.name}"?`,
      onOk: async () => {
        try {
          await apiService.delete(`/customer/customers/${record.id}`);
          message.success('Customer deleted successfully');
          fetchCustomers(page);
        } catch (error) {
          message.error('Failed to delete customer');
        }
      },
    });
  };

  const handleAddContact = async () => {
    if (!selectedCustomer) return;
    try {
      const values = await contactForm.validateFields();
      await apiService.post(`/customer/customers/${selectedCustomer.id}/contacts`, values);
      message.success('Contact added successfully');
      setContactModalVisible(false);
      contactForm.resetFields();
      handleView(selectedCustomer);
    } catch (error) {
      message.error('Failed to add contact');
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!selectedCustomer) return;
    try {
      await apiService.delete(`/customer/customers/${selectedCustomer.id}/contacts/${contactId}`);
      message.success('Contact removed successfully');
      handleView(selectedCustomer);
    } catch (error) {
      message.error('Failed to remove contact');
    }
  };

  const handleAddAddress = async () => {
    if (!selectedCustomer) return;
    try {
      const values = await addressForm.validateFields();
      await apiService.post(`/customer/customers/${selectedCustomer.id}/addresses`, values);
      message.success('Address added successfully');
      setAddressModalVisible(false);
      addressForm.resetFields();
      handleView(selectedCustomer);
    } catch (error) {
      message.error('Failed to add address');
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!selectedCustomer) return;
    try {
      await apiService.delete(`/customer/customers/${selectedCustomer.id}/addresses/${addressId}`);
      message.success('Address removed successfully');
      handleView(selectedCustomer);
    } catch (error) {
      message.error('Failed to remove address');
    }
  };

  const columns: ColumnsType<Customer> = [
    { title: 'Code', dataIndex: 'customerCode', key: 'customerCode', width: 110 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200 },
    { title: 'Type', dataIndex: 'customerType', key: 'customerType', width: 110 },
    { title: 'Contact', dataIndex: 'contactPerson', key: 'contactPerson', width: 130 },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 180 },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 120 },
    { title: 'City', dataIndex: 'city', key: 'city', width: 100 },
    {
      title: 'Tier', dataIndex: 'customerTier', key: 'customerTier', width: 90,
      render: (tier: string) => <Tag color={tierColorMap[tier]}>{tier}</Tag>,
    },
    {
      title: 'Revenue', dataIndex: 'totalRevenue', key: 'totalRevenue', width: 120, align: 'right',
      render: (v: number) => formatDecimal(v),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
        </Space>
      ),
    },
  ];

  return (
    <Card title="Customer Management" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Customer</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Input placeholder="Search customers..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchCustomers(1)} />
        </Col>
        <Col span={4}>
          <Select placeholder="Status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
            {STATUS_OPTIONS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Col>
        <Col span={4}>
          <Select placeholder="Type" allowClear style={{ width: '100%' }} value={filterType} onChange={setFilterType}>
            {CUSTOMER_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
          </Select>
        </Col>
        <Col span={4}>
          <Select placeholder="Tier" allowClear style={{ width: '100%' }} value={filterTier} onChange={setFilterTier}>
            {CUSTOMER_TIERS.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
          </Select>
        </Col>
        <Col span={3}>
          <Button onClick={() => fetchCustomers(1)}>Search</Button>
        </Col>
      </Row>
      <Table
        columns={columns}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }}
      />

      {/* Create/Edit Customer Modal */}
      <Modal
        title={editingCustomer ? 'Edit Customer' : 'Create Customer'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={900}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="companyId" label="Company ID" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customerCode" label="Customer Code" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shortName" label="Short Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="customerType" label="Customer Type">
                <Select>
                  {CUSTOMER_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="customerTier" label="Tier">
                <Select>
                  {CUSTOMER_TIERS.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="leadSource" label="Lead Source">
                <Select allowClear>
                  {LEAD_SOURCES.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactPerson" label="Contact Person">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="currencyCode" label="Currency">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="paymentTerms" label="Payment Terms">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="creditLimit" label="Credit Limit">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="creditDays" label="Credit Days">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discountPercent" label="Discount %">
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="lastContactDate" label="Last Contact Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nextFollowUpDate" label="Next Follow Up">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="city" label="City">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="state" label="State">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="country" label="Country">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Customer Detail Modal */}
      <Modal title="Customer Details" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={800}>
        {selectedCustomer && (
          <Tabs defaultActiveKey="info">
            <TabPane tab="Information" key="info">
              <Descriptions bordered column={2}>
                <Descriptions.Item label="Code">{selectedCustomer.customerCode}</Descriptions.Item>
                <Descriptions.Item label="Name">{selectedCustomer.name}</Descriptions.Item>
                <Descriptions.Item label="Type">{selectedCustomer.customerType}</Descriptions.Item>
                <Descriptions.Item label="Tier"><Tag color={tierColorMap[selectedCustomer.customerTier]}>{selectedCustomer.customerTier}</Tag></Descriptions.Item>
                <Descriptions.Item label="Contact">{selectedCustomer.contactPerson}</Descriptions.Item>
                <Descriptions.Item label="Email">{selectedCustomer.email}</Descriptions.Item>
                <Descriptions.Item label="Phone">{selectedCustomer.phone}</Descriptions.Item>
                <Descriptions.Item label="City">{selectedCustomer.city}</Descriptions.Item>
                <Descriptions.Item label="Currency">{selectedCustomer.currencyCode}</Descriptions.Item>
                <Descriptions.Item label="Payment Terms">{selectedCustomer.paymentTerms}</Descriptions.Item>
                <Descriptions.Item label="Credit Limit">{formatDecimal(selectedCustomer.creditLimit)}</Descriptions.Item>
                <Descriptions.Item label="Credit Days">{selectedCustomer.creditDays}</Descriptions.Item>
                <Descriptions.Item label="Discount">{selectedCustomer.discountPercent}%</Descriptions.Item>
                <Descriptions.Item label="Lead Source">{selectedCustomer.leadSource}</Descriptions.Item>
                <Descriptions.Item label="Total Orders">{selectedCustomer.totalOrders}</Descriptions.Item>
                <Descriptions.Item label="Total Revenue">{formatDecimal(selectedCustomer.totalRevenue)}</Descriptions.Item>
                <Descriptions.Item label="Status"><Tag color={statusColorMap[selectedCustomer.status]}>{selectedCustomer.status}</Tag></Descriptions.Item>
                <Descriptions.Item label="Notes" span={2}>{selectedCustomer.notes}</Descriptions.Item>
              </Descriptions>
            </TabPane>
            <TabPane tab={<span><UserOutlined /> Contacts ({selectedCustomer.contacts?.length || 0})</span>} key="contacts">
              <div style={{ marginBottom: 16 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { contactForm.resetFields(); setContactModalVisible(true); }}>
                  Add Contact
                </Button>
              </div>
              <List
                dataSource={selectedCustomer.contacts || []}
                renderItem={(contact: CustomerContact) => (
                  <List.Item
                    actions={[
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteContact(contact.id)} />,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<Badge dot={contact.isPrimary} offset={[-2, 2]}><UserOutlined style={{ fontSize: 24 }} /></Badge>}
                      title={`${contact.firstName} ${contact.lastName || ''}`}
                      description={
                        <Space direction="vertical" size={0}>
                          {contact.jobTitle && <span>{contact.jobTitle}</span>}
                          {contact.email && <span><MailOutlined /> {contact.email}</span>}
                          {contact.phone && <span><PhoneOutlined /> {contact.phone}</span>}
                          {contact.mobile && <span><PhoneOutlined /> {contact.mobile}</span>}
                        </Space>
                      }
                    />
                    {contact.isPrimary && <Tag color="blue">Primary</Tag>}
                  </List.Item>
                )}
              />
            </TabPane>
            <TabPane tab={<span><EnvironmentOutlined /> Addresses ({selectedCustomer.addresses?.length || 0})</span>} key="addresses">
              <div style={{ marginBottom: 16 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { addressForm.resetFields(); setAddressModalVisible(true); }}>
                  Add Address
                </Button>
              </div>
              <List
                dataSource={selectedCustomer.addresses || []}
                renderItem={(address: CustomerAddress) => (
                  <List.Item
                    actions={[
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteAddress(address.id)} />,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<EnvironmentOutlined style={{ fontSize: 24 }} />}
                      title={<>{address.addressType} {address.isDefault && <Tag color="blue">Default</Tag>}</>}
                      description={
                        <Space direction="vertical" size={0}>
                          <span>{address.addressLine1}</span>
                          {address.addressLine2 && <span>{address.addressLine2}</span>}
                          <span>{address.city}{address.state ? `, ${address.state}` : ''}{address.postalCode ? ` ${address.postalCode}` : ''}</span>
                          {address.country && <span>{address.country}</span>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </TabPane>
          </Tabs>
        )}
      </Modal>

      {/* Add Contact Modal */}
      <Modal title="Add Contact" open={contactModalVisible} onOk={handleAddContact} onCancel={() => setContactModalVisible(false)}>
        <Form form={contactForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="Last Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="jobTitle" label="Job Title">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="mobile" label="Mobile">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="isPrimary" label="Primary Contact" valuePropName="checked">
            <input type="checkbox" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Address Modal */}
      <Modal title="Add Address" open={addressModalVisible} onOk={handleAddAddress} onCancel={() => setAddressModalVisible(false)}>
        <Form form={addressForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="addressType" label="Address Type" rules={[{ required: true, message: 'Required' }]}>
                <Select>
                  {ADDRESS_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="isDefault" label="Default" valuePropName="checked">
                <input type="checkbox" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="addressLine1" label="Address Line 1" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="addressLine2" label="Address Line 2">
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="city" label="City" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="state" label="State">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="postalCode" label="Postal Code">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="country" label="Country">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CustomerManagement;