import React, { useState } from 'react';
import {
  Card,
  Input,
  Select,
  Switch,
  Button,
  Tag,
  Space,
  Tooltip,
  Divider,
  theme,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ApartmentOutlined,
  DeploymentUnitOutlined,
  ReloadOutlined,
  DownOutlined,
  RightOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import {
  DEPARTMENT_SCENE_CATALOG,
  DepartmentSceneKey,
  DepartmentStage,
  DivisionFlowLayout,
  DivisionLifecycleConfig,
  SCENE_PRESET_MAP,
  WelcomePortalConfig,
  formatDivisionFlowSummary,
  getDefaultDivisionLifecycles,
  getDefaultStrandingConfig,
  inferSceneKeyFromDepartmentName,
} from '../../config/companyWelcomeConfig';

interface Props {
  value: WelcomePortalConfig;
  onChange: (next: WelcomePortalConfig) => void;
}

const FLOW_LAYOUT_OPTIONS: { value: DivisionFlowLayout; label: string }[] = [
  {
    value: 'sequential',
    label: 'Sequential Department Flow (Stage 1 → Stage 2 → Dispatch)',
  },
  {
    value: 'wire_and_stranding',
    label: 'Wire Drawing Cycle + Stranding Bundle Convergence Flow',
  },
  {
    value: 'stranding',
    label: 'Stranding Multi-Wire Convergence Flow Only',
  },
];

const PULSE_SPEED_OPTIONS = [
  { value: 1800, label: 'Fast (1.8s per department scene)' },
  { value: 2600, label: 'Balanced (2.6s per department scene)' },
  { value: 3800, label: 'Cinematic (3.8s per department scene)' },
];

const SCENE_SELECT_OPTIONS = DEPARTMENT_SCENE_CATALOG.map((preset) => ({
  value: preset.key,
  label: `3D Scene: ${preset.label}`,
}));

export const WelcomeDivisionSettings: React.FC<Props> = ({ value, onChange }) => {
  const { token } = theme.useToken();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const first = value.divisions[0]?.id;
    return first ? { [first]: true } : {};
  });
  const [newDeptInputs, setNewDeptInputs] = useState<Record<string, string>>({});
  const [newStrandInputs, setNewStrandInputs] = useState<Record<string, string>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateDivisions = (nextDivisions: DivisionLifecycleConfig[]) => {
    onChange({
      ...value,
      divisions: nextDivisions,
    });
  };

  const handleAddDivision = () => {
    const nextNum = value.divisions.length + 1;
    const newId = `div-custom-${Date.now()}-${nextNum}`;
    const newDiv: DivisionLifecycleConfig = {
      id: newId,
      code: `DIV-0${nextNum}`,
      name: `Division ${nextNum}`,
      subtitle: 'Automated manufacturing, processing, packing, and dispatch lifecycle.',
      flowLayout: 'sequential',
      enabled: true,
      departments: [
        {
          id: `${newId}-1`,
          name: 'Raw Material',
          sceneKey: 'raw_material',
          backgroundUrl: SCENE_PRESET_MAP.raw_material.imageUrl,
        },
        {
          id: `${newId}-2`,
          name: 'Processing Department',
          sceneKey: 'wire_drawing',
          backgroundUrl: SCENE_PRESET_MAP.wire_drawing.imageUrl,
        },
        {
          id: `${newId}-3`,
          name: 'Packing Department',
          sceneKey: 'packing_dispatch',
          backgroundUrl: SCENE_PRESET_MAP.packing_dispatch.imageUrl,
        },
        {
          id: `${newId}-4`,
          name: 'Dispatch Department',
          sceneKey: 'global_earth',
          backgroundUrl: SCENE_PRESET_MAP.global_earth.imageUrl,
        },
      ],
    };
    setExpandedIds((prev) => ({ ...prev, [newId]: true }));
    updateDivisions([...value.divisions, newDiv]);
  };

  const handleRemoveDivision = (divisionId: string) => {
    updateDivisions(value.divisions.filter((d) => d.id !== divisionId));
  };

  const handleMoveDivision = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.divisions.length) return;
    const copy = [...value.divisions];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    updateDivisions(copy);
  };

  const handlePatchDivision = (
    divisionId: string,
    patch: Partial<DivisionLifecycleConfig>,
  ) => {
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        const next: DivisionLifecycleConfig = { ...div, ...patch };
        if (
          (next.flowLayout === 'stranding' ||
            next.flowLayout === 'wire_and_stranding') &&
          !next.stranding
        ) {
          next.stranding = getDefaultStrandingConfig();
        }
        return next;
      }),
    );
  };

  const handleAddDepartment = (divisionId: string) => {
    const rawName = (newDeptInputs[divisionId] || '').trim();
    if (!rawName) return;
    const autoScene = inferSceneKeyFromDepartmentName(rawName);
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        const nextStage: DepartmentStage = {
          id: `${divisionId}-dept-${Date.now()}-${div.departments.length + 1}`,
          name: rawName,
          sceneKey: autoScene,
          backgroundUrl: SCENE_PRESET_MAP[autoScene].imageUrl,
        };
        return {
          ...div,
          departments: [...div.departments, nextStage],
        };
      }),
    );
    setNewDeptInputs((prev) => ({ ...prev, [divisionId]: '' }));
  };

  const handleRenameDepartment = (
    divisionId: string,
    deptId: string,
    name: string,
  ) => {
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        return {
          ...div,
          departments: div.departments.map((d) =>
            d.id === deptId ? { ...d, name } : d,
          ),
        };
      }),
    );
  };

  const handleChangeDepartmentScene = (
    divisionId: string,
    deptId: string,
    sceneKey: DepartmentSceneKey,
  ) => {
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        return {
          ...div,
          departments: div.departments.map((d) =>
            d.id === deptId
              ? {
                  ...d,
                  sceneKey,
                  backgroundUrl: SCENE_PRESET_MAP[sceneKey].imageUrl,
                }
              : d,
          ),
        };
      }),
    );
  };

  const handleRemoveDepartment = (divisionId: string, deptId: string) => {
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        return {
          ...div,
          departments: div.departments.filter((d) => d.id !== deptId),
        };
      }),
    );
  };

  const handleMoveDepartment = (
    divisionId: string,
    deptIndex: number,
    direction: -1 | 1,
  ) => {
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        const target = deptIndex + direction;
        if (target < 0 || target >= div.departments.length) return div;
        const copy = [...div.departments];
        const [moved] = copy.splice(deptIndex, 1);
        copy.splice(target, 0, moved);
        return { ...div, departments: copy };
      }),
    );
  };

  const handleAddStrand = (divisionId: string) => {
    const strandName = (newStrandInputs[divisionId] || '').trim();
    if (!strandName) return;
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        const base = div.stranding || getDefaultStrandingConfig();
        return {
          ...div,
          stranding: {
            ...base,
            inputStrands: [...base.inputStrands, strandName],
          },
        };
      }),
    );
    setNewStrandInputs((prev) => ({ ...prev, [divisionId]: '' }));
  };

  const handleUpdateStrand = (
    divisionId: string,
    strandIdx: number,
    text: string,
  ) => {
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        const base = div.stranding || getDefaultStrandingConfig();
        const nextStrands = base.inputStrands.map((s, idx) =>
          idx === strandIdx ? text : s,
        );
        return {
          ...div,
          stranding: { ...base, inputStrands: nextStrands },
        };
      }),
    );
  };

  const handleRemoveStrand = (divisionId: string, strandIdx: number) => {
    updateDivisions(
      value.divisions.map((div) => {
        if (div.id !== divisionId) return div;
        const base = div.stranding || getDefaultStrandingConfig();
        if (base.inputStrands.length <= 1) return div;
        return {
          ...div,
          stranding: {
            ...base,
            inputStrands: base.inputStrands.filter((_, idx) => idx !== strandIdx),
          },
        };
      }),
    );
  };

  const activeCount = value.divisions.filter((d) => d.enabled).length;

  return (
    <Card
      data-testid="welcome-divisions-settings"
      style={{
        marginTop: 8,
        borderColor: token.colorBorderSecondary,
        borderRadius: 12,
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Space align="center" size={10} wrap>
            <ApartmentOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: token.colorText,
              }}
            >
              Welcome Screen &amp; Division Lifecycles
            </span>
            <Tag color="processing">
              {activeCount} of {value.divisions.length} Active on Welcome Page
            </Tag>
          </Space>
          <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
            Centralized configuration for all company divisions, department flows, and
            synchronized 3D holographic background scenes. Adding a 5th or 6th division
            updates the Welcome screen automatically upon saving.
          </span>
        </div>

        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() =>
              onChange({
                ...value,
                divisions: getDefaultDivisionLifecycles(),
              })
            }
            data-testid="reset-welcome-divisions-btn"
          >
            Reset Default Lifecycles
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddDivision}
            data-testid="add-welcome-division-btn"
          >
            Add Division
          </Button>
        </Space>
      </div>

      {/* Global Welcome Portal Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          padding: 14,
          borderRadius: 10,
          background: token.colorFillAlter,
          border: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: token.colorTextSecondary,
            }}
          >
            Welcome Portal Subtitle
          </label>
          <Input
            value={value.portalTagline}
            onChange={(e) =>
              onChange({ ...value, portalTagline: e.target.value })
            }
            placeholder="Enterprise Manufacturing & ERP System"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: token.colorTextSecondary,
            }}
          >
            Synchronized Scene Transition Speed
          </label>
          <Select
            value={value.stagePulseIntervalMs}
            onChange={(ms) =>
              onChange({ ...value, stagePulseIntervalMs: ms })
            }
            options={PULSE_SPEED_OPTIONS}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingTop: 18,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: token.colorText,
            }}
          >
            Auto-Advance Departments &amp; Backgrounds
          </span>
          <Switch
            checked={value.autoCycleDivisions}
            onChange={(checked) =>
              onChange({ ...value, autoCycleDivisions: checked })
            }
          />
        </div>
      </div>

      {/* Division Lifecycle Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {value.divisions.map((div, idx) => {
          const isExpanded = Boolean(expandedIds[div.id]);
          const showSequentialEditor =
            div.flowLayout === 'sequential' ||
            div.flowLayout === 'wire_and_stranding';
          const showStrandingEditor =
            div.flowLayout === 'stranding' ||
            div.flowLayout === 'wire_and_stranding';

          return (
            <div
              key={div.id}
              data-testid={`division-config-card-${div.id}`}
              style={{
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 10,
                background: token.colorBgContainer,
                overflow: 'hidden',
              }}
            >
              {/* Division Summary Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                  padding: '12px 16px',
                  background: token.colorFillAlter,
                  borderBottom: isExpanded
                    ? `1px solid ${token.colorBorderSecondary}`
                    : 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    flex: 1,
                    minWidth: 220,
                  }}
                  onClick={() => toggleExpand(div.id)}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={isExpanded ? <DownOutlined /> : <RightOutlined />}
                    aria-label={
                      isExpanded ? `Collapse ${div.name}` : `Expand ${div.name}`
                    }
                  />
                  <Tag color="default" style={{ margin: 0, fontWeight: 700 }}>
                    {String(idx + 1).padStart(2, '0')}
                  </Tag>
                  <Tag color="blue" style={{ margin: 0, fontWeight: 700 }}>
                    {div.code}
                  </Tag>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 14.5,
                      color: token.colorText,
                    }}
                  >
                    {div.name}
                  </span>
                  <Tag
                    color={
                      div.flowLayout === 'sequential' ? 'cyan' : 'geekblue'
                    }
                    style={{ margin: 0 }}
                  >
                    {div.flowLayout === 'wire_and_stranding'
                      ? 'Wire Drawing + Stranding'
                      : div.flowLayout === 'stranding'
                        ? 'Stranding Flow'
                        : `${div.departments.length} Departments`}
                  </Tag>
                </div>

                <Space size={6} wrap>
                  <Tooltip title="Show on Welcome Page">
                    <Switch
                      size="small"
                      checked={div.enabled}
                      onChange={(checked) =>
                        handlePatchDivision(div.id, { enabled: checked })
                      }
                    />
                  </Tooltip>
                  <Tooltip title="Move Up">
                    <Button
                      size="small"
                      icon={<ArrowUpOutlined />}
                      disabled={idx === 0}
                      onClick={() => handleMoveDivision(idx, -1)}
                      aria-label={`Move ${div.name} up`}
                    />
                  </Tooltip>
                  <Tooltip title="Move Down">
                    <Button
                      size="small"
                      icon={<ArrowDownOutlined />}
                      disabled={idx === value.divisions.length - 1}
                      onClick={() => handleMoveDivision(idx, 1)}
                      aria-label={`Move ${div.name} down`}
                    />
                  </Tooltip>
                  <Tooltip title="Remove Division">
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveDivision(div.id)}
                      aria-label={`Remove ${div.name}`}
                    />
                  </Tooltip>
                </Space>
              </div>

              {/* Live Flow Summary Strip */}
              <div
                style={{
                  padding: '8px 16px',
                  fontSize: 12,
                  color: token.colorTextSecondary,
                  borderBottom: isExpanded
                    ? `1px dashed ${token.colorBorderSecondary}`
                    : 'none',
                }}
              >
                <strong style={{ color: token.colorText }}>Flow: </strong>
                {formatDivisionFlowSummary(div)}
              </div>

              {/* Expanded Division & Department Flow Editor */}
              {isExpanded && (
                <div
                  style={{
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  {/* Division Metadata Fields */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 12,
                          fontWeight: 600,
                          color: token.colorTextSecondary,
                          marginBottom: 4,
                        }}
                      >
                        Division Name
                      </label>
                      <Input
                        value={div.name}
                        onChange={(e) =>
                          handlePatchDivision(div.id, { name: e.target.value })
                        }
                        placeholder="e.g. Spoke Division"
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 12,
                          fontWeight: 600,
                          color: token.colorTextSecondary,
                          marginBottom: 4,
                        }}
                      >
                        Division Code
                      </label>
                      <Input
                        value={div.code}
                        onChange={(e) =>
                          handlePatchDivision(div.id, { code: e.target.value })
                        }
                        placeholder="e.g. DIV-SPD"
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 12,
                          fontWeight: 600,
                          color: token.colorTextSecondary,
                          marginBottom: 4,
                        }}
                      >
                        Lifecycle Flow Layout
                      </label>
                      <Select
                        style={{ width: '100%' }}
                        value={div.flowLayout}
                        onChange={(layout) =>
                          handlePatchDivision(div.id, { flowLayout: layout })
                        }
                        options={FLOW_LAYOUT_OPTIONS}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        color: token.colorTextSecondary,
                        marginBottom: 4,
                      }}
                    >
                      Division Operational Summary
                    </label>
                    <Input
                      value={div.subtitle}
                      onChange={(e) =>
                        handlePatchDivision(div.id, {
                          subtitle: e.target.value,
                        })
                      }
                      placeholder="Short operational description displayed on Welcome screen"
                    />
                  </div>

                  {/* Sequential Department Stages + Mapped 3D Background Scene Editor */}
                  {showSequentialEditor && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        background: token.colorFillAlter,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <Space
                        align="center"
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: token.colorText,
                          marginBottom: 10,
                        }}
                      >
                        <PictureOutlined style={{ color: token.colorPrimary }} />
                        <span>
                          Sequential Department Flow &amp; Synchronized Background
                          Scenes ({div.departments.length} Stages)
                        </span>
                      </Space>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        {div.departments.map((dept, dIdx) => {
                          const effectiveScene =
                            dept.sceneKey ||
                            inferSceneKeyFromDepartmentName(dept.name);
                          return (
                            <div
                              key={dept.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 8,
                              }}
                            >
                              <Tag
                                color="processing"
                                style={{
                                  margin: 0,
                                  minWidth: 32,
                                  textAlign: 'center',
                                }}
                              >
                                {String(dIdx + 1).padStart(2, '0')}
                              </Tag>
                              <Input
                                style={{ flex: '1 1 200px' }}
                                value={dept.name}
                                onChange={(e) =>
                                  handleRenameDepartment(
                                    div.id,
                                    dept.id,
                                    e.target.value,
                                  )
                                }
                                aria-label={`${div.name} Stage ${dIdx + 1}`}
                              />
                              <Select
                                style={{ flex: '1 1 240px', minWidth: 220 }}
                                value={effectiveScene}
                                onChange={(sceneKey) =>
                                  handleChangeDepartmentScene(
                                    div.id,
                                    dept.id,
                                    sceneKey,
                                  )
                                }
                                options={SCENE_SELECT_OPTIONS}
                                aria-label={`${dept.name} background scene`}
                              />
                              <Button
                                size="small"
                                icon={<ArrowUpOutlined />}
                                disabled={dIdx === 0}
                                onClick={() =>
                                  handleMoveDepartment(div.id, dIdx, -1)
                                }
                                aria-label={`Move ${dept.name} earlier`}
                              />
                              <Button
                                size="small"
                                icon={<ArrowDownOutlined />}
                                disabled={dIdx === div.departments.length - 1}
                                onClick={() =>
                                  handleMoveDepartment(div.id, dIdx, 1)
                                }
                                aria-label={`Move ${dept.name} later`}
                              />
                              <Button
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                  handleRemoveDepartment(div.id, dept.id)
                                }
                                aria-label={`Remove ${dept.name}`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <Input
                          placeholder="Add new department stage (automatically maps matching 3D scene)"
                          value={newDeptInputs[div.id] || ''}
                          onChange={(e) =>
                            setNewDeptInputs((prev) => ({
                              ...prev,
                              [div.id]: e.target.value,
                            }))
                          }
                          onPressEnter={() => handleAddDepartment(div.id)}
                        />
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() => handleAddDepartment(div.id)}
                        >
                          Add Department
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Stranding Convergence Flow Editor */}
                  {showStrandingEditor && div.stranding && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        background: token.colorFillAlter,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <Space
                        align="center"
                        style={{ marginBottom: 10, fontWeight: 700, fontSize: 13 }}
                      >
                        <DeploymentUnitOutlined
                          style={{ color: token.colorPrimary }}
                        />
                        <span style={{ color: token.colorText }}>
                          Stranding Process Flow (Multi-Strand Bundle Convergence)
                        </span>
                      </Space>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          marginBottom: 12,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: token.colorTextSecondary,
                          }}
                        >
                          Converging Raw / Drawn Wire Strands
                        </span>
                        {div.stranding.inputStrands.map((strand, sIdx) => (
                          <div
                            key={sIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <Tag style={{ margin: 0 }}>S{sIdx + 1}</Tag>
                            <Input
                              value={strand}
                              onChange={(e) =>
                                handleUpdateStrand(div.id, sIdx, e.target.value)
                              }
                            />
                            <Button
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              disabled={div.stranding!.inputStrands.length <= 1}
                              onClick={() => handleRemoveStrand(div.id, sIdx)}
                            />
                          </div>
                        ))}

                        <div style={{ display: 'flex', gap: 8 }}>
                          <Input
                            placeholder="Add input wire strand (e.g. Raw Wire Strand 4)"
                            value={newStrandInputs[div.id] || ''}
                            onChange={(e) =>
                              setNewStrandInputs((prev) => ({
                                ...prev,
                                [div.id]: e.target.value,
                              }))
                            }
                            onPressEnter={() => handleAddStrand(div.id)}
                          />
                          <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => handleAddStrand(div.id)}
                          >
                            Add Strand
                          </Button>
                        </div>
                      </div>

                      <Divider style={{ margin: '10px 0' }} />

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(190px, 1fr))',
                          gap: 12,
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 600,
                              color: token.colorTextSecondary,
                              marginBottom: 4,
                            }}
                          >
                            Stranding Department
                          </label>
                          <Input
                            value={div.stranding.strandingDepartment}
                            onChange={(e) =>
                              handlePatchDivision(div.id, {
                                stranding: {
                                  ...div.stranding!,
                                  strandingDepartment: e.target.value,
                                },
                              })
                            }
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 600,
                              color: token.colorTextSecondary,
                              marginBottom: 4,
                            }}
                          >
                            Combined Bundle Output
                          </label>
                          <Input
                            value={div.stranding.bundleOutput}
                            onChange={(e) =>
                              handlePatchDivision(div.id, {
                                stranding: {
                                  ...div.stranding!,
                                  bundleOutput: e.target.value,
                                },
                              })
                            }
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 600,
                              color: token.colorTextSecondary,
                              marginBottom: 4,
                            }}
                          >
                            Final Stage / Dispatch
                          </label>
                          <Input
                            value={div.stranding.finalStage}
                            onChange={(e) =>
                              handlePatchDivision(div.id, {
                                stranding: {
                                  ...div.stranding!,
                                  finalStage: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default WelcomeDivisionSettings;
