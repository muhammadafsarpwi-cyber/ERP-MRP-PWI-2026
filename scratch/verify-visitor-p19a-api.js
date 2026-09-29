/* Prompt #19A — live API check of the slip payload. */
const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'system.admin@erp.com';
const PASS = 'Admin#2026!Secure';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const body = await login.json();
  const token = body.token || body.data?.token;
  console.log(`login status=${login.status} token=${token ? 'yes' : 'NO'}`);
  if (!token) { console.log(JSON.stringify(body).slice(0, 400)); process.exit(1); }
  const H = { authorization: `Bearer ${token}` };

  // Pick a visitor that has a real created_by, ideally host-confirmed too.
  const list = await fetch(`${BASE}/visitor/entries?limit=200&page=1`, { headers: H });
  const listed = await list.json();
  const rows = listed.data || [];
  console.log(`visitor rows: ${rows.length}`);

  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  let checked = 0;
  for (const row of rows.slice(0, 60)) {
    const res = await fetch(`${BASE}/visitor/entries/${row.id}/slip`, { headers: H });
    if (res.status !== 200) continue;
    const slip = (await res.json()).data;
    checked++;
    const h = slip.hostConfirmation || {};

    // #19A §2 — names resolved, ids still available for traceability.
    ok(`createdByName present (${row.visitorReference})`,
      typeof slip.createdByName === 'string' && slip.createdByName.length > 0,
      JSON.stringify(slip.createdByName));
    ok(`confirmedByName present (${row.visitorReference})`,
      typeof h.confirmedByName === 'string' && h.confirmedByName.length > 0,
      JSON.stringify(h.confirmedByName));
    ok(`no name field is a UUID (${row.visitorReference})`,
      !UUID.test(slip.createdByName) && !UUID.test(h.confirmedByName));
    ok(`§17 flag preserved (${row.visitorReference})`, h.hostIdentityVerified === false);

    // The API still exposes the raw ids for traceability — unchanged #19 behaviour.
    ok(`raw ids retained (${row.visitorReference})`,
      slip.createdBy === row.createdBy && h.confirmedBy === (row.hostConfirmedBy ?? null));
  }
  console.log(`slips checked: ${checked}`);

  // Show a couple of real resolutions so the result is human-verifiable.
  const sample = rows.find((r) => r.hostConfirmedBy) || rows[0];
  if (sample) {
    const res = await fetch(`${BASE}/visitor/entries/${sample.id}/slip`, { headers: H });
    const slip = (await res.json()).data;
    console.log('--- sample slip actor resolution ---');
    console.log('  visitorReference :', slip.visitorReference);
    console.log('  createdBy (uuid) :', slip.createdBy);
    console.log('  createdByName    :', slip.createdByName);
    console.log('  confirmedBy(uuid):', slip.hostConfirmation.confirmedBy);
    console.log('  confirmedByName  :', slip.hostConfirmation.confirmedByName);
    console.log('  companyName (api):', slip.companyName);
    console.log('  timeIn (api)     :', slip.timeIn);
    console.log('  timeOut (api)    :', slip.timeOut);
  }

  console.log(`\nP19A-API PASS=${pass} FAIL=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
