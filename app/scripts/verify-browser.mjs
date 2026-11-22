// Real-browser check of the 登記 restricted-wasm-v1 build (KOTOBA-159). Not part of `npm test`: it
// needs Chrome and the network (one consented Wikidata query). Run after `npm run build`:
//   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/verify-browser.mjs
// It serves dist/ on 127.0.0.1, drives Chrome over the DevTools protocol, answers the canonical
// consent dialog with trusted input (Input.dispatchMouseEvent) and records every request the page
// makes. It prints one JSON report and exits non-zero when a check fails.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dist = new URL('../dist/', import.meta.url);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html');
  try {
    const body = await readFile(new URL('.' + path, dist));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const appURL = `http://127.0.0.1:${server.address().port}/`;

const profile = await mkdtemp(join(tmpdir(), 'registry-cdp-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1100,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsURL = await new Promise((resolve, reject) => {
  let err = '';
  chrome.stderr.on('data', (d) => { err += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(err); if (m) resolve(m[1]); });
  setTimeout(() => reject(new Error('Chrome did not start')), 20000);
});
const targets = await (await fetch(wsURL.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '/json/list'))).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
  else for (const l of listeners) l(msg);
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const requests = [];
const contexts = new Map();
const consoleErrors = [];
// A sandboxed (opaque-origin) iframe runs out of process: it is its own target, attached flat.
const ctxKey = (sessionId, id) => `${sessionId ?? 'page'}:${id}`;
listeners.push((m) => {
  if (m.method === 'Target.attachedToTarget') {
    const sid = m.params.sessionId;
    Promise.all([send('Network.enable', {}, sid), send('Runtime.enable', {}, sid), send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sid)])
      .then(() => send('Runtime.runIfWaitingForDebugger', {}, sid)).catch(() => {});
  }
  if (m.method === 'Target.detachedFromTarget') for (const k of [...contexts.keys()]) if (k.startsWith(`${m.params.sessionId}:`)) contexts.delete(k);
  if (m.method === 'Network.requestWillBeSent') requests.push({ url: m.params.request.url, frame: m.params.frameId, session: m.sessionId ?? null });
  if (m.method === 'Runtime.executionContextCreated') contexts.set(ctxKey(m.sessionId, m.params.context.id), { ...m.params.context, sessionId: m.sessionId });
  if (m.method === 'Runtime.executionContextDestroyed') contexts.delete(ctxKey(m.sessionId, m.params.executionContextId));
  if (m.method === 'Runtime.executionContextsCleared') for (const k of [...contexts.keys()]) if (k.startsWith(`${m.sessionId ?? 'page'}:`)) contexts.delete(k);
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
});
await send('Network.enable');
await send('Runtime.enable');
await send('Page.enable');
await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
const evalIn = async (context, expression) => {
  if (!context) throw new Error('no such context');
  const r = await send('Runtime.evaluate', { expression, contextId: context.id, awaitPromise: true, returnByValue: true }, context.sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const hostContext = () => [...contexts.values()].find((c) => !c.sessionId && c.auxData?.isDefault && c.origin === appURL.slice(0, -1));
const guestContext = () => [...contexts.values()].filter((c) => c.sessionId && c.auxData?.isDefault).at(-1);
async function waitFor(fn, label, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('timeout: ' + label); await sleep(150); }
}
async function trustedClick(selector) {
  const box = await evalIn(hostContext(), `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
const lookupStatus = () => evalIn(guestContext(), `document.querySelector('.card p[role=status]')?.textContent ?? ''`);
const dialogOpen = () => evalIn(hostContext(), `!!document.querySelector('dialog[open]')`);
const external = () => requests.filter((r) => !r.url.startsWith(appURL) && !r.url.startsWith('data:') && !r.url.startsWith('about:'));

const report = { appURL, checks: {} };
const check = (name, ok, detail) => { report.checks[name] = { ok: !!ok, detail }; };
const clickLookup = () => evalIn(guestContext(), `[...document.querySelectorAll('button')].find((b) => b.textContent === 'Wikidata に照会').click()`);
try {
  await send('Page.navigate', { url: appURL });
  await waitFor(async () => guestContext() && await evalIn(guestContext(), `!!document.getElementById('new')`), 'guest ready');
  const frame = await evalIn(hostContext(), `(() => { const f = document.querySelector('#app > iframe'); return { sandbox: f.getAttribute('sandbox'), srcdoc: f.hasAttribute('srcdoc'), src: f.getAttribute('src') }; })()`);
  check('guest is a sandboxed srcdoc iframe', frame.sandbox === 'allow-scripts' && frame.srcdoc && frame.src === null, frame);
  check('guest origin is null', (await evalIn(guestContext(), `self.origin`)) === 'null');
  const idb = await evalIn(guestContext(), `(() => { try { const r = indexedDB.open('x'); return new Promise((res) => { r.onsuccess = () => res('opened'); r.onerror = () => res('refused: ' + r.error?.name); }); } catch (e) { return 'refused: ' + e.name; } })()`);
  check('guest has no IndexedDB', idb.startsWith('refused'), idb);
  const direct = await evalIn(guestContext(), `fetch('https://query.wikidata.org/').then(() => 'sent', (e) => 'refused: ' + e.message)`);
  check('guest cannot fetch directly (connect-src)', direct.startsWith('refused'), direct);
  check('guest cannot read the host DOM', (await evalIn(guestContext(), `(() => { try { return String(parent.document.title); } catch (e) { return e.name; } })()`)) === 'SecurityError');

  // A record with a precise location (about 1 m).
  await evalIn(guestContext(), `document.getElementById('new').click()`);
  await sleep(300);
  await evalIn(guestContext(), `(() => {
    const f = document.querySelector('form');
    const set = (n, v) => { const el = f.elements[n]; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('jurisdiction', 'JPN'); set('address', '東京都港区芝公園四丁目'); set('lat', '35.658612345'); set('lon', '139.745412345');
    if (f.elements['holder']) set('holder', '試験 太郎');
    [...f.querySelectorAll('button')].find((b) => b.textContent === '記録する').click();
  })()`);
  await waitFor(async () => (await evalIn(guestContext(), `[...document.querySelectorAll('button')].some((b) => b.textContent === 'Wikidata に照会')`)), 'record saved');
  const storageNote = await evalIn(guestContext(), `document.getElementById('storage').textContent`);
  check('the app says it cannot keep records (no storage in the sandbox yet)', storageNote.includes('保存できませんでした'), storageNote);

  // Deny: nothing is sent.
  let before = external().length;
  await clickLookup();
  await waitFor(dialogOpen, 'dialog for deny');
  const dialogText = await evalIn(hostContext(), `document.querySelector('dialog[open]').innerText`);
  check('dialog shows the recipient, the note and the withdrawal place', dialogText.includes('Wikimedia Foundation, Inc.') && dialogText.includes('約 100 m') && dialogText.includes('自宅を登録している場合は') && dialogText.includes('設定 › 許可した送信') && dialogText.includes('許可しない場合、この情報は送られません。'), dialogText.slice(0, 600));
  await evalIn(hostContext(), `[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === '許可しない').click()`);
  await waitFor(async () => (await lookupStatus()).includes('照会しませんでした'), 'deny status');
  await sleep(800);
  check('deny sends nothing', external().length === before, external().slice(before));

  // Allow with trusted input: one request, rounded to 3 decimals.
  before = external().length;
  await clickLookup();
  await waitFor(dialogOpen, 'dialog for allow');
  await sleep(800);
  await evalIn(hostContext(), `(() => { const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === '許可する'); b.id = 'cdp-allow'; })()`);
  await trustedClick('#cdp-allow');
  const status = await waitFor(async () => { const s = await lookupStatus(); return /件|該当する記載はありません|照会できませんでした/.test(s) ? s : null; }, 'allow status', 60000);
  await sleep(300);
  const sent = external().slice(before).map((r) => r.url);
  const q = sent.length === 1 ? new URL(sent[0]).searchParams.get('query') : '';
  check('allow sends exactly one request, to query.wikidata.org', sent.length === 1 && sent[0].startsWith('https://query.wikidata.org/sparql?'), sent.map((u) => u.slice(0, 120)));
  check('the query carries only the rounded place (3 decimals)', q.includes('Point(139.745 35.659)') && !q.includes('139.7454') && !q.includes('35.6586'), (q.match(/Point\([^)]*\)/) ?? [''])[0]);
  check('the lookup answered', !status.includes('照会できませんでした'), status);

  // A synthetic click on Allow does not send.
  before = external().length;
  await clickLookup();
  await waitFor(dialogOpen, 'dialog for synthetic');
  await sleep(800);
  await evalIn(hostContext(), `[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === '許可する').click()`);
  await sleep(800);
  const stillOpen = await dialogOpen();
  await evalIn(hostContext(), `[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === '許可しない').click()`);
  await sleep(800);
  check('a synthetic click on Allow does not send', stillOpen && external().length === before, { stillOpen });

  // Withdraw: the guest is remounted (records are not kept yet), and the lookup sends nothing.
  await evalIn(hostContext(), `(() => { document.getElementById('allowed-sending').open = true; document.querySelector('#allowed-list button').click(); })()`);
  await sleep(1000);
  await waitFor(async () => guestContext() && await evalIn(guestContext(), `!!document.getElementById('new')`), 'remount after withdraw');
  check('the withdrawal is kept in host storage', /"wikidata-query":\{"status":"withdrawn"/.test(await evalIn(hostContext(), `localStorage.getItem('itonami.registry.allowed-sending.v1')`)));
  await evalIn(hostContext(), `document.querySelector('#allowed-list button').click()`);
  await sleep(1000);

  check('every external request went to a declared origin', external().every((r) => r.url.startsWith('https://query.wikidata.org/')), external().map((r) => r.url.slice(0, 80)));
  check('no uncaught exception', consoleErrors.length === 0, consoleErrors);
} catch (error) {
  check('run', false, String(error?.stack ?? error));
  report.diagnostics = {
    contexts: [...contexts.values()].map((c) => ({ id: c.id, origin: c.origin, isDefault: c.auxData?.isDefault, frame: c.auxData?.frameId, session: c.sessionId ?? null })),
    host: await evalIn(hostContext(), `document.body.innerText.slice(0, 500)`).catch((e) => String(e)),
    errors: consoleErrors,
    guest: await evalIn(guestContext(), `document.body.innerText.slice(0, 1500)`).catch((e) => String(e)),
  };
} finally {
  report.externalRequests = external().map((r) => r.url);
  report.ok = Object.values(report.checks).every((c) => c.ok);
  console.log(JSON.stringify(report, null, 2));
  ws.close(); server.close();
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill(); await exited;
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  process.exitCode = report.ok ? 0 : 1;
}
