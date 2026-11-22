import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Empty,
  Form,
  Grid,
  Image,
  Input,
  Modal,
  Popover,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
  theme,
} from 'antd';
import {
  ArrowLeftOutlined,
  AudioMutedOutlined,
  AudioOutlined,
  CaretRightOutlined,
  CheckCircleFilled,
  CloseCircleOutlined,
  CommentOutlined,
  DeleteOutlined,
  FileTextOutlined,
  LinkOutlined,
  LoadingOutlined,
  MessageOutlined,
  PaperClipOutlined,
  PauseCircleOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  SoundOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useWorkspaceTabStore } from '../../store/workspaceTabStore';
import {
  playGentleChatChime,
  triggerTeamChatBadgeSync,
} from '../../components/layout/TeamChatHeaderIcon';

const { Text } = Typography;

export interface ChatUserItem {
  id: string;
  authUserId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  department: string;
  isSelf: boolean;
  isOnline: boolean;
  lastActiveAt: string | null;
  directConversationId: string | null;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

export interface ChatConversationItem {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string;
  departmentTag: string | null;
  participantCount: number;
  unreadCount: number;
  updatedAt: string;
  createdAt: string;
  partner: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    department: string;
    isOnline: boolean;
    lastActiveAt: string | null;
  } | null;
  lastMessage: {
    id: string;
    content: string;
    messageType?: string;
    audioDurationSec?: number | null;
    senderId: string;
    senderName: string;
    attachmentUrl: string | null;
    attachmentName: string | null;
    erpRefCode: string | null;
    createdAt: string;
  } | null;
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderDepartment: string;
  senderAvatarUrl: string | null;
  isOwn: boolean;
  content: string;
  attachmentUrl: string | null;
  hasAttachment?: boolean;
  attachmentMimePrefix?: string | null;
  attachmentName: string | null;
  erpRefCode: string | null;
  messageType?: 'TEXT' | 'VOICE' | 'ATTACHMENT';
  audioDurationSec?: number | null;
  createdAt: string;
}

const ACTIVE_POLL_INTERVAL_MS = 10000;
const SOUND_MUTE_STORAGE_KEY = 'pwi_team_chat_sound_muted';

const SAMPLE_VOUCHER_SUGGESTIONS = [
  { code: 'SIN-20261016-65057', label: 'Store Issue Note (SIN)' },
  { code: 'PE-2026-03051', label: 'Daily Production Entry' },
  { code: 'PE-2026-03053', label: 'Spoke Production Entry' },
  { code: 'SOC-2026-05806', label: 'Sales Order Confirmation' },
  { code: 'WIP-CS-001', label: 'Spiral Core Item Master' },
];

const DEPARTMENT_TAG_OPTIONS = [
  { value: 'Factory Wide', label: 'Factory Wide' },
  { value: 'Spoke Division', label: 'Spoke Division' },
  { value: 'Control Cable Division', label: 'Control Cable Division' },
  { value: 'Store & Tooling', label: 'Store & Tooling' },
  { value: 'Packing & Dispatch', label: 'Packing & Dispatch' },
  { value: 'Maintenance & Engineering', label: 'Maintenance & Engineering' },
  { value: 'Quality Control', label: 'Quality Control' },
  { value: 'Management & Supervisors', label: 'Management & Supervisors' },
];

