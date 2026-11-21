import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface SendChatMessageDto {
  content?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  erpRefCode?: string | null;
  messageType?: 'TEXT' | 'VOICE' | 'ATTACHMENT';
  audioDurationSec?: number | null;
}

export interface CreateGroupConversationDto {
  title: string;
  departmentTag?: string | null;
  memberIds?: string[];
}

const DEFAULT_GROUP_CHANNELS: Array<{ title: string; departmentTag: string; welcome: string }> = [
  {
    title: '#General-Factory',
    departmentTag: 'Factory Wide',
    welcome: 'Welcome to #General-Factory — plant-wide announcements, shift handovers, and inter-department coordination.',
  },
  {
    title: '#Spoke-Division',
    departmentTag: 'Spoke Division',
    welcome: 'Welcome to #Spoke-Division — wire drawing, heading, threading, plating, and spoke production updates.',
  },
  {
    title: '#Store-And-Tooling',
    departmentTag: 'Store & Tooling',
    welcome: 'Welcome to #Store-And-Tooling — Store Issue Notes (SIN), die/tooling lifecycle alerts, and spare parts requests.',
  },
  {
    title: '#Packing-And-Dispatch',
    departmentTag: 'Packing & Dispatch',
    welcome: 'Welcome to #Packing-And-Dispatch — daily hand packing, carton targets, SOC progress, and dispatch coordination.',
  },
];

