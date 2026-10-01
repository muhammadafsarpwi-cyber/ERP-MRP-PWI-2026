/**
 * DUMMY-DATA-CLEANUP — live database verification (§19/§21).
 *
 * GATED: runs only with ITEM_CLEANUP_E2E=1 so normal `npm test` never
 * touches a real database. Uses clearly-marked TMP-E2E rows and removes
 * every temp row it creates (audit rows for TMP ids are intentionally left
 * as proof of logging — see §13).
 *
 * Scenario A (recursive dummy delete): TMP item + TMP BOM + TMP BOM line
 *   → SUPER_ADMIN force delete → all three gone from the database, audit row present.
 * Scenario B (protected history): TMP item + real stock_ledger row
 *   → force delete attempt → 409 Conflict, item AND ledger row untouched.
 */
import { DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import dataSource from '../../../database/data-source';
import { Item } from '../entities/item.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { ItemRouteType } from '../entities/route-type.entity';
import { ItemTypeMaster } from '../entities/item-type.entity';
import { StockLedger } from '../../inventory/entities/stock-ledger.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { ProductionEntry } from '../../production/entities/production-entry.entity';
import { ActivityLog } from '../../audit/entities/activity-log.entity';
import { ActivityLogService } from '../../audit/services/activity-log.service';
import { ItemService } from './item.service';

const RUN_E2E = process.env.ITEM_CLEANUP_E2E === '1';
const describeE2e = RUN_E2E ? describe : describe.skip;

const TMP = 'TMP-E2E';

describeE2e('Item dummy cleanup — live database verification', () => {
  let ds: DataSource;
  let service: ItemService;
  let companyId: string;
  let uomId: string;
  let warehouseId: string | null;
  let superAuthId: string | null;
  let plainAuthId: string | null;

  const tempItemIds: string[] = [];

  const q = (sql: string, params?: any[]) => ds.query(sql, params);

  beforeAll(async () => {
    if (!dataSource.isInitialized) await dataSource.initialize();
    ds = dataSource;
    const co: any[] = await q('SELECT id FROM companies LIMIT 1');
    if (!co[0]) throw new Error('E2E needs at least one company row');
    companyId = co[0].id;
    const u: any[] = await q('SELECT id FROM uoms LIMIT 1');
    if (!u[0]) throw new Error('E2E needs at least one uom row');
    uomId = u[0].id;
    const w: any[] = await q('SELECT id FROM warehouses WHERE company_id = $1 LIMIT 1', [companyId]);
    warehouseId = w[0]?.id ?? null;
    const admins: any[] = await q(
      `SELECT u.auth_user_id AS id FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
       INNER JOIN erp_users u ON u.id = ur.user_id
       WHERE u.status = 'ACTIVE' AND ur.status = 'ACTIVE'
         AND (r.role_code IN ('SUPER_ADMIN','ADMIN','SYSTEM_ADMIN') OR r.name ILIKE '%admin%') LIMIT 1`,
    );
    superAuthId = admins[0]?.id ?? null;
    const plain: any[] = await q(
      `SELECT auth_user_id AS id FROM erp_users WHERE status = 'ACTIVE' AND id NOT IN (
         SELECT ur.user_id FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.status = 'ACTIVE' AND (r.role_code IN ('SUPER_ADMIN','ADMIN','SYSTEM_ADMIN') OR r.name ILIKE '%admin%')
       ) LIMIT 1`,
    );
    plainAuthId = plain[0]?.id ?? null;
    service = new ItemService(
      ds.getRepository(Item),
      ds.getRepository(Division),
      ds.getRepository(Section),
      ds.getRepository(Department),
      ds.getRepository(ItemRouteType),
      ds.getRepository(ItemTypeMaster),
      ds.getRepository(StockLedger),
      ds.getRepository(InventoryBalance),
      ds.getRepository(ProductionEntry),
      { ensureBarcodeForEntity: async () => ({}), backfill: async () => ({}), generateBarcodeValue: async () => 'X' } as any,
      ds,
      new ActivityLogService(ds.getRepository(ActivityLog)),
    );
  }, 120000);

  afterAll(async () => {
    // Sweep any leftover TMP rows in FK-safe order (audit rows stay as proof).
    await q(`DELETE FROM stock_ledger WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE '${TMP}%')`);
    await q(`DELETE FROM bom_lines WHERE bom_id IN (SELECT id FROM bill_of_materials WHERE product_id IN (SELECT id FROM items WHERE item_code LIKE '${TMP}%'))`);
    await q(`DELETE FROM bom_lines WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE '${TMP}%')`);
    await q(`DELETE FROM bill_of_materials WHERE product_id IN (SELECT id FROM items WHERE item_code LIKE '${TMP}%')`);
    await q(`DELETE FROM items WHERE item_code LIKE '${TMP}%'`);
    if (ds?.isInitialized) await ds.destroy();
  });

  async function createTmpItem(suffix: string, isDemo: boolean): Promise<string> {
    const code = `${TMP}-${suffix}`;
    const rows: any[] = await q(
      `INSERT INTO items (company_id, item_code, name, base_uom_id, is_demo, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE') RETURNING id`,
      [companyId, code, `TMP E2E Dummy ${suffix}`, uomId, isDemo],
    );
    tempItemIds.push(rows[0].id);
    return rows[0].id as string;
  }

  it('A: force-deletes a dummy item with its dummy BOM tree, then all are gone', async () => {
    if (!superAuthId) {
      console.warn('E2E-A skipped: no SUPER_ADMIN user in this database');
      return;
    }
    const itemId = await createTmpItem('A', true);
    const bom: any[] = await q(
      `INSERT INTO bill_of_materials (company_id, bom_code, name, product_id, status)
       VALUES ($1, $2, $3, $4, 'DRAFT') RETURNING id`,
      [companyId, `${TMP}-BOM-A`, `TMP E2E BOM A`, itemId],
    );
    await q(`INSERT INTO bom_lines (bom_id, line_number, item_id, uom_id, quantity) VALUES ($1, 1, $2, $3, 2)`, [
      bom[0].id,
      itemId,
      uomId,
    ]);

    await service.remove(itemId, {
      companyId,
      force: true,
      actor: { authUserId: superAuthId, email: 'e2e@erp.test' },
    });

    const stillItem: any[] = await q('SELECT id FROM items WHERE id = $1', [itemId]);
    const stillBom: any[] = await q('SELECT id FROM bill_of_materials WHERE id = $1', [bom[0].id]);
    const stillLines: any[] = await q('SELECT id FROM bom_lines WHERE bom_id = $1', [bom[0].id]);
    expect(stillItem).toHaveLength(0);
    expect(stillBom).toHaveLength(0);
    expect(stillLines).toHaveLength(0);

    const audit: any[] = await q(
      `SELECT action, target_id FROM activity_logs WHERE target_type = 'items' AND target_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [itemId],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe('ITEM_FORCE_DELETED');
  }, 120000);

  it('B: force delete is blocked (409) when protected stock history exists; data untouched', async () => {
    if (!superAuthId) {
      console.warn('E2E-B skipped: no SUPER_ADMIN user in this database');
      return;
    }
    if (!warehouseId) {
      console.warn('E2E-B skipped: no warehouse in this company');
      return;
    }
    const itemId = await createTmpItem('B', true);
    await q(
      `INSERT INTO stock_ledger (company_id, transaction_type, item_id, warehouse_id, quantity, uom_id, direction)
       VALUES ($1, 'OPENING', $2, $3, 10, $4, 'IN')`,
      [companyId, itemId, warehouseId, uomId],
    );

    await expect(
      service.remove(itemId, { companyId, force: true, actor: { authUserId: superAuthId } }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.remove(itemId, { companyId, force: true, actor: { authUserId: superAuthId } }),
    ).rejects.toThrow(/protected transactional history/);

    const stillItem: any[] = await q('SELECT id FROM items WHERE id = $1', [itemId]);
    const stillLedger: any[] = await q('SELECT id FROM stock_ledger WHERE item_id = $1', [itemId]);
    expect(stillItem).toHaveLength(1);
    expect(stillLedger).toHaveLength(1);

    // cleanup the protected fixture so the sweep stays small
    await q('DELETE FROM stock_ledger WHERE item_id = $1', [itemId]);
    await service.remove(itemId, { companyId, force: true, actor: { authUserId: superAuthId } });
    const gone: any[] = await q('SELECT id FROM items WHERE id = $1', [itemId]);
    expect(gone).toHaveLength(0);
  }, 120000);

  it('C: cross-company delete resolves to 404', async () => {
    const itemId = await createTmpItem('C', true);
    await expect(service.remove(itemId, { companyId: '00000000-0000-0000-0000-000000000000' })).rejects.toThrow(
      'not found',
    );
    const still: any[] = await q('SELECT id FROM items WHERE id = $1', [itemId]);
    expect(still).toHaveLength(1);
    await service.remove(itemId, {
      companyId,
      force: true,
      actor: { authUserId: superAuthId ?? plainAuthId ?? undefined },
    }).catch(() => undefined);
  }, 120000);
});

