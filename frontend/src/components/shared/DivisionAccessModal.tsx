import React, { useEffect, useMemo } from 'react';
import { Alert, Button, Col, Divider, Empty, Form, Modal, Popconfirm, Row, Select, Space, Spin, Switch, Tag, Typography, message } from 'antd';
import { ApartmentOutlined, CloseOutlined, PlusOutlined, SaveOutlined, WarningOutlined } from '@ant-design/icons';
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

/**
 * PROMPT #26 — the server-computed answer to "what can this user actually
 * reach?", returned by `GET /admin/users/:id/division-access`.
 *
 * The popup used to DERIVE this from the raw scope rows, which is how it came
 * to disagree with the API: the rows said "DIV-CCD only" while the API said
 * "everything", because the auto-provisioned company-wide row was filtered out
 * of the list and the contradiction was invisible. The server is the only
 * authority, so the modal now renders exactly what it returns.
 */
export interface EffectiveDivisionAccess {
  unrestricted: boolean;
  divisionIds: string[];
  /** Master rows for the divisions the user can reach (for readable labels). */
  accessibleDivisions?: Array<{ id: string; divisionCode?: string; name?: string }>;
}

/**
 * The contradictory state that caused the incident: the account holds BOTH a
 * company-wide default row AND at least one division-level row.
 *
 * `deriveUserDivisionIds()` used to short-circuit to 'ALL' on the company-wide
 * row, so such a user was shown "DIV-CCD only" in this popup while the API
 * served them every division. Surfacing the conflict is the honest rendering;
 * `PUT /admin/users/:id/division-access` is what actually resolves it.
 */
export function hasCompanyWideConflict(scopes: DivisionScope[] | null | undefined): boolean {
  if (!Array.isArray(scopes) || scopes.length === 0) return false;
  const companyWide = scopes.some(
    (s) => s && !isDivisionRestriction(s) && !isDenyAllMarker(s) && s.status !== 'INACTIVE',
  );
  const restricted = scopes.some((s) => isDivisionRestriction(s) && s.status !== 'INACTIVE');
  return companyWide && restricted;
}

/**
 * PROMPT #26 — the `scope_level = 'NONE'` row written by
 * `PUT /admin/users/:id/division-access` when an admin deliberately denies
 * every division.
 *
 * It carries a NULL `division_id`, so `isDivisionRestriction()` classifies it
 * as a company-wide row; rendering it as a "Full company access" tag would say
 * the exact opposite of what it means. It is excluded from the conflict
 * detection as well: a deny marker next to division rows is not the
 * company-wide contradiction, it is a leftover from an earlier save (the PUT
 * removes it in the same transaction as the rows it supersedes).
 */
export function isDenyAllMarker(scope: DivisionScope | null | undefined): boolean {
  return Boolean(scope?.scopeLevel === 'NONE');
}

/** Division ids the user is explicitly restricted to (server rows, not UI state). */
export function restrictedDivisionIds(scopes: DivisionScope[] | null | undefined): string[] {
  if (!Array.isArray(scopes)) return [];
  return scopes
    .filter((s) => s && s.status !== 'INACTIVE' && isDivisionRestriction(s) && s.divisionId)
    .map((s) => s.divisionId as string);
}

