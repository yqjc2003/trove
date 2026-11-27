// Opt-in Windows end-to-end test. Uses an isolated data directory under src-tauri/target.
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture } from '../skills/catch-and-linger/scripts/capture.mjs';

if (process.platform !== 'win32') throw new Error('此联调脚本目前仅支持 Windows。');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = realpathSync(join(root, 'src-tauri', 'target'));
const temporary = realpathSync(mkdtempSync(join(target, 'mcp-smoke-')));
if (!temporary.toLowerCase().startsWith(`${target.toLowerCase()}${sep}`)) throw new Error('测试目录不在预期范围。');
const binary = join(target, 'release', 'catchlinger-desktop.exe');
let app; let fixture;
const previous = { data: process.env.CATCHLINGER_DATA_DIR, token: process.env.CATCHLINGER_MCP_TOKEN, url: process.env.CATCHLINGER_MCP_URL };
try {
  const check = createNetServer();
  await new Promise((resolvePromise, reject) => { check.once('error', reject); check.listen(46917, '127.0.0.1', resolvePromise); });
  await new Promise((resolvePromise) => check.close(resolvePromise));
  const db = new DatabaseSync(join(temporary, 'trove.sqlite3'));
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO settings VALUES ('mcp_enabled', '1');");
  db.close();
  fixture = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<title>本地联调文章</title><article><h1>本地联调文章</h1><p>隔离测试正文。</p></article>'); });
  await new Promise((resolvePromise) => fixture.listen(0, '127.0.0.1', resolvePromise));
  const address = fixture.address();
  if (!address || typeof address === 'string') throw new Error('无法启动测试网页。');
  mkdirSync(join(temporary, 'webview'), { recursive: true });
  app = spawn(binary, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, CATCHLINGER_DATA_DIR: temporary, WEBVIEW2_USER_DATA_FOLDER: join(temporary, 'webview') } });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw new Error('隔离客户端提前退出。');
    try { const response = await fetch('http://127.0.0.1:46917/mcp'); if (response.status === 403) { ready = true; break; } } catch { /* 等待启动 */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  }
  if (!ready) throw new Error('隔离客户端未能启动 MCP。');
  const secret = readFileSync(join(temporary, '.env.local'), 'utf8').split(/\r?\n/).find((line) => line.startsWith('CATCHLINGER_MCP_TOKEN='))?.slice('CATCHLINGER_MCP_TOKEN='.length);
  if (!secret) throw new Error('客户端未生成本地密钥。');
  const rejected = await fetch('http://127.0.0.1:46917/mcp', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' });
  if (rejected.status !== 403) throw new Error('未拒绝不可信来源。');
  const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const preflight = await fetch('http://127.0.0.1:46917/mcp', { method: 'OPTIONS', headers: { Origin: extensionOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  if (preflight.status !== 204 || preflight.headers.get('access-control-allow-origin') !== extensionOrigin) throw new Error('浏览器扩展预检失败。');
  process.env.CATCHLINGER_DATA_DIR = temporary;
  delete process.env.CATCHLINGER_MCP_TOKEN;
  delete process.env.CATCHLINGER_MCP_URL;
  const url = `http://127.0.0.1:${address.port}/article`;
  const [first, second] = await capture([url, url]);
  if (first.status !== 'created' || second.status !== 'exists') throw new Error('MCP 收录或重复保护失败。');
  const verify = new DatabaseSync(join(temporary, 'trove.sqlite3'), { readOnly: true });
  const row = verify.prepare('SELECT title, body FROM items WHERE url = ?').get(url);
  verify.close();
  if (row?.title !== '本地联调文章' || !String(row.body).includes('隔离测试正文')) throw new Error('正文没有正确保存到隔离数据库。');
  process.stdout.write('本地 MCP 真实客户端联调通过：鉴权、收录正文和重复保护正常。\n');
} finally {
  if (previous.data === undefined) delete process.env.CATCHLINGER_DATA_DIR; else process.env.CATCHLINGER_DATA_DIR = previous.data;
  if (previous.token === undefined) delete process.env.CATCHLINGER_MCP_TOKEN; else process.env.CATCHLINGER_MCP_TOKEN = previous.token;
  if (previous.url === undefined) delete process.env.CATCHLINGER_MCP_URL; else process.env.CATCHLINGER_MCP_URL = previous.url;
  if (app && app.exitCode === null) { app.kill(); await new Promise((resolvePromise) => app.once('exit', resolvePromise)); }
  if (fixture) await new Promise((resolvePromise) => fixture.close(resolvePromise));
  if (realpathSync(temporary).toLowerCase().startsWith(`${target.toLowerCase()}${sep}`)) rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
