const { invoke } = window.__TAURI__.core;
const form = document.querySelector('#add-form');
const settingsForm = document.querySelector('#ai-form');
const items = document.querySelector('#items');
const message = document.querySelector('#message');
const settingsMessage = document.querySelector('#settings-message');
const analyzeButton = document.querySelector('#analyze');
const saveButton = form.querySelector('[type="submit"]');

async function refreshSettings() {
  const settings = await invoke('get_ai_settings');
  settingsForm.elements.model.value = settings.model;
  document.querySelector('#key-status').textContent = settings.has_key
    ? '已保存 API Key；留空可保留现有密钥。' : '密钥保存在本机的 .env.local 文件中。';
}
settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault(); settingsMessage.textContent = '';
  const data = new FormData(settingsForm);
  try {
    await invoke('save_ai_settings', { provider: data.get('provider'), model: data.get('model'), apiKey: data.get('apiKey') });
    settingsForm.elements.apiKey.value = '';
    await refreshSettings();
    settingsMessage.textContent = '设置已保存。';
  } catch (error) { settingsMessage.textContent = String(error); }
});
let lastAnalyzedUrl = '';
async function analyzeUrl() {
  if (analyzeButton.disabled) return;
  const url = form.elements.url.value.trim();
  if (!url || !form.elements.url.reportValidity()) return;
  analyzeButton.disabled = true;
  saveButton.disabled = true;
  message.textContent = '正在读取网页并生成摘要，请稍候……';
  try {
    const result = await invoke('analyze_url', { url });
    if (form.elements.url.value.trim() !== url) { message.textContent = '网址已更改，请重新解析。'; return; }
    form.elements.title.value = result.title;
    form.elements.summary.value = result.summary;
    form.elements.tags.value = result.tags.join(', ');
    lastAnalyzedUrl = url;
    message.textContent = '解析完成，可以检查或修改后保存。';
  } catch (error) { message.textContent = String(error); }
  finally { analyzeButton.disabled = false; saveButton.disabled = false; }
}
analyzeButton.addEventListener('click', analyzeUrl);
form.elements.url.addEventListener('input', () => {
  if (lastAnalyzedUrl && form.elements.url.value.trim() !== lastAnalyzedUrl) {
    form.elements.title.value = '';
    form.elements.summary.value = '';
    form.elements.tags.value = '';
    lastAnalyzedUrl = '';
  }
});
form.elements.url.addEventListener('blur', () => {
  const url = form.elements.url.value.trim();
  if (url && url !== lastAnalyzedUrl && form.elements.url.checkValidity()) analyzeUrl();
});
async function refresh() {
  const result = await invoke('list_items');
  items.replaceChildren();
  document.querySelector('#count').textContent = `${result.length} 条`;
  if (!result.length) items.textContent = '还没有收藏。从上方添加第一个链接。';
  for (const item of result) {
    const row = document.createElement('div'); row.className = 'item';
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = item.title;
    const url = document.createElement('small'); url.textContent = item.url;
    const summary = document.createElement('p'); summary.textContent = item.summary;
    const tags = document.createElement('small'); tags.textContent = item.tags.join(' / ');
    const remove = document.createElement('button'); remove.textContent = '删除';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`删除“${item.title}”？`)) return;
      try { await invoke('delete_item', { id: item.id }); await refresh(); } catch (error) { message.textContent = String(error); }
    });
    info.append(title, url, summary, tags); row.append(info, remove); items.append(row);
  }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault(); message.textContent = '';
  const data = new FormData(form);
  const item = { url: data.get('url'), title: data.get('title'), summary: data.get('summary'), tags: data.get('tags').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) };
  try { await invoke('save_item', { item }); form.reset(); lastAnalyzedUrl = ''; await refresh(); message.textContent = '收藏已保存。'; }
  catch (error) { message.textContent = String(error); }
});
refreshSettings().catch((error) => { settingsMessage.textContent = String(error); });
refresh().catch((error) => { message.textContent = String(error); });
