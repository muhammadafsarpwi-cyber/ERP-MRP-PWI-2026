require('../dist/main');
const BASE = 'http://127.0.0.1:3001/api/v1';

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/health', { signal: AbortSignal.timeout(1500) }).catch(() => null);
      if (r && r.status !== 502 && r.status !== 503) return;
    } catch (e) { /* not ready */ }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error('server did not become ready');
}

(async () => {
  await waitForServer();
  require('./workflow-audit.js');
  setTimeout(() => process.exit(0), 1200);
})().catch((e) => { console.error(e); process.exit(1); });