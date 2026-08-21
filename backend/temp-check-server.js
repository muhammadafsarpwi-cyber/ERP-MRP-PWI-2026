const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:3001/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || '';

async function api(method, path, body = null, token = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

(async () => {
  // Check what env file has JWT_SECRET
  const fs = require('fs');
  let envContent = '';
  try { envContent = fs.readFileSync('D:\\ERP-MRP-PWI-2026\\backend\\.env', 'utf8'); } catch {}
  try { envContent += '\n' + fs.readFileSync('D:\\ERP-MRP-PWI-2026\\backend\\.env.local', 'utf8'); } catch {}
  
  const match = envContent.match(/JWT_SECRET=(.+)/);
  const secret = match ? match[1].trim() : '';
  console.log('JWT_SECRET found:', !!secret, secret ? secret.substring(0, 20) + '...' : 'N/A');
  
  // Get health
  const health = await api('GET', '/health');
  console.log('Health:', health.status, JSON.stringify(health.data));
  
  // Try without auth
  const noAuth = await api('GET', '/production/routings');
  console.log('No auth:', noAuth.status, JSON.stringify(noAuth.data)?.substring(0, 200));
  
  await c?.end?.();
})().catch(e => console.error('Error:', e.message));
