import React from 'react';
import { Popover, Slider, Button, Tooltip } from 'antd';
import {
  SoundFilled,
  SoundOutlined,
  PlayCircleFilled,
  PauseCircleFilled,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMusicStore } from '../../store/musicStore';

interface ClassicalMusicControlProps {
  compact?: boolean;
}

export const ClassicalMusicControl: React.FC<ClassicalMusicControlProps> = () => {
  const navigate = useNavigate();
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const volume = useMusicStore((state) => state.volume);
  const activeTrackTitle = useMusicStore((state) => state.activeTrackTitle);
  const togglePlay = useMusicStore((state) => state.togglePlay);
  const setVolume = useMusicStore((state) => state.setVolume);

  const percent = Math.round(volume * 100);

  const popoverContent = (
    <div style={{ width: 230, padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            color: 'var(--theme-text, #1e293b)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 160,
          }}
          title={activeTrackTitle}
        >
          {activeTrackTitle}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>
          {percent}%
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Button
          type="text"
          size="small"
          icon={volume > 0 ? <SoundFilled style={{ color: '#10b981', fontSize: 16 }} /> : <SoundOutlined style={{ color: '#94a3b8', fontSize: 16 }} />}
          onClick={() => setVolume(volume > 0 ? 0 : 0.65)}
          title={volume > 0 ? 'Mute' : 'Unmute'}
        />
        <Slider
          min={0}
          max={100}
          value={percent}
          onChange={(val) => setVolume(val / 100)}
          style={{ flex: 1, margin: '4px 0' }}
          styles={{
            track: { background: '#10b981' },
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 6, borderTop: '1px solid var(--theme-border, #e2e8f0)' }}>
        <Button
          size="small"
          type={isPlaying ? 'default' : 'primary'}
          icon={isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
          onClick={togglePlay}
          style={{ fontSize: 11, borderRadius: 6, fontWeight: 600, flex: 1 }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </Button>

        <Tooltip title="Open Audio & Music Settings in Settings Hub">
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={() => navigate('/settings?tab=audio')}
            style={{ fontSize: 11, borderRadius: 6 }}
          >
            Settings
          </Button>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      trigger={['hover']}
      placement="bottomRight"
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Sound playing. Click to pause/mute.' : 'Sound muted/paused. Click to play.'}
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: isPlaying ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
          border: isPlaying ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid transparent',
          color: isPlaying ? '#10b981' : 'var(--theme-text-muted, #64748b)',
          fontSize: 20,
          transition: 'all 0.2s ease',
          outline: 'none',
          padding: 0,
        }}
        title={`Sound / Music (${isPlaying ? `Playing ${percent}%` : 'Muted/Paused'}) — Click to open/close sound`}
      >
        {isPlaying ? (
          <SoundFilled style={{ fontSize: 21, color: '#10b981' }} />
        ) : (
          <SoundOutlined style={{ fontSize: 20, color: 'var(--theme-text-muted, #64748b)' }} />
        )}
      </button>
    </Popover>
  );
};

export default ClassicalMusicControl;
