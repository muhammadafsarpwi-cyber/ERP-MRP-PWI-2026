import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.argv[2] || 8611);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml'
};

http.createServer(async (req, res) => {
  let p = '/';
  try {
    p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const st = await stat(file);
    if (st.isDirectory()) throw new Error('dir');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    // SPA fallback: client-side routes (e.g. /login) must render index.html
    if (!extname(p)) {
      try {
        const body = await readFile(join(root, 'index.html'));
        res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' });
        return res.end(body);
      } catch {}
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
}).listen(port, () => console.log('serving ' + root + ' on http://127.0.0.1:' + port));