function getInitials(name: string): string {
  const parts = String(name || 'U')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatCompactTimestamp(iso?: string | null): string {
  if (!iso) return '';
  const d = dayjs(iso);
  if (!d.isValid()) return '';
  const now = dayjs();
  if (d.isSame(now, 'day')) return d.format('hh:mm A');
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
  return d.format('DD MMM');
}

function formatDateDivider(iso: string): string {
  const d = dayjs(iso);
  if (!d.isValid()) return 'Messages';
  const now = dayjs();
  if (d.isSame(now, 'day')) return 'Today';
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
  return d.format('dddd, DD MMM YYYY');
}

function formatAudioSeconds(sec?: number | null): string {
  const safe = Number.isFinite(Number(sec)) && Number(sec) > 0 ? Math.round(Number(sec)) : 0;
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

function formatRecordingTimer(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

function resolveErpReferenceRoute(code: string): { route: string; moduleName: string } {
  const upper = String(code || '').trim().toUpperCase();
  if (upper.startsWith('SIN-')) {
    return { route: '/store/material-issues', moduleName: 'Store Issue Notes (SIN)' };
  }
  if (upper.startsWith('MRN-') || upper.startsWith('SRN-')) {
    return { route: '/store/material-returns', moduleName: 'Store Returns' };
  }
  if (upper.startsWith('GRN-') || upper.startsWith('MR-')) {
    return { route: '/store/material-receipts', moduleName: 'Material Receipts' };
  }
  if (upper.startsWith('PE-')) {
    return { route: '/production/entries', moduleName: 'Daily Production Entry' };
  }
  if (upper.startsWith('PKG-')) {
    return { route: '/production/packing', moduleName: 'Daily Packing Entry' };
  }
  if (upper.startsWith('SOC-') || upper.startsWith('SO-')) {
    return { route: '/sales/orders', moduleName: 'Sales Orders' };
  }
  if (upper.startsWith('PO-')) {
    return { route: '/procurement/orders', moduleName: 'Purchase Orders' };
  }
  if (upper.startsWith('JC-')) {
    return { route: '/maintenance/job-cards', moduleName: 'Maintenance Job Cards' };
  }
  if (upper.startsWith('WIP-') || upper.startsWith('SPI-') || upper.startsWith('RM-') || upper.startsWith('FG-')) {
    return { route: '/master-data/items', moduleName: 'Products & Items' };
  }
  return { route: '/production/entries', moduleName: 'ERP Record' };
}

function isImageAttachment(url?: string | null, name?: string | null, mimePrefix?: string | null): boolean {
  if (mimePrefix?.startsWith('data:image/')) return true;
  if (url?.startsWith('data:image/')) return true;
  const target = (name || url || '').toLowerCase();
  if (!target) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(target);
}

function isAudioMessage(msg: ChatMessageItem): boolean {
  if (msg.messageType === 'VOICE') return true;
  if (msg.attachmentMimePrefix?.startsWith('data:audio/')) return true;
  if (msg.attachmentUrl?.startsWith('data:audio/')) return true;
  const target = (msg.attachmentName || msg.attachmentUrl || '').toLowerCase();
  return /\.(webm|ogg|mp3|wav|m4a)$/.test(target);
}

const AVATAR_PALETTE = [
  '#4f46e5',
  '#0284c7',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0d9488',
  '#2563eb',
];

function avatarColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

const WAVE_BAR_HEIGHTS = [35, 65, 50, 85, 60, 95, 45, 75, 90, 55, 80, 48, 70, 92, 60, 40, 75, 52];
const STUDIO_WAVE_BAR_COUNT = 22;
const INITIAL_STUDIO_LEVELS = Array.from({ length: STUDIO_WAVE_BAR_COUNT }, () => 16);
const STUDIO_PREVIEW_BAR_HEIGHTS = [
  24, 48, 34, 72, 54, 88, 42, 66, 82, 50, 76, 40, 68, 90, 58, 36, 70, 52, 64, 44, 58, 30,
];

/** Compact custom-styled inline Audio Player for Voice Notes inside chat bubbles. */
const InlineVoiceNotePlayer: React.FC<{
  src: string | null;
  durationSec?: number | null;
  isOwn: boolean;
  loading?: boolean;
  onLoadSrc?: () => Promise<string | null>;
}> = ({ src, durationSec, isOwn, loading = false, onLoadSrc }) => {
  const { token } = theme.useToken();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [localSrc, setLocalSrc] = useState<string | null>(src);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState<number>(
    durationSec && durationSec > 0 ? durationSec : 0,
  );

  useEffect(() => {
    if (src) setLocalSrc(src);
  }, [src]);

  useEffect(() => {
    if (durationSec && durationSec > 0) {
      setTotalDuration(durationSec);
    }
  }, [durationSec]);

  const effectiveSrc = src || localSrc;

  const togglePlay = async () => {
    if (!effectiveSrc) {
      if (!onLoadSrc || fetching) return;
      setFetching(true);
      try {
        const fetched = await onLoadSrc();
        if (fetched) {
          setLocalSrc(fetched);
          window.setTimeout(() => {
            const audio = audioRef.current;
            if (audio) {
              Promise.resolve(audio.play())
                .then(() => setPlaying(true))
                .catch(() => setPlaying(false));
            }
          }, 40);
        }
      } finally {
        setFetching(false);
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      Promise.resolve(audio.play())
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !totalDuration || totalDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const nextTime = ratio * totalDuration;
    if (Number.isFinite(nextTime)) {
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    }
  };

  const progressPct =
    totalDuration > 0 ? Math.min(100, Math.round((currentTime / totalDuration) * 100)) : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        borderRadius: 10,
        minWidth: 215,
        maxWidth: 280,
        background: isOwn ? 'rgba(255, 255, 255, 0.14)' : token.colorFillAlter,
        border: isOwn
          ? '1px solid rgba(255, 255, 255, 0.24)'
          : `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <audio
        ref={audioRef}
        src={effectiveSrc || undefined}
        preload="none"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setTotalDuration(Math.round(d));
          }
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime || 0);
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0 && !totalDuration) {
            setTotalDuration(Math.round(d));
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setPlaying(false)}
      />

      <button
        type="button"
        onClick={() => void togglePlay()}
        disabled={loading || fetching}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: isOwn ? token.colorBgContainer : token.colorPrimary,
          color: isOwn ? token.colorPrimary : token.colorTextLightSolid,
          fontSize: 15,
          boxShadow: token.boxShadowTertiary,
        }}
      >
        {loading || fetching ? <LoadingOutlined /> : playing ? <PauseOutlined /> : <CaretRightOutlined style={{ marginLeft: 2 }} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Waveform & Progress Track */}
        <div
          onClick={handleSeek}
          title="Click to seek"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2.5,
            height: 20,
            cursor: 'pointer',
            marginBottom: 3,
          }}
        >
          {WAVE_BAR_HEIGHTS.map((h, idx) => {
            const barPct = ((idx + 1) / WAVE_BAR_HEIGHTS.length) * 100;
            const active = progressPct >= barPct;
            return (
              <span
                key={idx}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  minHeight: 4,
                  borderRadius: 2,
                  background: isOwn
                    ? active
                      ? token.colorTextLightSolid
                      : 'rgba(255, 255, 255, 0.38)'
                    : active
                    ? token.colorPrimary
                    : token.colorBorder,
                  transition: 'background 0.12s ease',
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10.5,
            fontWeight: 600,
            color: isOwn ? token.colorTextLightSolid : token.colorTextSecondary,
            opacity: isOwn ? 0.9 : 1,
          }}
        >
          <span>
            <AudioOutlined style={{ marginRight: 4 }} />
            Voice Note
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {playing || currentTime > 0
              ? `${formatAudioSeconds(currentTime)} / ${formatAudioSeconds(totalDuration)}`
              : formatAudioSeconds(totalDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};

const TeamChat: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

  const [mobilePane, setMobilePane] = useState<'DIRECTORY' | 'CHAT'>('DIRECTORY');

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    department: string;
    avatarUrl: string | null;
  } | null>(null);

  const [users, setUsers] = useState<ChatUserItem[]>([]);
  const [conversations, setConversations] = useState<ChatConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);

  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [loadedAttachments, setLoadedAttachments] = useState<Record<string, string>>({});
  const [loadingAttachmentIds, setLoadingAttachmentIds] = useState<Record<string, boolean>>({});

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [directoryFilter, setDirectoryFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const [draftText, setDraftText] = useState<string>('');
  const [draftErpRef, setDraftErpRef] = useState<string>('');
  const [erpRefPopoverOpen, setErpRefPopoverOpen] = useState<boolean>(false);
  const [draftAttachment, setDraftAttachment] = useState<{
    url: string;
    name: string;
  } | null>(null);

  // + New Group Modal state
  const [newGroupOpen, setNewGroupOpen] = useState<boolean>(false);
  const [creatingGroup, setCreatingGroup] = useState<boolean>(false);
  const [newGroupForm] = Form.useForm();

  // Voice Note Recording & Voice Studio state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [studioWaveLevels, setStudioWaveLevels] = useState<number[]>(INITIAL_STUDIO_LEVELS);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [previewCurrentSec, setPreviewCurrentSec] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingMimeRef = useRef<string>('audio/webm');
  const recordingTimerRef = useRef<number | null>(null);
  const pauseFlushTimerRef = useRef<number | null>(null);
  const recordingSecondsRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const mediaSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const waveRafRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioUrlRef = useRef<string | null>(null);

  const [soundMuted, setSoundMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SOUND_MUTE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const feedBottomRef = useRef<HTMLDivElement | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const lastLatestMsgIdRef = useRef<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  activeConvIdRef.current = activeConversationId;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      feedBottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, []);

  const clearPreviewAudio = useCallback(() => {
    if (pauseFlushTimerRef.current !== null) {
      window.clearTimeout(pauseFlushTimerRef.current);
      pauseFlushTimerRef.current = null;
    }
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (previewAudioUrlRef.current) {
      URL.revokeObjectURL(previewAudioUrlRef.current);
      previewAudioUrlRef.current = null;
    }
    setPreviewAudioUrl(null);
    setIsPreviewPlaying(false);
    setPreviewCurrentSec(0);
  }, []);

  const stopWaveformLoop = useCallback(() => {
    if (waveRafRef.current !== null) {
      window.cancelAnimationFrame(waveRafRef.current);
      waveRafRef.current = null;
    }
  }, []);

  const stopMediaTracks = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    stopWaveformLoop();
    try {
      mediaSourceNodeRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      analyserNodeRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    mediaSourceNodeRef.current = null;
    analyserNodeRef.current = null;
    if (audioContextRef.current) {
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      void ctx.close().catch(() => {});
    }
    clearPreviewAudio();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, [clearPreviewAudio, stopWaveformLoop]);

  const fetchDirectoryAndConversations = useCallback(async (autoSelectFirst = false) => {
    try {
      const [usersRes, convRes] = await Promise.all([
        apiService.get<{
          success: boolean;
          data: { currentUser: any; users: ChatUserItem[] };
        }>('/team-chat/users', undefined, { silent: true }),
        apiService.get<{
          success: boolean;
          data: ChatConversationItem[];
        }>('/team-chat/conversations', undefined, { silent: true }),
      ]);

      if (!mountedRef.current) return;

      if (usersRes?.data?.currentUser) {
        setCurrentUser(usersRes.data.currentUser);
      }
      const loadedUsers = usersRes?.data?.users || [];
      const loadedConvs = convRes?.data || [];

      setUsers(loadedUsers);
      setConversations(loadedConvs);

      if (autoSelectFirst && !activeConvIdRef.current && loadedConvs.length > 0) {
        const generalGroup =
          loadedConvs.find(
            (c) => c.type === 'GROUP' && c.title.toLowerCase() === '#general-factory',
          ) || loadedConvs[0];
        setActiveConversationId(generalGroup.id);
      }
    } catch {
      /* ignore background error */
    } finally {
      if (mountedRef.current) {
        setInitialLoading(false);
      }
    }
  }, []);

  const loadMessageAttachment = useCallback(
    async (messageId: string): Promise<string | null> => {
      if (loadedAttachments[messageId]) return loadedAttachments[messageId];
      setLoadingAttachmentIds((prev) => ({ ...prev, [messageId]: true }));
      try {
        const res = await apiService.get<{
          success: boolean;
          data: { id: string; attachmentUrl: string | null };
        }>(`/team-chat/messages/${messageId}/attachment`, undefined, { silent: true });
        const url = res?.data?.attachmentUrl || null;
        if (url && mountedRef.current) {
          setLoadedAttachments((prev) => ({ ...prev, [messageId]: url }));
        }
        return url;
      } catch {
        message.error('Failed to load message attachment');
        return null;
      } finally {
        if (mountedRef.current) {
          setLoadingAttachmentIds((prev) => ({ ...prev, [messageId]: false }));
        }
      }
    },
    [loadedAttachments, message],
  );

  const fetchActiveMessages = useCallback(
    async (convId: string, showSpinner = false) => {
      if (!convId) return;
      if (showSpinner) setMessagesLoading(true);
      try {
        const res = await apiService.get<{
          success: boolean;
          data: {
            conversationId: string;
            currentUserId: string;
            messages: ChatMessageItem[];
          };
        }>(`/team-chat/conversations/${convId}/messages`, { limit: 60 }, { silent: true, useEtag: true });

        if (!mountedRef.current || activeConvIdRef.current !== convId) return;
        const list = res?.data?.messages || [];

        const prevLastId = lastLatestMsgIdRef.current;
        const nextLast = list.length > 0 ? list[list.length - 1] : null;
        const nextLastId = nextLast?.id || null;

        setMessages(list);

        if (nextLastId && nextLastId !== prevLastId) {
          if (prevLastId && nextLast && !nextLast.isOwn) {
            playGentleChatChime();
          }
          lastLatestMsgIdRef.current = nextLastId;
          scrollToBottom(showSpinner ? 'auto' : 'smooth');
        }

        // Clear local unread count on the opened conversation
        setConversations((prev) =>
          prev.map((c) => (c.id === convId && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c)),
        );
        setUsers((prev) =>
          prev.map((u) =>
            u.directConversationId === convId && u.unreadCount > 0 ? { ...u, unreadCount: 0 } : u,
          ),
        );
        triggerTeamChatBadgeSync();
      } catch {
        /* non-fatal */
      } finally {
        if (mountedRef.current && showSpinner) {
          setMessagesLoading(false);
        }
      }
    },
    [scrollToBottom],
  );

  useEffect(() => {
    mountedRef.current = true;
    void fetchDirectoryAndConversations(true);
    return () => {
      mountedRef.current = false;
      stopMediaTracks();
    };
  }, [fetchDirectoryAndConversations, stopMediaTracks]);

  useEffect(() => {
    if (!activeConversationId) return;
    lastLatestMsgIdRef.current = null;
    void fetchActiveMessages(activeConversationId, true);
  }, [activeConversationId, fetchActiveMessages]);

  // 10-second active polling for messages & directory — paused when browser tab is hidden
  // OR when Team Chat is inactive in a background workspace keep-alive tab.
  const isTeamChatActive = useWorkspaceTabStore((s) => s.activeTabId === '/team-chat');
  const prevTeamChatActiveRef = useRef<boolean>(isTeamChatActive);

  useEffect(() => {
    const runPoll = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (useWorkspaceTabStore.getState().activeTabId !== '/team-chat') return;
      void fetchDirectoryAndConversations(false);
      if (activeConvIdRef.current) {
        void fetchActiveMessages(activeConvIdRef.current, false);
      }
    };
    if (isTeamChatActive && !prevTeamChatActiveRef.current) {
      // Single catch-up sync when switching back into the Team Chat tab
      runPoll();
    }
    prevTeamChatActiveRef.current = isTeamChatActive;

    const timer = window.setInterval(runPoll, ACTIVE_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        runPoll();
      }
    };
    document?.addEventListener?.('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document?.removeEventListener?.('visibilitychange', onVisibilityChange);
    };
  }, [fetchDirectoryAndConversations, fetchActiveMessages, isTeamChatActive]);

  const handleSelectGroup = (conv: ChatConversationItem) => {
    setActiveConversationId(conv.id);
    if (isMobile) setMobilePane('CHAT');
  };

  const handleSelectPerson = async (person: ChatUserItem) => {
    if (person.directConversationId) {
      setActiveConversationId(person.directConversationId);
      if (isMobile) setMobilePane('CHAT');
      return;
    }
    try {
      const res = await apiService.post<{
        success: boolean;
        data: ChatConversationItem;
      }>(`/team-chat/conversations/direct/${person.id}`, {});
      if (res?.data?.id) {
        await fetchDirectoryAndConversations(false);
        setActiveConversationId(res.data.id);
        if (isMobile) setMobilePane('CHAT');
      }
    } catch {
      message.error('Could not open direct conversation');
    }
  };

  const handleCreateGroupSubmit = async () => {
    try {
      const values = await newGroupForm.validateFields();
      setCreatingGroup(true);
      const res = await apiService.post<{
        success: boolean;
        data: ChatConversationItem;
      }>('/team-chat/conversations/group', {
        title: values.title,
        departmentTag: values.departmentTag || 'Factory Team',
        memberIds: values.memberIds || [],
      });

      if (res?.data?.id) {
        message.success(`Group ${res.data.title} created`);
        setNewGroupOpen(false);
        newGroupForm.resetFields();
        await fetchDirectoryAndConversations(false);
        setActiveConversationId(res.data.id);
        if (isMobile) setMobilePane('CHAT');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error('Failed to create group channel');
    } finally {
      if (mountedRef.current) {
        setCreatingGroup(false);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!activeConversationId) return;
    const text = draftText.trim();
    const refCode = draftErpRef.trim().toUpperCase();
    const attachment = draftAttachment;

    if (!text && !refCode && !attachment) return;

    setSending(true);
    try {
      const res = await apiService.post<{
        success: boolean;
        data: ChatMessageItem;
      }>(`/team-chat/conversations/${activeConversationId}/messages`, {
        content: text,
        erpRefCode: refCode || null,
        attachmentUrl: attachment?.url || null,
        attachmentName: attachment?.name || null,
        messageType: attachment ? 'ATTACHMENT' : 'TEXT',
      });

      if (res?.data) {
        if (res.data.attachmentUrl) {
          setLoadedAttachments((prev) => ({ ...prev, [res.data.id]: res.data.attachmentUrl! }));
        }
        setDraftText('');
        setDraftErpRef('');
        setDraftAttachment(null);
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
        lastLatestMsgIdRef.current = res.data.id;
        scrollToBottom('smooth');
        void fetchDirectoryAndConversations(false);
        triggerTeamChatBadgeSync();
      }
    } catch {
      message.error('Failed to send message');
    } finally {
      if (mountedRef.current) {
        setSending(false);
      }
    }
  };

  const startWaveformLoop = useCallback(() => {
    stopWaveformLoop();
    const analyser = analyserNodeRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    let lastPaintTs = 0;

    const tick = (ts: number) => {
      const currentAnalyser = analyserNodeRef.current;
      if (!currentAnalyser || !mountedRef.current) return;

      if (ts - lastPaintTs >= 45) {
        lastPaintTs = ts;
        currentAnalyser.getByteFrequencyData(freqData);

        const usableBins = Math.max(STUDIO_WAVE_BAR_COUNT, Math.min(bufferLength - 1, 44));
        const nextLevels: number[] = [];
        for (let i = 0; i < STUDIO_WAVE_BAR_COUNT; i++) {
          const startBin = Math.floor((i / STUDIO_WAVE_BAR_COUNT) * usableBins) + 1;
          const endBin = Math.min(
            bufferLength - 1,
            Math.max(startBin, Math.floor(((i + 1) / STUDIO_WAVE_BAR_COUNT) * usableBins)),
          );
          let peak = 0;
          for (let b = startBin; b <= endBin; b++) {
            if (freqData[b] > peak) peak = freqData[b];
          }
          const normalized = peak / 255;
          const boosted = Math.pow(normalized, 0.72);
          nextLevels.push(Math.max(14, Math.min(100, Math.round(14 + boosted * 86))));
        }
        setStudioWaveLevels(nextLevels);
      }

      waveRafRef.current = window.requestAnimationFrame(tick);
    };

    waveRafRef.current = window.requestAnimationFrame(tick);
  }, [stopWaveformLoop]);

  const setupAudioAnalyser = useCallback(
    (stream: MediaStream) => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);

        audioContextRef.current = ctx;
        mediaSourceNodeRef.current = source;
        analyserNodeRef.current = analyser;
        startWaveformLoop();
      } catch {
        /* Fallback to static idle bars if AudioContext is restricted */
      }
    },
    [startWaveformLoop],
  );

  const handleStartVoiceRecording = async () => {
    if (!activeConversationId) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof window.MediaRecorder === 'undefined'
    ) {
      message.warning('Voice recording is not supported in this browser environment');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      clearPreviewAudio();

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      let chosenMime = '';
      for (const candidate of preferredTypes) {
        if (
          typeof MediaRecorder.isTypeSupported === 'function' &&
          MediaRecorder.isTypeSupported(candidate)
        ) {
          chosenMime = candidate;
          break;
        }
      }

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      recordingMimeRef.current = recorder.mimeType || chosenMime || 'audio/webm';

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);

      setupAudioAnalyser(stream);

      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
      setIsRecordingPaused(false);
      setStudioWaveLevels(INITIAL_STUDIO_LEVELS);
      setIsRecording(true);

      recordingTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);
    } catch {
      message.error('Microphone access was denied or no microphone was found');
      stopMediaTracks();
      setIsRecording(false);
      setIsRecordingPaused(false);
    }
  };

  const handleCancelVoiceRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    audioChunksRef.current = [];
    stopMediaTracks();
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingSeconds(0);
    setStudioWaveLevels(INITIAL_STUDIO_LEVELS);
  }, [stopMediaTracks]);

  // Cancel active voice recording cleanly if the user switches conversation
  useEffect(() => {
    return () => {
      handleCancelVoiceRecording();
    };
  }, [activeConversationId, handleCancelVoiceRecording]);

  const handlePauseVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !isRecording || isRecordingPaused) return;

    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    stopWaveformLoop();

    try {
      if (recorder.state === 'recording') {
        if (typeof recorder.requestData === 'function') {
          recorder.requestData();
        }
        if (typeof recorder.pause === 'function') {
          recorder.pause();
        }
      }
    } catch {
      /* ignore */
    }

    setIsRecordingPaused(true);
    setStudioWaveLevels(STUDIO_PREVIEW_BAR_HEIGHTS);

    if (pauseFlushTimerRef.current !== null) {
      window.clearTimeout(pauseFlushTimerRef.current);
    }
    pauseFlushTimerRef.current = window.setTimeout(() => {
      pauseFlushTimerRef.current = null;
      if (!mountedRef.current || audioChunksRef.current.length === 0) return;
      const mime = recordingMimeRef.current || recorder.mimeType || 'audio/webm';
      const previewBlob = new Blob(audioChunksRef.current, { type: mime });
      if (previewBlob.size === 0) return;
      if (previewAudioUrlRef.current) {
        URL.revokeObjectURL(previewAudioUrlRef.current);
      }
      const nextUrl = URL.createObjectURL(previewBlob);
      previewAudioUrlRef.current = nextUrl;
      setPreviewAudioUrl(nextUrl);
      setPreviewCurrentSec(0);
    }, 90);
  };

  const handleResumeVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !isRecording || !isRecordingPaused) return;

    clearPreviewAudio();
    setIsRecordingPaused(false);
    setStudioWaveLevels(INITIAL_STUDIO_LEVELS);

    try {
      if (recorder.state === 'paused' && typeof recorder.resume === 'function') {
        recorder.resume();
      }
    } catch {
      /* ignore */
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume().catch(() => {});
    }
    startWaveformLoop();

    if (recordingTimerRef.current === null) {
      recordingTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);
    }
  };

  const handleTogglePreviewPlay = () => {
    const audio = previewAudioRef.current;
    if (!audio || !previewAudioUrl) return;
    if (isPreviewPlaying) {
      audio.pause();
      setIsPreviewPlaying(false);
    } else {
      Promise.resolve(audio.play())
        .then(() => setIsPreviewPlaying(true))
        .catch(() => {
          setIsPreviewPlaying(false);
          message.warning('Unable to preview audio in this browser');
        });
    }
  };

  const handleSeekPreview = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRecordingPaused) return;
    const audio = previewAudioRef.current;
    const total = Math.max(1, recordingSecondsRef.current || recordingSeconds || 1);
    if (!audio || !previewAudioUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const nextTime = ratio * total;
    if (Number.isFinite(nextTime)) {
      try {
        audio.currentTime = nextTime;
        setPreviewCurrentSec(nextTime);
      } catch {
        /* ignore seek error on unbuffered stream */
      }
    }
  };

  const uploadRecordedVoiceBlob = (
    convId: string,
    blob: Blob,
    mimeType: string,
    durationSec: number,
  ) => {
    if (blob.size === 0) {
      message.warning('Recorded voice note was empty');
      return;
    }
    const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      setSending(true);
      try {
        const refCode = draftErpRef.trim().toUpperCase();
        const res = await apiService.post<{
          success: boolean;
          data: ChatMessageItem;
        }>(`/team-chat/conversations/${convId}/messages`, {
          content: draftText.trim(),
          erpRefCode: refCode || null,
          attachmentUrl: reader.result,
          attachmentName: `voice-note-${dayjs().format('HHmmss')}.${ext}`,
          messageType: 'VOICE',
          audioDurationSec: durationSec,
        });

        if (res?.data) {
          if (res.data.attachmentUrl) {
            setLoadedAttachments((prev) => ({ ...prev, [res.data.id]: res.data.attachmentUrl! }));
          }
          setDraftText('');
          setDraftErpRef('');
          setMessages((prev) => {
            if (prev.some((m) => m.id === res.data.id)) return prev;
            return [...prev, res.data];
          });
          lastLatestMsgIdRef.current = res.data.id;
          scrollToBottom('smooth');
          void fetchDirectoryAndConversations(false);
          triggerTeamChatBadgeSync();
        }
      } catch {
        message.error('Failed to send voice note');
      } finally {
        if (mountedRef.current) {
          setSending(false);
        }
      }
    };
    reader.readAsDataURL(blob);
  };

  const handleSendVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    const convId = activeConversationId;
    if (!recorder || !convId) {
      handleCancelVoiceRecording();
      return;
    }

    const durationSec = Math.max(1, recordingSecondsRef.current || recordingSeconds || 1);
    const mimeType = recordingMimeRef.current || recorder.mimeType || 'audio/webm';

    if (recorder.state === 'inactive') {
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];
      stopMediaTracks();
      setIsRecording(false);
      setIsRecordingPaused(false);
      setRecordingSeconds(0);
      setStudioWaveLevels(INITIAL_STUDIO_LEVELS);
      uploadRecordedVoiceBlob(convId, blob, mimeType, durationSec);
      return;
    }

    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];
      stopMediaTracks();
      setIsRecording(false);
      setIsRecordingPaused(false);
      setRecordingSeconds(0);
      setStudioWaveLevels(INITIAL_STUDIO_LEVELS);
      uploadRecordedVoiceBlob(convId, blob, mimeType, durationSec);
    };

    try {
      recorder.stop();
    } catch {
      handleCancelVoiceRecording();
    }
  };

  const handleAttachmentSelect = (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      message.warning('File size must be under 15 MB');
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraftAttachment({
          url: reader.result,
          name: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
    return false;
  };

  const toggleSoundMute = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    try {
      localStorage.setItem(SOUND_MUTE_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
    if (!next) {
      playGentleChatChime();
    }
  };

  const handleErpChipClick = (code: string) => {
    const { route, moduleName } = resolveErpReferenceRoute(code);
    try {
      navigator.clipboard?.writeText(code);
    } catch {
      /* ignore */
    }
    message.info(`Opening ${moduleName} (${code} copied to clipboard)`);
    navigate(route);
  };

  const groupChannels = useMemo(
    () => conversations.filter((c) => c.type === 'GROUP'),
    [conversations],
  );

  const totalUnreadCount = useMemo(() => {
    const groupUnread = groupChannels.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    const directUnread = users.reduce((acc, u) => acc + (u.unreadCount || 0), 0);
    return groupUnread + directUnread;
  }, [groupChannels, users]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groupChannels.filter((g) => {
      if (directoryFilter === 'UNREAD' && g.unreadCount <= 0) return false;
      if (!q) return true;
      return (
        (g.title || '').toLowerCase().includes(q) ||
        (g.departmentTag || '').toLowerCase().includes(q) ||
        (g.lastMessage?.content || '').toLowerCase().includes(q)
      );
    });
  }, [groupChannels, searchQuery, directoryFilter]);

  const filteredPeople = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (directoryFilter === 'UNREAD' && u.unreadCount <= 0) return false;
      if (!q) return true;
      return (
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, directoryFilter]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  const activePerson = useMemo(() => {
    if (!activeConversation || activeConversation.type !== 'DIRECT') return null;
    if (activeConversation.partner) {
      return (
        users.find((u) => u.id === activeConversation.partner?.id) || {
          ...activeConversation.partner,
          authUserId: activeConversation.partner.id,
          phone: null,
          isSelf: activeConversation.partner.id === currentUser?.id,
          directConversationId: activeConversation.id,
          unreadCount: 0,
          lastMessage: null,
          lastMessageAt: null,
        }
      );
    }
    return null;
  }, [activeConversation, users, currentUser]);

  const onlineUserCount = useMemo(
    () => users.filter((u) => u.isOnline).length,
    [users],
  );

  const groupedMessages = useMemo(() => {
    const groups: Array<{ dateKey: string; dateLabel: string; items: ChatMessageItem[] }> = [];
    for (const m of messages) {
      const d = dayjs(m.createdAt);
      const dateKey = d.isValid() ? d.format('YYYY-MM-DD') : 'unknown';
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.dateKey !== dateKey) {
        groups.push({
          dateKey,
          dateLabel: formatDateDivider(m.createdAt),
          items: [m],
        });
      } else {
        lastGroup.items.push(m);
      }
    }
    return groups;
  }, [messages]);

  const voucherPopoverContent = (
    <div style={{ width: 290 }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: token.colorText }}>
        Link ERP Voucher / Entry Number
      </div>
      <Input
        placeholder="e.g. SIN-20261016-65057 or PE-2026-03051"
        value={draftErpRef}
        onChange={(e) => setDraftErpRef(e.target.value.toUpperCase())}
        allowClear
        size="small"
        onPressEnter={() => setErpRefPopoverOpen(false)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 6 }}>
        Quick Prefixes & Recent References:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SAMPLE_VOUCHER_SUGGESTIONS.map((item) => (
          <div
            key={item.code}
            onClick={() => {
              setDraftErpRef(item.code);
              setErpRefPopoverOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 8px',
              borderRadius: token.borderRadiusSM,
              cursor: 'pointer',
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600, color: token.colorPrimary }}>{item.code}</span>
            <span style={{ fontSize: 11, color: token.colorTextSecondary }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const showDirectoryPane = !isMobile || mobilePane === 'DIRECTORY';
  const showConversationPane = !isMobile || mobilePane === 'CHAT';

  return (
    <div
      style={{
        display: 'flex',
        height: isMobile ? 'calc(100vh - 132px)' : 'calc(100vh - 148px)',
        minHeight: 500,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        overflow: 'hidden',
      }}
    >
      {/* LEFT PANE: PEOPLE & GROUPS DIRECTORY (315px on desktop, 100% on mobile directory view) */}
      {showDirectoryPane && (
        <div
          style={{
            width: isMobile ? '100%' : 315,
            minWidth: isMobile ? '100%' : 295,
            maxWidth: isMobile ? '100%' : 330,
            borderRight: isMobile ? 'none' : `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* Directory Top Header */}
          <div
            style={{
              padding: '12px 14px 10px',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorFillAlter,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <Space size={8} align="center">
                <CommentOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: token.colorText }}>
                  Team Directory
                </span>
                <Tag
                  color="success"
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 10,
                    padding: '0 7px',
                  }}
                >
                  {onlineUserCount} Online
                </Tag>
              </Space>
              <Tooltip title={soundMuted ? 'Unmute notification chime' : 'Mute notification chime'}>
                <Button
                  type="text"
                  size="small"
                  icon={
                    soundMuted ? (
                      <AudioMutedOutlined style={{ color: token.colorTextTertiary }} />
                    ) : (
                      <SoundOutlined style={{ color: token.colorPrimary }} />
                    )
                  }
                  onClick={toggleSoundMute}
                />
              </Tooltip>
            </div>

            <Input
              prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
              placeholder="Search people or groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
              size="middle"
              style={{ marginBottom: 8, borderRadius: token.borderRadius }}
            />

            <Segmented
              block
              size="small"
              value={directoryFilter}
              onChange={(val) => setDirectoryFilter(val as 'ALL' | 'UNREAD')}
              options={[
                { label: 'All', value: 'ALL' },
                {
                  label: `Unread (${totalUnreadCount})`,
                  value: 'UNREAD',
                },
              ]}
            />
          </div>

          {/* Scrollable Directory Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 8px 14px',
            }}
          >
            {initialLoading ? (
              <div style={{ textAlign: 'center', padding: 36 }}>
                <Spin tip="Loading directory..." />
              </div>
            ) : (
              <>
                {/* GROUPS / CHANNELS SECTION HEADER + "+ New Group" BUTTON */}
                <div
                  style={{
                    padding: '6px 8px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      color: token.colorTextSecondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    Groups / Channels ({filteredGroups.length})
                  </span>
                  <Button
                    type="primary"
                    ghost
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      newGroupForm.setFieldsValue({
                        title: '',
                        departmentTag: 'Spoke Division',
                        memberIds: users.filter((u) => !u.isSelf).map((u) => u.id),
                      });
                      setNewGroupOpen(true);
                    }}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      height: 24,
                      paddingInline: 8,
                      borderRadius: 6,
                    }}
                  >
                    New Group
                  </Button>
                </div>

                {filteredGroups.length === 0 ? (
                  <div
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      color: token.colorTextTertiary,
                    }}
                  >
                    No matching channels
                  </div>
                ) : (
                  filteredGroups.map((group) => {
                    const isSelected = group.id === activeConversationId;
                    const snippet = group.lastMessage
                      ? `${group.lastMessage.senderName.split(' ')[0]}: ${
                          group.lastMessage.content ||
                          (group.lastMessage.attachmentName
                            ? `📎 ${group.lastMessage.attachmentName}`
                            : group.lastMessage.erpRefCode || '')
                        }`
                      : group.departmentTag || 'Factory Channel';

                    return (
                      <div
                        key={group.id}
                        onClick={() => handleSelectGroup(group)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          marginBottom: 3,
                          borderRadius: token.borderRadius,
                          cursor: 'pointer',
                          background: isSelected ? token.colorPrimaryBg : 'transparent',
                          border: isSelected
                            ? `1px solid ${token.colorPrimaryBorder}`
                            : '1px solid transparent',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 9,
                            background: isSelected ? token.colorPrimary : token.colorFillSecondary,
                            color: isSelected ? token.colorTextLightSolid : token.colorPrimary,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 15,
                            flexShrink: 0,
                          }}
                        >
                          #
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                fontWeight: group.unreadCount > 0 || isSelected ? 700 : 600,
                                fontSize: 13,
                                color: token.colorText,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {group.title.replace(/^#/, '')}
                            </span>
                            <span
                              style={{
                                fontSize: 10.5,
                                color: token.colorTextTertiary,
                                flexShrink: 0,
                              }}
                            >
                              {formatCompactTimestamp(
                                group.lastMessage?.createdAt || group.updatedAt,
                              )}
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                              marginTop: 2,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11.5,
                                color:
                                  group.unreadCount > 0
                                    ? token.colorText
                                    : token.colorTextSecondary,
                                fontWeight: group.unreadCount > 0 ? 600 : 400,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {snippet}
                            </span>
                            {group.unreadCount > 0 && (
                              <Badge
                                count={group.unreadCount}
                                style={{ backgroundColor: token.colorError }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* PEOPLE SECTION */}
                <div
                  style={{
                    padding: '12px 8px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      color: token.colorTextSecondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    People ({filteredPeople.length})
                  </span>
                </div>

                {filteredPeople.length === 0 ? (
                  <div
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      color: token.colorTextTertiary,
                    }}
                  >
                    No matching team members
                  </div>
                ) : (
                  filteredPeople.map((person) => {
                    const isSelected =
                      Boolean(person.directConversationId) &&
                      person.directConversationId === activeConversationId;
                    const roleSubtitle = `${person.role}${
                      person.department ? ` · ${person.department}` : ''
                    }`;

                    return (
                      <div
                        key={person.id}
                        onClick={() => void handleSelectPerson(person)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          marginBottom: 3,
                          borderRadius: token.borderRadius,
                          cursor: 'pointer',
                          background: isSelected ? token.colorPrimaryBg : 'transparent',
                          border: isSelected
                            ? `1px solid ${token.colorPrimaryBorder}`
                            : '1px solid transparent',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <Avatar
                            size={38}
                            src={person.avatarUrl || undefined}
                            style={{
                              backgroundColor: avatarColorForId(person.id),
                              fontWeight: 700,
                              fontSize: 13,
                            }}
                          >
                            {getInitials(person.fullName)}
                          </Avatar>
                          <span
                            title={person.isOnline ? 'Online' : 'Offline'}
                            style={{
                              position: 'absolute',
                              right: 0,
                              bottom: 0,
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              backgroundColor: person.isOnline
                                ? token.colorSuccess
                                : token.colorTextQuaternary,
                              border: `2px solid ${token.colorBgContainer}`,
                            }}
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                fontWeight: person.unreadCount > 0 || isSelected ? 700 : 600,
                                fontSize: 13,
                                color: token.colorText,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {person.fullName}
                              {person.isSelf ? ' (You)' : ''}
                            </span>
                            {person.lastMessageAt && (
                              <span
                                style={{
                                  fontSize: 10.5,
                                  color: token.colorTextTertiary,
                                  flexShrink: 0,
                                }}
                              >
                                {formatCompactTimestamp(person.lastMessageAt)}
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              fontSize: 11,
                              color: token.colorPrimary,
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {roleSubtitle}
                          </div>

                          {person.lastMessage && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 6,
                                marginTop: 1,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11.5,
                                  color:
                                    person.unreadCount > 0
                                      ? token.colorText
                                      : token.colorTextSecondary,
                                  fontWeight: person.unreadCount > 0 ? 600 : 400,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {person.lastMessage}
                              </span>
                              {person.unreadCount > 0 && (
                                <Badge
                                  count={person.unreadCount}
                                  style={{ backgroundColor: token.colorError }}
                                />
                              )}
                            </div>
                          )}
                        </div>

                        {!person.lastMessage && person.unreadCount > 0 && (
                          <Badge
                            count={person.unreadCount}
                            style={{ backgroundColor: token.colorError }}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* RIGHT PANE: ACTIVE CONVERSATION WINDOW */}
      {showConversationPane && (
        <div
          style={{
            flex: 1,
            width: isMobile ? '100%' : undefined,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minWidth: 0,
            background: token.colorBgLayout,
          }}
        >
          {!activeConversation ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                gap: 12,
              }}
            >
              {isMobile && (
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => setMobilePane('DIRECTORY')}
                >
                  Back to Directory
                </Button>
              )}
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ color: token.colorTextSecondary }}>
                    Select a factory channel or team member to start chatting
                  </span>
                }
              />
            </div>
          ) : (
            <>
              {/* Conversation Top Bar */}
              <div
                style={{
                  padding: isMobile ? '8px 12px' : '10px 18px',
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorBgContainer,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {isMobile && (
                    <Button
                      type="text"
                      icon={<ArrowLeftOutlined />}
                      onClick={() => setMobilePane('DIRECTORY')}
                      style={{
                        fontWeight: 600,
                        paddingInline: 8,
                        flexShrink: 0,
                      }}
                    >
                      Back
                    </Button>
                  )}

                  {activeConversation.type === 'GROUP' ? (
                    <div
                      style={{
                        width: isMobile ? 34 : 40,
                        height: isMobile ? 34 : 40,
                        borderRadius: 10,
                        background: token.colorPrimaryBg,
                        color: token.colorPrimary,
                        border: `1px solid ${token.colorPrimaryBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: isMobile ? 16 : 18,
                        flexShrink: 0,
                      }}
                    >
                      #
                    </div>
                  ) : (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar
                        size={isMobile ? 34 : 40}
                        src={activePerson?.avatarUrl || undefined}
                        style={{
                          backgroundColor: avatarColorForId(
                            activePerson?.id || activeConversation.id,
                          ),
                          fontWeight: 700,
                        }}
                      >
                        {getInitials(activePerson?.fullName || activeConversation.title)}
                      </Avatar>
                      <span
                        style={{
                          position: 'absolute',
                          right: 0,
                          bottom: 0,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: activePerson?.isOnline
                            ? token.colorSuccess
                            : token.colorTextQuaternary,
                          border: `2px solid ${token.colorBgContainer}`,
                        }}
                      />
                    </div>
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: isMobile ? 14 : 15.5,
                          color: token.colorText,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {activeConversation.type === 'GROUP'
                          ? activeConversation.title
                          : activePerson?.fullName || activeConversation.title}
                      </span>

                      {activeConversation.type === 'GROUP' ? (
                        <Tag
                          icon={<TeamOutlined />}
                          color="processing"
                          style={{ margin: 0, fontSize: 11, fontWeight: 600 }}
                        >
                          {activeConversation.participantCount} Members
                        </Tag>
                      ) : (
                        <Tag
                          color={activePerson?.isOnline ? 'success' : 'default'}
                          style={{ margin: 0, fontSize: 11, fontWeight: 600 }}
                        >
                          {activePerson?.isOnline ? '● Online' : 'Offline'}
                        </Tag>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: 11.5,
                        color: token.colorTextSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {activeConversation.type === 'GROUP'
                        ? `${activeConversation.departmentTag || 'Factory Department Channel'} · Real-time floor & office feed`
                        : `${activePerson?.role || 'Factory Staff'} · ${
                            activePerson?.department || 'Factory Operations'
                          }`}
                    </div>
                  </div>
                </div>

                <Space size={6} style={{ flexShrink: 0 }}>
                  <Tooltip title="Refresh conversation now">
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        if (activeConversationId) {
                          void fetchActiveMessages(activeConversationId, false);
                          void fetchDirectoryAndConversations(false);
                        }
                      }}
                    >
                      {!isMobile ? 'Sync' : null}
                    </Button>
                  </Tooltip>
                </Space>
              </div>

              {/* Scrollable Message Feed */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: isMobile ? '12px 10px' : '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {messagesLoading && messages.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center' }}>
                    <Spin tip="Loading conversation..." />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 380 }}>
                    <MessageOutlined
                      style={{
                        fontSize: 34,
                        color: token.colorPrimary,
                        marginBottom: 10,
                        opacity: 0.75,
                      }}
                    />
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: token.colorText,
                        marginBottom: 4,
                      }}
                    >
                      No messages in this conversation yet
                    </div>
                    <div style={{ fontSize: 12.5, color: token.colorTextSecondary }}>
                      Send a message, record a voice note, attach a photo/report, or link a Store
                      Issue Note (`SIN-...`) or Production Entry (`PE-...`) below.
                    </div>
                  </div>
                ) : (
                  groupedMessages.map((group) => (
                    <React.Fragment key={group.dateKey}>
                      {/* Date Divider */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '10px 0 8px',
                        }}
                      >
                        <span
                          style={{
                            padding: '3px 12px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: token.colorFillSecondary,
                            color: token.colorTextSecondary,
                            border: `1px solid ${token.colorBorderSecondary}`,
                          }}
                        >
                          {group.dateLabel}
                        </span>
                      </div>

                      {group.items.map((msg) => {
                        const isOwn = msg.isOwn || msg.senderId === currentUser?.id;
                        const resolvedAttachmentUrl =
                          msg.attachmentUrl || loadedAttachments[msg.id] || null;
                        const hasAnyAttachment =
                          Boolean(resolvedAttachmentUrl) || Boolean(msg.hasAttachment);
                        const showVoicePlayer = isAudioMessage(msg) && hasAnyAttachment;
                        const showImage =
                          !showVoicePlayer &&
                          isImageAttachment(
                            resolvedAttachmentUrl,
                            msg.attachmentName,
                            msg.attachmentMimePrefix,
                          );

                        return (
                          <div
                            key={msg.id}
                            style={{
                              display: 'flex',
                              justifyContent: isOwn ? 'flex-end' : 'flex-start',
                              alignItems: 'flex-end',
                              gap: 8,
                              marginBottom: 6,
                            }}
                          >
                            {!isOwn && (
                              <Avatar
                                size={30}
                                src={msg.senderAvatarUrl || undefined}
                                icon={<UserOutlined />}
                                style={{
                                  backgroundColor: avatarColorForId(msg.senderId),
                                  fontWeight: 700,
                                  fontSize: 11.5,
                                  flexShrink: 0,
                                }}
                              >
                                {getInitials(msg.senderName)}
                              </Avatar>
                            )}

                            <div
                              style={{
                                maxWidth: isMobile ? '84%' : '68%',
                                minWidth: 150,
                                padding: '9px 13px',
                                borderRadius: isOwn
                                  ? '14px 14px 3px 14px'
                                  : '14px 14px 14px 3px',
                                background: isOwn ? token.colorPrimary : token.colorBgContainer,
                                color: isOwn ? token.colorTextLightSolid : token.colorText,
                                border: isOwn
                                  ? `1px solid ${token.colorPrimary}`
                                  : `1px solid ${token.colorBorderSecondary}`,
                                boxShadow: token.boxShadowTertiary,
                              }}
                            >
                              {/* Sender Name & Role Header */}
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  marginBottom: 4,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    color: isOwn ? token.colorTextLightSolid : token.colorPrimary,
                                    opacity: isOwn ? 0.92 : 1,
                                  }}
                                >
                                  {isOwn ? 'You' : msg.senderName}
                                  {!isOwn && msg.senderRole ? (
                                    <span
                                      style={{
                                        fontWeight: 500,
                                        fontSize: 10.5,
                                        color: token.colorTextSecondary,
                                        marginLeft: 6,
                                      }}
                                    >
                                      ({msg.senderRole})
                                    </span>
                                  ) : null}
                                </span>

                                <span
                                  style={{
                                    fontSize: 10.5,
                                    color: isOwn
                                      ? token.colorTextLightSolid
                                      : token.colorTextTertiary,
                                    opacity: isOwn ? 0.8 : 1,
                                    flexShrink: 0,
                                  }}
                                >
                                  {dayjs(msg.createdAt).format('hh:mm A')}
                                </span>
                              </div>

                              {/* Optional Linked ERP Voucher / Entry Chip */}
                              {msg.erpRefCode && (
                                <div style={{ marginBottom: msg.content || showVoicePlayer ? 6 : 2 }}>
                                  <Tag
                                    icon={<LinkOutlined />}
                                    color={isOwn ? 'default' : 'processing'}
                                    onClick={() => handleErpChipClick(msg.erpRefCode!)}
                                    style={{
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      fontSize: 11.5,
                                      borderRadius: 6,
                                      padding: '2px 8px',
                                      margin: 0,
                                    }}
                                  >
                                    {msg.erpRefCode} ·{' '}
                                    {resolveErpReferenceRoute(msg.erpRefCode).moduleName}
                                  </Tag>
                                </div>
                              )}

                              {/* Inline Voice Note Audio Player */}
                              {showVoicePlayer && hasAnyAttachment && (
                                <div style={{ marginBottom: msg.content ? 6 : 2 }}>
                                  <InlineVoiceNotePlayer
                                    src={resolvedAttachmentUrl}
                                    durationSec={msg.audioDurationSec}
                                    isOwn={isOwn}
                                    loading={Boolean(loadingAttachmentIds[msg.id])}
                                    onLoadSrc={() => loadMessageAttachment(msg.id)}
                                  />
                                </div>
                              )}

                              {/* Optional Image or File Attachment */}
                              {!showVoicePlayer && hasAnyAttachment && (
                                <div style={{ marginBottom: msg.content ? 6 : 2 }}>
                                  {showImage && resolvedAttachmentUrl ? (
                                    <div
                                      style={{
                                        borderRadius: 8,
                                        overflow: 'hidden',
                                        maxWidth: 260,
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                      }}
                                    >
                                      <Image
                                        src={resolvedAttachmentUrl}
                                        alt={msg.attachmentName || 'Attachment'}
                                        style={{ maxHeight: 210, objectFit: 'cover' }}
                                      />
                                    </div>
                                  ) : resolvedAttachmentUrl ? (
                                    <a
                                      href={resolvedAttachmentUrl}
                                      download={msg.attachmentName || 'attachment'}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '5px 10px',
                                        borderRadius: 6,
                                        background: token.colorFillAlter,
                                        color: token.colorPrimary,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                      }}
                                    >
                                      <FileTextOutlined />
                                      <span>{msg.attachmentName || 'Download Attachment'}</span>
                                    </a>
                                  ) : (
                                    <Button
                                      size="small"
                                      icon={loadingAttachmentIds[msg.id] ? <LoadingOutlined /> : <FileTextOutlined />}
                                      onClick={() => void loadMessageAttachment(msg.id)}
                                    >
                                      {showImage
                                        ? `Load Image (${msg.attachmentName || 'Attachment'})`
                                        : `Load Attachment (${msg.attachmentName || 'File'})`}
                                    </Button>
                                  )}
                                </div>
                              )}

                              {/* Message Text Body */}
                              {msg.content && (
                                <div
                                  style={{
                                    fontSize: 13.5,
                                    lineHeight: 1.48,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {msg.content}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
                <div ref={feedBottomRef} />
              </div>

              {/* Bottom Composer Bar */}
              <div
                style={{
                  padding: isMobile ? '8px 10px 10px' : '10px 16px 12px',
                  borderTop: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorBgContainer,
                  flexShrink: 0,
                }}
              >
                {/* Active Attachment / ERP Voucher Tag Preview Strip */}
                {(draftErpRef || draftAttachment) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginBottom: 8,
                    }}
                  >
                    {draftErpRef && (
                      <Tag
                        color="processing"
                        closable
                        onClose={() => setDraftErpRef('')}
                        icon={<LinkOutlined />}
                        style={{ fontWeight: 700, fontSize: 12, padding: '2px 8px' }}
                      >
                        Linked Ref: {draftErpRef}
                      </Tag>
                    )}

                    {draftAttachment && (
                      <Tag
                        color="cyan"
                        closable
                        onClose={() => setDraftAttachment(null)}
                        icon={<PaperClipOutlined />}
                        style={{ fontWeight: 600, fontSize: 12, padding: '2px 8px' }}
                      >
                        {draftAttachment.name}
                      </Tag>
                    )}
                  </div>
                )}

                {isRecording ? (
                  /* WHATSAPP-STYLE EMERALD-SLATE VOICE STUDIO BAR */
                  <div
                    className="erp-voice-studio-bar"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      padding: '8px 14px',
                      borderRadius: token.borderRadiusLG || 12,
                    }}
                  >
                    {previewAudioUrl && (
                      <audio
                        ref={previewAudioRef}
                        src={previewAudioUrl}
                        preload="metadata"
                        onTimeUpdate={(e) => {
                          setPreviewCurrentSec(e.currentTarget.currentTime || 0);
                        }}
                        onEnded={() => {
                          setIsPreviewPlaying(false);
                          setPreviewCurrentSec(0);
                        }}
                        onPause={() => setIsPreviewPlaying(false)}
                      />
                    )}

                    {/* Left: Mic Status Dot + Status + Timer */}
                    <Space size={9} align="center" style={{ flexShrink: 0 }}>
                      <span
                        className={
                          isRecordingPaused
                            ? 'erp-voice-studio-dot erp-voice-studio-dot--paused'
                            : 'erp-voice-studio-dot'
                        }
                        aria-hidden="true"
                      />
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: isRecordingPaused ? token.colorWarning : token.colorSuccess,
                          letterSpacing: 0.2,
                        }}
                      >
                        {isRecordingPaused ? 'Paused' : 'Recording'}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: token.colorText,
                          fontVariantNumeric: 'tabular-nums',
                          minWidth: 44,
                        }}
                      >
                        {isRecordingPaused && (isPreviewPlaying || previewCurrentSec > 0)
                          ? `${formatRecordingTimer(previewCurrentSec)} / ${formatRecordingTimer(recordingSeconds)}`
                          : formatRecordingTimer(recordingSeconds)}
                      </span>
                    </Space>

                    {/* Center: 22-Bar Live Voice Waveform / Preview Scrubber */}
                    <div
                      onClick={handleSeekPreview}
                      title={isRecordingPaused ? 'Click waveform to seek preview' : 'Live microphone input levels'}
                      style={{
                        flex: 1,
                        minWidth: isMobile ? 120 : 170,
                        maxWidth: 360,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        paddingInline: 6,
                        cursor: isRecordingPaused ? 'pointer' : 'default',
                      }}
                    >
                      {studioWaveLevels.map((pct, idx) => {
                        const totalSec = Math.max(1, recordingSeconds || 1);
                        const progressRatio = isRecordingPaused ? previewCurrentSec / totalSec : 1;
                        const barRatio = (idx + 1) / STUDIO_WAVE_BAR_COUNT;
                        const isPlayed = isRecordingPaused ? progressRatio >= barRatio : true;

                        return (
                          <span
                            key={idx}
                            style={{
                              flex: 1,
                              height: `${pct}%`,
                              minHeight: 4,
                              borderRadius: 999,
                              background: isRecordingPaused
                                ? isPlayed && (isPreviewPlaying || previewCurrentSec > 0)
                                  ? token.colorSuccess
                                  : token.colorBorder
                                : token.colorSuccess,
                              opacity: isRecordingPaused ? 0.9 : 0.88,
                              transition: isRecordingPaused
                                ? 'background-color 0.14s ease, height 0.16s ease'
                                : 'height 0.06s ease-out',
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Right: Discard + Pause/Preview/(Resume) + Send Voice Note */}
                    <Space size={6} wrap>
                      <Tooltip title="Discard voice note">
                        <Button
                          size="small"
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={handleCancelVoiceRecording}
                          aria-label="Discard voice note"
                          style={{ color: token.colorTextSecondary, fontWeight: 500 }}
                        >
                          Cancel
                        </Button>
                      </Tooltip>

                      {!isRecordingPaused ? (
                        <Tooltip title="Pause and listen before sending">
                          <Button
                            size="small"
                            icon={<PauseCircleOutlined />}
                            onClick={handlePauseVoiceRecording}
                            aria-label="Pause voice recording"
                            style={{ fontWeight: 600 }}
                          >
                            Pause
                          </Button>
                        </Tooltip>
                      ) : (
                        <>
                          <Tooltip
                            title={
                              isPreviewPlaying
                                ? 'Pause preview playback'
                                : 'Play & preview voice note before sending'
                            }
                          >
                            <Button
                              size="small"
                              icon={
                                isPreviewPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />
                              }
                              disabled={!previewAudioUrl}
                              onClick={handleTogglePreviewPlay}
                              aria-label={isPreviewPlaying ? 'Pause preview' : 'Preview voice note'}
                              style={{ fontWeight: 600 }}
                            >
                              {isPreviewPlaying ? 'Pause' : 'Preview'}
                            </Button>
                          </Tooltip>
                          <Tooltip title="Resume recording">
                            <Button
                              size="small"
                              icon={<AudioOutlined />}
                              onClick={handleResumeVoiceRecording}
                              aria-label="Resume voice recording"
                              style={{ fontWeight: 600 }}
                            >
                              Resume
                            </Button>
                          </Tooltip>
                        </>
                      )}

                      <Button
                        type="primary"
                        size="small"
                        className="erp-voice-studio-send"
                        icon={<SendOutlined />}
                        loading={sending}
                        onClick={handleSendVoiceRecording}
                        aria-label="Send Voice Note"
                      >
                        Send Voice Note
                      </Button>
                    </Space>
                  </div>
                ) : (
                  /* STANDARD MESSAGE + ATTACHMENT + VOICE RECORDER COMPOSER */
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                    <Upload
                      showUploadList={false}
                      beforeUpload={handleAttachmentSelect}
                      accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt"
                    >
                      <Tooltip title="Attach image or document">
                        <Button icon={<PaperClipOutlined />} />
                      </Tooltip>
                    </Upload>

                    <Tooltip title="Record voice note">
                      <Button
                        icon={<AudioOutlined />}
                        onClick={() => void handleStartVoiceRecording()}
                        aria-label="Record voice note"
                      />
                    </Tooltip>

                    <Popover
                      content={voucherPopoverContent}
                      trigger="click"
                      open={erpRefPopoverOpen}
                      onOpenChange={setErpRefPopoverOpen}
                      placement="topLeft"
                    >
                      <Tooltip title="Link ERP Voucher or Production Entry (e.g. SIN-..., PE-...)">
                        <Button
                          icon={<LinkOutlined />}
                          type={draftErpRef ? 'primary' : 'default'}
                          ghost={Boolean(draftErpRef)}
                        >
                          {isMobile ? (draftErpRef ? draftErpRef : null) : draftErpRef || 'Link Voucher / Entry #'}
                        </Button>
                      </Tooltip>
                    </Popover>

                    <Input.TextArea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder={
                        isMobile
                          ? 'Type message...'
                          : `Message ${
                              activeConversation.type === 'GROUP'
                                ? activeConversation.title
                                : activePerson?.fullName || activeConversation.title
                            }... (Enter to send, Shift+Enter for new line)`
                      }
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      style={{ flex: 1, minWidth: 110, borderRadius: token.borderRadius }}
                    />

                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      loading={sending}
                      disabled={!draftText.trim() && !draftErpRef.trim() && !draftAttachment}
                      onClick={() => void handleSendMessage()}
                      style={{ fontWeight: 600, paddingInline: isMobile ? 12 : 18 }}
                    >
                      {isMobile ? null : 'Send'}
                    </Button>
                  </div>
                )}

                {!isMobile && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 5,
                      fontSize: 11,
                      color: token.colorTextTertiary,
                    }}
                  >
                    <span>
                      <CheckCircleFilled style={{ color: token.colorSuccess, marginRight: 5 }} />
                      Live 5s real-time sync active &bull; Press <Text keyboard>Enter</Text> to
                      send, <Text keyboard>Shift + Enter</Text> for newline, or click{' '}
                      <AudioOutlined /> to record a voice note
                    </span>
                    {draftErpRef && (
                      <span
                        onClick={() => setDraftErpRef('')}
                        style={{ cursor: 'pointer', color: token.colorTextSecondary }}
                      >
                        <CloseCircleOutlined style={{ marginRight: 4 }} />
                        Clear linked reference
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* "+ NEW GROUP" CREATION MODAL WITH SIGNATURE 6px–8px TRANSLUCENT DOUBLE-BORDER FRAME */}
      <Modal
        open={newGroupOpen}
        onCancel={() => setNewGroupOpen(false)}
        onOk={() => void handleCreateGroupSubmit()}
        confirmLoading={creatingGroup}
        okText="Create & Open Group"
        cancelText="Cancel"
        width={520}
        destroyOnClose
        title={
          <Space size={8}>
            <TeamOutlined style={{ color: token.colorPrimary }} />
            <span style={{ fontWeight: 700 }}>Create New Factory Group Channel</span>
          </Space>
        }
        modalRender={(node) => (
          <div
            style={{
              padding: 7,
              borderRadius: 16,
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1.5px solid rgba(99, 102, 241, 0.34)',
              boxShadow: '0 14px 40px rgba(0, 0, 0, 0.22)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div
              style={{
                borderRadius: 11,
                overflow: 'hidden',
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgElevated,
              }}
            >
              {node}
            </div>
          </div>
        )}
      >
        <Form
          form={newGroupForm}
          layout="vertical"
          style={{ marginTop: 10 }}
          initialValues={{
            departmentTag: 'Spoke Division',
          }}
        >
          <Form.Item
            name="title"
            label={<span style={{ fontWeight: 600 }}>Group Name</span>}
            rules={[
              { required: true, message: 'Please enter a group name (e.g., Shift-A Supervisors)' },
            ]}
          >
            <Input
              prefix={<span style={{ fontWeight: 800, color: token.colorPrimary }}>#</span>}
              placeholder="e.g., Shift-A Supervisors"
              maxLength={80}
            />
          </Form.Item>

          <Form.Item
            name="departmentTag"
            label={<span style={{ fontWeight: 600 }}>Department Tag (Optional)</span>}
          >
            <Select
              showSearch
              allowClear
              placeholder="Select or type department tag..."
              options={DEPARTMENT_TAG_OPTIONS}
            />
          </Form.Item>

          <Form.Item
            name="memberIds"
            label={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  gap: 12,
                }}
              >
                <span style={{ fontWeight: 600 }}>Enroll Team Members</span>
                <Space size={6}>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto', fontSize: 12 }}
                    onClick={() =>
                      newGroupForm.setFieldValue(
                        'memberIds',
                        users.filter((u) => !u.isSelf).map((u) => u.id),
                      )
                    }
                  >
                    Select All ({users.filter((u) => !u.isSelf).length})
                  </Button>
                  <span style={{ color: token.colorTextTertiary }}>&bull;</span>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto', fontSize: 12 }}
                    onClick={() => newGroupForm.setFieldValue('memberIds', [])}
                  >
                    Clear
                  </Button>
                </Space>
              </div>
            }
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select active ERP staff members..."
              maxTagCount="responsive"
              options={users
                .filter((u) => !u.isSelf)
                .map((u) => ({
                  value: u.id,
                  label: `${u.fullName} (${u.role} · ${u.department})`,
                }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TeamChat;
