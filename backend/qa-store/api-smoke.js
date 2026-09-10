const { login, api, expect, summary } = require('./helper');

const ITEM = '1c53e9a9-b020-4d3a-bcd4-67ab8b50ef6f';
const STORE = '3b6b5628-859c-4df0-aab7-a69fd953bdd7';

async function main() {
  const lr = await login();
  console.log('logged in as ' + lr.user.email + ' (id ' + lr.user.id + ')');
  console.log('store.* permission count: ' + (lr.user.permissions || []).filter((p) => p.startsWith('store.')).length);

  const endpoints = [
    ['GET', '/store/stores'],
    ['GET', '/store/stores/' + STORE],
    ['GET', '/store/stores/' + STORE + '/items'],
    ['GET', '/store/material-requests'],
    ['GET', '/store/dashboard'],
    ['GET', '/store/dashboard/summary?storeId=' + STORE],
    ['GET', '/store/lifecycle/items/' + ITEM],
    ['GET', '/store/replenishment'],
    ['GET', '/store/replenishment/kpis'],
  ];
  for (const [m, p] of endpoints) {
    const r = await api(m, p);
    let info = '';
    if (Array.isArray(r.json)) info = 'rows=' + r.json.length;
    else if (r.json && typeof r.json === 'object') {
      info = Object.keys(r.json).slice(0, 8).join(',');
      if (r.json.data && Array.isArray(r.json.data)) info += ' dataRows=' + r.json.data.length;
    }
    expect(r.status === 200, p + ' -> 200 (got ' + r.status + ')', info);
  }

  summary('API smoke GET');
}
main().catch((e) => { console.error(e.message); process.exit(2); });