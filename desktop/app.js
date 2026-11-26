const { invoke } = window.__TAURI__.core;
const form = document.querySelector('#add-form');
const settingsForm = document.querySelector('#ai-form');
const items = document.querySelector('#items');
const message = document.querySelector('#message');
const settingsMessage = document.querySelector('#settings-message');
const analyzeButton = document.querySelector('#analyze');
const saveButton = form.querySelector('[type="submit"]');
const aiDialog = document.querySelector('#ai-dialog');
document.querySelector('#open-ai').addEventListener('click', () => {
  document.querySelector('#settings-menu').open = false;
  aiDialog.showModal();
});
document.querySelector('#close-ai').addEventListener('click', () => aiDialog.close());

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
let pendingBody = '';
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
    pendingBody = result.body;
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
    pendingBody = '';
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
    const title = document.createElement('button'); title.type = 'button'; title.className = 'item-title'; title.textContent = item.title;
    title.addEventListener('click', () => openReader(item));
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
  const item = { url: data.get('url'), title: data.get('title'), summary: data.get('summary'), tags: data.get('tags').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), body: pendingBody };
  try { await invoke('save_item', { item }); form.reset(); lastAnalyzedUrl = ''; pendingBody = ''; await refresh(); message.textContent = '收藏已保存。'; }
  catch (error) { message.textContent = String(error); }
});
refreshSettings().catch((error) => { settingsMessage.textContent = String(error); });
refresh().catch((error) => { message.textContent = String(error); });

const library = document.querySelector('#library');
const reader = document.querySelector('#reader');
const page = document.querySelector('#reading-page');
const readerBody = document.querySelector('#reader-body');
const readerTitle = document.querySelector('#reader-title');
const readerUrl = document.querySelector('#reader-url');
const font = document.querySelector('#reader-font');
const size = document.querySelector('#reader-size');
const color = document.querySelector('#reader-color');
const theme = document.querySelector('#reader-theme');
let currentItem = null;
let readerVersion = 0;
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem('reader-settings') || '{}'); } catch { preferences = {}; }
if (['serif', 'sans', 'kai'].includes(preferences.font)) font.value = preferences.font;
if (Number(preferences.size) >= 14 && Number(preferences.size) <= 30) size.value = preferences.size;
if (/^#[0-9a-f]{6}$/i.test(preferences.color || '')) color.value = preferences.color;
if (['white', 'eye', 'paper', 'kindle'].includes(preferences.theme)) theme.value = preferences.theme;
function applyReaderSettings() {
  page.dataset.font = font.value;
  page.dataset.theme = theme.value;
  page.style.setProperty('--reader-size', `${size.value}px`);
  page.style.setProperty('--reader-color', color.value);
  document.querySelector('#size-value').textContent = `${size.value} px`;
  localStorage.setItem('reader-settings', JSON.stringify({ font: font.value, size: size.value, color: color.value, theme: theme.value }));
}
[font, size, color, theme].forEach((control) => control.addEventListener('input', applyReaderSettings));
applyReaderSettings();
async function openReader(item) {
  const version = ++readerVersion;
  currentItem = item;
  library.hidden = true;
  reader.hidden = false;
  readerTitle.textContent = item.title;
  readerUrl.textContent = item.url;
  readerBody.textContent = '正在读取正文……';
  window.scrollTo(0, 0);
  try {
    const result = await invoke('get_reader_item', { id: item.id });
    if (version !== readerVersion) return;
    readerBody.replaceChildren();
    for (const paragraph of result.body.split(/\n\s*\n/)) {
      if (!paragraph.trim()) continue;
      const p = document.createElement('p');
      p.textContent = paragraph;
      readerBody.append(p);
    }
  } catch (error) {
    if (version === readerVersion) readerBody.textContent = String(error);
  }
}
document.querySelector('#back').addEventListener('click', () => {
  readerVersion++;
  reader.hidden = true;
  library.hidden = false;
  window.scrollTo(0, 0);
});
document.querySelector('#open-original').addEventListener('click', async () => {
  try { await invoke('open_original', { url: currentItem.url }); }
  catch (error) { readerBody.textContent = String(error); }
});
