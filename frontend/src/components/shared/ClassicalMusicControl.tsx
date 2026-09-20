import React from 'react';
import { Popover, Slider, Tooltip, Button } from 'antd';
import { SoundFilled, SoundOutlined, PlayCircleFilled, PauseCircleFilled } from '@ant-design/icons';
import { useMusicStore } from '../../store/musicStore';

interface ClassicalMusicControlProps {
  compact?: boolean;
}

export const ClassicalMusicControl: React.FC<ClassicalMusicControlProps> = ({ compact = false }) => {
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const volume = useMusicStore((state) => state.volume);
  const togglePlay = useMusicStore((state) => state.togglePlay);
  const setVolume = useMusicStore((state) => state.setVolume);

  const percent = Math.round(volume * 100);

  const popoverContent = (
    <div style={{ width: 220, padding: '6px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--theme-text, #1e293b)' }}>
          Ambient Classical Music
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-primary, #2563eb)' }}>
          {percent}%
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button
          type="text"
          size="small"
          icon={volume > 0 ? <SoundFilled style={{ color: '#2563eb' }} /> : <SoundOutlined style={{ color: '#94a3b8' }} />}
          onClick={() => setVolume(volume > 0 ? 0 : 0.65)}
          title={volume > 0 ? 'Mute' : 'Unmute'}
        />
        <Slider
          min={0}
          max={100}
          value={percent}
          onChange={(val) => setVolume(val / 100)}
          style={{ flex: 1, margin: '6px 0' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <Button
          size="small"
          type={isPlaying ? 'default' : 'primary'}
          icon={isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
          onClick={togglePlay}
          style={{ fontSize: 12, borderRadius: 6, fontWeight: 600 }}
        >
          {isPlaying ? 'Pause Music' : 'Play Music'}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      trigger={['hover', 'click']}
      placement="bottomRight"
    >
      <button
        type="button"
        onClick={togglePlay}
        style={{
          background: isPlaying ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
          border: isPlaying ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
          borderRadius: 6,
          padding: compact ? '4px 8px' : '5px 10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          color: isPlaying ? 'var(--theme-primary, #2563eb)' : 'var(--theme-text-muted, #64748b)',
          transition: 'all 0.2s ease',
          outline: 'none',
        }}
        title={`Ambient Classical Music (${isPlaying ? `Playing ${percent}%` : 'Paused'}) — Click to toggle, hover for volume slider`}
      >
        {isPlaying ? (
          <SoundFilled style={{ fontSize: 16, color: 'var(--theme-primary, #2563eb)' }} />
        ) : (
          <SoundOutlined style={{ fontSize: 16 }} />
        )}
        {!compact && (
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            {isPlaying ? `${percent}%` : 'Music'}
          </span>
        )}
      </button>
    </Popover>
  );
};

export default ClassicalMusicControl;