function formatDurationLabel(sec?: number | null): string {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

@Injectable()
export class TeamChatService implements OnModuleInit {
  private readonly logger = new Logger(TeamChatService.name);
  private readonly lastActiveMap = new Map<string, number>();
  private readonly resolvedUserCache = new Map<
    string,
    {
      user: {
        id: string;
        authUserId: string;
        fullName: string;
        email: string;
        role: string;
        department: string;
        avatarUrl: string | null;
      };
      expiresAt: number;
    }
  >();
  private readonly enrolledDefaultUsers = new Set<string>();
  private initialized = false;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchemaAndSeed();
  }

  private async ensureSchemaAndSeed(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS chat_conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(20) NOT NULL CHECK (type IN ('DIRECT', 'GROUP')),
          title VARCHAR(255) NULL,
          department_tag VARCHAR(120) NULL,
          created_by UUID NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS chat_participants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
          user_id UUID NOT NULL,
          last_read_at TIMESTAMPTZ NULL,
          joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(conversation_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
          sender_id UUID NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          attachment_url TEXT NULL,
          attachment_name VARCHAR(255) NULL,
          erp_ref_code VARCHAR(120) NULL,
          message_type VARCHAR(20) NOT NULL DEFAULT 'TEXT',
          audio_duration_sec INTEGER NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE chat_messages
          ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'TEXT';

        ALTER TABLE chat_messages
          ADD COLUMN IF NOT EXISTS audio_duration_sec INTEGER NULL;

        CREATE INDEX IF NOT EXISTS idx_chat_participants_user
          ON chat_participants(user_id, conversation_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created
          ON chat_messages(conversation_id, created_at ASC);
      `);

      const activeUsers: Array<{ id: string }> = await this.dataSource.query(`
        SELECT id FROM erp_users WHERE is_active = true
      `);
      const creatorId = activeUsers[0]?.id ?? null;

      for (const ch of DEFAULT_GROUP_CHANNELS) {
        const existing: Array<{ id: string }> = await this.dataSource.query(
          `SELECT id FROM chat_conversations WHERE type = 'GROUP' AND LOWER(title) = LOWER($1) LIMIT 1`,
          [ch.title],
        );
        let convId: string;
        let isNew = false;
        if (existing.length > 0) {
          convId = existing[0].id;
        } else {
          const inserted: Array<{ id: string }> = await this.dataSource.query(
            `INSERT INTO chat_conversations (type, title, department_tag, created_by, updated_at, created_at)
             VALUES ('GROUP', $1, $2, $3, NOW(), NOW())
             RETURNING id`,
            [ch.title, ch.departmentTag, creatorId],
          );
          convId = inserted[0].id;
          isNew = true;
        }

        if (activeUsers.length > 0) {
          for (const u of activeUsers) {
            await this.dataSource.query(
              `INSERT INTO chat_participants (conversation_id, user_id, last_read_at, joined_at)
               VALUES ($1, $2, NOW(), NOW())
               ON CONFLICT (conversation_id, user_id) DO NOTHING`,
              [convId, u.id],
            );
          }
        }

        if (isNew && creatorId) {
          await this.dataSource.query(
            `INSERT INTO chat_messages (conversation_id, sender_id, content, message_type, created_at)
             VALUES ($1, $2, $3, 'TEXT', NOW())`,
            [convId, creatorId, ch.welcome],
          );
        }
      }

      this.initialized = true;
      this.logger.log('Team Chat tables verified and default factory channels ready.');
    } catch (err) {
      this.logger.warn(`TeamChatService schema init deferred: ${(err as Error).message}`);
    }
  }

  private formatFullName(row: any): string {
    const display = (row?.display_name || '').trim();
    if (display && !display.includes('@')) return display;
    const firstLast = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();
    if (firstLast) return firstLast;
    if (display) return display;
    const uname = (row?.username || '').trim();
    if (uname) return uname;
    return row?.email || 'ERP User';
  }

  private isUserOnline(userId: string, lastLoginAt?: string | Date | null, currentUserId?: string): boolean {
    if (currentUserId && userId === currentUserId) return true;
    const memTs = this.lastActiveMap.get(userId);
    if (memTs && Date.now() - memTs < 15 * 60 * 1000) return true;
    if (lastLoginAt) {
      const loginMs = new Date(lastLoginAt).getTime();
      if (Number.isFinite(loginMs) && Date.now() - loginMs < 12 * 60 * 60 * 1000) return true;
    }
    return false;
  }

  private resolveLastActiveAt(userId: string, lastLoginAt?: string | Date | null, updatedAt?: string | Date | null): string | null {
    const memTs = this.lastActiveMap.get(userId);
    if (memTs) return new Date(memTs).toISOString();
    if (lastLoginAt) return new Date(lastLoginAt).toISOString();
    if (updatedAt) return new Date(updatedAt).toISOString();
    return null;
  }

  private formatMessagePreview(row: {
    content?: string | null;
    message_type?: string | null;
    audio_duration_sec?: number | null;
    attachment_url?: string | null;
    is_voice?: boolean | null;
    attachment_name?: string | null;
    erp_ref_code?: string | null;
  }): string | null {
    const text = (row.content || '').trim();
    if (text) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
    const isVoice =
      Boolean(row.is_voice) ||
      row.message_type === 'VOICE' ||
      String(row.attachment_url || '').startsWith('data:audio/');
    if (isVoice) {
      return `🎤 Voice Note (${formatDurationLabel(row.audio_duration_sec)})`;
    }
    if (row.attachment_name) return `📎 ${row.attachment_name}`;
    if (row.erp_ref_code) return `🔗 ${row.erp_ref_code}`;
    return null;
  }

  async resolveCurrentUser(reqUser: any): Promise<{
    id: string;
    authUserId: string;
    fullName: string;
    email: string;
    role: string;
    department: string;
    avatarUrl: string | null;
  }> {
    await this.ensureSchemaAndSeed();

    const rawId = reqUser?.id ? String(reqUser.id) : '';
    const rawEmail = reqUser?.email ? String(reqUser.email) : '';
    const userCacheKey = rawId || rawEmail.toLowerCase();
    if (userCacheKey) {
      const cached = this.resolvedUserCache.get(userCacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.lastActiveMap.set(cached.user.id, Date.now());
        return cached.user;
      }
    }

    let rows: any[] = [];
    if (rawId || rawEmail) {
      rows = await this.dataSource.query(
        `
        SELECT u.*,
               (
                 SELECT r.name
                 FROM user_roles ur
                 JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = u.id AND ur.is_active = true
                 ORDER BY r.is_system_role DESC, ur.created_at ASC
                 LIMIT 1
               ) AS role_name,
               d.name AS department_name,
               div.name AS division_name
        FROM erp_users u
        LEFT JOIN departments d ON d.id = u.default_department_id
        LEFT JOIN divisions div ON div.id = u.default_division_id
        WHERE u.is_active = true
          AND (u.id::text = $1 OR u.auth_user_id::text = $1 OR ($2 <> '' AND LOWER(u.email) = LOWER($2)))
        ORDER BY u.created_at ASC
        LIMIT 1
        `,
        [rawId, rawEmail],
      );
    }

    if (rows.length === 0) {
      rows = await this.dataSource.query(`
        SELECT u.*,
               (
                 SELECT r.name
                 FROM user_roles ur
                 JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = u.id AND ur.is_active = true
                 ORDER BY r.is_system_role DESC, ur.created_at ASC
                 LIMIT 1
               ) AS role_name,
               d.name AS department_name,
               div.name AS division_name
        FROM erp_users u
        LEFT JOIN departments d ON d.id = u.default_department_id
        LEFT JOIN divisions div ON div.id = u.default_division_id
        WHERE u.is_active = true
        ORDER BY u.last_login_at DESC NULLS LAST, u.created_at ASC
        LIMIT 1
      `);
    }

    if (rows.length === 0) {
      throw new NotFoundException('No active ERP user record found');
    }

    const u = rows[0];
    this.lastActiveMap.set(u.id, Date.now());

    // Ensure current user is enrolled in the default factory GROUP channels (only once per server lifecycle)
    if (!this.enrolledDefaultUsers.has(u.id)) {
      const defaultTitles = DEFAULT_GROUP_CHANNELS.map((c) => c.title.toLowerCase());
      await this.dataSource.query(
        `
        INSERT INTO chat_participants (conversation_id, user_id, last_read_at, joined_at)
        SELECT c.id, $1, NOW(), NOW()
        FROM chat_conversations c
        WHERE c.type = 'GROUP'
          AND LOWER(c.title) = ANY($2)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        `,
        [u.id, defaultTitles],
      );
      this.enrolledDefaultUsers.add(u.id);
    }

    const avatarUrl = u.avatar_url && !String(u.avatar_url).startsWith('data:') ? u.avatar_url : null;
    const resolved = {
      id: u.id,
      authUserId: u.auth_user_id,
      fullName: this.formatFullName(u),
      email: u.email,
      role: u.role_name || (String(u.username || '').toLowerCase().includes('admin') ? 'System Administrator' : 'Factory Staff'),
      department: u.department_name || u.division_name || 'Factory Operations',
      avatarUrl,
    };
    if (userCacheKey) {
      if (this.resolvedUserCache.size >= 200) this.resolvedUserCache.clear();
      this.resolvedUserCache.set(userCacheKey, { user: resolved, expiresAt: Date.now() + 60_000 });
    }
    return resolved;
  }

  async getUsers(reqUser: any) {
    const currentUser = await this.resolveCurrentUser(reqUser);

    const rows: any[] = await this.dataSource.query(
      `
      SELECT u.id,
             u.auth_user_id,
             u.username,
             u.display_name,
             u.first_name,
             u.last_name,
             u.email,
             u.phone,
             CASE WHEN LEFT(COALESCE(u.avatar_url, ''), 5) = 'data:' THEN NULL ELSE u.avatar_url END AS avatar_url,
             u.last_login_at,
             u.updated_at,
             (
               SELECT r.name
               FROM user_roles ur
               JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id AND ur.is_active = true
               ORDER BY r.is_system_role DESC, ur.created_at ASC
               LIMIT 1
             ) AS role_name,
             d.name AS department_name,
             div.name AS division_name,
             dc.conv_id AS direct_conversation_id,
             dc.unread_count AS direct_unread_count,
             dc.last_content AS last_message_content,
             dc.last_message_type AS last_message_type,
             dc.last_audio_duration_sec AS last_audio_duration_sec,
             dc.last_is_voice AS last_is_voice,
             dc.last_attachment_name AS last_attachment_name,
             dc.last_erp_ref AS last_erp_ref,
             dc.last_created_at AS last_message_at
      FROM erp_users u
      LEFT JOIN departments d ON d.id = u.default_department_id
      LEFT JOIN divisions div ON div.id = u.default_division_id
      LEFT JOIN LATERAL (
        SELECT c.id AS conv_id,
               (
                 SELECT COUNT(*)::int
                 FROM chat_messages m
                 WHERE m.conversation_id = c.id
                   AND m.sender_id <> $1
                   AND (cp_me.last_read_at IS NULL OR m.created_at > cp_me.last_read_at)
               ) AS unread_count,
               LEFT(lm.content, 160) AS last_content,
               lm.message_type AS last_message_type,
               lm.audio_duration_sec AS last_audio_duration_sec,
               lm.last_is_voice AS last_is_voice,
               lm.attachment_name AS last_attachment_name,
               lm.erp_ref_code AS last_erp_ref,
               lm.created_at AS last_created_at
        FROM chat_conversations c
        JOIN chat_participants cp_me ON cp_me.conversation_id = c.id AND cp_me.user_id = $1
        JOIN chat_participants cp_other ON cp_other.conversation_id = c.id AND cp_other.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT m.content,
                 m.message_type,
                 m.audio_duration_sec,
                 (m.message_type = 'VOICE' OR LEFT(COALESCE(m.attachment_url, ''), 11) = 'data:audio/') AS last_is_voice,
                 m.attachment_name,
                 m.erp_ref_code,
                 m.created_at
          FROM chat_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) lm ON true
        WHERE c.type = 'DIRECT'
          AND (
            ($1 <> u.id AND (SELECT COUNT(*) FROM chat_participants cp_cnt WHERE cp_cnt.conversation_id = c.id) = 2)
            OR ($1 = u.id AND (SELECT COUNT(*) FROM chat_participants cp_cnt WHERE cp_cnt.conversation_id = c.id) = 1)
          )
        ORDER BY COALESCE(lm.created_at, c.updated_at) DESC
        LIMIT 1
      ) dc ON true
      WHERE u.is_active = true
        AND COALESCE(u.status, 'ACTIVE') = 'ACTIVE'
      ORDER BY
        CASE WHEN u.id = $1 THEN 1 ELSE 0 END ASC,
        COALESCE(dc.unread_count, 0) DESC,
        dc.last_created_at DESC NULLS LAST,
        u.display_name ASC
      `,
      [currentUser.id],
    );

    return {
      currentUser,
      users: rows.map((r) => {
        const fullName = this.formatFullName(r);
        const role =
          r.role_name ||
          (String(r.username || '').toLowerCase().includes('admin') ? 'System Administrator' : 'Operations Specialist');
        const department = r.department_name || r.division_name || 'Factory Operations';
        const isOnline = this.isUserOnline(r.id, r.last_login_at, currentUser.id);
        return {
          id: r.id,
          authUserId: r.auth_user_id,
          fullName,
          email: r.email,
          phone: r.phone || null,
          avatarUrl: r.avatar_url || null,
          role,
          department,
          isSelf: r.id === currentUser.id,
          isOnline,
          lastActiveAt: this.resolveLastActiveAt(r.id, r.last_login_at, r.updated_at),
          directConversationId: r.direct_conversation_id || null,
          unreadCount: Number(r.direct_unread_count || 0),
          lastMessage: this.formatMessagePreview({
            content: r.last_message_content,
            message_type: r.last_message_type,
            audio_duration_sec: r.last_audio_duration_sec,
            is_voice: Boolean(r.last_is_voice),
            attachment_name: r.last_attachment_name,
            erp_ref_code: r.last_erp_ref,
          }),
          lastMessageAt: r.last_message_at || null,
        };
      }),
    };
  }

  async getConversations(reqUser: any) {
    const currentUser = await this.resolveCurrentUser(reqUser);

    const rows: any[] = await this.dataSource.query(
      `
      SELECT c.id,
             c.type,
             c.title,
             c.department_tag,
             c.created_by,
             c.updated_at,
             c.created_at,
             cp.last_read_at,
             (
               SELECT COUNT(*)::int
               FROM chat_participants cp_all
               WHERE cp_all.conversation_id = c.id
             ) AS participant_count,
             (
               SELECT COUNT(*)::int
               FROM chat_messages m
               WHERE m.conversation_id = c.id
                 AND m.sender_id <> $1
                 AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
             ) AS unread_count,
             lm.id AS last_msg_id,
             LEFT(lm.content, 160) AS last_msg_content,
             lm.message_type AS last_msg_type,
             lm.audio_duration_sec AS last_msg_audio_duration_sec,
             lm.sender_id AS last_msg_sender_id,
             lm.sender_name AS last_msg_sender_name,
             lm.last_msg_is_voice AS last_msg_is_voice,
             lm.last_msg_has_attachment AS last_msg_has_attachment,
             lm.attachment_name AS last_msg_attachment_name,
             lm.erp_ref_code AS last_msg_erp_ref_code,
             lm.created_at AS last_msg_created_at,
             partner.id AS partner_id,
             partner.display_name AS partner_display_name,
             partner.first_name AS partner_first_name,
             partner.last_name AS partner_last_name,
             partner.username AS partner_username,
             partner.email AS partner_email,
             partner.avatar_url AS partner_avatar_url,
             partner.last_login_at AS partner_last_login_at,
             partner.updated_at AS partner_updated_at,
             partner.role_name AS partner_role_name,
             partner.department_name AS partner_department_name
      FROM chat_conversations c
      JOIN chat_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
      LEFT JOIN LATERAL (
        SELECT m.id,
               m.content,
               m.message_type,
               m.audio_duration_sec,
               m.sender_id,
               (m.message_type = 'VOICE' OR LEFT(COALESCE(m.attachment_url, ''), 11) = 'data:audio/') AS last_msg_is_voice,
               (m.attachment_url IS NOT NULL AND m.attachment_url <> '') AS last_msg_has_attachment,
               m.attachment_name,
               m.erp_ref_code,
               m.created_at,
               COALESCE(NULLIF(TRIM(su.display_name), ''), NULLIF(TRIM(CONCAT(su.first_name, ' ', su.last_name)), ''), su.username, su.email, 'User') AS sender_name
        FROM chat_messages m
        LEFT JOIN erp_users su ON su.id = m.sender_id
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT pu.id,
               pu.display_name,
               pu.first_name,
               pu.last_name,
               pu.username,
               pu.email,
               CASE WHEN LEFT(COALESCE(pu.avatar_url, ''), 5) = 'data:' THEN NULL ELSE pu.avatar_url END AS avatar_url,
               pu.last_login_at,
               pu.updated_at,
               (
                 SELECT r.name
                 FROM user_roles ur
                 JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = pu.id AND ur.is_active = true
                 ORDER BY r.is_system_role DESC, ur.created_at ASC
                 LIMIT 1
               ) AS role_name,
               COALESCE(d.name, div.name, 'Factory Operations') AS department_name
        FROM chat_participants cp_p
        JOIN erp_users pu ON pu.id = cp_p.user_id
        LEFT JOIN departments d ON d.id = pu.default_department_id
        LEFT JOIN divisions div ON div.id = pu.default_division_id
        WHERE cp_p.conversation_id = c.id
          AND c.type = 'DIRECT'
        ORDER BY CASE WHEN cp_p.user_id = $1 THEN 1 ELSE 0 END ASC
        LIMIT 1
      ) partner ON true
      ORDER BY
        COALESCE(lm.created_at, c.updated_at, c.created_at) DESC
      `,
      [currentUser.id],
    );

    return rows.map((r) => {
      const partner =
        r.type === 'DIRECT' && r.partner_id
          ? {
              id: r.partner_id,
              fullName: this.formatFullName({
                display_name: r.partner_display_name,
                first_name: r.partner_first_name,
                last_name: r.partner_last_name,
                username: r.partner_username,
                email: r.partner_email,
              }),
              email: r.partner_email,
              avatarUrl: r.partner_avatar_url || null,
              role:
                r.partner_role_name ||
                (String(r.partner_username || '').toLowerCase().includes('admin')
                  ? 'System Administrator'
                  : 'Operations Specialist'),
              department: r.partner_department_name || 'Factory Operations',
              isOnline: this.isUserOnline(r.partner_id, r.partner_last_login_at, currentUser.id),
              lastActiveAt: this.resolveLastActiveAt(
                r.partner_id,
                r.partner_last_login_at,
                r.partner_updated_at,
              ),
            }
          : null;

      return {
        id: r.id,
        type: r.type as 'DIRECT' | 'GROUP',
        title: r.type === 'GROUP' ? r.title : partner?.fullName || r.title || 'Direct Message',
        departmentTag: r.department_tag || (partner ? partner.department : null),
        participantCount: Number(r.participant_count || 0),
        unreadCount: Number(r.unread_count || 0),
        updatedAt: r.last_msg_created_at || r.updated_at || r.created_at,
        createdAt: r.created_at,
        partner,
        lastMessage: r.last_msg_id
          ? {
              id: r.last_msg_id,
              content:
                this.formatMessagePreview({
                  content: r.last_msg_content,
                  message_type: r.last_msg_type,
                  audio_duration_sec: r.last_msg_audio_duration_sec,
                  is_voice: Boolean(r.last_msg_is_voice),
                  attachment_name: r.last_msg_attachment_name,
                  erp_ref_code: r.last_msg_erp_ref_code,
                }) || '',
              messageType: r.last_msg_type || 'TEXT',
              audioDurationSec:
                r.last_msg_audio_duration_sec != null
                  ? Number(r.last_msg_audio_duration_sec)
                  : null,
              senderId: r.last_msg_sender_id,
              senderName: r.last_msg_sender_name,
              hasAttachment: Boolean(r.last_msg_has_attachment),
              attachmentUrl: null,
              attachmentName: r.last_msg_attachment_name || null,
              erpRefCode: r.last_msg_erp_ref_code || null,
              createdAt: r.last_msg_created_at,
            }
          : null,
      };
    });
  }

  async openOrCreateDirectConversation(reqUser: any, targetUserId: string) {
    const currentUser = await this.resolveCurrentUser(reqUser);

    const targetRows: any[] = await this.dataSource.query(
      `SELECT id FROM erp_users WHERE is_active = true AND (id::text = $1 OR auth_user_id::text = $1) LIMIT 1`,
      [String(targetUserId || '').trim()],
    );
    if (targetRows.length === 0) {
      throw new NotFoundException('Target ERP user not found');
    }
    const resolvedTargetId: string = targetRows[0].id;

    let convId: string | null = null;
    if (resolvedTargetId === currentUser.id) {
      const existingSelf: any[] = await this.dataSource.query(
        `
        SELECT c.id
        FROM chat_conversations c
        JOIN chat_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
        WHERE c.type = 'DIRECT'
          AND (SELECT COUNT(*) FROM chat_participants cp2 WHERE cp2.conversation_id = c.id) = 1
        LIMIT 1
        `,
        [currentUser.id],
      );
      if (existingSelf.length > 0) {
        convId = existingSelf[0].id;
      }
    } else {
      const existingPair: any[] = await this.dataSource.query(
        `
        SELECT c.id
        FROM chat_conversations c
        JOIN chat_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
        JOIN chat_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
        WHERE c.type = 'DIRECT'
          AND (SELECT COUNT(*) FROM chat_participants cp3 WHERE cp3.conversation_id = c.id) = 2
        ORDER BY c.updated_at DESC
        LIMIT 1
        `,
        [currentUser.id, resolvedTargetId],
      );
      if (existingPair.length > 0) {
        convId = existingPair[0].id;
      }
    }

    if (!convId) {
      const created: any[] = await this.dataSource.query(
        `
        INSERT INTO chat_conversations (type, title, department_tag, created_by, updated_at, created_at)
        VALUES ('DIRECT', NULL, NULL, $1, NOW(), NOW())
        RETURNING id
        `,
        [currentUser.id],
      );
      convId = created[0].id;

      await this.dataSource.query(
        `
        INSERT INTO chat_participants (conversation_id, user_id, last_read_at, joined_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        `,
        [convId, currentUser.id],
      );

      if (resolvedTargetId !== currentUser.id) {
        await this.dataSource.query(
          `
          INSERT INTO chat_participants (conversation_id, user_id, last_read_at, joined_at)
          VALUES ($1, $2, NULL, NOW())
          ON CONFLICT (conversation_id, user_id) DO NOTHING
          `,
          [convId, resolvedTargetId],
        );
      }
    }

    const all = await this.getConversations(reqUser);
    return all.find((c) => c.id === convId) || all[0];
  }

  async createGroupConversation(reqUser: any, dto: CreateGroupConversationDto) {
    const currentUser = await this.resolveCurrentUser(reqUser);

    const rawTitle = String(dto?.title || '').trim();
    if (!rawTitle) {
      throw new BadRequestException('Group name is required');
    }
    const normalizedTitle = rawTitle.startsWith('#') ? rawTitle : `#${rawTitle}`;
    const departmentTag = dto?.departmentTag ? String(dto.departmentTag).trim() : 'Factory Team';

    const requestedIds = Array.isArray(dto?.memberIds)
      ? dto.memberIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];

    let validMemberIds: string[] = [currentUser.id];
    if (requestedIds.length > 0) {
      const matchedUsers: Array<{ id: string }> = await this.dataSource.query(
        `
        SELECT id
        FROM erp_users
        WHERE is_active = true
          AND (id::text = ANY($1) OR auth_user_id::text = ANY($1))
        `,
        [requestedIds],
      );
      validMemberIds = Array.from(
        new Set([currentUser.id, ...matchedUsers.map((u) => u.id)]),
      );
    }

    const insertedConv: Array<{ id: string }> = await this.dataSource.query(
      `
      INSERT INTO chat_conversations (type, title, department_tag, created_by, updated_at, created_at)
      VALUES ('GROUP', $1, $2, $3, NOW(), NOW())
      RETURNING id
      `,
      [normalizedTitle, departmentTag, currentUser.id],
    );
    const convId = insertedConv[0].id;

    for (const memberId of validMemberIds) {
      await this.dataSource.query(
        `
        INSERT INTO chat_participants (conversation_id, user_id, last_read_at, joined_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        `,
        [convId, memberId, memberId === currentUser.id ? new Date() : null],
      );
    }

    await this.dataSource.query(
      `
      INSERT INTO chat_messages (conversation_id, sender_id, content, message_type, created_at)
      VALUES ($1, $2, $3, 'TEXT', NOW())
      `,
      [
        convId,
        currentUser.id,
        `Created group ${normalizedTitle}${departmentTag ? ` (${departmentTag})` : ''} with ${validMemberIds.length} team member${validMemberIds.length === 1 ? '' : 's'}.`,
      ],
    );

    const all = await this.getConversations(reqUser);
    return all.find((c) => c.id === convId) || all[0];
  }

  async getMessagesVersion(reqUser: any, conversationId: string): Promise<{ count: number; maxCreatedAt: string | null }> {
    const convRows: any[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS cnt, MAX(created_at) AS max_at FROM chat_messages WHERE conversation_id::text = $1`,
      [String(conversationId || '').trim()],
    );
    const r = convRows[0];
    return {
      count: Number(r?.cnt || 0),
      maxCreatedAt: r?.max_at ? new Date(r.max_at).toISOString() : null,
    };
  }

  async getMessageAttachment(reqUser: any, messageId: string) {
    const currentUser = await this.resolveCurrentUser(reqUser);
    const rows: any[] = await this.dataSource.query(
      `
      SELECT m.id,
             m.conversation_id,
             m.attachment_url,
             m.attachment_name,
             m.message_type,
             m.audio_duration_sec
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id
      LEFT JOIN chat_participants cp ON cp.conversation_id = c.id AND cp.user_id = $2
      WHERE m.id::text = $1
        AND (cp.id IS NOT NULL OR c.type = 'GROUP')
      LIMIT 1
      `,
      [String(messageId || '').trim(), currentUser.id],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Message attachment not found');
    }
    const r = rows[0];
    return {
      id: r.id,
      conversationId: r.conversation_id,
      attachmentUrl: r.attachment_url || null,
      attachmentName: r.attachment_name || null,
      messageType: r.message_type || 'TEXT',
      audioDurationSec: r.audio_duration_sec != null ? Number(r.audio_duration_sec) : null,
    };
  }

  async getMessages(reqUser: any, conversationId: string, limit = 60) {
    const currentUser = await this.resolveCurrentUser(reqUser);
    const safeLimit = Math.min(Math.max(Number(limit) || 60, 10), 200);

    const convRows: any[] = await this.dataSource.query(
      `SELECT id, type, title, department_tag FROM chat_conversations WHERE id::text = $1 LIMIT 1`,
      [String(conversationId || '').trim()],
    );
    if (convRows.length === 0) {
      throw new NotFoundException('Conversation not found');
    }

    // Only write last_read_at when missing or when there are actual unread messages
    await this.dataSource.query(
      `
      INSERT INTO chat_participants (conversation_id, user_id, last_read_at, joined_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (conversation_id, user_id) DO NOTHING
      `,
      [convRows[0].id, currentUser.id],
    );
    await this.dataSource.query(
      `
      UPDATE chat_participants cp
      SET last_read_at = NOW()
      WHERE cp.conversation_id = $1
        AND cp.user_id = $2
        AND EXISTS (
          SELECT 1
          FROM chat_messages m
          WHERE m.conversation_id = $1
            AND m.sender_id <> $2
            AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
        )
      `,
      [convRows[0].id, currentUser.id],
    );

    // Exclude base64 `data:` blobs from the list payload; fetch on demand via /messages/:id/attachment
    const rows: any[] = await this.dataSource.query(
      `
      SELECT sub.*
      FROM (
        SELECT m.id,
               m.conversation_id,
               m.sender_id,
               m.content,
               CASE
                 WHEN m.attachment_url IS NULL OR m.attachment_url = '' THEN NULL
                 WHEN LEFT(m.attachment_url, 5) = 'data:' THEN NULL
                 ELSE m.attachment_url
               END AS attachment_url,
               (m.attachment_url IS NOT NULL AND m.attachment_url <> '') AS has_attachment,
               LEFT(COALESCE(m.attachment_url, ''), 32) AS attachment_mime_prefix,
               m.attachment_name,
               m.erp_ref_code,
               m.message_type,
               m.audio_duration_sec,
               m.created_at,
               u.display_name,
               u.first_name,
               u.last_name,
               u.username,
               u.email,
               CASE WHEN LEFT(COALESCE(u.avatar_url, ''), 5) = 'data:' THEN NULL ELSE u.avatar_url END AS avatar_url,
               (
                 SELECT r.name
                 FROM user_roles ur
                 JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = u.id AND ur.is_active = true
                 ORDER BY r.is_system_role DESC, ur.created_at ASC
                 LIMIT 1
               ) AS role_name,
               COALESCE(d.name, div.name, 'Factory Operations') AS department_name
        FROM chat_messages m
        LEFT JOIN erp_users u ON u.id = m.sender_id
        LEFT JOIN departments d ON d.id = u.default_department_id
        LEFT JOIN divisions div ON div.id = u.default_division_id
        WHERE m.conversation_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2
      ) sub
      ORDER BY sub.created_at ASC
      `,
      [convRows[0].id, safeLimit],
    );

    return {
      conversationId: convRows[0].id,
      currentUserId: currentUser.id,
      messages: rows.map((r) => {
        const mimePrefix = String(r.attachment_mime_prefix || '');
        const isVoice =
          r.message_type === 'VOICE' ||
          mimePrefix.startsWith('data:audio/') ||
          String(r.attachment_url || '').startsWith('data:audio/');
        return {
          id: r.id,
          conversationId: r.conversation_id,
          senderId: r.sender_id,
          senderName: this.formatFullName(r),
          senderRole:
            r.role_name ||
            (String(r.username || '').toLowerCase().includes('admin') ? 'System Administrator' : 'Operations Specialist'),
          senderDepartment: r.department_name || 'Factory Operations',
          senderAvatarUrl: r.avatar_url || null,
          isOwn: r.sender_id === currentUser.id,
          content: r.content || '',
          attachmentUrl: r.attachment_url || null,
          hasAttachment: Boolean(r.has_attachment),
          attachmentMimePrefix: mimePrefix || null,
          attachmentName: r.attachment_name || null,
          erpRefCode: r.erp_ref_code || null,
          messageType: isVoice ? 'VOICE' : r.message_type || 'TEXT',
          audioDurationSec:
            r.audio_duration_sec != null ? Number(r.audio_duration_sec) : null,
          createdAt: r.created_at,
        };
      }),
    };
  }

  async sendMessage(reqUser: any, conversationId: string, dto: SendChatMessageDto) {
    const currentUser = await this.resolveCurrentUser(reqUser);

    const convRows: any[] = await this.dataSource.query(
      `SELECT id FROM chat_conversations WHERE id::text = $1 LIMIT 1`,
      [String(conversationId || '').trim()],
    );
    if (convRows.length === 0) {
      throw new NotFoundException('Conversation not found');
    }
    const convId = convRows[0].id;

    const content = String(dto?.content || '').trim();
    const attachmentUrl = dto?.attachmentUrl ? String(dto.attachmentUrl).trim() : null;
    const attachmentName = dto?.attachmentName ? String(dto.attachmentName).trim() : null;
    const erpRefCode = dto?.erpRefCode ? String(dto.erpRefCode).trim().toUpperCase() : null;
    const isVoice =
      dto?.messageType === 'VOICE' ||
      Boolean(attachmentUrl && attachmentUrl.startsWith('data:audio/'));
    const messageType = isVoice
      ? 'VOICE'
      : attachmentUrl
      ? 'ATTACHMENT'
      : 'TEXT';
    const audioDurationSec =
      dto?.audioDurationSec != null && Number.isFinite(Number(dto.audioDurationSec))
        ? Math.max(1, Math.round(Number(dto.audioDurationSec)))
        : null;

    if (!content && !attachmentUrl && !erpRefCode) {
      throw new BadRequestException('Message content, voice note, attachment, or ERP reference code is required');
    }

    const inserted: any[] = await this.dataSource.query(
      `
      INSERT INTO chat_messages (
        conversation_id,
        sender_id,
        content,
        attachment_url,
        attachment_name,
        erp_ref_code,
        message_type,
        audio_duration_sec,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id, conversation_id, sender_id, content, attachment_url, attachment_name, erp_ref_code, message_type, audio_duration_sec, created_at
      `,
      [
        convId,
        currentUser.id,
        content,
        attachmentUrl,
        attachmentName,
        erpRefCode,
        messageType,
        audioDurationSec,
      ],
    );

    await this.dataSource.query(
      `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
      [convId],
    );

    await this.dataSource.query(
      `
      INSERT INTO chat_participants (conversation_id, user_id, last_read_at, joined_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET last_read_at = NOW()
      `,
      [convId, currentUser.id],
    );

    const msg = inserted[0];
    return {
      id: msg.id,
      conversationId: msg.conversation_id,
      senderId: msg.sender_id,
      senderName: currentUser.fullName,
      senderRole: currentUser.role,
      senderDepartment: currentUser.department,
      senderAvatarUrl: currentUser.avatarUrl,
      isOwn: true,
      content: msg.content || '',
      attachmentUrl: msg.attachment_url || null,
      attachmentName: msg.attachment_name || null,
      erpRefCode: msg.erp_ref_code || null,
      messageType: msg.message_type || messageType,
      audioDurationSec:
        msg.audio_duration_sec != null ? Number(msg.audio_duration_sec) : null,
      createdAt: msg.created_at,
    };
  }

  async getUnreadSummary(reqUser: any) {
    const currentUser = await this.resolveCurrentUser(reqUser);

    const aggRows: any[] = await this.dataSource.query(
      `
      SELECT COUNT(m.id)::int AS total_unread,
             COUNT(CASE WHEN c.type = 'DIRECT' THEN 1 END)::int AS direct_unread,
             COUNT(CASE WHEN c.type <> 'DIRECT' THEN 1 END)::int AS group_unread,
             MAX(m.created_at) AS max_created_at
      FROM chat_participants cp
      JOIN chat_conversations c ON c.id = cp.conversation_id
      JOIN chat_messages m ON m.conversation_id = c.id
        AND m.sender_id <> $1
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
      WHERE cp.user_id = $1
      `,
      [currentUser.id],
    );

    const totalUnread = Number(aggRows[0]?.total_unread || 0);
    const directUnread = Number(aggRows[0]?.direct_unread || 0);
    const groupUnread = Number(aggRows[0]?.group_unread || 0);
    const maxCreatedAt = aggRows[0]?.max_created_at
      ? new Date(aggRows[0].max_created_at).toISOString()
      : null;

    const latestRows: any[] =
      totalUnread > 0
        ? await this.dataSource.query(
            `
            SELECT m.id,
                   m.conversation_id,
                   LEFT(m.content, 100) AS content,
                   m.message_type,
                   m.audio_duration_sec,
                   (m.message_type = 'VOICE' OR LEFT(COALESCE(m.attachment_url, ''), 11) = 'data:audio/') AS is_voice,
                   m.attachment_name,
                   m.erp_ref_code,
                   m.created_at,
                   c.type,
                   c.title,
                   u.display_name,
                   u.first_name,
                   u.last_name,
                   u.username,
                   u.email
            FROM chat_messages m
            JOIN chat_conversations c ON c.id = m.conversation_id
            JOIN chat_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
            LEFT JOIN erp_users u ON u.id = m.sender_id
            WHERE m.sender_id <> $1
              AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
            ORDER BY m.created_at DESC
            LIMIT 1
            `,
            [currentUser.id],
          )
        : [];

    const latest = latestRows[0]
      ? {
          id: latestRows[0].id,
          conversationId: latestRows[0].conversation_id,
          conversationTitle:
            latestRows[0].type === 'GROUP'
              ? latestRows[0].title
              : this.formatFullName(latestRows[0]),
          senderName: this.formatFullName(latestRows[0]),
          content:
            this.formatMessagePreview({
              content: latestRows[0].content,
              message_type: latestRows[0].message_type,
              audio_duration_sec: latestRows[0].audio_duration_sec,
              is_voice: Boolean(latestRows[0].is_voice),
              attachment_name: latestRows[0].attachment_name,
              erp_ref_code: latestRows[0].erp_ref_code,
            }) || 'New message',
          createdAt: latestRows[0].created_at,
        }
      : null;

    return {
      totalUnread,
      directUnread,
      groupUnread,
      maxCreatedAt,
      latestUnreadMessage: latest,
    };
  }
}
