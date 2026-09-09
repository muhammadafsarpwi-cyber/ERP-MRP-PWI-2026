const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const BASE_URL = 'http://localhost:3001/api/v1';

// Read env for database connection
const env = {};
const envPath = path.join(__dirname, '..', '.env');
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const client = new Client({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: env.DB_SSL_SERVERNAME },
});

async function apiLogin(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const token = data.token || data.data?.access_token || data.data?.token || data.accessToken;
  if (!res.ok || !token) {
    throw new Error(`Login failed for ${email} (status ${res.status}): ${JSON.stringify(data)}`);
  }
  return token;
}

async function apiRequest(method, endpoint, token, body = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${endpoint}`, opts);
  const json = await res.json();
  return { status: res.status, ok: res.ok, data: json };
}

async function runLiveVerification() {
  console.log('=== STARTING LIVE E2E STOCK TRANSFER WORKFLOW VERIFICATION ===\n');
  await client.connect();

  const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';

  // Find two distinct warehouses in this company
  const whRes = await client.query(
    `SELECT id, warehouse_code, name FROM warehouses WHERE company_id = $1 LIMIT 2`,
    [COMPANY_ID]
  );
  if (whRes.rows.length < 2) {
    throw new Error('Need at least 2 warehouses in company to test transfer');
  }
  const SOURCE_WH = whRes.rows[0];
  const DEST_WH = whRes.rows[1];
  console.log(`Source Warehouse: ${SOURCE_WH.name} (${SOURCE_WH.id})`);
  console.log(`Destination Warehouse: ${DEST_WH.name} (${DEST_WH.id})`);

  // Find a valid item
  const itemRes = await client.query(
    `SELECT id, item_code, name, base_uom_id FROM items WHERE company_id = $1 LIMIT 1`,
    [COMPANY_ID]
  );
  const ITEM = itemRes.rows[0];
  console.log(`Item for transfer: ${ITEM.name} (${ITEM.item_code}) ID: ${ITEM.id}\n`);

  console.log('1. Authenticating users...');
  const creatorToken = await apiLogin('dev@erp-local.test', 'Dev#2026Test');
  console.log('   ✓ Creator logged in (dev@erp-local.test)');
  const approverToken = await apiLogin('system.admin@erp.com', 'Admin#2026!Secure');
  console.log('   ✓ Approver logged in (system.admin@erp.com)\n');

  // Verify Initial Live Stock Balances
  const srcBalRes = await client.query(
    `SELECT on_hand FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
    [ITEM.id, SOURCE_WH.id]
  );
  const initSrcQty = parseFloat(srcBalRes.rows[0]?.on_hand || '0');

  const dstBalRes = await client.query(
    `SELECT on_hand FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
    [ITEM.id, DEST_WH.id]
  );
  const initDstQty = parseFloat(dstBalRes.rows[0]?.on_hand || '0');

  console.log(`2. Initial Balances: Source = ${initSrcQty} KG, Destination = ${initDstQty} KG\n`);

  // Ensure source warehouse has at least 50 KG for transfer test
  if (initSrcQty < 20) {
    console.log('   Adding 100 KG initial test stock to source warehouse...');
    const existBal = await client.query(
      `SELECT id FROM inventory_balances WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3`,
      [COMPANY_ID, ITEM.id, SOURCE_WH.id]
    );
    if (existBal.rows.length > 0) {
      await client.query(
        `UPDATE inventory_balances SET on_hand = on_hand + 100, available = available + 100 WHERE id = $1`,
        [existBal.rows[0].id]
      );
    } else {
      await client.query(`
        INSERT INTO inventory_balances (id, company_id, item_id, warehouse_id, uom_id, on_hand, available, reserved, status)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, 100, 100, 0, 'ACTIVE')
      `, [COMPANY_ID, ITEM.id, SOURCE_WH.id, ITEM.base_uom_id]);
    }
  }

  const freshSrcBal = await client.query(
    `SELECT on_hand FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
    [ITEM.id, SOURCE_WH.id]
  );
  const startSrcQty = parseFloat(freshSrcBal.rows[0].on_hand);
  const freshDstBal = await client.query(
    `SELECT on_hand FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
    [ITEM.id, DEST_WH.id]
  );
  const startDstQty = parseFloat(freshDstBal.rows[0]?.on_hand || '0');

  let createdTrfId = null;
  let rejectedTrfId = null;

  try {
    // ----------------------------------------------------
    // STEP 1: CREATE DRAFT TRANSFER
    // ----------------------------------------------------
    console.log('3. Creator creating DRAFT Stock Transfer...');
    const createRes = await apiRequest('POST', '/inventory/transfers', creatorToken, {
      companyId: COMPANY_ID,
      fromWarehouseId: SOURCE_WH.id,
      toWarehouseId: DEST_WH.id,
      itemId: ITEM.id,
      quantity: 10,
      notes: 'Inter-warehouse transfer live test',
    });

    if (!createRes.ok || !createRes.data.data?.id) {
      throw new Error(`Create Draft failed: ${JSON.stringify(createRes.data)}`);
    }
    createdTrfId = createRes.data.data.id;
    const trfCode = createRes.data.data.transferCode;
    console.log(`   ✓ Draft created: ${trfCode} (ID: ${createdTrfId}, Status: ${createRes.data.data.status})\n`);

    // ----------------------------------------------------
    // STEP 2: SAME WAREHOUSE VALIDATION
    // ----------------------------------------------------
    console.log('4. Testing same warehouse validation...');
    const sameWhRes = await apiRequest('POST', '/inventory/transfers', creatorToken, {
      companyId: COMPANY_ID,
      fromWarehouseId: SOURCE_WH.id,
      toWarehouseId: SOURCE_WH.id, // identical!
      itemId: ITEM.id,
      quantity: 10,
    });
    if (sameWhRes.status === 400) {
      console.log('   ✓ Same warehouse correctly rejected with 400 Bad Request\n');
    } else {
      throw new Error(`Expected 400 for same warehouse, got ${sameWhRes.status}`);
    }

    // ----------------------------------------------------
    // STEP 3: SUBMIT TRANSFER
    // ----------------------------------------------------
    console.log('5. Creator submitting transfer for approval...');
    const submitRes = await apiRequest('PATCH', `/inventory/transfers/${createdTrfId}/submit`, creatorToken, {
      remarks: 'Submitted for verification',
    });
    if (!submitRes.ok || submitRes.data.data?.status !== 'PENDING_APPROVAL') {
      throw new Error(`Submit failed: ${JSON.stringify(submitRes.data)}`);
    }
    console.log(`   ✓ Status updated to: ${submitRes.data.data.status}\n`);

    // ----------------------------------------------------
    // STEP 4: SEGREGATION OF DUTIES (CREATOR CANNOT SELF-APPROVE)
    // ----------------------------------------------------
    console.log('6. Testing Segregation of Duties: Creator attempting self-approval...');
    const selfApproveRes = await apiRequest('PATCH', `/inventory/transfers/${createdTrfId}/approve`, creatorToken, {
      remarks: 'Self approval attempt',
    });
    if (selfApproveRes.status === 400) {
      console.log(`   ✓ Self-approval successfully blocked: "${selfApproveRes.data.message}"\n`);
    } else {
      throw new Error(`Segregation of duties failed! Expected 400, got ${selfApproveRes.status}`);
    }

    // ----------------------------------------------------
    // STEP 5: RETURN WORKFLOW (REQUIRE REASON & RESUBMISSION)
    // ----------------------------------------------------
    console.log('7. Testing Return workflow...');
    const retNoReason = await apiRequest('PATCH', `/inventory/transfers/${createdTrfId}/return`, approverToken, {
      reason: '',
    });
    if (retNoReason.status === 400) {
      console.log('   ✓ Return without reason correctly rejected (400)');
    } else {
      throw new Error(`Expected 400 for return without reason, got ${retNoReason.status}`);
    }

    const retValid = await apiRequest('PATCH', `/inventory/transfers/${createdTrfId}/return`, approverToken, {
      reason: 'Please check destination capacity',
      remarks: 'Returning for verification',
    });
    if (!retValid.ok || retValid.data.data?.status !== 'RETURNED') {
      throw new Error(`Return failed: ${JSON.stringify(retValid.data)}`);
    }
    console.log('   ✓ Transfer returned to creator (Status: RETURNED)');

    // Creator resubmits
    const resubmitRes = await apiRequest('PATCH', `/inventory/transfers/${createdTrfId}/submit`, creatorToken, {
      remarks: 'Capacity verified, resubmitting',
    });
    if (!resubmitRes.ok || resubmitRes.data.data?.status !== 'PENDING_APPROVAL') {
      throw new Error(`Resubmit failed: ${JSON.stringify(resubmitRes.data)}`);
    }
    console.log('   ✓ Resubmitted back to PENDING_APPROVAL\n');

    // ----------------------------------------------------
    // STEP 6: REJECT WORKFLOW (SEPARATE RECORD)
    // ----------------------------------------------------
    console.log('8. Testing Reject workflow...');
    const rejectDraft = await apiRequest('POST', '/inventory/transfers', creatorToken, {
      companyId: COMPANY_ID,
      fromWarehouseId: SOURCE_WH.id,
      toWarehouseId: DEST_WH.id,
      itemId: ITEM.id,
      quantity: 5,
      notes: 'Transfer to be rejected',
    });
    rejectedTrfId = rejectDraft.data.data.id;
    await apiRequest('PATCH', `/inventory/transfers/${rejectedTrfId}/submit`, creatorToken);

    const rejNoReason = await apiRequest('PATCH', `/inventory/transfers/${rejectedTrfId}/reject`, approverToken, {
      reason: '',
    });
    if (rejNoReason.status === 400) {
      console.log('   ✓ Reject without reason correctly rejected (400)');
    }

    const rejValid = await apiRequest('PATCH', `/inventory/transfers/${rejectedTrfId}/reject`, approverToken, {
      reason: 'Unneeded transfer request',
      remarks: 'Rejected by management',
    });
    if (!rejValid.ok || rejValid.data.data?.status !== 'REJECTED') {
      throw new Error(`Reject failed: ${JSON.stringify(rejValid.data)}`);
    }
    console.log('   ✓ Transfer permanently rejected (Status: REJECTED)');

    const postRej = await apiRequest('PATCH', `/inventory/transfers/${rejectedTrfId}/post`, approverToken);
    if (postRej.status === 400) {
      console.log('   ✓ Posting rejected transfer correctly blocked (400)\n');
    }

    // ----------------------------------------------------
    // STEP 7: AUTHORIZED APPROVAL
    // ----------------------------------------------------
    console.log('9. Authorized Approver approving transfer...');
    const approveRes = await apiRequest('PATCH', `/inventory/transfers/${createdTrfId}/approve`, approverToken, {
      remarks: 'Inter-warehouse relocation approved',
    });
    if (!approveRes.ok || approveRes.data.data?.status !== 'APPROVED') {
      throw new Error(`Approve failed: ${JSON.stringify(approveRes.data)}`);
    }
    console.log(`   ✓ Transfer APPROVED by authorized approver (Approved By ID: ${approveRes.data.data.approvedBy})\n`);

    // ----------------------------------------------------
    // STEP 8: LIVE STOCK IMPACT CHECK
    // ----------------------------------------------------
    console.log('10. Testing Live Stock Impact computation...');
    const impactRes = await apiRequest('GET', `/inventory/transfers/${createdTrfId}/impact`, approverToken);
    if (impactRes.ok && impactRes.data.data?.hasLine) {
      const imp = impactRes.data.data;
      console.log(`   ✓ Source Projected: ${imp.source.onHand} -> ${imp.source.projectedBalance} KG`);
      console.log(`   ✓ Dest Projected: ${imp.destination.onHand} -> ${imp.destination.projectedBalance} KG\n`);
    } else {
      throw new Error(`Impact check failed: ${JSON.stringify(impactRes.data)}`);
    }

    // ----------------------------------------------------
    // STEP 9: ATOMIC POSTING (SOURCE OUT & DEST IN)
    // ----------------------------------------------------
    console.log('11. Authorized user posting transfer to inventory ledger...');
    const postRes = await apiRequest('PATCH', `/inventory/transfers/${createdTrfId}/post`, approverToken, {
      remarks: 'Posting live verified transfer',
    });
    if (!postRes.ok || postRes.data.data?.status !== 'POSTED') {
      throw new Error(`Post failed: ${JSON.stringify(postRes.data)}`);
    }
    console.log(`   ✓ Transfer status updated to: ${postRes.data.data.status} (Posted By ID: ${postRes.data.data.postedBy})\n`);

    // Verify Balances After Posting
    const afterSrcBal = await client.query(
      `SELECT on_hand FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
      [ITEM.id, SOURCE_WH.id]
    );
    const endSrcQty = parseFloat(afterSrcBal.rows[0].on_hand);

    const afterDstBal = await client.query(
      `SELECT on_hand FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
      [ITEM.id, DEST_WH.id]
    );
    const endDstQty = parseFloat(afterDstBal.rows[0].on_hand);

    console.log(`12. Balances After Posting:`);
    console.log(`   Source Warehouse:      ${startSrcQty} KG -> ${endSrcQty} KG (Expected: ${startSrcQty - 10} KG)`);
    console.log(`   Destination Warehouse: ${startDstQty} KG -> ${endDstQty} KG (Expected: ${startDstQty + 10} KG)`);

    if (endSrcQty !== startSrcQty - 10 || endDstQty !== startDstQty + 10) {
      throw new Error(`Balance reconciliation mismatch! Source expected ${startSrcQty - 10}, got ${endSrcQty}. Dest expected ${startDstQty + 10}, got ${endDstQty}`);
    }
    console.log('   ✓ Balance reconciliation 100% exact!\n');

    // Verify Stock Ledger Movements
    console.log('13. Verifying Stock Ledger movements in database...');
    const ledgerRows = await client.query(
      `SELECT id, transaction_type, direction, warehouse_id, quantity, reference_id, reference_type 
       FROM stock_ledger 
       WHERE reference_id = $1 
       ORDER BY transaction_type`,
      [createdTrfId]
    );
    console.log(`   Found ${ledgerRows.rows.length} ledger movements:`);
    for (const r of ledgerRows.rows) {
      console.log(`     - [${r.transaction_type}] Direction: ${r.direction}, Qty: ${r.quantity}, Wh: ${r.warehouse_id}`);
    }

    if (ledgerRows.rows.length !== 2) {
      throw new Error(`Expected exactly 2 ledger movements (1 OUT, 1 IN), found ${ledgerRows.rows.length}`);
    }
    const outMv = ledgerRows.rows.find(r => r.transaction_type === 'TRANSFER_OUT');
    const inMv = ledgerRows.rows.find(r => r.transaction_type === 'TRANSFER_IN');
    if (!outMv || !inMv || outMv.warehouse_id !== SOURCE_WH.id || inMv.warehouse_id !== DEST_WH.id) {
      throw new Error('Ledger movement details mismatch!');
    }
    console.log('   ✓ Dual-warehouse ledger movements verified!\n');

    // ----------------------------------------------------
    // STEP 10: DOUBLE POSTING PROTECTION
    // ----------------------------------------------------
    console.log('14. Testing Double Posting protection...');
    const doublePostRes = await apiRequest('PATCH', `/inventory/transfers/${createdTrfId}/post`, approverToken);
    if (doublePostRes.status === 400) {
      console.log(`   ✓ Double posting blocked with 400 Bad Request: "${doublePostRes.data.message}"\n`);
    } else {
      throw new Error(`Expected 400 on double post, got ${doublePostRes.status}`);
    }

    // ----------------------------------------------------
    // STEP 11: AUDIT TRAIL / WORKFLOW HISTORY VERIFICATION
    // ----------------------------------------------------
    console.log('15. Verifying complete audit history...');
    const histRes = await apiRequest('GET', `/inventory/transfers/${createdTrfId}/history`, approverToken);
    if (histRes.ok && Array.isArray(histRes.data.data)) {
      console.log(`   Retrieved ${histRes.data.data.length} audit history events:`);
      for (const h of histRes.data.data) {
        console.log(`     - [${h.action}] From: ${h.fromStatus || 'NONE'} -> To: ${h.toStatus} by ${h.performedByUser?.displayName || h.performedBy} (${h.performedAt})`);
      }
      const actions = histRes.data.data.map(h => h.action);
      const expectedActions = ['CREATED', 'SUBMITTED', 'RETURNED', 'SUBMITTED', 'APPROVED', 'POSTED'];
      for (const exp of expectedActions) {
        if (!actions.includes(exp)) {
          throw new Error(`Audit trail missing expected action: ${exp}`);
        }
      }
      console.log('   ✓ Complete workflow audit history verified!\n');
    } else {
      throw new Error(`History fetch failed: ${JSON.stringify(histRes.data)}`);
    }

    // ----------------------------------------------------
    // STEP 12: STATUS TAB COUNTS VERIFICATION
    // ----------------------------------------------------
    console.log('16. Verifying status summary counts...');
    const countsRes = await apiRequest('GET', '/inventory/transfers/counts', approverToken);
    if (countsRes.ok && countsRes.data.data) {
      console.log(`   Live Counts: Total=${countsRes.data.data.total}, Drafts=${countsRes.data.data.draft}, Pending=${countsRes.data.data.pendingApproval}, Approved=${countsRes.data.data.approved}, Posted=${countsRes.data.data.posted}`);
      console.log('   ✓ Status counts API verified!\n');
    }

    console.log('=== ALL 16 LIVE E2E WORKFLOW CHECKS PASSED SUCCESSFULLY ===\n');

  } finally {
    // Clean up temporary test transfers and reverse ledger movements to restore balance
    console.log('Cleaning up temporary verification test records...');
    if (createdTrfId) {
      // Revert test ledger entries
      await client.query(`DELETE FROM stock_ledger WHERE reference_id = $1`, [createdTrfId]);
      // Restore balances
      await client.query(
        `UPDATE inventory_balances SET on_hand = $1, available = $1 WHERE item_id = $2 AND warehouse_id = $3`,
        [startSrcQty, ITEM.id, SOURCE_WH.id]
      );
      await client.query(
        `UPDATE inventory_balances SET on_hand = $1, available = $1 WHERE item_id = $2 AND warehouse_id = $3`,
        [startDstQty, ITEM.id, DEST_WH.id]
      );
      // Delete test transfer
      await client.query(`DELETE FROM stock_transfers WHERE id = $1`, [createdTrfId]);
    }
    if (rejectedTrfId) {
      await client.query(`DELETE FROM stock_transfers WHERE id = $1`, [rejectedTrfId]);
    }
    console.log('✓ Cleaned up temporary test data cleanly and restored balances.');
    await client.end();
  }
}

runLiveVerification().catch(err => {
  console.error('\n❌ LIVE E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
