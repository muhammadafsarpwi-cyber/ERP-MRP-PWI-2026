import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Tooltip } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useNavBadgeStore } from './navBadgeStore';
import { useWorkspaceTabStore } from '../../store/workspaceTabStore';

interface UnreadSummaryPayload {
  totalUnread: number;
  directUnread: number;
  groupUnread: number;
  latestUnreadMessage: {
    id: string;
    conversationId: string;
    conversationTitle: string;
    senderName: string;
    content: string;
    createdAt: string;
  } | null;
}

interface UnreadSummaryResponse {
  success: boolean;
  data: UnreadSummaryPayload;
}

const POLL_BACKGROUND_MS = 15000;
const SOUND_MUTE_STORAGE_KEY = 'pwi_team_chat_sound_muted';

/** Plays a subtle, gentle two-tone chime via Web Audio API when a new chat message arrives. */
export function playGentleChatChime(): void {
  try {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SOUND_MUTE_STORAGE_KEY) === 'true') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    // Gentle executive two-note chime (D5 -> A5)
    playTone(587.33, 0, 0.14, 0.06);
    playTone(880.0, 0.11, 0.22, 0.05);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 500);
  } catch {
    /* Web Audio autoplay restriction or unsupported browser — non-fatal */
  }
}

export function triggerTeamChatBadgeSync(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('erp-team-chat-sync'));
  }
}

const TeamChatHeaderIcon: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestPreview, setLatestPreview] = useState<string>('');
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);
  const prevUnreadRef = useRef(0);
  const lastMsgIdRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const syncSidebarBadge = useCallback((count: number) => {
    const store = useNavBadgeStore.getState();
    if (count > 0) {
      store.setNavBadge('/team-chat', count);
    } else {
      store.clearNavBadge('/team-chat');
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await apiService.get<UnreadSummaryResponse>(
        '/team-chat/unread-summary',
        undefined,
        { silent: true },
      );
      if (!mountedRef.current || !res?.data) return;

      const total = Number(res.data.totalUnread || 0);
      const latestId = res.data.latestUnreadMessage?.id || null;

      if (initializedRef.current) {
        const hasNewMessage =
          (total > prevUnreadRef.current && total > 0) ||
          (latestId && latestId !== lastMsgIdRef.current && total > 0);
        if (hasNewMessage) {
          playGentleChatChime();
        }
      }

      initializedRef.current = true;
      prevUnreadRef.current = total;
      lastMsgIdRef.current = latestId;

      setUnreadCount(total);
      syncSidebarBadge(total);

      if (res.data.latestUnreadMessage) {
        const m = res.data.latestUnreadMessage;
        setLatestPreview(`${m.senderName}: ${m.content}`);
      } else {
        setLatestPreview('');
      }
    } catch {
      /* polling failure is non-fatal */
    }
  }, [syncSidebarBadge]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshUnread();
    const timer = window.setInterval(() => {
      void refreshUnread();
    }, POLL_BACKGROUND_MS);

    const onSync = () => {
      void refreshUnread();
    };
    window.addEventListener('erp-team-chat-sync', onSync);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      window.removeEventListener('erp-team-chat-sync', onSync);
    };
  }, [refreshUnread]);

  const handleOpenTeamChat = () => {
    const tabStore = useWorkspaceTabStore.getState();
    tabStore.openTab({
      id: '/team-chat',
      route: '/team-chat',
      pathname: '/team-chat',
      title: 'Team Chat',
      closable: true,
    });
    if (location.pathname !== '/team-chat') {
      navigate('/team-chat');
    }
  };

  const tooltipTitle =
    unreadCount > 0
      ? `Team Chat (${unreadCount} unread)${latestPreview ? ` — ${latestPreview}` : ''}`
      : 'Team Chat (Internal Messaging)';

  return (
    <Tooltip title={tooltipTitle}>
      <span
        data-testid="team-chat-header-icon"
        aria-label="Team Chat"
        role="button"
        tabIndex={0}
        onClick={handleOpenTeamChat}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleOpenTeamChat();
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 38,
          borderRadius: 'var(--ui-radius-md)',
          cursor: 'pointer',
          color: 'var(--theme-primary, #6366f1)',
          background: 'rgba(99, 102, 241, 0.10)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          fontSize: 20,
          transition: 'all 0.2s ease',
        }}
      >
        <Badge
          count={unreadCount}
          overflowCount={99}
          showZero={false}
          offset={[4, -4]}
          styles={{
            root: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
            indicator: {
              backgroundColor: '#ef4444',
              fontWeight: 700,
              fontSize: 11,
              minWidth: 18,
              height: 18,
              lineHeight: '18px',
              padding: '0 5px',
            },
          }}
        >
          <MessageOutlined style={{ fontSize: 20, color: 'var(--theme-primary, #6366f1)' }} />
        </Badge>
      </span>
    </Tooltip>
  );
};

export default TeamChatHeaderIcon;
