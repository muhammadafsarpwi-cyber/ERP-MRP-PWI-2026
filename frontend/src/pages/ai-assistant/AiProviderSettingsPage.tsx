import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Slider,
  Switch,
  Button,
  Row,
  Col,
  Space,
  Tag,
  Typography,
  Table,
  Tooltip,
  Popconfirm,
  App,
  Divider,
  Alert,
  theme,
} from 'antd';
import {
  RobotOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  EditOutlined,
  StarFilled,
  LinkOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ArrowLeftOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  SlidersOutlined,
  CloudDownloadOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import aiProviderConfigService, {
  AiProviderPlatform,
  MaskedAiProviderConfig,
  ActiveAiEngineInfo,
  AiModelQuotaDetail,
} from '../../services/aiProviderConfigService';

const { Title, Text, Paragraph } = Typography;

interface PlatformPreset {
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  recommendedModels: string[];
  helperUrl: string;
  helperText: string;
  placeholderKey: string;
}

const PLATFORM_PRESETS: Record<AiProviderPlatform, PlatformPreset> = {
  google_gemini: {
    label: 'Google AI Studio (Gemini)',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    recommendedModels: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    helperUrl: 'https://aistudio.google.com/apikey',
    helperText: 'Get Google AI Studio API Key ↗',
    placeholderKey: 'AIzaSy...',
  },
  openrouter: {
    label: 'OpenRouter (Unified API)',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-001',
    recommendedModels: [
      'google/gemini-2.0-flash-001',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o-mini',
      'deepseek/deepseek-chat',
    ],
    helperUrl: 'https://openrouter.ai/keys',
    helperText: 'Get OpenRouter API Key ↗',
    placeholderKey: 'sk-or-v1-...',
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    recommendedModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    helperUrl: 'https://platform.openai.com/api-keys',
    helperText: 'Get OpenAI API Key ↗',
    placeholderKey: 'sk-proj-...',
  },
  anthropic: {
    label: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    recommendedModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
    helperUrl: 'https://console.anthropic.com/settings/keys',
    helperText: 'Get Anthropic API Key ↗',
    placeholderKey: 'sk-ant-api03-...',
  },
  custom_openai: {
    label: 'Custom OpenAI-Compatible (Ollama / Local / Groq)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    recommendedModels: ['llama3.1', 'qwen2.5-coder', 'llama-3.3-70b-versatile'],
    helperUrl: 'https://ollama.com',
    helperText: 'Ollama Documentation ↗',
    placeholderKey: 'Optional for local models, or gsk_...',
  },
};

export const AiProviderSettingsPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelDetails, setModelDetails] = useState<AiModelQuotaDetail[]>([]);
  const [onlyFreeFilter, setOnlyFreeFilter] = useState(false);
  const [configs, setConfigs] = useState<MaskedAiProviderConfig[]>([]);
  const [activeEngine, setActiveEngine] = useState<ActiveAiEngineInfo | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Watch selected platform to update default URLs, helper links, and chips dynamically
  const selectedPlatform = Form.useWatch<AiProviderPlatform>('providerPlatform', form) || 'google_gemini';
  const currentPreset = PLATFORM_PRESETS[selectedPlatform] || PLATFORM_PRESETS.google_gemini;
  const currentTemperature = Form.useWatch<number>('temperature', form) ?? 0.2;
  const watchedModelId = Form.useWatch<string>('modelId', form) || currentPreset.defaultModel;

  // Active Model Quota Information
  const activeQuotaInfo = useMemo(() => {
    if (modelDetails.length > 0) {
      const match = modelDetails.find((d) => d.id === watchedModelId);
      if (match) return match;
    }

    // Default static fallback quota info when user hasn't fetched models yet
    if (selectedPlatform === 'google_gemini') {
      if (/gemini-2\.0-flash-lite/i.test(watchedModelId)) {
        return {
          id: watchedModelId,
          isFree: true,
          tierLabel: 'Free Tier (30 RPM / 1,500 RPD in AI Studio)',
          rpm: 30,
          rpd: 1500,
          tpm: 1000000,
          description: 'Ultra-fast lightweight multimodal model with free quota.',
        };
      }
      if (/gemini-2\.0-flash/i.test(watchedModelId)) {
        return {
          id: watchedModelId,
          isFree: true,
          tierLabel: 'Free Tier (15 RPM / 1,500 RPD in AI Studio)',
          rpm: 15,
          rpd: 1500,
          tpm: 1000000,
          description: 'High-speed multimodal intelligence with generous free tier.',
        };
      }
      if (/gemini-1\.5-flash/i.test(watchedModelId)) {
        return {
          id: watchedModelId,
          isFree: true,
          tierLabel: 'Free Tier (15 RPM / 1,500 RPD in AI Studio)',
          rpm: 15,
          rpd: 1500,
          tpm: 1000000,
          description: 'High-speed production model with generous free quota.',
        };
      }
      if (/gemini-1\.5-pro/i.test(watchedModelId)) {
        return {
          id: watchedModelId,
          isFree: true,
          tierLabel: 'Free Tier (2 RPM / 50 RPD in AI Studio)',
          rpm: 2,
          rpd: 50,
          tpm: 32000,
          description: 'Deep reasoning with 2M context window.',
        };
      }
      return {
        id: watchedModelId,
        isFree: true,
        tierLabel: 'Free Tier (15 RPM / 1,500 RPD in AI Studio)',
        rpm: 15,
        rpd: 1500,
        tpm: 1000000,
        description: 'Google AI Studio free tier multimodal model.',
      };
    }

    if (selectedPlatform === 'openrouter') {
      if (watchedModelId.endsWith(':free')) {
        return {
          id: watchedModelId,
          isFree: true,
          tierLabel: '100% Free OpenRouter Community Tier ($0.00)',
          description: 'No per-token charges or usage fees.',
        };
      }
    }

    if (selectedPlatform === 'custom_openai') {
      return {
        id: watchedModelId,
        isFree: true,
        tierLabel: '100% Free & Unlimited (Self-Hosted Local Model)',
        description: 'Runs directly on your local hardware with 0 external API cost.',
      };
    }

    return null;
  }, [modelDetails, watchedModelId, selectedPlatform, currentPreset.defaultModel]);

  // Count total free models available for the current provider
  const totalFreeCount = useMemo(() => {
    if (modelDetails.length > 0) {
      return modelDetails.filter((d) => d.isFree).length;
    }
    if (selectedPlatform === 'google_gemini' || selectedPlatform === 'custom_openai') {
      return currentPreset.recommendedModels.length;
    }
    if (selectedPlatform === 'openrouter') {
      return currentPreset.recommendedModels.filter((m) => m.includes(':free')).length;
    }
    return 0;
  }, [modelDetails, selectedPlatform, currentPreset.recommendedModels]);

  // Model chips to display (respecting onlyFreeFilter)
  const displayedModelChips = useMemo(() => {
    if (modelDetails.length > 0) {
      const filtered = onlyFreeFilter ? modelDetails.filter((d) => d.isFree) : modelDetails;
      return filtered.slice(0, 24);
    }
    if (onlyFreeFilter) {
      if (selectedPlatform === 'google_gemini' || selectedPlatform === 'custom_openai') {
        return currentPreset.recommendedModels;
      }
      if (selectedPlatform === 'openrouter') {
        return currentPreset.recommendedModels.filter((m) => m.includes(':free'));
      }
      return [];
    }
    return currentPreset.recommendedModels;
  }, [modelDetails, onlyFreeFilter, currentPreset.recommendedModels, selectedPlatform]);

  // Load configs and active status
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await aiProviderConfigService.getConfigs();
      setConfigs(data.configs || []);
      setActiveEngine(data.activeEngine || null);
    } catch (err) {
      message.error((err as Error).message || 'Failed to load AI provider settings');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle platform change: auto-fill defaults if not in edit mode
  const handlePlatformChange = (platform: AiProviderPlatform) => {
    setModelDetails([]); // Reset dynamically fetched models on platform switch
    setOnlyFreeFilter(false);
    const preset = PLATFORM_PRESETS[platform];
    if (!preset) return;
    if (!editingId) {
      form.setFieldsValue({
        configurationLabel: preset.label,
        baseApiUrl: preset.defaultBaseUrl,
        modelId: preset.defaultModel,
      });
    }
  };

  // Fetch live models and quotas supported by the user's API key
  const handleFetchModels = async () => {
    const platform = form.getFieldValue('providerPlatform') || selectedPlatform;
    const key = form.getFieldValue('apiKey');
    const baseApiUrl = form.getFieldValue('baseApiUrl');

    if (platform !== 'custom_openai' && (!key || key.trim() === '')) {
      message.warning('Please enter an API Key first to fetch available models & check quotas.');
      return;
    }

    setFetchingModels(true);
    try {
      const result = await aiProviderConfigService.listModels({
        providerPlatform: platform,
        apiKey: key,
        baseApiUrl,
        configId: editingId || undefined,
      });

      const details = result.details || [];
      if (!details || details.length === 0) {
        message.warning(`No models returned by ${platform}.`);
        setModelDetails([]);
      } else {
        setModelDetails(details);
        const freeCount = result.summary?.freeModelsCount ?? details.filter((d) => d.isFree).length;
        message.success(
          `Found ${details.length} models for ${platform}! (${freeCount} Free Tier models available)`,
        );

        // Auto-select first free model if current modelId is empty
        const currentModel = form.getFieldValue('modelId');
        if (!currentModel) {
          const firstFree = details.find((d) => d.isFree);
          form.setFieldsValue({ modelId: firstFree ? firstFree.id : details[0].id });
        }
      }
    } catch (err) {
      message.error((err as Error).message || 'Failed to fetch models from provider.');
    } finally {
      setFetchingModels(false);
    }
  };

  // Start editing an existing profile
  const handleEdit = (record: MaskedAiProviderConfig) => {
    setModelDetails([]);
    setOnlyFreeFilter(false);
    setEditingId(record.id);
    form.setFieldsValue({
      providerPlatform: record.providerPlatform,
      configurationLabel: record.configurationLabel,
      apiKey: record.maskedApiKey,
      modelId: record.modelId,
      baseApiUrl: record.baseApiUrl || PLATFORM_PRESETS[record.providerPlatform]?.defaultBaseUrl,
      temperature: record.temperature,
      maxOutputTokens: record.maxOutputTokens,
      isEnabled: record.isEnabled,
      isPrimaryDefault: record.isPrimaryDefault,
    });
    // Scroll smoothly to form
    window.scrollTo({ top: 180, behavior: 'smooth' });
  };

  // Cancel editing mode
  const handleCancelEdit = () => {
    setModelDetails([]);
    setOnlyFreeFilter(false);
    setEditingId(null);
    form.resetFields();
    const preset = PLATFORM_PRESETS.google_gemini;
    form.setFieldsValue({
      providerPlatform: 'google_gemini',
      configurationLabel: preset.label,
      baseApiUrl: preset.defaultBaseUrl,
      modelId: preset.defaultModel,
      temperature: 0.2,
      maxOutputTokens: 4096,
      isEnabled: true,
      isPrimaryDefault: false,
    });
  };

  // Save (Create or Update)
  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      if (editingId) {
        await aiProviderConfigService.updateConfig(editingId, {
          providerPlatform: values.providerPlatform,
          configurationLabel: values.configurationLabel,
          apiKey: values.apiKey,
          modelId: values.modelId,
          baseApiUrl: values.baseApiUrl,
          temperature: values.temperature,
          maxOutputTokens: values.maxOutputTokens,
          isEnabled: values.isEnabled,
          isPrimaryDefault: values.isPrimaryDefault,
        });
        message.success('AI Provider configuration updated successfully');
      } else {
        await aiProviderConfigService.createConfig({
          providerPlatform: values.providerPlatform,
          configurationLabel: values.configurationLabel,
          apiKey: values.apiKey,
          modelId: values.modelId,
          baseApiUrl: values.baseApiUrl,
          temperature: values.temperature,
          maxOutputTokens: values.maxOutputTokens,
          isEnabled: values.isEnabled,
          isPrimaryDefault: values.isPrimaryDefault,
        });
        message.success('New AI Provider added successfully');
      }
      handleCancelEdit();
      await loadData();
    } catch (err) {
      message.error((err as Error).message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Test live connection
  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields(['providerPlatform', 'modelId', 'baseApiUrl', 'apiKey', 'temperature', 'maxOutputTokens']);
      setTesting(true);
      const res = await aiProviderConfigService.testConnection({
        providerPlatform: values.providerPlatform,
        modelId: values.modelId,
        baseApiUrl: values.baseApiUrl,
        apiKey: values.apiKey,
        temperature: values.temperature,
        maxOutputTokens: values.maxOutputTokens,
        configId: editingId || undefined,
      });

      if (res.ok) {
        message.success({
          content: `${res.message}`,
          duration: 4,
          icon: <CheckCircleOutlined style={{ color: '#10b981' }} />,
        });
      } else {
        message.error({
          content: `Connection test failed: ${res.message}`,
          duration: 5,
        });
      }
    } catch (err: any) {
      if (err?.errorFields) return; // Validation error
      message.error(err?.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  // Set as primary
  const handleSetPrimary = async (id: string) => {
    try {
      await aiProviderConfigService.setPrimary(id);
      message.success('Primary AI Provider updated');
      await loadData();
    } catch (err) {
      message.error((err as Error).message || 'Failed to set primary provider');
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    try {
      await aiProviderConfigService.deleteConfig(id);
      message.success('Provider deleted successfully');
      if (editingId === id) handleCancelEdit();
      await loadData();
    } catch (err) {
      message.error((err as Error).message || 'Failed to delete provider');
    }
  };

  const columns = [
    {
      title: 'Provider & Model',
      key: 'provider',
      render: (_: unknown, r: MaskedAiProviderConfig) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text strong style={{ fontSize: 13.5 }}>
              {r.configurationLabel}
            </Text>
            {r.isPrimaryDefault && (
              <Tag color="gold" icon={<StarFilled />} style={{ fontWeight: 700, margin: 0 }}>
                Active Primary
              </Tag>
            )}
            {!r.isEnabled && <Tag color="default">Disabled</Tag>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 2 }}>
            Platform: <span style={{ fontWeight: 600 }}>{r.providerPlatform}</span> · Model:{' '}
            <span style={{ fontWeight: 600, color: 'var(--theme-primary, #0ea5e9)' }}>{r.modelId}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'API Key',
      dataIndex: 'maskedApiKey',
      key: 'maskedApiKey',
      render: (key: string, r: MaskedAiProviderConfig) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: r.hasApiKey ? undefined : 'var(--theme-text-muted)' }}>
          {key}
        </span>
      ),
    },
    {
      title: 'Endpoint',
      dataIndex: 'baseApiUrl',
      key: 'baseApiUrl',
      render: (url: string) => (
        <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
          {url || 'Default Vendor Endpoint'}
        </span>
      ),
    },
    {
      title: 'Temperature',
      dataIndex: 'temperature',
      key: 'temperature',
      width: 100,
      render: (t: number) => (
        <span style={{ fontSize: 12, fontWeight: 700 }}>
          {Number(t).toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      width: 220,
      render: (_: unknown, r: MaskedAiProviderConfig) => (
        <Space size="small">
          {!r.isPrimaryDefault && r.isEnabled && (
            <Button
              size="small"
              icon={<StarFilled style={{ color: '#eab308' }} />}
              onClick={() => handleSetPrimary(r.id)}
            >
              Set Primary
            </Button>
          )}
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(r)}
          />
          <Popconfirm
            title="Delete this provider profile?"
            description="Are you sure you want to remove this configuration?"
            onConfirm={() => handleDelete(r.id)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 4px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Space size="middle">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/ai-assistant')}
          >
            Back to AI Assistant
          </Button>
          <div>
            <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <RobotOutlined style={{ color: 'var(--theme-primary, #0ea5e9)' }} />
              Multi-Provider AI Configuration (BYOK)
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Bring Your Own Key: Connect Google AI Studio, OpenRouter, OpenAI, Anthropic, or local Ollama models.
            </Text>
          </div>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          Refresh
        </Button>
      </div>

      {/* ── SECTION 1: CURRENT ACTIVE AI ENGINE BANNER CARD ── */}
      <Card
        style={{
          marginBottom: 22,
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          boxShadow: 'var(--theme-shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
        }}
        bodyStyle={{ padding: '20px 22px' }}
      >
        {/* Banner Top Row: Title, Subtitle and Right-side Active Status Tag */}
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={16} md={17}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: token.borderRadiusLG,
                  background:
                    activeEngine?.source === 'database'
                      ? 'rgba(16, 185, 129, 0.12)'
                      : activeEngine?.source === 'env'
                      ? 'rgba(14, 165, 233, 0.12)'
                      : 'rgba(245, 158, 11, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color:
                    activeEngine?.source === 'database'
                      ? token.colorSuccess
                      : activeEngine?.source === 'env'
                      ? token.colorPrimary
                      : token.colorWarning,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <ThunderboltOutlined />
              </div>
              <div>
                <Title level={4} style={{ margin: 0, fontSize: 16, fontWeight: 700, color: token.colorText }}>
                  Current Active AI Engine
                </Title>
                <Text style={{ fontSize: 12.5, color: token.colorTextSecondary, display: 'block', marginTop: 2 }}>
                  The AI Digital Manager uses this engine for natural language queries, financial insights, and action proposals.
                </Text>
              </div>
            </div>
          </Col>

          <Col xs={24} sm={8} md={7} style={{ textAlign: 'right' }}>
            {activeEngine?.source === 'database' ? (
              <Tag
                color="success"
                icon={<CheckCircleOutlined />}
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: token.borderRadiusSM,
                  margin: 0,
                  whiteSpace: 'normal',
                  textAlign: 'left',
                  lineHeight: 1.4,
                }}
              >
                Active: {activeEngine.label} ({activeEngine.model})
              </Tag>
            ) : activeEngine?.source === 'env' ? (
              <Tag
                color="processing"
                icon={<InfoCircleOutlined />}
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: token.borderRadiusSM,
                  margin: 0,
                  whiteSpace: 'normal',
                  textAlign: 'left',
                  lineHeight: 1.4,
                }}
              >
                Fallback: .env Configuration ({activeEngine.model || 'Gemini'})
              </Tag>
            ) : (
              <Tag
                color="warning"
                icon={<ExclamationCircleOutlined />}
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: token.borderRadiusSM,
                  margin: 0,
                  whiteSpace: 'normal',
                  textAlign: 'left',
                  lineHeight: 1.4,
                }}
              >
                Fallback: Local Business Logic Active
              </Tag>
            )}
          </Col>
        </Row>

        {/* Inner Status Box: Serving Provider / Model & Safety Notice */}
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: token.borderRadius,
            background: token.colorFillAlter,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Row align="middle" justify="space-between" gutter={[12, 12]}>
            <Col xs={24} md={16}>
              <Space size="middle" wrap align="center">
                <span style={{ fontSize: 12, fontWeight: 700, color: token.colorTextSecondary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Serving Requests:
                </span>
                <Tag
                  color={activeEngine?.source === 'database' ? 'green' : activeEngine?.source === 'env' ? 'blue' : 'gold'}
                  style={{ fontWeight: 700, fontSize: 12, padding: '2px 8px', margin: 0 }}
                >
                  {activeEngine?.label || 'Autonomous Fallback Engine'}
                </Tag>
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Model:</Text>
                  <Tag style={{ fontFamily: 'monospace', fontSize: 11.5, fontWeight: 600, margin: 0 }}>
                    {activeEngine?.model || 'heuristic-rules'}
                  </Tag>
                </Space>
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Origin:</Text>
                  <span style={{ fontSize: 12, fontWeight: 600, color: token.colorText }}>
                    {activeEngine?.source === 'database'
                      ? 'Database (BYOK Profile)'
                      : activeEngine?.source === 'env'
                      ? 'System Environment (.env)'
                      : 'Built-in ERP Heuristics'}
                  </span>
                </Space>
              </Space>
            </Col>
            <Col xs={24} md={8} style={{ textAlign: 'right' }}>
              <Space size="small">
                <SafetyCertificateOutlined style={{ color: token.colorSuccess, fontSize: 14 }} />
                <span style={{ fontSize: 11.5, color: token.colorTextSecondary }}>
                  Keys AES-256 encrypted at rest
                </span>
              </Space>
            </Col>
          </Row>

          {activeEngine?.source !== 'database' && (
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px dashed ${token.colorBorderSecondary}`,
                fontSize: 12,
                color: token.colorTextSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <InfoCircleOutlined style={{ color: token.colorWarning, fontSize: 14, flexShrink: 0 }} />
              <span>
                <strong>Notice:</strong> No custom primary database provider is currently active. Configure and enable a provider below with <em>"Set as primary default AI provider"</em> to route natural language queries through your own API key.
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ── SECTION 2: CONFIGURE / EDIT PROVIDER CARD ── */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space>
              <SlidersOutlined style={{ color: 'var(--theme-primary, #0ea5e9)' }} />
              <span>{editingId ? 'Edit AI Provider Profile' : 'Configure New AI Provider API'}</span>
            </Space>
            {editingId && (
              <Tag color="processing">Editing: {form.getFieldValue('configurationLabel')}</Tag>
            )}
          </div>
        }
        style={{ marginBottom: 24 }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            providerPlatform: 'google_gemini',
            configurationLabel: 'Google AI Studio (Gemini)',
            baseApiUrl: 'https://generativelanguage.googleapis.com/v1beta',
            modelId: 'gemini-2.0-flash',
            temperature: 0.2,
            maxOutputTokens: 4096,
            isEnabled: true,
            isPrimaryDefault: false,
          }}
          onFinish={handleSave}
        >
          <Row gutter={16}>
            {/* 1. Platform Select */}
            <Col xs={24} sm={12}>
              <Form.Item
                name="providerPlatform"
                label="Provider Platform"
                rules={[{ required: true, message: 'Select an AI provider platform' }]}
              >
                <Select
                  onChange={handlePlatformChange}
                  options={[
                    { value: 'google_gemini', label: 'Google AI Studio (Gemini)' },
                    { value: 'openrouter', label: 'OpenRouter (Unified API)' },
                    { value: 'openai', label: 'OpenAI (ChatGPT)' },
                    { value: 'anthropic', label: 'Anthropic Claude' },
                    { value: 'custom_openai', label: 'Custom OpenAI-Compatible (Ollama / Local / Groq)' },
                  ]}
                />
              </Form.Item>
            </Col>

            {/* 2. Configuration Label */}
            <Col xs={24} sm={12}>
              <Form.Item
                name="configurationLabel"
                label="Configuration Label / Profile Name"
                rules={[{ required: true, message: 'Enter a profile label' }]}
              >
                <Input placeholder="e.g. My Production Google AI Key" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            {/* 3. API Key */}
            <Col xs={24} sm={12}>
              <Form.Item
                name="apiKey"
                label={
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span>API Key (Secret)</span>
                    <a
                      href={currentPreset.helperUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, fontWeight: 600 }}
                    >
                      {currentPreset.helperText}
                    </a>
                  </div>
                }
                rules={[
                  {
                    required: selectedPlatform !== 'custom_openai',
                    message: 'API Key is required for cloud providers',
                  },
                ]}
              >
                <Input.Password
                  placeholder={currentPreset.placeholderKey}
                  prefix={<ApiOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                />
              </Form.Item>
            </Col>

            {/* 4. Model ID with Quota System, Free Tier Filter & Dynamic Chips */}
            <Col xs={24} sm={12}>
              <Form.Item
                name="modelId"
                label={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>Model ID</span>
                    <Space size="middle">
                      {totalFreeCount > 0 && (
                        <Space size={4}>
                          <Switch
                            size="small"
                            checked={onlyFreeFilter}
                            onChange={setOnlyFreeFilter}
                          />
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: onlyFreeFilter ? token.colorSuccess : token.colorTextSecondary,
                              cursor: 'pointer',
                            }}
                            onClick={() => setOnlyFreeFilter(!onlyFreeFilter)}
                          >
                            Free Models ({totalFreeCount})
                          </span>
                        </Space>
                      )}
                      <Button
                        type="link"
                        size="small"
                        icon={<CloudDownloadOutlined />}
                        loading={fetchingModels}
                        onClick={handleFetchModels}
                        style={{ padding: 0, fontSize: 11.5, height: 'auto', fontWeight: 600 }}
                      >
                        {modelDetails.length > 0 ? 'Refresh Quotas' : 'Check Quotas & Models'}
                      </Button>
                    </Space>
                  </div>
                }
                rules={[{ required: true, message: 'Enter or select a model ID' }]}
                extra={
                  <div>
                    {/* Chips list */}
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {onlyFreeFilter
                          ? `Free Models (${displayedModelChips.length}):`
                          : modelDetails.length > 0
                          ? `Available Models (${modelDetails.length}):`
                          : 'Quick Select:'}
                      </Text>

                      {displayedModelChips.map((item) => {
                        const id = typeof item === 'string' ? item : item.id;
                        const isFree =
                          typeof item === 'string'
                            ? selectedPlatform === 'google_gemini' || selectedPlatform === 'custom_openai' || item.includes(':free')
                            : item.isFree;
                        const isSelected = form.getFieldValue('modelId') === id;
                        const rpm = typeof item === 'object' ? item.rpm : undefined;

                        return (
                          <Tag
                            key={id}
                            color={isSelected ? (isFree ? 'success' : 'processing') : undefined}
                            style={{
                              cursor: 'pointer',
                              fontSize: 10.5,
                              marginRight: 4,
                              marginBottom: 4,
                              border: isSelected
                                ? `1.5px solid ${isFree ? token.colorSuccess : token.colorPrimary}`
                                : isFree
                                ? '1px solid rgba(16, 185, 129, 0.45)'
                                : undefined,
                              background: isFree && !isSelected ? 'rgba(16, 185, 129, 0.08)' : undefined,
                              fontWeight: isSelected ? 700 : 500,
                            }}
                            onClick={() => form.setFieldsValue({ modelId: id })}
                          >
                            {isFree && (
                              <span
                                style={{
                                  marginRight: 4,
                                  fontSize: 8.5,
                                  fontWeight: 800,
                                  background: isSelected ? '#ffffff' : token.colorSuccess,
                                  color: isSelected ? token.colorSuccess : '#ffffff',
                                  padding: '1px 3.5px',
                                  borderRadius: 3,
                                }}
                              >
                                FREE
                              </span>
                            )}
                            {id}
                            {rpm && (
                              <span style={{ marginLeft: 4, opacity: 0.75, fontSize: 9 }}>
                                ({rpm} RPM)
                              </span>
                            )}
                          </Tag>
                        );
                      })}
                    </div>

                    {/* Selected Model Quota & Cost Detail Callout */}
                    {activeQuotaInfo && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '8px 12px',
                          borderRadius: token.borderRadiusSM,
                          background: activeQuotaInfo.isFree
                            ? 'rgba(16, 185, 129, 0.07)'
                            : 'rgba(14, 165, 233, 0.05)',
                          border: `1px solid ${
                            activeQuotaInfo.isFree
                              ? 'rgba(16, 185, 129, 0.3)'
                              : token.colorBorderSecondary
                          }`,
                          fontSize: 11.5,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Tag
                              color={activeQuotaInfo.isFree ? 'success' : 'default'}
                              style={{ fontWeight: 800, fontSize: 10, margin: 0, padding: '0 6px' }}
                            >
                              {activeQuotaInfo.isFree ? 'FREE TIER MODEL' : 'COMMERCIAL MODEL'}
                            </Tag>
                            <strong style={{ color: activeQuotaInfo.isFree ? token.colorSuccess : token.colorText }}>
                              {activeQuotaInfo.tierLabel}
                            </strong>
                          </div>

                          {activeQuotaInfo.rpm && (
                            <span style={{ color: token.colorTextSecondary }}>
                              Rate Limit: <strong>{activeQuotaInfo.rpm} RPM</strong> · Daily: <strong>{activeQuotaInfo.rpd} RPD</strong>
                            </span>
                          )}
                        </div>

                        {activeQuotaInfo.description && (
                          <div style={{ marginTop: 4, color: token.colorTextSecondary, fontSize: 11 }}>
                            {activeQuotaInfo.description}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                }
              >
                <Input placeholder="e.g. gemini-2.0-flash, gpt-4o-mini" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            {/* 5. Base API URL */}
            <Col xs={24} sm={12}>
              <Form.Item
                name="baseApiUrl"
                label="Base API URL"
                tooltip="Official vendor endpoint or local/proxy URL"
              >
                <Input placeholder={currentPreset.defaultBaseUrl} />
              </Form.Item>
            </Col>

            {/* 6. Max Output Tokens */}
            <Col xs={24} sm={12}>
              <Form.Item
                name="maxOutputTokens"
                label="Max Output Tokens"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { value: 2048, label: '2,048 tokens (Fast)' },
                    { value: 4096, label: '4,096 tokens (Detailed, Recommended)' },
                    { value: 8192, label: '8,192 tokens (Extended)' },
                    { value: 16384, label: '16,384 tokens (Large Reports)' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* 7. Temperature Slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Temperature:{' '}
                <Text strong style={{ color: 'var(--theme-primary, #0ea5e9)' }}>
                  {Number(currentTemperature).toFixed(2)}
                </Text>
              </span>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                Recommended: 0.00 to 0.20 for SQL generation
              </span>
            </div>
            <Form.Item name="temperature" noStyle>
              <Slider min={0.0} max={1.0} step={0.05} />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--theme-text-muted)' }}>
              <span>0.0 (Precise / Factual)</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <Divider style={{ margin: '14px 0 18px' }} />

          {/* 8. Activation Checkboxes */}
          <Row gutter={24} style={{ marginBottom: 20 }}>
            <Col xs={24} sm={12}>
              <Form.Item name="isEnabled" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
              <span style={{ marginLeft: 10, fontWeight: 600 }}>
                Enable this AI provider for requests
              </span>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="isPrimaryDefault" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
              <span style={{ marginLeft: 10, fontWeight: 600 }}>
                Set as primary default AI provider
              </span>
            </Col>
          </Row>

          {/* 9. Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            {editingId && (
              <Button onClick={handleCancelEdit}>
                Cancel Edit
              </Button>
            )}
            <Button
              icon={<ThunderboltOutlined />}
              onClick={handleTestConnection}
              loading={testing}
            >
              Test Connection
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
              style={{ minWidth: 140 }}
            >
              {editingId ? 'Update Configuration' : 'Save Configuration'}
            </Button>
          </div>
        </Form>
      </Card>

      {/* ── SECTION 3: SAVED PROVIDERS TABLE ── */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space>
              <ApiOutlined style={{ color: 'var(--theme-primary, #0ea5e9)' }} />
              <span>Saved AI Provider Profiles ({configs.length})</span>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Highest active priority: Primary Default ➔ First Enabled ➔ .env
            </Text>
          </div>
        }
      >
        <Table
          dataSource={configs}
          columns={columns}
          rowKey="id"
          pagination={false}
          loading={loading}
          locale={{
            emptyText: (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <RobotOutlined style={{ fontSize: 32, color: 'var(--theme-text-muted)', marginBottom: 8 }} />
                <Paragraph type="secondary">
                  No custom AI provider profiles configured yet. The ERP is currently using the system .env fallback.
                </Paragraph>
              </div>
            ),
          }}
        />
      </Card>
    </div>
  );
};

export default AiProviderSettingsPage;

