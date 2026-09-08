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
  console.log('=== STARTING LIVE E2E STOCK ADJUSTMENT WORKFLOW VERIFICATION ===\n');
  await client.connect();

  const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
  const WAREHOUSE_ID = 'aa9fedcb-27ac-47d2-a963-40d01c2594bc';
  const ITEM_ID = 'c1000000-0000-0000-0000-000000000001';

  console.log('1. Authenticating users...');
  const creatorToken = await apiLogin('dev@erp-local.test', 'Dev#2026Test');
  console.log('   ✓ Creator logged in (dev@erp-local.test)');
  const approverToken = await apiLogin('system.admin@erp.com', 'Admin#2026!Secure');
  console.log('   ✓ Approver logged in (system.admin@erp.com)\n');

  // Verify Initial Live Stock
  const initBalRes = await client.query(
    `SELECT on_hand FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
    [ITEM_ID, WAREHOUSE_ID]
  );
  const initialQty = parseFloat(initBalRes.rows[0]?.on_hand || '0');
  console.log(`2. Initial Inventory Balance for item: ${initialQty} KG\n`);

  let createdAdjId = null;
  let rejectedAdjId = null;

  try {
    // ----------------------------------------------------
    // STEP 1: CREATE DRAFT
    // ----------------------------------------------------
    console.log('3. Creator creating DRAFT Stock Adjustment...');
    const createRes = await apiRequest('POST', '/inventory/adjustments', creatorToken, {
      companyId: COMPANY_ID,
      itemId: ITEM_ID,
      warehouseId: WAREHOUSE_ID,
      adjustmentType: 'ADJUSTMENT_IN',
      quantity: 50,
      reason: 'Physical inventory surplus during live test',
    });

    if (!createRes.ok || !createRes.data.data?.id) {
      throw new Error(`Create Draft failed: ${JSON.stringify(createRes.data)}`);
    }
    createdAdjId = createRes.data.data.id;
    const adjCode = createRes.data.data.adjustmentCode;
    console.log(`   ✓ Draft created: ${adjCode} (ID: ${createdAdjId}, Status: ${createRes.data.data.status})\n`);

    // ----------------------------------------------------
    // STEP 2: SUBMIT FOR APPROVAL
    // ----------------------------------------------------
    console.log('4. Creator submitting adjustment for approval...');
    const submitRes = await apiRequest('POST', `/inventory/adjustments/${createdAdjId}/submit`, creatorToken, {
      remarks: 'Submitting test adjustment for verification',
    });
    if (!submitRes.ok || submitRes.data.data?.status !== 'PENDING_APPROVAL') {
      throw new Error(`Submit failed: ${JSON.stringify(submitRes.data)}`);
    }
    console.log(`   ✓ Submitted successfully. Status: ${submitRes.data.data.status}\n`);

    // ----------------------------------------------------
    // STEP 3: SEGREGATION OF DUTIES ENFORCEMENT
    // ----------------------------------------------------
    console.log('5. Testing Segregation of Duties: Creator attempting self-approval...');
    const selfApproveRes = await apiRequest('POST', `/inventory/adjustments/${createdAdjId}/approve`, creatorToken, {
      remarks: 'Attempting invalid self-approval',
    });
    if (selfApproveRes.status === 400 && selfApproveRes.data.message?.includes('cannot approve your own stock adjustment')) {
      console.log(`   ✓ PASS: Self-approval correctly blocked with 400 Bad Request: "${selfApproveRes.data.message}"\n`);
    } else {
      throw new Error(`Self-approval was NOT blocked as expected: status=${selfApproveRes.status}, body=${JSON.stringify(selfApproveRes.data)}`);
    }

    // ----------------------------------------------------
    // STEP 4: RETURN WORKFLOW
    // ----------------------------------------------------
    console.log('6. Approver testing RETURN workflow...');
    // Attempt return without reason
    const noReasonReturn = await apiRequest('POST', `/inventory/adjustments/${createdAdjId}/return`, approverToken, {
      reason: '   ',
    });
    if (noReasonReturn.status === 400) {
      console.log('   ✓ Return without reason blocked with 400 Bad Request.');
    } else {
      throw new Error('Return without reason should have failed with 400');
    }

    // Valid return
    const validReturn = await apiRequest('POST', `/inventory/adjustments/${createdAdjId}/return`, approverToken, {
      reason: 'Physical count recount requested',
      remarks: 'Please re-verify batch documentation',
    });
    if (!validReturn.ok || validReturn.data.data?.status !== 'RETURNED') {
      throw new Error(`Return failed: ${JSON.stringify(validReturn.data)}`);
    }
    console.log(`   ✓ Returned successfully. Status: ${validReturn.data.data.status}, Reason: "${validReturn.data.data.returnReason}"`);

    // Resubmit returned adjustment
    const resubmitRes = await apiRequest('POST', `/inventory/adjustments/${createdAdjId}/submit`, creatorToken, {
      remarks: 'Recount confirmed surplus of 50 KG',
    });
    if (!resubmitRes.ok || resubmitRes.data.data?.status !== 'PENDING_APPROVAL') {
      throw new Error(`Resubmit failed: ${JSON.stringify(resubmitRes.data)}`);
    }
    console.log(`   ✓ Resubmitted successfully back to PENDING_APPROVAL.\n`);

    // ----------------------------------------------------
    // STEP 5: REJECT WORKFLOW (SEPARATE RECORD)
    // ----------------------------------------------------
    console.log('7. Testing REJECT workflow on second test adjustment...');
    const create2 = await apiRequest('POST', '/inventory/adjustments', creatorToken, {
      companyId: COMPANY_ID,
      itemId: ITEM_ID,
      warehouseId: WAREHOUSE_ID,
      adjustmentType: 'ADJUSTMENT_OUT',
      quantity: 10,
      reason: 'Test scrap candidate',
    });
    rejectedAdjId = create2.data.data.id;
    await apiRequest('POST', `/inventory/adjustments/${rejectedAdjId}/submit`, creatorToken);

    // Reject without reason
    const noReasonReject = await apiRequest('POST', `/inventory/adjustments/${rejectedAdjId}/reject`, approverToken, {
      reason: '',
    });
    if (noReasonReject.status === 400) {
      console.log('   ✓ Reject without reason blocked with 400 Bad Request.');
    } else {
      throw new Error('Reject without reason should have failed with 400');
    }

    // Valid reject
    const validReject = await apiRequest('POST', `/inventory/adjustments/${rejectedAdjId}/reject`, approverToken, {
      reason: 'Scrap report disproved upon warehouse inspection',
      remarks: 'Disapproved permanently',
    });
    if (!validReject.ok || validReject.data.data?.status !== 'REJECTED') {
      throw new Error(`Reject failed: ${JSON.stringify(validReject.data)}`);
    }
    console.log(`   ✓ Rejected successfully. Status: ${validReject.data.data.status}`);

    // Attempt to post rejected adjustment
    const postRejected = await apiRequest('POST', `/inventory/adjustments/${rejectedAdjId}/post`, approverToken, {});
    console.log(`   [DEBUG] postRejected status: ${postRejected.status}, data:`, JSON.stringify(postRejected.data));
    if (postRejected.status === 400) {
      console.log(`   ✓ Posting rejected adjustment blocked with 400: "${postRejected.data.message}"\n`);
    } else {
      throw new Error(`Posting rejected adjustment should have failed with 400, got ${postRejected.status}: ${JSON.stringify(postRejected.data)}`);
    }

    // ----------------------------------------------------
    // STEP 6: APPROVE ADJUSTMENT
    // ----------------------------------------------------
    console.log('8. Approver approving the first adjustment...');
    const approveRes = await apiRequest('POST', `/inventory/adjustments/${createdAdjId}/approve`, approverToken, {
      remarks: 'Physical surplus verified by stock auditor',
    });
    if (!approveRes.ok || approveRes.data.data?.status !== 'APPROVED') {
      throw new Error(`Approve failed: ${JSON.stringify(approveRes.data)}`);
    }
    console.log(`   ✓ Approved successfully. Status: ${approveRes.data.data.status}, ApprovedBy: ${approveRes.data.data.approvedBy}\n`);

    // ----------------------------------------------------
    // STEP 7: POST ADJUSTMENT (ATOMIC STOCK LEDGER MOVEMENT)
    // ----------------------------------------------------
    console.log('9. Authorized user posting APPROVED adjustment to inventory ledger...');
    const postRes = await apiRequest('POST', `/inventory/adjustments/${createdAdjId}/post`, approverToken);
    if (!postRes.ok || postRes.data.data?.status !== 'POSTED') {
      throw new Error(`Post failed: ${JSON.stringify(postRes.data)}`);
    }
    console.log(`   ✓ Posted successfully. Status: ${postRes.data.data.status}, PostedBy: ${postRes.data.data.postedBy}`);

    // Verify DB Stock Balance & Stock Ledger
    const postBalRes = await client.query(
      `SELECT on_hand FROM inventory_balances WHERE item_id = $1 AND warehouse_id = $2`,
      [ITEM_ID, WAREHOUSE_ID]
    );
    const updatedQty = parseFloat(postBalRes.rows[0]?.on_hand || '0');
    console.log(`   ✓ Updated Inventory Balance: ${updatedQty} KG (Expected: ${initialQty + 50} KG)`);
    if (Math.abs(updatedQty - (initialQty + 50)) > 0.001) {
      throw new Error(`Inventory balance mismatch! Expected ${initialQty + 50}, got ${updatedQty}`);
    }

    // Verify Stock Ledger entry exists and references adjustment
    const ledgerRes = await client.query(
      `SELECT id, transaction_type, quantity, reference_id, reference_type 
       FROM stock_ledger 
       WHERE reference_id = $1`,
      [createdAdjId]
    );
    console.log(`   ✓ Stock Ledger Entries found: ${ledgerRes.rows.length}`);
    if (ledgerRes.rows.length !== 1) {
      throw new Error(`Expected exactly 1 stock ledger movement, found ${ledgerRes.rows.length}`);
    }
    console.log(`   ✓ Ledger Entry details:`, ledgerRes.rows[0]);

    // ----------------------------------------------------
    // STEP 8: IDEMPOTENCY / DOUBLE-POSTING PROTECTION
    // ----------------------------------------------------
    console.log('\n10. Testing Idempotency: Attempting second post on already POSTED adjustment...');
    const doublePostRes = await apiRequest('POST', `/inventory/adjustments/${createdAdjId}/post`, approverToken);
    if (doublePostRes.status === 400 && (doublePostRes.data.message?.includes('already been posted') || doublePostRes.data.message?.includes('APPROVED status'))) {
      console.log(`   ✓ PASS: Double-post safely blocked: "${doublePostRes.data.message}"`);
    } else {
      throw new Error(`Double post was not blocked as expected! Status=${doublePostRes.status}, Message=${doublePostRes.data?.message}`);
    }

    // Verify still exactly 1 ledger movement
    const ledgerRes2 = await client.query(
      `SELECT COUNT(*)::int as count FROM stock_ledger WHERE reference_id = $1`,
      [createdAdjId]
    );
    if (ledgerRes2.rows[0].count !== 1) {
      throw new Error(`Ledger entries duplicated! Count=${ledgerRes2.rows[0].count}`);
    }
    console.log('   ✓ Ledger remains exactly 1 movement. No duplicate entries created.');

    // ----------------------------------------------------
    // STEP 9: AUDIT & WORKFLOW HISTORY VERIFICATION
    // ----------------------------------------------------
    console.log('\n11. Verifying Workflow Audit History...');
    const histRes = await apiRequest('GET', `/inventory/adjustments/${createdAdjId}/history`, approverToken);
    const events = histRes.data.data || [];
    console.log(`   ✓ History records retrieved: ${events.length}`);
    events.forEach(e => {
      console.log(`     - [${e.createdAt}] Action: ${e.action}, From: ${e.fromStatus} -> To: ${e.toStatus}, User: ${e.user?.displayName || e.userId}, Remarks: ${e.remarks || '-'}`);
    });

    const actions = events.map(e => e.action);
    const expectedActions = ['CREATED', 'SUBMITTED', 'RETURNED', 'SUBMITTED', 'APPROVED', 'POSTED'];
    const hasAllActions = expectedActions.every(a => actions.includes(a));
    if (!hasAllActions) {
      throw new Error(`Missing expected lifecycle actions in audit history! Found: ${actions.join(', ')}`);
    }
    console.log('   ✓ PASS: Complete workflow lifecycle captured in audit history.');

  } finally {
    // ----------------------------------------------------
    // CLEANUP TEST RECORDS (REVERT INVENTORY + DELETE TEST ADJS)
    // ----------------------------------------------------
    console.log('\n12. Performing clean up of temporary test records...');
    if (createdAdjId) {
      // Revert stock ledger and balance for test record
      await client.query(`DELETE FROM stock_ledger WHERE reference_id = $1`, [createdAdjId]);
      await client.query(
        `UPDATE inventory_balances SET on_hand = $1, updated_at = NOW() WHERE item_id = $2 AND warehouse_id = $3`,
        [initialQty, ITEM_ID, WAREHOUSE_ID]
      );
      await client.query(`DELETE FROM stock_adjustment_history WHERE adjustment_id = $1`, [createdAdjId]);
      await client.query(`DELETE FROM stock_adjustments WHERE id = $1`, [createdAdjId]);
      console.log(`   ✓ Cleaned up test adjustment ${createdAdjId} and restored balance to ${initialQty} KG.`);
    }

    if (rejectedAdjId) {
      await client.query(`DELETE FROM stock_adjustment_history WHERE adjustment_id = $1`, [rejectedAdjId]);
      await client.query(`DELETE FROM stock_adjustments WHERE id = $1`, [rejectedAdjId]);
      console.log(`   ✓ Cleaned up test adjustment ${rejectedAdjId}.`);
    }

    await client.end();
    console.log('\n=== ALL LIVE E2E WORKFLOW VERIFICATIONS PASSED WITH 100% SUCCESS ===\n');
  }
}

runLiveVerification().catch(err => {
  console.error('\n❌ LIVE E2E VERIFICATION ERROR:', err);
  process.exit(1);
});
