import { TeamChatService } from './team-chat.service';
import { NotificationsService } from '../notification/notifications.service';
import { ProductionRoutingService } from '../production-routing/services/production-routing.service';
import { ItemDocumentService } from '../item/services/item-document.service';
import express = require('express');
import compression = require('compression');
import * as http from 'http';

describe('Egress & Lightweight Polling Optimizations', () => {
  describe('TeamChatService egress controls', () => {
    it('getUnreadSummary runs lightweight COUNT/MAX query and returns < 200 bytes when idle', async () => {
      const queries: string[] = [];
      const dataSource: any = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
          if (sql.includes('FROM erp_users u')) {
            return [
              {
                id: 'u1',
                auth_user_id: 'auth-1',
                display_name: 'Afsar',
                email: 'afsar@pwi.test',
                username: 'afsar',
                role_name: 'Admin',
                department_name: 'Production',
                avatar_url: null,
              },
            ];
          }
          if (sql.includes('MAX(m.created_at) AS max_created_at')) {
            return [{ total_unread: 0, direct_unread: 0, group_unread: 0, max_created_at: null }];
          }
          return [];
        }),
      };

      const svc = new TeamChatService(dataSource);
      (svc as any).initialized = true;
      (svc as any).enrolledDefaultUsers.add('u1');

      const summary = await svc.getUnreadSummary({ id: 'auth-1', email: 'afsar@pwi.test' });
      const payloadSize = Buffer.byteLength(JSON.stringify({ success: true, data: summary }), 'utf8');

      expect(summary).toEqual({
        totalUnread: 0,
        directUnread: 0,
        groupUnread: 0,
        maxCreatedAt: null,
        latestUnreadMessage: null,
      });
      expect(payloadSize).toBeLessThan(200);
      expect(queries.some((q) => q.includes('COUNT(m.id)::int') && q.includes('MAX(m.created_at)'))).toBe(true);

      // Second call hits 60s user resolution cache instead of re-querying erp_users
      const prevCalls = dataSource.query.mock.calls.length;
      await svc.getUnreadSummary({ id: 'auth-1', email: 'afsar@pwi.test' });
      const deltaCalls = dataSource.query.mock.calls.length - prevCalls;
      expect(deltaCalls).toBe(1);
    });

    it('getMessages strips data: base64 attachment_url blobs and lazy-loads via getMessageAttachment', async () => {
      const dataSource: any = {
        query: jest.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('FROM erp_users u')) {
            return [{ id: 'u1', auth_user_id: 'auth-1', display_name: 'Afsar', email: 'afsar@pwi.test' }];
          }
          if (sql.includes('FROM chat_conversations WHERE id::text')) {
            return [{ id: 'conv-1', type: 'GROUP', title: '#General', department_tag: 'All' }];
          }
          if (sql.includes('FROM chat_messages m') && sql.includes('has_attachment')) {
            // Verify query strips data: blobs in SQL and honors clamped limit
            expect(params?.[1]).toBe(60);
            return [
              {
                id: 'msg-1',
                conversation_id: 'conv-1',
                sender_id: 'u2',
                display_name: 'Bilal',
                content: '',
                attachment_url: null,
                has_attachment: true,
                attachment_mime_prefix: 'data:audio/webm;base64,AAA',
                attachment_name: 'voice-note.webm',
                erp_ref_code: null,
                message_type: 'VOICE',
                audio_duration_sec: 12,
                created_at: '2026-11-21T07:00:00Z',
              },
            ];
          }
          if (sql.includes('WHERE m.id::text = $1')) {
            return [
              {
                id: 'msg-1',
                conversation_id: 'conv-1',
                attachment_url: 'data:audio/webm;base64,FULL_AUDIO_PAYLOAD',
                attachment_name: 'voice-note.webm',
                message_type: 'VOICE',
                audio_duration_sec: 12,
              },
            ];
          }
          return [];
        }),
      };

      const svc = new TeamChatService(dataSource);
      (svc as any).initialized = true;
      (svc as any).enrolledDefaultUsers.add('u1');

      const res = await svc.getMessages({ id: 'auth-1' }, 'conv-1');
      expect(res.messages).toHaveLength(1);
      expect(res.messages[0].attachmentUrl).toBeNull();
      expect(res.messages[0].hasAttachment).toBe(true);
      expect(res.messages[0].messageType).toBe('VOICE');

      const att = await svc.getMessageAttachment({ id: 'auth-1' }, 'msg-1');
      expect(att.attachmentUrl).toBe('data:audio/webm;base64,FULL_AUDIO_PAYLOAD');
    });
  });

  describe('NotificationsService lightweight delta & 60-day bound', () => {
    it('unreadDelta executes COUNT(*) + MAX(created_at) and listForUser bounds by 60 days', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ count: 3, maxCreatedAt: '2026-11-21T07:15:00.000Z' }),
        getMany: jest.fn().mockResolvedValue([]),
      };
      const repo: any = { createQueryBuilder: jest.fn(() => qb) };
      const svc = new NotificationsService(repo, {} as any);

      const delta = await svc.unreadDelta('auth-1');
      expect(delta).toEqual({ count: 3, maxCreatedAt: '2026-11-21T07:15:00.000Z' });
      expect(qb.select).toHaveBeenCalledWith('COUNT(n.id)::int', 'count');
      expect(qb.addSelect).toHaveBeenCalledWith('MAX(n.created_at)', 'maxCreatedAt');
      expect(Buffer.byteLength(JSON.stringify({ success: true, data: delta }), 'utf8')).toBeLessThan(200);

      await svc.listForUser('auth-1', 20);
      expect(qb.andWhere).toHaveBeenCalledWith('(n.createdAt >= :since OR n.isRead = false)', expect.any(Object));
      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });

  describe('ProductionRoutingService bounded list query', () => {
    it('findAll selects compact columns and applies default take(200)', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      const routingRepo: any = {
        createQueryBuilder: jest.fn(() => qb),
        manager: { query: jest.fn().mockResolvedValue([]) },
      };
      const svc = Object.create(ProductionRoutingService.prototype);
      svc.routingRepo = routingRepo;
      svc.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };

      await svc.findAll('comp-1');
      expect(qb.select).toHaveBeenCalled();
      expect(qb.take).toHaveBeenCalledWith(200);
    });
  });

  describe('ItemDocumentService & HTTP Gzip Compression', () => {
    it('strips legacy data: base64 blobs in ItemDocumentService.findAllByItem while preserving findOne', async () => {
      const rows = [
        { id: 'd1', itemId: 'i1', documentName: 'Spec', fileUrl: 'data:image/png;base64,HUGE_BLOB' },
        { id: 'd2', itemId: 'i1', documentName: 'Sheet', fileUrl: '/uploads/items/sheet.pdf' },
      ];
      const docRepo: any = {
        find: jest.fn().mockResolvedValue(rows),
        findOne: jest.fn().mockResolvedValue(rows[0]),
      };
      const svc = new ItemDocumentService(docRepo);
      const list = await svc.findAllByItem('i1');
      expect(list[0].fileUrl).toBe('');
      expect((list[0] as any).hasInlineBlob).toBe(true);
      expect(list[1].fileUrl).toBe('/uploads/items/sheet.pdf');

      const single = await svc.findOne('d1');
      expect(single.fileUrl).toBe('data:image/png;base64,HUGE_BLOB');
    });

    it('compresses JSON payloads >= 1KB over HTTP with gzip (~80% reduction)', async () => {
      const app = express();
      app.use(compression({ threshold: 1024 }));
      const samplePayload = {
        success: true,
        data: Array.from({ length: 40 }, (_, i) => ({
          id: `item-${i}`,
          itemCode: `WIP-ST-${100 + i}`,
          name: `Straightened High-Carbon Steel Wire Coil Batch ${i}`,
          uomCode: 'KG',
          divisionName: 'Spoke Division (DIV-SPD)',
        })),
      };
      const rawBytes = Buffer.byteLength(JSON.stringify(samplePayload), 'utf8');
      app.get('/test-json', (_req, res) => res.json(samplePayload));

      const server = await new Promise<http.Server>((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      try {
        const addr = server.address() as any;
        const result = await new Promise<{ encoding: string | undefined; wireBytes: number }>((resolve, reject) => {
          http
            .get(
              { host: '127.0.0.1', port: addr.port, path: '/test-json', headers: { 'Accept-Encoding': 'gzip' } },
              (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c) => chunks.push(Buffer.from(c)));
                res.on('end', () =>
                  resolve({
                    encoding: res.headers['content-encoding'],
                    wireBytes: Buffer.concat(chunks).length,
                  }),
                );
              },
            )
            .on('error', reject);
        });
        expect(result.encoding).toBe('gzip');
        expect(result.wireBytes).toBeLessThan(rawBytes * 0.25);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
