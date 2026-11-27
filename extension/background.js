chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const endpoint = 'http://127.0.0.1:46917/mcp';

async function request(key, method, params, id) {
  let response;
  try {
    response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(id === undefined ? {} : { id }) }), signal: AbortSignal.timeout(300000) });
  } catch { throw Error('无法连接客户端，请确认客户端运行中且已启用本地 MCP。'); }
  if (!response.ok) throw Error(`连接失败（${response.status}），请检查本地 MCP 密钥。`);
  if (response.status === 202) return null;
  const data = await response.json();
  if (data.error) throw Error(data.error.message || 'MCP 请求失败。');
  return data.result;
}
async function connect(key) {
  await request(key, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'catchlinger-browser-extension', version: '1.0.0' } }, 1);
  await request(key, 'notifications/initialized', {}, undefined);
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (sender.id !== chrome.runtime.id || ![chrome.runtime.getURL('popup.html'), chrome.runtime.getURL('options.html')].includes(sender.url)) throw Error('无权执行此操作。');
    const key = message.type === 'validate' ? message.key : (await chrome.storage.local.get('mcpToken')).mcpToken;
    if (!key) throw Error('请先在设置中填写本地 MCP 密钥。');
    await connect(key);
    if (message.type === 'validate' || message.type === 'check') return { ok: true };
    if (message.type !== 'capture' || sender.url !== chrome.runtime.getURL('popup.html')) throw Error('未知操作。');
    const url = new URL(message.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw Error('仅支持 HTTP(S) 网页。');
    const result = await request(key, 'tools/call', { name: 'catchlinger_save', arguments: { url: url.href } }, 2);
    if (result?.isError) throw Error(result.content?.[0]?.text || '收录失败。');
    return { ok: true, data: JSON.parse(result.content[0].text) };
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || '操作失败。' }));
  return true;
});
