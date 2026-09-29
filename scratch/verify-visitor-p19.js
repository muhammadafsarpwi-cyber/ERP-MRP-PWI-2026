/**
 * LIVE API VERIFICATION — Prompt #19 (Visitor Slip + Print + Host Confirmation).
 *
 * Drives the REAL running backend on :3001 against the REAL database. Nothing is
 * mocked. Every check prints PASS/FAIL and the script exits non-zero if any FAIL,
 * so a green run is evidence rather than an assertion.
 *
 * Usage:  node scratch/verify-visitor-p19.js
 */

const BASE = process.env.ERP_API || 'http://localhost:3001/api/v1';

// ── Seeded ids (same set the earlier prompts used) ─────────────────────────
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002';
const DIV_NB = '0653339b-94d0-4cc5-b880-e07908b2015f';
const LOCATION = '86dc16b0-6297-4829-9964-2dfc0dc7d8b5'; // SPI-A01 (existing)

const SUPER_ADMIN = { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' };
const STORE_GM = { email: 'store.gm.qa@erp-local.test', password: 'GmQa#2026Test1' };

// 1×1 transparent PNG — the smallest valid image a signature can be.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const NON_NULL_PATH = /"(photoPath|signaturePath|photo_path|signature_path)":\s*"[^"]/;

async function call(token, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const sendBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: sendBody ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function login(user) {
  const res = await call(null, 'POST', '/auth/login', { email: user.email, password: user.password });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const token = res.body?.token || res.body?.data?.token || res.body?.accessToken;
  if (!token) throw new Error(`no token in login response: ${JSON.stringify(res.body).slice(0, 300)}`);
  return token;
}

/** Upload a 1x1 PNG as the visitor photo (multipart, session-authenticated). */
async function uploadPhoto(token, entryId) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(PNG_1x1, 'base64')], { type: 'image/png' }), 'visitor.png');
  const res = await fetch(`${BASE}/visitor/entries/${entryId}/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  const runId = Date.now().toString().slice(-7);
  const visitorName = `P19 Verify ${runId}`;

  // ───────────────────────────────────────────── 1. AUTH + PERMISSIONS ────
  section('1. Authentication and the new visitor.slip.print permission');
  const admin = await login(SUPER_ADMIN);
  const gm = await login(STORE_GM);
  check('SUPER_ADMIN can log in', !!admin);
  check('MANAGEMENT (store GM) can log in', !!gm);

  const meAdmin = await call(admin, 'GET', '/auth/me');
  const me = meAdmin.body?.data || {};
  const perms = me.permissions || [];
  check('SUPER_ADMIN holds visitor.slip.print', perms.includes('visitor.slip.print'), `permissions=${JSON.stringify(perms).slice(0, 300)}`);
  check(
    'SUPER_ADMIN still holds visitor.entry.view and visitor.entry.update',
    perms.includes('visitor.entry.view') && perms.includes('visitor.entry.update'),
  );
  const adminUserId = me.user?.id || me.id;
  check('the authenticated ERP user id is known', !!adminUserId, `id=${adminUserId}`);

  const meGm = await call(gm, 'GET', '/auth/me');
  const gmPerms = meGm.body?.data?.permissions || [];
  check(
    'MANAGEMENT holds visitor.slip.print (granted by ERP-00071)',
    gmPerms.includes('visitor.slip.print'),
    `permissions=${JSON.stringify(gmPerms).slice(0, 300)}`,
  );
  const gmScope = meGm.body?.data?.divisions || {};
  const gmDivisionIds = new Set((gmScope.items || []).map((d) => d.id));
  console.log(
    `      MANAGEMENT scope: unrestricted=${gmScope.unrestricted} divisions=${(gmScope.items || []).map((d) => d.divisionCode).join(',')}`,
  );

  // ─────────────────────────────────────────────── 2. CREATE + PHOTO ──────
  section('2. Create a visitor (server-owned Time-In and reference)');
  const hostsRes = await call(admin, 'GET', `/visitor/hosts?divisionId=${DIV_CCD}&limit=5`);
  const hosts = hostsRes.body?.data || [];
  check('a host is available in the CCD division', hosts.length > 0, `status=${hostsRes.status} ${JSON.stringify(hostsRes.body).slice(0, 200)}`);
  const host = hosts[0];
  console.log(`      host: ${host?.name} (${host?.employeeCode}) department=${host?.department}`);

  const created = await call(admin, 'POST', '/visitor/entries', {
    divisionId: DIV_CCD,
    locationId: LOCATION,
    visitorName,
    cnic: '35202-1234567-3',
    mobile: '0300-7654321',
    visitorCompany: 'P19 Verification Co',
    hostEmployeeId: host?.id,
  });
  check('POST /visitor/entries → 201', created.status === 201, `status=${created.status} ${JSON.stringify(created.body).slice(0, 300)}`);
  const row = created.body?.data;
  const entryId = row?.id;
  if (!entryId) {
    console.log('FATAL: could not create the visitor entry; aborting.');
    process.exit(2);
  }
  check('created entry has a server-generated visitor_reference', /^(VIS-\d{4}-\d{6})$/.test(row?.visitorReference || ''), `ref=${row?.visitorReference}`);
  check('the reference is NOT a raw UUID', row?.visitorReference !== entryId);
  check('Time-In is server generated', !!row?.timeIn);
  check('status is PENDING', row?.status === 'PENDING');
  const ref = row.visitorReference;
  const createdText = JSON.stringify(row);
  check('the create response carries NO non-null storage path', !NON_NULL_PATH.test(createdText), createdText.match(/"(photoPath|signaturePath)":[^,}]*/g)?.join(' | '));
  check('the create response carries no base64 image blob', !createdText.includes('data:image'));
  check('host confirmation starts unconfirmed', row?.hostConfirmed === false);
  check('host confirmation has no actor yet', row?.hostConfirmedBy == null);

  // The LIST view is the one that must mask the CNIC for everyone.
  const listNow = await call(admin, 'GET', '/visitor/entries?limit=10');
  const listRow = (listNow.body?.data || []).find((r) => r.id === entryId);
  check('the list returns the new entry', !!listRow);
  check('the LIST view masks the CNIC', String(listRow?.cnic || '').includes('*'), `cnic=${listRow?.cnic}`);
  check('the LIST view never contains the full CNIC', !JSON.stringify(listNow.body).includes('35202-1234567-3'));
  check('the LIST view carries no storage path', !NON_NULL_PATH.test(JSON.stringify(listRow || {})));
  check('the LIST view shows the reference', listRow?.visitorReference === ref);

  // A photo, so the slip's authorised-image path is really exercised.
  const photo = await uploadPhoto(admin, entryId);
  check('POST photo → 2xx', photo.status >= 200 && photo.status < 300, `status=${photo.status} ${photo.text.slice(0, 200)}`);

  // ─────────────────────────────────────────────────────── 3. SLIP ────────
  section('3. GET slip — content, masking and scope');
  const slip = await call(admin, 'GET', `/visitor/entries/${entryId}/slip`);
  check('GET slip → 200', slip.status === 200, `status=${slip.status} ${JSON.stringify(slip.body).slice(0, 200)}`);
  const s = slip.body?.data || {};
  const slipText = JSON.stringify(s);
  check('slip shows the visitor reference', s.visitorReference === ref);
  check('slip shows the company name', typeof s.companyName === 'string' && s.companyName.length > 3, `companyName=${s.companyName}`);
  check('slip shows the company code', typeof s.companyCode === 'string' && s.companyCode.length > 0, `companyCode=${s.companyCode}`);
  check('slip masks the CNIC', String(s.cnic || '').includes('*'), `cnic=${s.cnic}`);
  check('slip never contains the full CNIC', !slipText.includes('35202-1234567-3'));
  check('slip shows the visitor name', s.visitorName === visitorName);
  check('slip shows the visitor mobile', !!s.mobile);
  check('slip shows the visitor company / source', !!s.visitorCompany);
  check('slip shows the host', !!s.hostName);
  check('slip carries a host department field', 'hostDepartment' in s, `keys=${Object.keys(s).join(',')}`);
  check('slip shows the division', !!s.division);
  check('slip shows the location', !!s.location);
  check('slip shows Time-In', !!s.timeIn);
  check('slip shows a NULL Time-Out for an open visit', s.timeOut === null, `timeOut=${s.timeOut}`);
  check('slip shows the status', s.status === 'PENDING');
  check('slip shows who created the record and when', !!s.createdBy && !!s.createdAt);
  check('slip reports the host confirmation as not confirmed', s.hostConfirmation?.confirmed === false);
  check(
    'slip states the host identity was NOT verified (§17)',
    s.hostConfirmation?.hostIdentityVerified === false,
    `hostIdentityVerified=${s.hostConfirmation?.hostIdentityVerified}`,
  );
  check('slip exposes NO photo storage path', !NON_NULL_PATH.test(slipText), slipText.match(/"(photoPath|signaturePath)":[^,}]*/g)?.join(' | '));
  check('slip reports hasPhoto once a photo exists', s.hasPhoto === true, `hasPhoto=${s.hasPhoto}`);
  check(
    'the photo is an authorised endpoint, never a storage URL (§6/§22)',
    s.photoUrl === `/visitor/entries/${entryId}/photo`,
    `photoUrl=${s.photoUrl}`,
  );
  check('the slip has no signature endpoint while unsigned', s.hasSignature === false && s.signatureUrl == null);

  // Reference search (§5)
  const search = await call(admin, 'GET', `/visitor/entries?search=${encodeURIComponent(ref)}`);
  check('the reference is searchable server-side', (search.body?.data || []).some((r) => r.id === entryId), `search=${JSON.stringify(search.body).slice(0, 200)}`);
  const searchName = await call(admin, 'GET', '/visitor/entries?search=P19%20Verify');
  check('the visitor name is still searchable', (searchName.body?.data || []).some((r) => r.id === entryId));

  // Authentication + guessing
  const noToken = await call(null, 'GET', `/visitor/entries/${entryId}/slip`);
  check('slip without a token → 401', noToken.status === 401, `status=${noToken.status}`);
  const guessed = await call(admin, 'GET', '/visitor/entries/00000000-0000-0000-0000-000000000000/slip');
  check('slip for an unknown id → 404', guessed.status === 404, `status=${guessed.status}`);
  const malformed = await call(admin, 'GET', '/visitor/entries/not-a-uuid/slip');
  check('slip for a malformed id → 4xx (never 500)', malformed.status >= 400 && malformed.status < 500, `status=${malformed.status}`);

  // ─────────────────────────── 3b. DIVISION SCOPE (out-of-scope probe) ────
  section('3b. Division scope on the slip');
  // Every seeded account holds a company-wide `user_organization_scopes` row,
  // so no seeded user is division-restricted and this run has no out-of-scope
  // subject. The scope probe lives in `verify-visitor-p19-scope.js`, which
  // narrows the store GM's scope temporarily and restores it byte-for-byte.
  if (gmScope.unrestricted) {
    console.log('      DEFERRED: the seeded caller is unrestricted — see verify-visitor-p19-scope.js');
    check(
      'the slip endpoint is reachable by an in-scope caller with the permission',
      (await call(gm, 'GET', `/visitor/entries/${entryId}/slip`)).status === 200,
    );
  } else if (!gmDivisionIds.has(DIV_CCD)) {
    const gmSlip = await call(gm, 'GET', `/visitor/entries/${entryId}/slip`);
    check('an out-of-scope division gets 403/404 for the slip', gmSlip.status === 403 || gmSlip.status === 404, `status=${gmSlip.status}`);
    check('the out-of-scope slip body carries no visitor data', !JSON.stringify(gmSlip.body).includes(visitorName));
  } else {
    console.log('      SKIPPED: the seeded caller covers every division.');
    check('division-scope probe executed', false, 'no out-of-scope division available with the seeded data');
  }

  // ───────────────────────────────────── 4. FORBIDDEN BODY KEYS (§17/28) ──
  section('4. The client may not state the host-confirmation fields');
  const forbidden = [
    ['hostConfirmed', true],
    ['host_confirmed', true],
    ['hostConfirmedAt', '2020-01-01T00:00:00.000Z'],
    ['host_confirmed_at', '2020-01-01T00:00:00.000Z'],
    ['hostConfirmedBy', adminUserId],
    ['host_confirmed_by', adminUserId],
    ['timeOut', '2020-01-01T00:00:00.000Z'],
    ['time_out', '2020-01-01T00:00:00.000Z'],
    ['timeIn', '2020-01-01T00:00:00.000Z'],
    ['status', 'COMPLETED'],
    ['visitorReference', 'VIS-2026-999999'],
    ['visitor_reference', 'VIS-2026-999999'],
    ['signaturePath', 'x/y.png'],
    ['hostEmployeeId', host.id],
    ['hostNameSnapshot', 'Someone Else'],
    ['divisionId', DIV_NB],
    ['locationId', LOCATION],
  ];
  for (const [key, value] of forbidden) {
    const bad = await call(admin, 'POST', `/visitor/entries/${entryId}/host-confirmation`, {
      note: 'probe',
      [key]: value,
    });
    check(`host-confirmation payload with "${key}" → 400`, bad.status === 400, `status=${bad.status} ${JSON.stringify(bad.body).slice(0, 160)}`);
  }

  const badMime = await call(admin, 'POST', `/visitor/entries/${entryId}/host-confirmation`, {
    signature: 'data:text/plain;base64,aGk=',
  });
  check('a non-image signature data URL → 400', badMime.status === 400, `status=${badMime.status}`);

  const badMagic = await call(admin, 'POST', `/visitor/entries/${entryId}/host-confirmation`, {
    signature: 'data:image/png;base64,' + Buffer.from('not really a png').toString('base64'),
  });
  check('a fake PNG (wrong magic bytes) → 400', badMagic.status === 400, `status=${badMagic.status}`);

  const oversize = await call(admin, 'POST', `/visitor/entries/${entryId}/host-confirmation`, {
    signature: 'data:image/png;base64,' + 'A'.repeat(90_000),
  });
  check(
    'an oversized signature is a 400, not a 413 (it is explained, not a crash)',
    oversize.status === 400,
    `status=${oversize.status} ${JSON.stringify(oversize.body).slice(0, 160)}`,
  );

  const afterProbes = await call(admin, 'GET', `/visitor/entries/${entryId}`);
  check('none of the rejected payloads changed the record', afterProbes.body?.data?.hostConfirmed === false);
  check('none of the rejected payloads set a Time-Out', afterProbes.body?.data?.timeOut === null);
  check('none of the rejected payloads stored a signature', afterProbes.body?.data?.hasSignature === false);

  // ───────────────────────────────────── 5. HOST CONFIRMATION (with sig) ─
  section('5. Confirm the host visit (with a digital signature)');
  const confirm = await call(admin, 'POST', `/visitor/entries/${entryId}/host-confirmation`, {
    signature: `data:image/png;base64,${PNG_1x1}`,
    note: 'Live verification — host received the visitor',
  });
  check('POST host-confirmation → 201', confirm.status === 201, `status=${confirm.status} ${JSON.stringify(confirm.body).slice(0, 300)}`);
  const confirmed = confirm.body?.data || {};
  check('host_confirmed is now true', confirmed.hostConfirmed === true);
  check('host_confirmed_at was recorded', !!confirmed.hostConfirmedAt);
  check('host_confirmed_by is the authenticated ERP user', confirmed.hostConfirmedBy === adminUserId, `by=${confirmed.hostConfirmedBy} expected=${adminUserId}`);
  check('a signature was recorded', confirmed.hasSignature === true);
  check('the response exposes only the authorised signature endpoint', confirmed.signatureUrl === `/visitor/entries/${entryId}/signature`, `url=${confirmed.signatureUrl}`);
  check('no base64 blob is ever returned in a visitor row', !JSON.stringify(confirmed).includes('data:image/png;base64'));
  check('the row still carries no signature storage path', !NON_NULL_PATH.test(JSON.stringify(confirmed)));

  // §28 — the confirmation must not have touched the visit lifecycle.
  check('status is STILL PENDING after the confirmation', confirmed.status === 'PENDING', `status=${confirmed.status}`);
  check('Time-Out is STILL null after the confirmation', confirmed.timeOut === null, `timeOut=${confirmed.timeOut}`);
  check('Time-In was NOT changed', confirmed.timeIn === row.timeIn, `${confirmed.timeIn} vs ${row.timeIn}`);
  check('the division was NOT changed', confirmed.divisionId === DIV_CCD);
  check('the location was NOT changed', confirmed.locationId === LOCATION);
  check('the host was NOT changed', confirmed.hostEmployeeId === host.id);

  // Replay → 409
  const replay = await call(admin, 'POST', `/visitor/entries/${entryId}/host-confirmation`, { note: 'again' });
  check('a second confirmation → 409', replay.status === 409, `status=${replay.status} ${JSON.stringify(replay.body).slice(0, 200)}`);

  // Concurrent confirmation — exactly one may win.
  const second = await call(admin, 'POST', '/visitor/entries', {
    divisionId: DIV_CCD,
    locationId: LOCATION,
    visitorName: `${visitorName} (no sig)`,
    cnic: '35202-1234568-4',
    mobile: '0300-7654322',
    visitorCompany: 'P19 Verification Co',
    hostEmployeeId: host.id,
  });
  const secondId = second.body?.data?.id;
  const secondRef = second.body?.data?.visitorReference;
  check('a second reference is distinct from the first', !!secondRef && secondRef !== ref, `${ref} vs ${secondRef}`);

  const [c1, c2] = await Promise.all([
    call(admin, 'POST', `/visitor/entries/${secondId}/host-confirmation`, {}),
    call(admin, 'POST', `/visitor/entries/${secondId}/host-confirmation`, {}),
  ]);
  const winners = [c1.status, c2.status].filter((x) => x === 201).length;
  check('two simultaneous confirmations: exactly one succeeds', winners === 1, `${c1.status} / ${c2.status}`);
  check('the loser gets a 409', [c1.status, c2.status].includes(409), `${c1.status} / ${c2.status}`);

  // Confirmation without a signature is valid.
  const third = await call(admin, 'POST', '/visitor/entries', {
    divisionId: DIV_CCD,
    locationId: LOCATION,
    visitorName: `${visitorName} (plain)`,
    cnic: '35202-1234569-5',
    mobile: '0300-7654323',
    visitorCompany: 'P19 Verification Co',
    hostEmployeeId: host.id,
  });
  const thirdId = third.body?.data?.id;
  const confirmNoSig = await call(admin, 'POST', `/visitor/entries/${thirdId}/host-confirmation`, {});
  check('confirming WITHOUT a signature → 201', confirmNoSig.status === 201, `status=${confirmNoSig.status} ${JSON.stringify(confirmNoSig.body).slice(0, 200)}`);
  check('host_confirmed is true without a signature', confirmNoSig.body?.data?.hostConfirmed === true);
  check('has_signature is false when none was supplied', confirmNoSig.body?.data?.hasSignature === false);

  // ─────────────────────────────────────────── 6. SIGNATURE RETRIEVAL ──────
  section('6. Signature retrieval is private and authorised');
  const sigRes = await fetch(`${BASE}/visitor/entries/${entryId}/signature`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  const sigBuf = Buffer.from(await sigRes.arrayBuffer());
  check('GET signature with a session → 200', sigRes.status === 200, `status=${sigRes.status}`);
  check('the stored signature is a real PNG', sigBuf.subarray(1, 4).toString('ascii') === 'PNG', `magic=${sigBuf.subarray(0, 8).toString('hex')}`);
  check('the response is a binary image, not JSON', String(sigRes.headers.get('content-type')).includes('image/'), `ct=${sigRes.headers.get('content-type')}`);

  const sigNoAuth = await fetch(`${BASE}/visitor/entries/${entryId}/signature`);
  check('GET signature without a session → 401/403', sigNoAuth.status === 401 || sigNoAuth.status === 403, `status=${sigNoAuth.status}`);

  const sigGm = await fetch(`${BASE}/visitor/entries/${entryId}/signature`, {
    headers: { Authorization: `Bearer ${gm}` },
  });
  check(
    'an in-scope caller holding the permission CAN read the signature',
    sigGm.status === 200,
    `status=${sigGm.status}`,
  );
  // The out-of-scope refusal needs a genuinely division-restricted caller, and
  // no seeded account has one — that is proven in verify-visitor-p19-scope.js.

  const sigNone = await call(admin, 'GET', `/visitor/entries/${thirdId}/signature`);
  check('a visitor with no signature → 404', sigNone.status === 404, `status=${sigNone.status}`);

  // The photo is private too.
  const photoNoAuth = await fetch(`${BASE}/visitor/entries/${entryId}/photo`);
  check('GET photo without a session → 401/403', photoNoAuth.status === 401 || photoNoAuth.status === 403, `status=${photoNoAuth.status}`);

  // ─────────────────────────────────────── 7. SLIP AFTER CONFIRMATION ──────
  section('7. The slip now shows the confirmation');
  const slip2 = await call(admin, 'GET', `/visitor/entries/${entryId}/slip`);
  const s2 = slip2.body?.data || {};
  check('slip reports confirmed = true', s2.hostConfirmation?.confirmed === true);
  check('slip names who confirmed', s2.hostConfirmation?.confirmedBy === adminUserId);
  check('slip shows when the confirmation happened', !!s2.hostConfirmation?.confirmedAt);
  check('slip still reports hostIdentityVerified = false', s2.hostConfirmation?.hostIdentityVerified === false);
  check('slip shows the signature capture moment', !!s2.hostConfirmation?.signatureCapturedAt);
  check('slip shows the signature capture actor', !!s2.hostConfirmation?.signatureCapturedBy);
  check('slip still shows a NULL Time-Out (confirmation is not a departure)', s2.timeOut === null, `timeOut=${s2.timeOut}`);
  check('slip still shows PENDING', s2.status === 'PENDING');
  check('slip exposes the signature endpoint', s2.signatureUrl === `/visitor/entries/${entryId}/signature`);
  check('the slip still exposes no storage path', !NON_NULL_PATH.test(JSON.stringify(s2)));

  // ─────────────────────────────────────────── 8. EXIT + RE-PRINT ──────────
  section('8. Exit, then re-print the completed slip');
  const exit = await call(admin, 'PATCH', `/visitor/entries/${entryId}/exit`, {});
  check('PATCH exit → 200', exit.status === 200, `status=${exit.status} ${JSON.stringify(exit.body).slice(0, 200)}`);
  check('the exit set a Time-Out', !!exit.body?.data?.timeOut);
  check('the exit completed the visit', exit.body?.data?.status === 'COMPLETED');
  check('the host confirmation survived the exit', exit.body?.data?.hostConfirmed === true);
  check('the signature survived the exit', exit.body?.data?.hasSignature === true);

  const exit2 = await call(admin, 'PATCH', `/visitor/entries/${entryId}/exit`, {});
  check('a second exit → 409', exit2.status === 409, `status=${exit2.status}`);

  const slip3 = await call(admin, 'GET', `/visitor/entries/${entryId}/slip`);
  const s3 = slip3.body?.data || {};
  check('a COMPLETED visitor is still printable', slip3.status === 200);
  check('the slip shows the real Time-Out', !!s3.timeOut, `timeOut=${s3.timeOut}`);
  check('the slip shows COMPLETED', s3.status === 'COMPLETED');
  check('the slip still shows the host confirmation', s3.hostConfirmation?.confirmed === true);
  check('the re-printed slip is still the same reference', s3.visitorReference === ref);

  // ────────────────────────────────────── 9. AUDIT LOG (no secrets) ────────
  section('9. Activity log (written by the shared ActivityLogService)');
  // This codebase has NO read endpoint for activity logs — the audit module is
  // deliberately write-only. The rows themselves are inspected directly in
  // `verify-visitor-p19-db.js` (which also proves no CNIC / mobile / base64 /
  // storage path is ever written). Here we only prove the shared service is the
  // one being used, and that the read endpoint genuinely does not exist rather
  // than the audit trail being missing.
  const logs = await call(admin, 'GET', '/activity-logs?limit=100');
  check('there is still no activity-log read endpoint (as before this work)', logs.status === 404, `status=${logs.status}`);
  console.log('      NOTE: the rows are read straight from the table in verify-visitor-p19-db.js');

  // ─────────────────────────── 10. NO RESIDUE FROM THE REJECTED PROBES ─────
  section('10. The rejected probes left no residue');
  const after = await call(admin, 'GET', `/visitor/entries/${entryId}`);
  check('the entry is still readable after every probe', after.status === 200);
  check('the confirmed actor is unchanged', after.body?.data?.hostConfirmedBy === adminUserId);
  check('the confirmed moment is unchanged', !!after.body?.data?.hostConfirmedAt);
  check('the signature is the only one stored', after.body?.data?.hasSignature === true);
  check('the exit actor is recorded', !!after.body?.data?.exitedBy);

  console.log(`\n================ ${checks - failures}/${checks} checks passed ================`);
  console.log(`Primary entry (completed): ${entryId} (${ref})`);
  console.log(`Race entry:                 ${secondId} (${secondRef})`);
  console.log(`No-signature entry:         ${thirdId} (PENDING, host confirmed, no signature)`);
  if (failures > 0) {
    console.log(`\n${failures} CHECK(S) FAILED`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nSCRIPT ERROR:', err);
  process.exitCode = 2;
});
