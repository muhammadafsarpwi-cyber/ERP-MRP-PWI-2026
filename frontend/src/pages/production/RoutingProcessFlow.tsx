import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Button, Space, Tag, Modal, Form, Select, Input, App, Typography,
  Drawer, Descriptions, Popconfirm, Tooltip, Empty, Spin, Alert,
} from 'antd';
import {
  ZoomInOutlined, ZoomOutOutlined, ReloadOutlined, PlusOutlined,
  DeleteOutlined, NodeIndexOutlined, CheckCircleOutlined,
  BranchesOutlined, MergeCellsOutlined, EyeOutlined, CompressOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import apiService, { describeRequestError } from '../../services/api';
import { Routing, RoutingOperation } from './OperationEditor';
import { formatDecimal, toNum } from '../../utils/numberFormat';
import './routingProcessFlow.css';

const { Title, Text } = Typography;

export interface RoutingConnection {
  id: string;
  routingId: string;
  fromOperationId: string;
  toOperationId: string;
  connectionType: 'SEQUENTIAL' | 'BRANCH' | 'MERGE' | 'ASSEMBLY' | 'PACKING' | 'OUTPUT';
  branchLabel?: string | null;
  orderIndex?: number;
  status?: string;
  isSynthetic?: boolean;
}

export interface RoutingGraphNode extends RoutingOperation {
  inDegree: number;
  outDegree: number;
  isBranch: boolean;
  isMerge: boolean;
  predecessorIds: string[];
  successorIds: string[];
  yieldPercentage?: number | string | null;
}

export interface RoutingGraphData {
  routingId: string;
  routingCode: string;
  routingName: string;
  status: string;
  nodes: RoutingGraphNode[];
  edges: RoutingConnection[];
}

interface RoutingProcessFlowProps {
  routing: Routing;
  onRefreshRouting?: () => void;
  onEditOperation?: (op: RoutingOperation) => void;
}

export const RoutingProcessFlow: React.FC<RoutingProcessFlowProps> = ({
  routing,
  onRefreshRouting,
  onEditOperation,
}) => {
  const { message } = App.useApp();
  const [graphData, setGraphData] = useState<RoutingGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Selected node for details drawer
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Modal to add new connection
  const [connectionModalVisible, setConnectionModalVisible] = useState(false);
  const [connectionForm] = Form.useForm();
  const [connectionSaving, setConnectionSaving] = useState(false);

  // Fetch graph data from backend
  const fetchGraph = useCallback(async () => {
    if (!routing?.id) return;
    setLoading(true);
    try {
      const res = await apiService.get<any>(
        `/production/routings/${routing.id}/graph`,
      );
      const graph = (res && res.data && Array.isArray(res.data.nodes))
        ? res.data
        : (res && Array.isArray(res.nodes) ? res : (res?.data || null));
      setGraphData(graph);
    } catch (err) {
      message.error(describeRequestError(err) || 'Failed to load routing process flow');
    } finally {
      setLoading(false);
    }
  }, [routing?.id, message]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Layout calculations: arrange nodes into topological levels
  const { levels, nodePositions, edgesWithCoords } = useMemo(() => {
    if (!graphData || !Array.isArray(graphData.nodes) || !graphData.nodes.length) {
      return { levels: [], nodePositions: new Map<string, { x: number; y: number }>(), edgesWithCoords: [] };
    }

    const nodeMap = new Map<string, RoutingGraphNode>();
    graphData.nodes.forEach((n) => nodeMap.set(n.id, n));

    const edges = Array.isArray(graphData.edges) ? graphData.edges : [];

    // Build adjacency list for forward edges
    const forwardAdj = new Map<string, string[]>();
    const inDegreeMap = new Map<string, number>();

    graphData.nodes.forEach((n) => {
      forwardAdj.set(n.id, []);
      inDegreeMap.set(n.id, 0);
    });

    edges.forEach((e) => {
      if (forwardAdj.has(e.fromOperationId) && nodeMap.has(e.toOperationId)) {
        forwardAdj.get(e.fromOperationId)!.push(e.toOperationId);
        inDegreeMap.set(e.toOperationId, (inDegreeMap.get(e.toOperationId) || 0) + 1);
      }
    });

    // Compute topological ranks (levels)
    const levelMap = new Map<string, number>();
    // Roots are nodes with inDegree === 0
    const queue: { id: string; lvl: number }[] = [];
    graphData.nodes.forEach((n) => {
      if ((inDegreeMap.get(n.id) || 0) === 0) {
        queue.push({ id: n.id, lvl: 0 });
        levelMap.set(n.id, 0);
      }
    });

    // If graph has disconnected components or cycle fallback, seed unvisited
    while (queue.length > 0) {
      const { id, lvl } = queue.shift()!;
      const successors = forwardAdj.get(id) || [];
      for (const nextId of successors) {
        const curNextLvl = levelMap.get(nextId) ?? -1;
        if (lvl + 1 > curNextLvl) {
          levelMap.set(nextId, lvl + 1);
          queue.push({ id: nextId, lvl: lvl + 1 });
        }
      }
    }

    // Assign fallback level by sequenceNo if not reachable
    graphData.nodes.forEach((n) => {
      if (!levelMap.has(n.id)) {
        levelMap.set(n.id, Math.floor(n.sequenceNo / 10));
      }
    });

    // Group nodes into level arrays
    const maxLevel = Math.max(...Array.from(levelMap.values()), 0);
    const levelGroups: RoutingGraphNode[][] = Array.from({ length: maxLevel + 1 }, () => []);

    graphData.nodes.forEach((n) => {
      const lvl = levelMap.get(n.id) || 0;
      levelGroups[lvl].push(n);
    });

    // Sort each level by sequenceNo
    levelGroups.forEach((group) => group.sort((a, b) => a.sequenceNo - b.sequenceNo));

    // Calculate approximate coordinates for SVG connectors
    const cardWidth = 270;
    const cardHeight = 180;
    const horizontalGap = 40;
    const verticalGap = 70;
    const paddingX = 60;
    const paddingTop = 40;

    const positions = new Map<string, { x: number; y: number }>();

    levelGroups.forEach((group, lvlIdx) => {
      const rowWidth = group.length * cardWidth + (group.length - 1) * horizontalGap;
      const startX = Math.max(paddingX, (1000 - rowWidth) / 2);
      const y = paddingTop + lvlIdx * (cardHeight + verticalGap);

      group.forEach((node, colIdx) => {
        const x = startX + colIdx * (cardWidth + horizontalGap);
        positions.set(node.id, { x, y });
      });
    });

    // Calculate coordinates for edges
    const computedEdges = edges.map((edge) => {
      const fromPos = positions.get(edge.fromOperationId);
      const toPos = positions.get(edge.toOperationId);
      if (!fromPos || !toPos) return null;

      const fromPoint = {
        x: fromPos.x + cardWidth / 2,
        y: fromPos.y + cardHeight,
      };
      const toPoint = {
        x: toPos.x + cardWidth / 2,
        y: toPos.y,
      };

      // Curve control points
      const dy = Math.max(30, (toPoint.y - fromPoint.y) / 2);
      const pathD = `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x} ${fromPoint.y + dy}, ${toPoint.x} ${toPoint.y - dy}, ${toPoint.x} ${toPoint.y}`;

      const midX = (fromPoint.x + toPoint.x) / 2;
      const midY = (fromPoint.y + toPoint.y) / 2;

      return {
        ...edge,
        fromPoint,
        toPoint,
        pathD,
        midX,
        midY,
      };
    }).filter(Boolean);

    return {
      levels: levelGroups,
      nodePositions: positions,
      edgesWithCoords: computedEdges as any[],
    };
  }, [graphData]);

  // Selected node object
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !graphData) return null;
    return graphData.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graphData]);

  // Handle Zoom
  const handleZoomIn = () => setZoom((z) => Math.min(2.0, z + 0.15));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, z - 0.15));
  const handleZoomReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.routing-node-card') || (e.target as HTMLElement).closest('.ant-btn')) {
      return;
    }
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  // Connection Creation
  const handleOpenAddConnection = (preSelectedFromId?: string) => {
    connectionForm.resetFields();
    if (preSelectedFromId) {
      connectionForm.setFieldsValue({ fromOperationId: preSelectedFromId, connectionType: 'SEQUENTIAL' });
    } else if (selectedNodeId) {
      connectionForm.setFieldsValue({ fromOperationId: selectedNodeId, connectionType: 'SEQUENTIAL' });
    } else {
      connectionForm.setFieldsValue({ connectionType: 'SEQUENTIAL' });
    }
    setConnectionModalVisible(true);
  };

  const handleSaveConnection = async () => {
    try {
      const vals = await connectionForm.validateFields();
      setConnectionSaving(true);
      await apiService.post(`/production/routings/${routing.id}/connections`, vals);
      message.success('Process connection created successfully');
      setConnectionModalVisible(false);
      await fetchGraph();
      if (onRefreshRouting) onRefreshRouting();
    } catch (err: any) {
      message.error(err?.response?.data?.message || describeRequestError(err) || 'Failed to create connection');
    } finally {
      setConnectionSaving(false);
    }
  };

  const handleDeleteConnection = async (connId: string) => {
    try {
      await apiService.delete(`/production/routings/${routing.id}/connections/${connId}`);
      message.success('Process connection removed');
      await fetchGraph();
      if (onRefreshRouting) onRefreshRouting();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to remove connection');
    }
  };

  const isDraft = routing.status === 'DRAFT';

  return (
    <div className="routing-flow-wrapper" data-testid="routing-process-flow">
      {/* ── Top Toolbar ── */}
      <div className="routing-flow-toolbar">
        <div className="routing-flow-toolbar-left">
          <Space>
            <Tooltip title="Zoom In"><Button icon={<ZoomInOutlined />} onClick={handleZoomIn} size="small" /></Tooltip>
            <Tooltip title="Zoom Out"><Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} size="small" /></Tooltip>
            <Tooltip title="Reset View"><Button icon={<CompressOutlined />} onClick={handleZoomReset} size="small">{(zoom * 100).toFixed(0)}%</Button></Tooltip>
            <Tooltip title="Refresh Flow Graph"><Button icon={<ReloadOutlined />} onClick={fetchGraph} size="small" loading={loading} /></Tooltip>
          </Space>

          <div className="routing-flow-legend" style={{ marginLeft: 16 }}>
            <div className="routing-flow-legend-item">
              <span className="routing-flow-legend-color" style={{ background: '#3b82f6' }}></span>
              <span>Sequential</span>
            </div>
            <div className="routing-flow-legend-item">
              <span className="routing-flow-legend-color" style={{ background: '#f59e0b' }}></span>
              <span>Branch (1 to Many)</span>
            </div>
            <div className="routing-flow-legend-item">
              <span className="routing-flow-legend-color" style={{ background: '#8b5cf6' }}></span>
              <span>Merge (Many to 1)</span>
            </div>
          </div>
        </div>

        <div className="routing-flow-toolbar-right">
          {isDraft && (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleOpenAddConnection()}
              style={{ fontWeight: 600 }}
            >
              Add Connection
            </Button>
          )}
        </div>
      </div>

      {/* ── Canvas Viewport ── */}
      <div
        className={`routing-flow-canvas-container ${isPanning ? 'panning' : ''}`}
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Spin spinning={loading}>
          {(!graphData || !Array.isArray(graphData.nodes) || graphData.nodes.length === 0) ? (
            <div className="routing-flow-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No operations defined in this routing yet. Add operations from the Operations List to view the process flow."
              />
            </div>
          ) : (
            <div
              className="routing-flow-stage"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              {/* ── SVG Connection Edges Layer ── */}
              <svg className="routing-flow-svg-layer" width="3000" height="2000">
                <defs>
                  <marker
                    id="arrow-sequential"
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#64748b" />
                  </marker>
                  <marker
                    id="arrow-branch"
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#f59e0b" />
                  </marker>
                  <marker
                    id="arrow-merge"
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#8b5cf6" />
                  </marker>
                </defs>

                {edgesWithCoords.map((edge: any) => {
                  let edgeClass = 'routing-flow-svg-edge';
                  let marker = 'url(#arrow-sequential)';

                  if (edge.connectionType === 'BRANCH') {
                    edgeClass += ' branch-edge';
                    marker = 'url(#arrow-branch)';
                  } else if (edge.connectionType === 'MERGE' || edge.connectionType === 'ASSEMBLY') {
                    edgeClass += ' merge-edge';
                    marker = 'url(#arrow-merge)';
                  }

                  return (
                    <g key={edge.id || `${edge.fromOperationId}-${edge.toOperationId}`}>
                      <path
                        d={edge.pathD}
                        className={edgeClass}
                        markerEnd={marker}
                      />
                      {edge.branchLabel && (
                        <g transform={`translate(${edge.midX}, ${edge.midY})`}>
                          <rect
                            x={-edge.branchLabel.length * 4 - 6}
                            y="-12"
                            width={edge.branchLabel.length * 8 + 12}
                            height="18"
                            rx="4"
                            fill="#ffffff"
                            stroke="#cbd5e1"
                            strokeWidth="1"
                          />
                          <text
                            textAnchor="middle"
                            y="1"
                            className="routing-flow-edge-label"
                            fill="#475569"
                          >
                            {edge.branchLabel}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* ── Levels and Operation Nodes ── */}
              <div className="routing-flow-levels">
                {levels.map((levelGroup, lvlIdx) => (
                  <div key={lvlIdx} className="routing-flow-level-row">
                    {levelGroup.map((node) => {
                      const isSelected = selectedNodeId === node.id;
                      const hasBranch = node.outDegree > 1;
                      const hasMerge = node.inDegree > 1;

                      let topologyClass = 'is-linear';
                      if (hasBranch) topologyClass = 'is-branch';
                      else if (hasMerge) topologyClass = 'is-merge';

                      // Determine primary input & output descriptions
                      const primaryInputs = node.inputs && node.inputs.length
                        ? node.inputs
                        : (node.inputItem ? [{
                            item: node.inputItem,
                            quantity: node.inputQuantity,
                            uom: node.uom,
                          }] : []);

                      const primaryOutputs = node.outputs && node.outputs.length
                        ? node.outputs
                        : (node.outputItem ? [{
                            item: node.outputItem,
                            quantity: node.outputQuantity,
                            uom: node.uom,
                          }] : []);

                      return (
                        <div
                          key={node.id}
                          className={`routing-node-card ${topologyClass} ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedNodeId(node.id);
                            setDrawerVisible(true);
                          }}
                        >
                          {/* Header */}
                          <div className="routing-node-header">
                            <span className="routing-node-seq">#{node.sequenceNo}</span>
                            <span className="routing-node-code" title={node.operationCode}>
                              {node.operationCode}
                            </span>
                            {node.yieldPercentage && toNum(node.yieldPercentage) < 100 && (
                              <Tag color="orange" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                                {formatDecimal(toNum(node.yieldPercentage))}%
                              </Tag>
                            )}
                          </div>

                          {/* Title */}
                          <div className="routing-node-title" title={node.operationName}>
                            {node.operationName}
                          </div>

                          {/* Meta: Dept & Machine */}
                          <div className="routing-node-meta">
                            <span className="routing-node-meta-item">
                              <strong>Dept:</strong> {node.department?.name || node.section?.name || 'Standard'}
                            </span>
                            {node.machine && (
                              <span className="routing-node-meta-item">
                                <strong>MC:</strong> {node.machine.machineCode}
                              </span>
                            )}
                          </div>

                          {/* Materials: Input / Output Chips */}
                          <div className="routing-node-materials">
                            {/* Inputs */}
                            {primaryInputs.slice(0, 2).map((inp: any, idx: number) => (
                              <div key={idx} className="routing-node-io-chip">
                                <span className="routing-node-io-badge in">IN</span>
                                <span className="routing-node-io-desc" title={inp.item ? `${inp.item.itemCode} - ${inp.item.name}` : inp.itemId}>
                                  {inp.item ? inp.item.itemCode : 'Input Item'}
                                </span>
                                <span className="routing-node-io-qty">
                                  {formatDecimal(toNum(inp.quantity))} {inp.uom?.code || ''}
                                </span>
                              </div>
                            ))}
                            {primaryInputs.length === 0 && (
                              <div className="routing-node-io-chip" style={{ color: '#94a3b8' }}>
                                <span className="routing-node-io-badge in">IN</span>
                                <span>No raw materials</span>
                              </div>
                            )}

                            {/* Outputs */}
                            {primaryOutputs.slice(0, 2).map((out: any, idx: number) => (
                              <div key={idx} className="routing-node-io-chip">
                                <span className="routing-node-io-badge out">OUT</span>
                                <span className="routing-node-io-desc" title={out.item ? `${out.item.itemCode} - ${out.item.name}` : out.itemId}>
                                  {out.item ? out.item.itemCode : 'Output Item'}
                                </span>
                                <span className="routing-node-io-qty out">
                                  {formatDecimal(toNum(out.quantity))} {out.uom?.code || ''}
                                </span>
                              </div>
                            ))}
                            {primaryOutputs.length === 0 && (
                              <div className="routing-node-io-chip" style={{ color: '#94a3b8' }}>
                                <span className="routing-node-io-badge out">OUT</span>
                                <span>Output configured in editor</span>
                              </div>
                            )}
                          </div>

                          {/* Branch / Merge Indicators */}
                          {(hasBranch || hasMerge) && (
                            <div className="routing-node-topology-indicators">
                              {hasBranch && (
                                <span className="routing-topology-tag branch">
                                  <BranchesOutlined /> Split ({node.outDegree})
                                </span>
                              )}
                              {hasMerge && (
                                <span className="routing-topology-tag merge">
                                  <MergeCellsOutlined /> Merge ({node.inDegree})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Spin>
      </div>

      {/* ── Node Detail Drawer ── */}
      <Drawer
        title={
          selectedNode ? (
            <div className="routing-detail-drawer-header">
              <Tag color="blue">#{selectedNode.sequenceNo}</Tag>
              <Text strong style={{ fontSize: 16 }}>{selectedNode.operationCode} — {selectedNode.operationName}</Text>
            </div>
          ) : 'Operation Details'
        }
        placement="right"
        width={480}
        open={drawerVisible}
        getContainer={false}
        forceRender
        onClose={() => setDrawerVisible(false)}
        extra={
          selectedNode && isDraft && (
            <Space>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => handleOpenAddConnection(selectedNode.id)}
              >
                Connect From Here
              </Button>
              {onEditOperation && (
                <Button
                  size="small"
                  onClick={() => {
                    setDrawerVisible(false);
                    onEditOperation(selectedNode);
                  }}
                >
                  Edit Op
                </Button>
              )}
            </Space>
          )
        }
      >
        {selectedNode && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Code">{selectedNode.operationCode}</Descriptions.Item>
              <Descriptions.Item label="Sequence">#{selectedNode.sequenceNo}</Descriptions.Item>
              <Descriptions.Item label="Department">{selectedNode.department?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Section">{selectedNode.section?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Machine">{selectedNode.machine?.machineCode || '-'}</Descriptions.Item>
              <Descriptions.Item label="Yield">{formatDecimal(toNum(selectedNode.yieldPercentage))}%</Descriptions.Item>
              <Descriptions.Item label="Setup Time">{formatDecimal(toNum(selectedNode.setupTimeMinutes))} min</Descriptions.Item>
              <Descriptions.Item label="Run Time">{formatDecimal(toNum(selectedNode.runTimeMinutes))} min</Descriptions.Item>
            </Descriptions>

            {/* Inputs Section */}
            <div>
              <Title level={5} style={{ margin: '8px 0' }}>Input Materials</Title>
              {selectedNode.inputs && selectedNode.inputs.length > 0 ? (
                <Descriptions bordered size="small" column={1}>
                  {selectedNode.inputs.map((inp, idx) => (
                    <Descriptions.Item key={idx} label={inp.item ? inp.item.itemCode : `Item ${idx + 1}`}>
                      <Space wrap>
                        <span>{inp.item?.name || inp.itemId}</span>
                        <Tag color="cyan">{formatDecimal(toNum(inp.quantity))} {(inp as any).uom?.code || ''}</Tag>
                        {inp.isPrimary && <Tag color="blue">Primary</Tag>}
                      </Space>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : (
                <Text type="secondary">No explicit multi-inputs configured. Default base input applies.</Text>
              )}
            </div>

            {/* Outputs Section */}
            <div>
              <Title level={5} style={{ margin: '8px 0' }}>Output Products</Title>
              {selectedNode.outputs && selectedNode.outputs.length > 0 ? (
                <Descriptions bordered size="small" column={1}>
                  {selectedNode.outputs.map((out, idx) => (
                    <Descriptions.Item key={idx} label={out.item ? out.item.itemCode : `Product ${idx + 1}`}>
                      <Space wrap>
                        <span>{out.item?.name || out.itemId}</span>
                        <Tag color="green">{formatDecimal(toNum(out.quantity))} {(out as any).uom?.code || ''}</Tag>
                        {out.outputType && <Tag color="purple">{out.outputType}</Tag>}
                      </Space>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : (
                <Text type="secondary">No explicit multi-outputs configured. Primary route product applies.</Text>
              )}
            </div>

            {/* Process Connections */}
            <div>
              <Title level={5} style={{ margin: '8px 0' }}>Outgoing Process Connections</Title>
              {(graphData?.edges || []).filter((e) => e.fromOperationId === selectedNode.id).length ? (
                <Descriptions bordered size="small" column={1}>
                  {(graphData?.edges || [])
                    .filter((e) => e.fromOperationId === selectedNode.id)
                    .map((conn) => {
                      const targetNode = (graphData?.nodes || []).find((n) => n.id === conn.toOperationId);
                      return (
                        <Descriptions.Item
                          key={conn.id || `${conn.fromOperationId}-${conn.toOperationId}`}
                          label={
                            <Space>
                              <Tag color={conn.connectionType === 'BRANCH' ? 'orange' : 'blue'}>
                                {conn.connectionType}
                              </Tag>
                              {conn.branchLabel && <Tag color="gold">{conn.branchLabel}</Tag>}
                            </Space>
                          }
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>
                              <ArrowRightOutlined style={{ marginRight: 6, color: '#1890ff' }} />
                              #{targetNode?.sequenceNo} {targetNode?.operationCode} ({targetNode?.operationName})
                            </span>
                            {isDraft && !conn.isSynthetic && (
                              <Popconfirm
                                title="Remove connection?"
                                onConfirm={() => handleDeleteConnection(conn.id)}
                              >
                                <Button size="small" danger icon={<DeleteOutlined />} type="text" />
                              </Popconfirm>
                            )}
                          </div>
                        </Descriptions.Item>
                      );
                    })}
                </Descriptions>
              ) : (
                <Text type="secondary">This operation is an endpoint (no outgoing process flow).</Text>
              )}
            </div>

            <div>
              <Title level={5} style={{ margin: '8px 0' }}>Incoming Process Connections</Title>
              {(graphData?.edges || []).filter((e) => e.toOperationId === selectedNode.id).length ? (
                <Descriptions bordered size="small" column={1}>
                  {(graphData?.edges || [])
                    .filter((e) => e.toOperationId === selectedNode.id)
                    .map((conn) => {
                      const srcNode = (graphData?.nodes || []).find((n) => n.id === conn.fromOperationId);
                      return (
                        <Descriptions.Item
                          key={conn.id || `${conn.fromOperationId}-${conn.toOperationId}`}
                          label={
                            <Space>
                              <Tag color={conn.connectionType === 'MERGE' ? 'purple' : 'blue'}>
                                {conn.connectionType}
                              </Tag>
                              {conn.branchLabel && <Tag color="gold">{conn.branchLabel}</Tag>}
                            </Space>
                          }
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>
                              #{srcNode?.sequenceNo} {srcNode?.operationCode} ({srcNode?.operationName})
                              <ArrowRightOutlined style={{ marginLeft: 6, color: '#1890ff' }} />
                            </span>
                            {isDraft && !conn.isSynthetic && (
                              <Popconfirm
                                title="Remove connection?"
                                onConfirm={() => handleDeleteConnection(conn.id)}
                              >
                                <Button size="small" danger icon={<DeleteOutlined />} type="text" />
                              </Popconfirm>
                            )}
                          </div>
                        </Descriptions.Item>
                      );
                    })}
                </Descriptions>
              ) : (
                <Text type="secondary">This is an entry point operation (no predecessors).</Text>
              )}
            </div>
          </Space>
        )}
      </Drawer>

      {/* ── Add Connection Modal ── */}
      <Modal
        title="Add Process Routing Connection"
        open={connectionModalVisible}
        onCancel={() => setConnectionModalVisible(false)}
        onOk={handleSaveConnection}
        confirmLoading={connectionSaving}
        destroyOnHidden
      >
        <Form layout="vertical" form={connectionForm}>
          <Form.Item
            name="fromOperationId"
            label="From Operation (Predecessor)"
            rules={[{ required: true, message: 'Select source operation' }]}
          >
            <Select placeholder="Select source operation">
              {(graphData?.nodes || []).map((n) => (
                <Select.Option key={n.id} value={n.id}>
                  #{n.sequenceNo} — {n.operationCode} ({n.operationName})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="toOperationId"
            label="To Operation (Successor)"
            rules={[{ required: true, message: 'Select target operation' }]}
          >
            <Select placeholder="Select target operation">
              {(graphData?.nodes || []).map((n) => (
                <Select.Option key={n.id} value={n.id}>
                  #{n.sequenceNo} — {n.operationCode} ({n.operationName})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="connectionType"
            label="Connection Relationship"
            initialValue="SEQUENTIAL"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="SEQUENTIAL">Sequential (Linear step)</Select.Option>
              <Select.Option value="BRANCH">Branch (Split into alternate/parallel line)</Select.Option>
              <Select.Option value="MERGE">Merge (Convergence of multiple flows)</Select.Option>
              <Select.Option value="ASSEMBLY">Assembly (Component joining)</Select.Option>
              <Select.Option value="PACKING">Packing (Packaging flow)</Select.Option>
              <Select.Option value="OUTPUT">Output (Finished stage)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="branchLabel"
            label="Branch / Connection Label (Optional)"
            tooltip="Descriptive label for this flow link (e.g. 'Inner Straight', 'Outer Straight', 'Alternate Line A')"
          >
            <Input placeholder="e.g. Inner Straight, Outer Straight" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RoutingProcessFlow;
