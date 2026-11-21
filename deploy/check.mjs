// Read-only deployment checks. Run after starting the production containers, then again against the HTTPS hostname.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const WebSocket = require('ws');
const url = new URL(process.argv[2] || 'http://localhost:18800');
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Remote play requires an HTTPS URL');
let failures = 0;
async function check(name, run) { try { await run(); console.log(`PASS ${name}`); } catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); } }
const fetchAt = (path, init = {}) => fetch(new URL(path, url), { ...init, signal: AbortSignal.timeout(8000) });
await check('backend health and browser targets', async () => { const r = await fetchAt('/health'), body = await r.json(); if (!r.ok || !body.ok || !['auth', 'game1'].every(t => body.targets.includes(t))) throw Error('missing backend targets'); });
await check('database readiness', async () => { const r = await fetchAt('/ready'); if (!r.ok || !(await r.json()).ok) throw Error('database not ready'); });
await check('production HTML and hashed bundle', async () => {
  const r = await fetchAt('/'), html = await r.text(); const bundle = /src="(\/bundle\/[^" ]+\.js)"/.exec(html)?.[1];
  if (!r.ok || !bundle || html.includes('/@vite/client')) throw Error('not a production build');
  const b = await fetchAt(bundle); if (!b.ok || !/javascript/.test(b.headers.get('content-type') || '')) throw Error('bundle missing/wrong MIME');
  if (!/immutable/.test(b.headers.get('cache-control') || '')) throw Error('hashed bundle is not cached');
});
await check('map catalog and real GLB assets', async () => {
  const r = await fetchAt('/assets/maps/index.json'); const maps = await r.json(); const map = maps.find(m => m.id === 'nstation');
  if (!r.ok || !map?.check?.visual || !map.check.collisionGlb) throw Error('NStation not available');
  const glb = await fetchAt('/assets/maps/nstation/visual.glb', { headers: { range: 'bytes=0-11' } });
  const bytes = new Uint8Array(await glb.arrayBuffer()); if (!glb.ok || new TextDecoder().decode(bytes.slice(0, 4)) !== 'glTF') throw Error('map GLB missing or replaced by HTML');
});
await check('missing assets and bundles return 404', async () => { for (const path of ['/assets/pb-readiness-missing.json', '/bundle/pb-readiness-missing.js']) if ((await fetchAt(path)).status !== 404) throw Error(`${path} did not return 404`); });
await check('untrusted API origin is refused', async () => { const r = await fetchAt('/api/login', { method: 'POST', headers: { origin: 'https://untrusted.invalid', 'content-type': 'application/json' }, body: '{}' }); if (r.status !== 403) throw Error(`expected 403, got ${r.status}`); });
async function socketCheck(origin, allowed) {
  const wsUrl = new URL('/tcp?target=auth', url); wsUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { origin }); const timer = setTimeout(() => { ws.terminate(); reject(Error('WebSocket timed out')); }, 8000);
    const done = error => { clearTimeout(timer); ws.close(); error ? reject(error) : resolve(); };
    ws.on('message', (data, binary) => done(allowed && binary && data.length > 20 ? null : Error('unexpected protocol frame')));
    ws.on('unexpected-response', (_req, res) => { res.resume(); done(!allowed && res.statusCode === 403 ? null : Error(`upgrade HTTP ${res.statusCode}`)); });
    ws.on('error', error => { if (allowed) done(error); });
  });
}
await check('WebSocket upgrade and PB handshake through proxy', () => socketCheck(url.origin, true));
await check('untrusted WebSocket origin is refused', () => socketCheck('https://untrusted.invalid', false));
process.exitCode = failures ? 1 : 0;
