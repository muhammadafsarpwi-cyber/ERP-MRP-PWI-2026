/* eslint-disable */
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require(path.join(__dirname, '..', 'node_modules', 'jsonwebtoken'));

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const token = jwt.sign(
  { sub: '36e816a9-b7a9-4e9d-9fb9-0c20270aec89', email: 'muhammadafsarpwi@gmail.com', role: 'authenticated' },
  env.SUPABASE_JWT_SECRET,
  { expiresIn: '2h' }
);
fs.writeFileSync(path.join(os.tmpdir(), 'erp_test_token.txt'), token);
console.log('TOKEN_WRITTEN len=' + token.length);
