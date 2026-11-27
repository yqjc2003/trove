import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function localEndpoint(value = 'http://127.0.0.1:46917/mcp') {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/mcp' || url.search || url.hash) throw new Error('MCP 地址必须是本机 HTTP /mcp 地址。');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.href;
}

function dataDirectory() {
  if (process.env.CATCHLINGER_DATA_DIR) return process.env.CATCHLINGER_DATA_DIR;
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'catchlinger');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'tech.sxyicheng.catchlinger');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'tech.sxyicheng.catchlinger');
}

async function token() {
  if (process.env.CATCHLINGER_MCP_TOKEN) return process.env.CATCHLINGER_MCP_TOKEN.trim();
  try { return (await readFile(join(dataDirectory(), '.env.local'), 'utf8')).split(/\r?\n/).find((line) => line.startsWith('CATCHLINGER_MCP_TOKEN='))?.slice('CATCHLINGER_MCP_TOKEN='.length).trim() || ''; }
  catch { return ''; }
}

export async function capture(urls) {
  if (!urls.length) throw new Error('请提供至少一个 HTTP(S) 网址。');
  for (const raw of urls) { const url = new URL(raw); if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('仅支持 HTTP(S) 网址。'); }
  const secret = await token();
  if (!secret) throw new Error('未找到本地 MCP 密钥，请启动桌面客户端并启用本地 MCP。');
  const endpoint = localEndpoint(process.env.CATCHLINGER_MCP_URL);
  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' };
  async function call(method, params, id) {
    const request = { jsonrpc: '2.0', method, params, ...(id === undefined ? {} : { id }) };
    let response;
    try { response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(request), redirect: 'error', signal: AbortSignal.timeout(300000) }); }
    catch { throw new Error('无法连接本地 MCP，请确认客户端正在运行且已启用服务。'); }
    if (!response.ok) throw new Error(`本地 MCP 请求失败（${response.status}），请检查服务和密钥。`);
    if (response.status === 202) return null;
    const result = await response.json();
    if (result.error) throw new Error(result.error.message || 'MCP 请求失败');
    return result.result;
  }
  await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'catch-and-linger-skill', version: '1.0.0' } }, 1);
  await call('notifications/initialized', {}, undefined);
  const results = [];
  for (const url of urls) {
    try {
      const result = await call('tools/call', { name: 'catchlinger_save', arguments: { url } }, results.length + 2);
      if (result?.isError) throw new Error(result.content?.[0]?.text || '收录失败');
      results.push(JSON.parse(result.content[0].text));
    } catch (error) { results.push({ url, status: 'error', error: error.message }); }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const results = await capture(process.argv.slice(2)); process.stdout.write(`${JSON.stringify(results, null, 2)}\n`); if (results.some((result) => result.status === 'error')) process.exitCode = 1; }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
