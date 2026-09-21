import React, { useRef, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Slider,
  Button,
  Tag,
  Typography,
  Upload,
  message,
  Switch,
  Space,
  Empty,
  Popconfirm,
  Tooltip,
} from 'antd';
import {
  SoundFilled,
  SoundOutlined,
  PlayCircleFilled,
  PauseCircleFilled,
  StopFilled,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleFilled,
  CustomerServiceOutlined,
  InboxOutlined,
  SyncOutlined,
  FileDoneOutlined,
} from '@ant-design/icons';
import {
  useMusicStore,
  BUILT_IN_TRACK_ID,
  BUILT_IN_TRACK_TITLE,
} from '../../store/musicStore';
import { StoredAudioTrack } from '../../utils/audioStorage';
import './audioMusicSettings.css';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

export const AudioMusicSettings: React.FC = () => {
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const volume = useMusicStore((state) => state.volume);
  const activeTrackId = useMusicStore((state) => state.activeTrackId);
  const activeTrackTitle = useMusicStore((state) => state.activeTrackTitle);
  const activeTrackType = useMusicStore((state) => state.activeTrackType);
  const customTracks = useMusicStore((state) => state.customTracks);
  const isLooping = useMusicStore((state) => state.isLooping);
  const isLoading = useMusicStore((state) => state.isLoading);

  const togglePlay = useMusicStore((state) => state.togglePlay);
  const play = useMusicStore((state) => state.play);
  const pause = useMusicStore((state) => state.pause);
  const stop = useMusicStore((state) => state.stop);
  const setVolume = useMusicStore((state) => state.setVolume);
  const selectTrack = useMusicStore((state) => state.selectTrack);
  const uploadTrack = useMusicStore((state) => state.uploadTrack);
  const deleteTrack = useMusicStore((state) => state.deleteTrack);
  const downloadTrack = useMusicStore((state) => state.downloadTrack);
  const setLooping = useMusicStore((state) => state.setLooping);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const percent = Math.round(volume * 100);

  const handleCustomUpload = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|aac|m4a|flac|webm)$/i)) {
      message.error('Please upload a valid audio file (MP3, WAV, AAC, OGG, M4A).');
      return false;
    }

    if (file.size > 40 * 1024 * 1024) {
      message.error('File size exceeds the 40MB limit for browser storage.');
      return false;
    }

    setUploading(true);
    try {
      const track = await uploadTrack(file);
      message.success(`Track "${track.name}" uploaded successfully and set as active!`);
    } catch (err) {
      console.error(err);
      message.error('Failed to save audio file into storage.');
    } finally {
      setUploading(false);
    }
    return false; // Prevent Antd default upload behavior
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="erp-audio-settings-container">
      {/* ── Top Hero: Master Status & Quick Controls ── */}
      <Card
        className="erp-audio-master-card"
        bordered
        style={{
          borderRadius: 12,
          marginBottom: 20,
          background: 'var(--theme-card-bg, #ffffff)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={12}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                className={`erp-audio-avatar-circle ${isPlaying ? 'playing' : ''}`}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isPlaying
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : 'var(--theme-border, #e2e8f0)',
                  color: isPlaying ? '#ffffff' : 'var(--theme-text-muted, #64748b)',
                  fontSize: 26,
                  boxShadow: isPlaying ? '0 0 20px rgba(16, 185, 129, 0.4)' : 'none',
                  transition: 'all 0.3s ease',
                  flexShrink: 0,
                }}
              >
                <CustomerServiceOutlined />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Title level={4} style={{ margin: 0 }}>
                    Background Music & Sound Setup
                  </Title>
                  <Tag color={isPlaying ? 'success' : 'default'} style={{ fontWeight: 600 }}>
                    {isPlaying ? '● Playing' : 'Paused / Muted'}
                  </Tag>
                  {isPlaying && (
                    <div className="erp-sound-wave-bars">
                      <span className="bar" />
                      <span className="bar" />
                      <span className="bar" />
                      <span className="bar" />
                      <span className="bar" />
                    </div>
                  )}
                </div>
                <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
                  Current Track: <strong style={{ color: 'var(--theme-text)' }}>{activeTrackTitle}</strong>
                </Text>
              </div>
            </div>
          </Col>

          <Col xs={24} md={12}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <Button
                type={isPlaying ? 'default' : 'primary'}
                size="large"
                icon={isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
                onClick={togglePlay}
                style={{
                  minWidth: 120,
                  height: 42,
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                {isPlaying ? 'Pause' : 'Play Sound'}
              </Button>

              <Button
                danger
                size="large"
                icon={<StopFilled />}
                onClick={stop}
                disabled={!isPlaying}
                style={{ height: 42, borderRadius: 8 }}
                title="Stop Audio"
              >
                Stop
              </Button>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--theme-bg-subtle, #f8fafc)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--theme-border, #e2e8f0)',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: 600 }}>Continuous Loop:</Text>
                <Switch
                  checked={isLooping}
                  onChange={(val) => setLooping(val)}
                  size="small"
                />
              </div>
            </div>
          </Col>
        </Row>

        {/* Master Volume Slider Row */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--theme-border, #e2e8f0)',
          }}
        >
          <Row gutter={[16, 12]} align="middle">
            <Col xs={24} sm={6} md={4}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  type="text"
                  shape="circle"
                  icon={volume > 0 ? <SoundFilled style={{ color: '#10b981', fontSize: 18 }} /> : <SoundOutlined style={{ color: '#94a3b8', fontSize: 18 }} />}
                  onClick={() => setVolume(volume > 0 ? 0 : 0.65)}
                  title={volume > 0 ? 'Mute' : 'Unmute'}
                />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Master Volume</div>
                  <strong style={{ fontSize: 15, color: 'var(--theme-primary, #2563eb)' }}>
                    {percent}%
                  </strong>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={12} md={14}>
              <Slider
                min={0}
                max={100}
                value={percent}
                onChange={(val) => setVolume(val / 100)}
                tooltip={{ formatter: (v) => `${v}%` }}
                styles={{
                  track: { background: 'linear-gradient(90deg, #10b981, #059669)' },
                }}
              />
            </Col>

            <Col xs={24} sm={6} md={6}>
              <Space size={6} wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
                <Button size="small" onClick={() => setVolume(0)}>Mute (0%)</Button>
                <Button size="small" onClick={() => setVolume(0.25)}>Soft (25%)</Button>
                <Button size="small" onClick={() => setVolume(0.5)}>Mid (50%)</Button>
                <Button size="small" onClick={() => setVolume(0.85)}>High (85%)</Button>
              </Space>
            </Col>
          </Row>
        </div>
      </Card>

      {/* ── Middle: Audio Library & Track Selection ── */}
      <Row gutter={[20, 20]}>
        {/* Left Column: Track Library */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CustomerServiceOutlined style={{ color: '#10b981' }} />
                <span>Audio Library & Soundtracks</span>
              </div>
            }
            bordered
            style={{ borderRadius: 12, height: '100%' }}
          >
            {/* Built-in Procedural Classical Music Track */}
            <div
              className={`erp-track-item-card ${activeTrackId === BUILT_IN_TRACK_ID ? 'selected' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: 10,
                border: activeTrackId === BUILT_IN_TRACK_ID
                  ? '2px solid #10b981'
                  : '1px solid var(--theme-border, #e2e8f0)',
                background: activeTrackId === BUILT_IN_TRACK_ID
                  ? 'rgba(16, 185, 129, 0.06)'
                  : 'var(--theme-card-bg, #ffffff)',
                marginBottom: 14,
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  <CustomerServiceOutlined />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ fontSize: 14, color: 'var(--theme-text)' }}>
                      Classical Ambient Harmony
                    </strong>
                    <Tag color="cyan" style={{ fontSize: 10 }}>Built-in Synthesizer</Tag>
                    {activeTrackId === BUILT_IN_TRACK_ID && (
                      <Tag color="success" icon={<CheckCircleFilled />} style={{ fontSize: 10 }}>
                        Active
                      </Tag>
                    )}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Procedural piano & strings generator • Infinite calm harmony • Zero internet bandwidth
                  </Text>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  type={activeTrackId === BUILT_IN_TRACK_ID && isPlaying ? 'primary' : 'default'}
                  icon={activeTrackId === BUILT_IN_TRACK_ID && isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
                  onClick={() => {
                    if (activeTrackId === BUILT_IN_TRACK_ID) {
                      togglePlay();
                    } else {
                      selectTrack(BUILT_IN_TRACK_ID, true);
                    }
                  }}
                  style={{ borderRadius: 6 }}
                >
                  {activeTrackId === BUILT_IN_TRACK_ID && isPlaying ? 'Pause' : 'Play'}
                </Button>
              </div>
            </div>

            {/* Custom Uploaded Tracks Section */}
            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <Title level={5} style={{ margin: 0 }}>
                  Custom Uploaded Tracks ({customTracks.length})
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Stored securely in your local browser database (IndexedDB)
                </Text>
              </div>

              {customTracks.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span>
                      No custom music uploaded yet. You can upload any MP3/WAV track using the box on the right.
                    </span>
                  }
                  style={{ padding: '24px 0' }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {customTracks.map((track: StoredAudioTrack) => {
                    const isSelected = activeTrackId === track.id;
                    const isTrackPlaying = isSelected && isPlaying;

                    return (
                      <div
                        key={track.id}
                        className={`erp-track-item-card ${isSelected ? 'selected' : ''}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          borderRadius: 8,
                          border: isSelected
                            ? '2px solid #10b981'
                            : '1px solid var(--theme-border, #e2e8f0)',
                          background: isSelected
                            ? 'rgba(16, 185, 129, 0.06)'
                            : 'var(--theme-card-bg, #ffffff)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isTrackPlaying ? '#10b981' : 'var(--theme-border, #e2e8f0)',
                              color: isTrackPlaying ? '#ffffff' : 'var(--theme-text-muted, #64748b)',
                              fontSize: 16,
                              flexShrink: 0,
                            }}
                          >
                            <CustomerServiceOutlined />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong
                                style={{
                                  fontSize: 13,
                                  color: 'var(--theme-text)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 240,
                                }}
                              >
                                {track.name}
                              </strong>
                              {isSelected && (
                                <Tag color="success" icon={<CheckCircleFilled />} style={{ fontSize: 10 }}>
                                  Active
                                </Tag>
                              )}
                            </div>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              Size: {formatFileSize(track.size)}
                              {track.duration ? ` • Length: ${formatDuration(track.duration)}` : ''}
                            </Text>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Button
                            size="small"
                            type={isTrackPlaying ? 'primary' : 'default'}
                            icon={isTrackPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
                            onClick={() => {
                              if (isSelected) {
                                togglePlay();
                              } else {
                                selectTrack(track.id, true);
                              }
                            }}
                          >
                            {isTrackPlaying ? 'Pause' : 'Play'}
                          </Button>

                          <Tooltip title="Download this audio file to your computer">
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={() => {
                                downloadTrack(track.id);
                                message.success(`Downloading "${track.name}"...`);
                              }}
                            />
                          </Tooltip>

                          <Popconfirm
                            title="Delete track"
                            description="Are you sure you want to remove this audio file?"
                            onConfirm={async () => {
                              await deleteTrack(track.id);
                              message.info('Track removed from library.');
                            }}
                            okText="Yes, delete"
                            cancelText="Cancel"
                          >
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              title="Delete track"
                            />
                          </Popconfirm>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </Col>

        {/* Right Column: Upload Music & Storage Management */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UploadOutlined style={{ color: '#2563eb' }} />
                <span>Upload Music Track (نیا میوزک اپلوڈ کریں)</span>
              </div>
            }
            bordered
            style={{ borderRadius: 12, height: '100%' }}
          >
            <Dragger
              name="file"
              multiple={false}
              showUploadList={false}
              beforeUpload={handleCustomUpload}
              accept="audio/*,.mp3,.wav,.ogg,.aac,.m4a,.flac,.webm"
              style={{
                padding: '24px 16px',
                borderRadius: 12,
                border: '2px dashed var(--theme-border, #cbd5e1)',
                background: 'var(--theme-bg-subtle, #f8fafc)',
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#10b981', fontSize: 44 }} />
              </p>
              <p className="ant-upload-text" style={{ fontSize: 14, fontWeight: 600 }}>
                Click or drag audio file to upload
              </p>
              <p className="ant-upload-hint" style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>
                Supports MP3, WAV, AAC, OGG, M4A up to 40MB. Stored directly in your browser.
              </p>
            </Dragger>

            {uploading && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <Tag color="processing" icon={<SyncOutlined spin />}>
                  Saving track to database...
                </Tag>
              </div>
            )}

            <div
              style={{
                marginTop: 24,
                padding: '16px',
                borderRadius: 8,
                background: 'var(--theme-bg-subtle, #f8fafc)',
                border: '1px solid var(--theme-border, #e2e8f0)',
              }}
            >
              <Title level={5} style={{ margin: '0 0 8px 0', fontSize: 13 }}>
                💡 Quick Instructions & Tips:
              </Title>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--theme-text-muted)', lineHeight: '1.7' }}>
                <li>
                  <strong>Direct Playback:</strong> Uploaded tracks immediately appear in your library and can be played instantly.
                </li>
                <li>
                  <strong>Header Icon Sync:</strong> The sound button in the top header toggles sound for whichever track is currently active.
                </li>
                <li>
                  <strong>Download Track:</strong> Click the <DownloadOutlined /> icon next to any custom track to export and download it to your computer.
                </li>
                <li>
                  <strong>Volume Control:</strong> Adjust the volume slider above ("اندازہ تیز / زیادہ") or use the presets to set your desired sound level.
                </li>
              </ul>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AudioMusicSettings;
