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
  hideSettingsLink?: boolean;
}

export const ClassicalMusicControl: React.FC<ClassicalMusicControlProps> = ({
  hideSettingsLink = false,
}) => {
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
            color: 'var(--theme-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 160,
          }}
          title={activeTrackTitle}
        >
          {activeTrackTitle}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-success)' }}>
          {percent}%
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Button
          type="text"
          size="small"
          icon={volume > 0 ? <SoundFilled style={{ color: 'var(--theme-success)', fontSize: 16 }} /> : <SoundOutlined style={{ color: 'var(--theme-text-muted)', fontSize: 16 }} />}
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
            track: { background: 'var(--theme-success)' },
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 6, borderTop: '1px solid var(--theme-border)' }}>
        <Button
          size="small"
          type={isPlaying ? 'default' : 'primary'}
          icon={isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
          onClick={togglePlay}
          style={{ fontSize: 11, borderRadius: 'var(--ui-radius-sm)', fontWeight: 600, flex: 1 }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </Button>

        {!hideSettingsLink && (
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
        )}
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
          width: 32,
          height: 32,
          borderRadius: 8,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: isPlaying ? 'var(--theme-success-soft)' : 'transparent',
          border: isPlaying ? '1px solid var(--theme-success)' : '1px solid transparent',
          color: isPlaying ? 'var(--theme-success)' : 'var(--theme-text-muted)',
          fontSize: 17,
          transition: 'all 0.2s ease',
          outline: 'none',
          padding: 0,
        }}
        title={`Ambient Audio (${isPlaying ? `Playing ${percent}%` : 'Muted/Paused'}) — Click to toggle`}
      >
        {isPlaying ? (
          <SoundFilled style={{ fontSize: 18, color: 'var(--theme-success)' }} />
        ) : (
          <SoundOutlined style={{ fontSize: 17, color: 'var(--theme-text-muted)' }} />
        )}
      </button>
    </Popover>
  );
};

export default ClassicalMusicControl;
