const { Client } = require('pg');

const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'dev@erp-local.test';
const PASSWORD = 'Dev#2026Test';
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';

const DB = {
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  ssl: { rejectUnauthorized: false },
};

let _token = null;
let _user = null;

async function db() {
  const c = new Client(DB);
  await c.connect();
  await c.query('SET statement_timeout = 30000');
  return c;
}

async function login(email = EMAIL, password = PASSWORD) {
  const r = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (r.status >= 400) throw new Error('login failed: ' + (j.message || JSON.stringify(j)));
  _token = j.token || j.accessToken || (j.data && j.data.accessToken);
  _user = j.user || (j.data && j.data.user) || {};
  return { status: r.status, token: _token, user: _user };
}

async function api(method, p, body, token) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      Authorization: 'Bearer ' + (token || _token),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

let pass = 0;
let fail = 0;
const failures = [];

function expect(cond, name, detail) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    failures.push(name);
    console.log('  FAIL ' + name + (detail ? '  [' + String(detail).slice(0, 200) + ']' : ''));
  }
}

function summary(label) {
  console.log('\n=== ' + label + ' === pass=' + pass + ' fail=' + fail);
  if (failures.length) console.log('FAILURES: ' + failures.join(' | '));
  return { pass, fail, failures };
}

module.exports = { BASE, COMPANY, EMAIL, PASSWORD, DB, db, login, api, expect, summary };