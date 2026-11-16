const presets = {
  openai: ['https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'],
  deepseek: ['https://api.deepseek.com/chat/completions', 'deepseek-chat'],
  kimi: ['https://api.moonshot.cn/v1/chat/completions', 'moonshot-v1-8k'],
  glm: ['https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-flash'],
  minimax: ['https://api.minimaxi.com/v1/chat/completions', 'MiniMax-M2.1'],
};
const $ = (id) => document.getElementById(id);
const fields = ['base', 'key', 'provider', 'endpoint', 'model', 'aiKey'];
chrome.storage.local.get(fields).then((data) => {
  for (const field of fields) $(field).value = data[field] || '';
  if (!data.provider) {
    $('provider').value = 'openai';
    $('endpoint').value = presets.openai[0];
    $('model').value = presets.openai[1];
  }
});
$('provider').addEventListener('change', () => {
  const preset = presets[$('provider').value];
  if (preset) { $('endpoint').value = preset[0]; $('model').value = preset[1]; }
});
$('website').addEventListener('click', () => {
  try { const url = new URL($('base').value); if (!['http:', 'https:'].includes(url.protocol)) throw Error(); chrome.tabs.create({ url: new URL('/settings#connections', url).href }); }
  catch { $('status').textContent = '请先填写有效的网站地址。'; }
});
$('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(fields.map((field) => [field, $(field).value.trim()]));
  try {
    const base = new URL(data.base);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw Error('网站地址必须使用 HTTPS（本机开发可用 HTTP）。');
    data.base = base.origin;
    if (data.aiKey) { const endpoint = new URL(data.endpoint); if (endpoint.protocol !== 'https:') throw Error('AI 接口必须使用 HTTPS。'); if (!data.model) throw Error('请填写模型名称。'); }
    const result = await chrome.runtime.sendMessage({ type: 'validate', base: data.base, key: data.key });
    if (!result.ok) throw Error(result.error);
    await chrome.storage.local.set(data);
    $('status').textContent = '已登录并保存设置。';
  } catch (error) { $('status').textContent = error.message || '设置保存失败。'; }
});