export interface DivisionScopeTagsProps {
  scopes: DivisionScope[];
  loading?: boolean;
  /** Rendered by the modal only — the read-only summaries never offer removal. */
  onRemove?: (scopeId: string) => void;
  style?: React.CSSProperties;
  /**
   * PROMPT #26 — override for the empty state.
   *
   * The default wording ("…has full company access") is only true when the
   * server says the user is unrestricted. A deliberately denied account has an
   * empty division list too, so the modal passes its own copy derived from
   * `GET /admin/users/:id/division-access` rather than asserting a lie.
   */
  emptyDescription?: React.ReactNode;
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
export function DivisionScopeTags({ scopes, loading, onRemove, style, emptyDescription }: DivisionScopeTagsProps) {
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
          description={
            emptyDescription ?? 'No division restriction — this user currently has full company access'
          }
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
  /**
   * PROMPT #26 — declarative save. `PUT /admin/users/:id/division-access`
   * reconciles the exact division set AND removes the contradictory
   * company-wide row in one transaction. Resolves `true` only when persisted.
   */
  onSaveAccess?: (values: {
    companyId: string;
    divisionIds: string[];
    companyWide: boolean;
  }) => boolean | Promise<boolean>;
  /** Server-computed effective access; `null` until it has been fetched. */
  effectiveAccess?: EffectiveDivisionAccess | null;
  /**
   * PROMPT #26 — the UNFILTERED `user_organization_scopes` rows.
   *
   * `scopes` is the restriction-only list the tag list renders. The
   * contradictory company-wide row is filtered out of it by design, which is
   * precisely why the incident was invisible. Conflict detection therefore has
   * to run against the raw rows, and this is where they come from.
   * Falls back to `scopes` when a caller has nothing better to offer.
   */
  rawScopes?: DivisionScope[] | null;
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
  onSaveAccess,
  effectiveAccess,
  rawScopes,
  onClose,
}) => {
  const [form] = Form.useForm();
  const [saveForm] = Form.useForm();
  const defaultCompanyId = user?.defaultCompanyId || companies[0]?.id;
  // §12 — Company → Division dependency: the division picker only ever offers
  // divisions that belong to the company currently selected in the form.
  const watchedCompanyId = Form.useWatch('companyId', form) as string | undefined;
  const watchedSaveCompanyId = Form.useWatch('companyId', saveForm) as string | undefined;
  const watchedCompanyWide = Form.useWatch('companyWide', saveForm) as boolean | undefined;

  // PROMPT #26 — the contradiction check must see the RAW rows: the tag list
  // `scopes` is filtered to restrictions only, so the company-wide row that
  // caused the incident is exactly what it does NOT contain.
  const conflict = useMemo(
    () => hasCompanyWideConflict(rawScopes ?? scopes),
    [rawScopes, scopes],
  );

  // PROMPT #26 — the server snapshot the Save form was last seeded from.
  // Guards the re-seed effect below against re-running on every render of the
  // scope list; see the long comment there for why that matters.
  const seededSignatureRef = React.useRef<string | null>(null);

  // Seed the company picker from the user's own default company every time a
  // (different) user's modal is opened — exactly like the inline version did.
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (defaultCompanyId) form.setFieldValue('companyId', defaultCompanyId);
    saveForm.resetFields();
    if (defaultCompanyId) saveForm.setFieldValue('companyId', defaultCompanyId);
    // Two users can carry byte-identical scope rows, so the signature alone
    // would not detect the switch and the fresh form would stay empty.
    seededSignatureRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  /**
   * PROMPT #26 — seed the Save form from the SERVER state.
   *
   * `GET /admin/users/:id` resolves AFTER the modal is already open, so seeding
   * on open alone produced an EMPTY desired set: pressing "Save Changes" would
   * have wiped every division the user actually had. The form therefore
   * re-seeds whenever the server snapshot changes.
   *
   * Two things this must NOT do, both of which silently escalated access:
   *
   *  1. Re-seed on every render of the scope list. Removing the last division
   *     with the per-row ✕ re-reads the rows as `[]`, and an empty list used to
   *     be interpreted as "nothing configured ⇒ unrestricted" — so the pending
   *     save flipped to *grant every division* right after the admin revoked
   *     the only one. `serverSignature` below makes the refresh explicit.
   *  2. Guess "unrestricted" from an empty row list. That guess is the
   *     contradiction this whole prompt exists to remove, so once the
   *     server-authoritative answer has arrived, `companyWide` comes from
   *     `effectiveAccess.unrestricted` and never from the row count.
   */
  const serverDivisionIds = restrictedDivisionIds(scopes);
  const serverSignature = JSON.stringify({
    companyId: defaultCompanyId ?? null,
    divisionIds: serverDivisionIds,
    unrestricted: effectiveAccess == null ? null : effectiveAccess.unrestricted,
    conflict: hasCompanyWideConflict(rawScopes ?? scopes),
  });

  useEffect(() => {
    if (!open) {
      seededSignatureRef.current = null;
      return;
    }
    if (!defaultCompanyId) return;
    if (seededSignatureRef.current === serverSignature) return;
    seededSignatureRef.current = serverSignature;
    // The admin's own pending edits always win over a server refresh.
    if (saveForm.isFieldsTouched()) return;
    saveForm.setFieldValue('companyId', defaultCompanyId);
    saveForm.setFieldValue(
      'companyWide',
      // Server answer when we have one; row-derived fallback only while
      // `GET /admin/users/:id/division-access` is still in flight.
      effectiveAccess == null
        ? !hasCompanyWideConflict(rawScopes ?? scopes) && serverDivisionIds.length === 0
        : effectiveAccess.unrestricted,
    );
    saveForm.setFieldValue('divisionIds', serverDivisionIds);
    // `companies` may refetch while the modal is open; that must not re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id, serverSignature]);

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

  const handleSaveAccess = async () => {
    if (!onSaveAccess) return;
    let values: { companyId?: string; divisionIds?: string[]; companyWide?: boolean };
    try {
      values = await saveForm.validateFields();
    } catch {
      return;
    }
    if (!values.companyId) return;
    const saved = await onSaveAccess({
      companyId: values.companyId,
      divisionIds: values.companyWide ? [] : values.divisionIds ?? [],
      companyWide: values.companyWide === true,
    });
    if (saved) {
      message.success('Division access saved');
    }
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
      width={620}
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

      {/*
        PROMPT #26 — the contradiction is the whole reason this popup lied.
        Before the fix, the company-wide row was filtered out of the list below
        and the API silently treated it as "grant everything", so the popup said
        "DIV-CCD only" while the user received every division. Stating the
        conflict out loud is what stops an admin from trusting a wrong summary.
      */}
      {conflict ? (
        <Alert
          data-testid="division-access-conflict"
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 14 }}
          message="Conflicting scope rows on this account"
          description={
            <span>
              This user has a company-wide default scope <em>and</em> an explicit division scope at the
              same time. Historically the API treated the company-wide row as "no restriction", so the
              user received access to <strong>every</strong> division even though only the divisions listed
              below were configured. Saving below removes the contradictory row and persists exactly the
              set you choose.
            </span>
          }
        />
      ) : null}

      <Typography.Text strong>Current division access</Typography.Text>
      <DivisionScopeTags
        scopes={scopes}
        loading={loading}
        onRemove={onRemove}
        // PROMPT #26 — an empty tag list is ambiguous on its own: it means
        // either "nothing configured ⇒ unrestricted" or "denied on purpose".
        // The server-authoritative block below is what tells them apart, so the
        // empty state defers to it instead of asserting full access.
        emptyDescription={
          effectiveAccess != null && !effectiveAccess.unrestricted && effectiveAccess.divisionIds.length === 0
            ? 'No division rows — this user is denied access to every division'
            : undefined
        }
      />

      {/*
        PROMPT #26 — what the server will ACTUALLY enforce, straight from the
        backend. Never derived on the client.
      */}
      <Typography.Text strong>Effective access (server)</Typography.Text>
      <div data-testid="division-access-effective" style={{ margin: '8px 0 16px', minHeight: 32 }}>
        {effectiveAccess == null ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            <Spin size="small" /> Loading what this user can actually reach…
          </Text>
        ) : effectiveAccess.unrestricted ? (
          <Tag color="gold" data-testid="division-access-effective-unrestricted">
            Unrestricted — every active division
          </Tag>
        ) : effectiveAccess.divisionIds.length === 0 ? (
          <Tag color="red" data-testid="division-access-effective-none">
            No division access — the API rejects every division for this user
          </Tag>
        ) : (
          <Space size={[6, 8]} wrap>
            {effectiveAccess.divisionIds.map((id) => {
              const master = effectiveAccess.accessibleDivisions?.find((d) => d.id === id);
              return (
                <Tag key={id} color="blue" data-testid="division-access-effective-item">
                  {master?.divisionCode
                    ? `${master.divisionCode} · ${master.name ?? ''}`.trim()
                    : id}
                </Tag>
              );
            })}
          </Space>
        )}
      </div>

      {onSaveAccess ? (
        <>
          <Divider orientation="left" style={{ fontSize: 13, margin: '4px 0 12px' }}>
            Save division access
          </Divider>
          <Form form={saveForm} layout="vertical" data-testid="division-access-save-form">
            <Row gutter={10}>
              <Col xs={24} sm={10}>
                <Form.Item
                  name="companyId"
                  label="Company"
                  rules={[{ required: true, message: 'Select a company' }]}
                >
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
                <Form.Item
                  name="companyWide"
                  label="Unrestricted (no division restriction)"
                  valuePropName="checked"
                >
                  <Switch
                    data-testid="division-access-company-wide"
                    checkedChildren="All divisions"
                    unCheckedChildren="Restricted"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="divisionIds"
              label="Divisions this user may access"
              tooltip="Saving replaces the current set: anything removed here loses access, anything added gains it."
            >
              <DivisionSelect
                mode="multiple"
                // Distinct wording from the quick-grant picker's placeholder so
                // the two controls are never ambiguous.
                placeholder="Select divisions"
                showCode
                disabled={watchedCompanyWide === true}
                companyId={watchedSaveCompanyId || defaultCompanyId}
              />
            </Form.Item>
            <Button
              type="primary"
              block
              icon={<SaveOutlined />}
              data-testid="division-access-save"
              loading={loading}
              onClick={handleSaveAccess}
            >
              Save Changes
            </Button>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              Saving removes any company-wide default row so it can no longer override the set above.
              Use the switch to grant unrestricted access instead.
            </Text>
          </Form>
        </>
      ) : null}

      <Divider orientation="left" style={{ fontSize: 13, margin: '16px 0 12px' }}>
        Quick grant (single division)
      </Divider>
      <Form form={form} layout="vertical">
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
