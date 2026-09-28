import React, { useEffect } from 'react';
import { Button, Col, Empty, Form, Modal, Popconfirm, Row, Select, Space, Spin, Tag, Typography } from 'antd';
import { ApartmentOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import DivisionSelect from './DivisionSelect';

const { Text } = Typography;

/**
 * Prompt #16B — THE Division Access implementation.
 *
 * There is exactly ONE place in the ERP that renders, grants and revokes
 * division access: this module. It is used by all three entry points of
 * User Management:
 *
 *   Actions → Divisions  ─┐
 *   Add User (after create)├─→ <DivisionAccessModal />
 *   Edit User             ─┘
 *
 * Data contract (unchanged from Prompt #16):
 *   - source of truth : `user_organization_scopes`
 *   - API             : GET    /admin/users/:id            (read `organizationScopes`)
 *                       POST   /admin/users/:id/org-scopes (grant)
 *                       DELETE /admin/users/:id/org-scopes/:scopeId (revoke)
 *   - the payload always carries `division.id` (a real UUID) and NEVER a
 *     division code such as `DIV-CCD`.
 *
 * The component is deliberately "controlled": scopes, loading and the API
 * calls stay in the caller (UserManagement) so the Edit form summary and this
 * modal always render the SAME single state (Prompt #16B §19 — no duplicate
 * state). What lives here is the whole UI + validation for the workflow.
 */

/** Minimal reference to a user — never an email / employee code / temp id. */
export interface DivisionAccessTarget {
  /** `erp_core.users.id` (real UUID). */
  id: string;
  displayName?: string;
  defaultCompanyId?: string;
  /** Only embedded by `GET /admin/users/:id`; the users LIST endpoint omits it. */
  organizationScopes?: DivisionScope[];
}

export interface DivisionCompanyOption {
  id: string;
  legalName?: string;
  tradeName?: string;
  companyCode?: string;
}

/** One row of `user_organization_scopes` as returned by the API. */
export interface DivisionScope {
  id: string;
  companyId?: string | null;
  divisionId?: string | null;
  scopeLevel?: string;
  isFullScope?: boolean;
  status?: string;
  company?: { id?: string; legalName?: string; tradeName?: string } | null;
  division?: { id?: string; divisionCode?: string; name?: string } | null;
}

export interface DivisionScopeTagsProps {
  scopes: DivisionScope[];
  loading?: boolean;
  /** Rendered by the modal only — the read-only summaries never offer removal. */
  onRemove?: (scopeId: string) => void;
  style?: React.CSSProperties;
}

const SUMMARY_BLOCK_STYLE: React.CSSProperties = { margin: '8px 0 16px', minHeight: 44 };

/**
 * Prompt #16B §6 — is this row a *division restriction*?
 *
 * Every account starts with an auto-provisioned COMPANY-wide row
 * (`scope_level = 'COMPANY'`, `division_id = NULL`). That row is NOT a
 * restriction: counting it would make "1 division scope configured" a lie and
 * — because it is rendered with a Remove button inside this section — it would
 * offer a one-click way to revoke full access from a screen called
 * "Division Access". The correct rendering for it is the empty state
 * ("No division restriction — this user currently has full company access"),
 * which is exactly why the list is filtered before it is displayed.
 *
 * This is the single place that decides it, so the modal, the Edit summary and
 * the New User summary can never disagree.
 */
export function isDivisionRestriction(scope: DivisionScope | null | undefined): boolean {
  if (!scope) return false;
  if (scope.scopeLevel === 'COMPANY' || scope.isFullScope === true) return false;
  return Boolean(scope.divisionId) || scope.scopeLevel === 'DIVISION';
}

/**
 * Prompt #16B §7 — display `DIV-CCD · Control Cable Division`, never the raw
 * identifier: the UUID is what gets submitted, not what gets read back.
 * Falls back to the id only when the division row genuinely carries no code.
 */
export function formatDivisionLabel(scope: DivisionScope): string {
  const code = scope.division?.divisionCode;
  const name = scope.division?.name;
  if (code && name) return `${code} · ${name}`;
  if (code) return code;
  if (name) return name;
  return scope.divisionId || 'Unknown division';
}

/**
 * Read-only rendering of a user's division access. Shared by the modal and by
 * the Edit / New User summaries so the tags (and the wording of the
 * "no restriction" state) can never drift apart.
 */
export function DivisionScopeTags({ scopes, loading, onRemove, style }: DivisionScopeTagsProps) {
  const blockStyle = style || SUMMARY_BLOCK_STYLE;

  if (loading) {
    return (
      <div style={blockStyle}>
        <Spin size="small" />
      </div>
    );
  }

  if (!scopes || scopes.length === 0) {
    return (
      <div style={blockStyle}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No division restriction — this user currently has full company access"
        />
      </div>
    );
  }

  return (
    <div style={blockStyle}>
      <Space size={[6, 8]} wrap>
        {scopes.map(scope => {
          const companyWide = !isDivisionRestriction(scope);
          return (
            <Tag
              key={scope.id}
              color={companyWide ? 'gold' : 'blue'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px' }}
            >
              {companyWide
                ? `Full company access${scope.company?.legalName ? ` · ${scope.company.legalName}` : ''}`
                : formatDivisionLabel(scope)}
              {onRemove ? (
                <Popconfirm
                  title="Remove this division access?"
                  description={
                    companyWide
                      ? 'Removing company-wide access may restrict what this user can see.'
                      : 'The user will lose access to this division.'
                  }
                  onConfirm={() => onRemove(scope.id)}
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                >
                  <button
                    type="button"
                    aria-label="Remove division access"
                    onClick={e => e.stopPropagation()}
                    style={{
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      margin: 0,
                      cursor: 'pointer',
                      color: 'inherit',
                      lineHeight: 1,
                    }}
                  >
                    <CloseOutlined style={{ fontSize: 10 }} />
                  </button>
                </Popconfirm>
              ) : null}
            </Tag>
          );
        })}
      </Space>
    </div>
  );
}

export interface DivisionAccessModalProps {
  open: boolean;
  /** The user being configured — must carry the real database UUID. */
  user: DivisionAccessTarget | null;
  companies: DivisionCompanyOption[];
  scopes: DivisionScope[];
  loading: boolean;
  /** Grant one scope. Resolves `true` only when it was persisted. */
  onGrant: (values: { companyId: string; divisionId: string }) => boolean | Promise<boolean>;
  onRemove: (scopeId: string) => void | Promise<void>;
  onClose: () => void;
}

/**
 * The working Division Access modal (Prompt #16 §25/§26) extracted verbatim so
 * the New User and Edit User workflows can open the very same implementation.
 */
export const DivisionAccessModal: React.FC<DivisionAccessModalProps> = ({
  open,
  user,
  companies,
  scopes,
  loading,
  onGrant,
  onRemove,
  onClose,
}) => {
  const [form] = Form.useForm();
  const defaultCompanyId = user?.defaultCompanyId || companies[0]?.id;
  // §12 — Company → Division dependency: the division picker only ever offers
  // divisions that belong to the company currently selected in the form.
  const watchedCompanyId = Form.useWatch('companyId', form) as string | undefined;

  // Seed the company picker from the user's own default company every time a
  // (different) user's modal is opened — exactly like the inline version did.
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (defaultCompanyId) form.setFieldValue('companyId', defaultCompanyId);
    // Re-seed only per user; `companies` may refetch while the modal is open
    // and must not wipe a division the admin already picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const handleGrant = async () => {
    let values: { companyId?: string; divisionId?: string };
    try {
      values = await form.validateFields();
    } catch {
      return; // antd already highlighted the fields
    }
    if (!values.companyId || !values.divisionId) return;

    const granted = await onGrant({ companyId: values.companyId, divisionId: values.divisionId });
    if (granted) form.setFieldValue('divisionId', undefined);
  };

  return (
    <Modal
      title={
        <Space>
          <ApartmentOutlined style={{ color: '#0ea5e9' }} />
          <span>Division Access — {user?.displayName}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" aria-label="Close Division Access" onClick={onClose}>
          Close
        </Button>,
      ]}
      width={580}
      destroyOnHidden
    >
      <div
        style={{
          background: 'rgba(14, 165, 233, 0.08)',
          border: '1px solid rgba(14, 165, 233, 0.25)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 14,
        }}
      >
        <Text style={{ fontSize: 12, display: 'block' }}>
          A user's effective access for a module is the intersection of{' '}
          <strong>their division access below</strong> and any division restriction on their role's permission.
          Empty configuration on either side means <strong>no restriction</strong> — never a denial.
        </Text>
      </div>

      <Typography.Text strong>Current division access</Typography.Text>
      <DivisionScopeTags scopes={scopes} loading={loading} onRemove={onRemove} />

      <Typography.Text strong>Grant division access</Typography.Text>
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Row gutter={10}>
          <Col xs={24} sm={10}>
            <Form.Item name="companyId" label="Company" rules={[{ required: true, message: 'Select a company' }]}>
              <Select placeholder="Select company" showSearch optionFilterProp="label" style={{ width: '100%' }}>
                {companies.map(c => (
                  <Select.Option key={c.id} value={c.id}>
                    {c.tradeName || c.legalName || c.companyCode || c.id}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item name="divisionId" label="Division" rules={[{ required: true, message: 'Select a division' }]}>
              <DivisionSelect placeholder="Select division" showCode companyId={watchedCompanyId || defaultCompanyId} />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" block icon={<PlusOutlined />} loading={loading} onClick={handleGrant}>
          Grant Division Access
        </Button>
      </Form>
    </Modal>
  );
};

export default DivisionAccessModal;
