import { captureReadingPosition, readingScrollTop } from './reader-position.mjs';

const { invoke } = window.__TAURI__.core;
const form = document.querySelector('#add-form');
const settingsForm = document.querySelector('#ai-form');
const items = document.querySelector('#items');
const message = document.querySelector('#message');
const libraryMessage = document.querySelector('#library-message');
const settingsMessage = document.querySelector('#settings-message');
const analyzeButton = document.querySelector('#analyze');
const saveButton = form.querySelector('[type="submit"]');
const aiDialog = document.querySelector('#ai-dialog');
const readerSettingsDialog = document.querySelector('#reader-settings-dialog');
const addDialog = document.querySelector('#add-dialog');
document.querySelector('#open-add').addEventListener('click', () => addDialog.showModal());
document.querySelector('#close-add').addEventListener('click', () => addDialog.close());
document.querySelector('#open-ai').addEventListener('click', () => {
  document.querySelector('#settings-menu').open = false;
  aiDialog.showModal();
});
document.querySelector('#close-ai').addEventListener('click', () => aiDialog.close());
document.querySelector('#open-reader-settings').addEventListener('click', () => {
  document.querySelector('#settings-menu').open = false;
  readerSettingsDialog.showModal();
});
document.querySelector('#close-reader-settings').addEventListener('click', () => readerSettingsDialog.close());

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
let refreshVersion = 0;
async function refresh() {
  const version = ++refreshVersion;
  const result = await invoke('list_items', { query: document.querySelector('#search').value });
  if (version !== refreshVersion) return;
  libraryMessage.textContent = '';
  allItems = result;
  renderItems();
}
let allItems = [];
let currentView = 'unread';
let selectedTag = '';
let currentItem = null;
function renderItems() {
  document.querySelector('#count-all').textContent = allItems.length;
  document.querySelector('#count-unread').textContent = allItems.filter((item) => !item.archived).length;
  document.querySelector('#count-liked').textContent = allItems.filter((item) => item.liked).length;
  document.querySelector('#count-archive').textContent = allItems.filter((item) => item.archived).length;
  const tags = [...new Set(allItems.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b));
  const tagFilters = document.querySelector('#tag-filters');
  tagFilters.replaceChildren();
  for (const tag of tags) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tag-filter'; button.textContent = tag;
    button.classList.toggle('active', tag === selectedTag);
    button.addEventListener('click', () => { selectedTag = selectedTag === tag ? '' : tag; renderItems(); });
    tagFilters.append(button);
  }
  const titles = { unread: '待读', liked: '喜欢', archive: '归档', all: '全部收藏' };
  document.querySelector('#list-heading').textContent = selectedTag || titles[currentView];
  document.querySelector('#list-subtitle').textContent = selectedTag ? '按标签筛选收藏' : '留给稍后的好文章';
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === currentView));
  const result = allItems.filter((item) => {
    if (selectedTag && !item.tags.includes(selectedTag)) return false;
    return currentView === 'all' || (currentView === 'unread' && !item.archived)
      || (currentView === 'liked' && item.liked) || (currentView === 'archive' && item.archived);
  });
  items.replaceChildren();
  document.querySelector('#count').textContent = `${result.length} 条`;
  if (!result.length) items.textContent = '这里还没有收藏。';
  for (const item of result) {
    const row = document.createElement('div'); row.className = 'item';
    row.dataset.itemId = String(item.id);
    row.classList.toggle('selected', currentItem?.id === item.id);
    row.addEventListener('click', (event) => { if (!event.target.closest('button')) openReader(item); });
    const info = document.createElement('div');
    const title = document.createElement('button'); title.type = 'button'; title.className = 'item-title'; title.textContent = item.title;
    title.addEventListener('click', () => openReader(item));
    const url = document.createElement('small'); url.textContent = item.url;
    const summary = document.createElement('p'); summary.textContent = item.summary;
    const tags = document.createElement('small'); tags.textContent = item.tags.join(' / ');
    const actions = document.createElement('div'); actions.className = 'item-actions';
    const like = document.createElement('button'); like.textContent = item.liked ? '♥ 已喜欢' : '♡ 喜欢';
    like.addEventListener('click', async () => { try { await invoke('set_item_state', { id: item.id, field: 'liked', value: !item.liked }); await refresh(); } catch (error) { libraryMessage.textContent = String(error); } });
    const archive = document.createElement('button'); archive.textContent = item.archived ? '移回待读' : '归档';
    archive.addEventListener('click', async () => { try { await invoke('set_item_state', { id: item.id, field: 'archived', value: !item.archived }); await refresh(); } catch (error) { libraryMessage.textContent = String(error); } });
    const remove = document.createElement('button'); remove.textContent = '删除';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`删除“${item.title}”？`)) return;
      try {
        await invoke('delete_item', { id: item.id });
        if (currentItem?.id === item.id) await closeReader();
        try { localStorage.removeItem(positionKey(item)); } catch { /* 收藏删除已成功 */ }
        await refresh();
      } catch (error) { libraryMessage.textContent = String(error); }
    });
    actions.append(like, archive, remove);
    info.append(title, url, summary, tags, actions); row.append(info); items.append(row);
  }
}
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  currentView = button.dataset.view; selectedTag = ''; renderItems();
}));
let searchTimer;
document.querySelector('#search').addEventListener('input', () => {
  if (document.querySelector('#search').value.trim()) {
    currentView = 'all';
    selectedTag = '';
  }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refresh().catch((error) => { libraryMessage.textContent = String(error); }), 180);
});
form.addEventListener('submit', async (event) => {
  event.preventDefault(); message.textContent = '';
  const data = new FormData(form);
  const item = { url: data.get('url'), title: data.get('title'), summary: data.get('summary'), tags: data.get('tags').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), body: pendingBody };
  try { await invoke('save_item', { item }); form.reset(); lastAnalyzedUrl = ''; pendingBody = ''; await refresh(); addDialog.close(); }
  catch (error) { message.textContent = String(error); }
});
refreshSettings().catch((error) => { settingsMessage.textContent = String(error); });
refresh().catch((error) => { libraryMessage.textContent = String(error); });

const reader = document.querySelector('#reader');
const readerContent = document.querySelector('#reader-content');
const readerPlaceholder = document.querySelector('#reader-placeholder');
const fullscreenButton = document.querySelector('#toggle-fullscreen');
const readerStatus = document.querySelector('#reader-status');
const page = document.querySelector('#reading-page');
const readerBody = document.querySelector('#reader-body');
const readerTitle = document.querySelector('#reader-title');
const readerUrl = document.querySelector('#reader-url');
const font = document.querySelector('#reader-font');
const size = document.querySelector('#reader-size');
const color = document.querySelector('#reader-color');
const theme = document.querySelector('#reader-theme');
let readerVersion = 0;
let layoutVersion = 0;
let readerReady = false;
let restoringPosition = false;
let positionTimer;
function positionKey(item) {
  return `reader-position:${item.id}:${item.url}`;
}
function capturePosition() {
  const rectangles = [...readerBody.children].map((paragraph) => paragraph.getBoundingClientRect());
  return captureReadingPosition(rectangles, reader.getBoundingClientRect().top, reader.scrollTop);
}
function saveReaderPosition() {
  if (!currentItem || !readerReady || restoringPosition) return;
  try { localStorage.setItem(positionKey(currentItem), JSON.stringify(capturePosition())); } catch { /* 阅读不应因本地设置存储失败而中断 */ }
}
function restorePosition(position) {
  const rectangles = [...readerBody.children].map((paragraph) => paragraph.getBoundingClientRect());
  const next = readingScrollTop(position, rectangles, reader.getBoundingClientRect().top, reader.scrollTop);
  if (next !== null) reader.scrollTop = next;
}
function loadReaderPosition(item) {
  try { return JSON.parse(localStorage.getItem(positionKey(item)) || 'null'); } catch { return null; }
}
reader.addEventListener('scroll', () => {
  if (!readerReady || restoringPosition) return;
  clearTimeout(positionTimer);
  positionTimer = setTimeout(saveReaderPosition, 200);
}, { passive: true });
window.addEventListener('pagehide', saveReaderPosition);
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem('reader-settings') || '{}'); } catch { preferences = {}; }
if (['serif', 'sans', 'kai'].includes(preferences.font)) font.value = preferences.font;
if (Number(preferences.size) >= 14 && Number(preferences.size) <= 30) size.value = preferences.size;
if (/^#[0-9a-f]{6}$/i.test(preferences.color || '')) color.value = preferences.color;
if (['white', 'eye', 'paper', 'kindle'].includes(preferences.theme)) theme.value = preferences.theme;
function applyReaderSettings() {
  page.dataset.font = font.value;
  document.documentElement.dataset.theme = theme.value;
  page.style.setProperty('--reader-size', `${size.value}px`);
  page.style.setProperty('--reader-color', color.value);
  document.querySelector('#size-value').textContent = `${size.value} px`;
  localStorage.setItem('reader-settings', JSON.stringify({ font: font.value, size: size.value, color: color.value, theme: theme.value }));
}
[font, size, color, theme].forEach((control) => control.addEventListener('input', applyReaderSettings));
applyReaderSettings();
async function openReader(item) {
  clearTimeout(positionTimer);
  saveReaderPosition();
  readerReady = false;
  const version = ++readerVersion;
  currentItem = item;
  readerPlaceholder.hidden = true;
  readerContent.hidden = false;
  document.body.classList.add('reading-active');
  document.querySelectorAll('.item').forEach((row) => row.classList.toggle('selected', row.dataset.itemId === String(item.id)));
  readerTitle.textContent = item.title;
  readerUrl.textContent = item.url;
  readerBody.textContent = '正在读取正文……';
  readerStatus.textContent = '';
  document.querySelector('#notes').replaceChildren();
  document.querySelector('#note-message').textContent = '';
  refreshNotes(item.id).catch((error) => { document.querySelector('#note-message').textContent = String(error); });
  reader.scrollTop = 0;
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
    const savedPosition = loadReaderPosition(item);
    requestAnimationFrame(() => {
      if (version !== readerVersion) return;
      restoringPosition = true;
      restorePosition(savedPosition);
      requestAnimationFrame(() => {
        if (version !== readerVersion) return;
        restoringPosition = false;
        readerReady = true;
      });
    });
  } catch (error) {
    if (version === readerVersion) readerBody.textContent = String(error);
  }
}
function setReaderFullscreen(enabled) {
  const position = readerReady ? capturePosition() : null;
  saveReaderPosition();
  const version = readerVersion;
  const layout = ++layoutVersion;
  restoringPosition = true;
  document.body.classList.toggle('reader-fullscreen', enabled);
  fullscreenButton.setAttribute('aria-pressed', String(enabled));
  fullscreenButton.setAttribute('aria-label', enabled ? '退出阅读区全屏' : '展开阅读区');
  fullscreenButton.title = enabled ? '退出阅读区全屏' : '展开阅读区';
  requestAnimationFrame(() => {
    if (version !== readerVersion || layout !== layoutVersion) return;
    restorePosition(position);
    requestAnimationFrame(() => {
      if (version !== readerVersion || layout !== layoutVersion) return;
      restoringPosition = false;
      saveReaderPosition();
    });
  });
}
fullscreenButton.addEventListener('click', () => {
  setReaderFullscreen(!document.body.classList.contains('reader-fullscreen'));
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('reader-fullscreen') && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    setReaderFullscreen(false);
  }
});
async function closeReader() {
  clearTimeout(positionTimer);
  saveReaderPosition();
  if (document.body.classList.contains('reader-fullscreen')) setReaderFullscreen(false);
  readerVersion++;
  readerReady = false;
  restoringPosition = false;
  currentItem = null;
  readerContent.hidden = true;
  readerPlaceholder.hidden = false;
  document.body.classList.remove('reading-active');
  document.querySelectorAll('.item.selected').forEach((row) => row.classList.remove('selected'));
}
document.querySelector('#back').addEventListener('click', closeReader);
document.querySelector('#show-library').addEventListener('click', () => {
  if (!readerContent.hidden) closeReader();
});
async function refreshNotes(itemId) {
  const notes = await invoke('list_reader_notes', { itemId });
  if (!currentItem || currentItem.id !== itemId || readerContent.hidden) return;
  const container = document.querySelector('#notes');
  container.replaceChildren();
  for (const note of notes) {
    const row = document.createElement('div'); row.className = 'note';
    const text = document.createElement('p'); text.textContent = note.body;
    const date = document.createElement('small'); date.textContent = note.created_at;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = '删除笔记';
    remove.addEventListener('click', async () => {
      if (!window.confirm('删除这条笔记？')) return;
      try { await invoke('delete_reader_note', { id: note.id, itemId }); await refreshNotes(itemId); }
      catch (error) { document.querySelector('#note-message').textContent = String(error); }
    });
    row.append(text, date, remove); container.append(row);
  }
}
document.querySelector('#note-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const itemId = currentItem.id;
  const input = document.querySelector('#note-input');
  try {
    await invoke('add_reader_note', { itemId, body: input.value });
    input.value = '';
    document.querySelector('#note-message').textContent = '笔记已保存。';
    await refreshNotes(itemId);
  } catch (error) { document.querySelector('#note-message').textContent = String(error); }
});
document.querySelector('#open-original').addEventListener('click', async () => {
  try { await invoke('open_original', { url: currentItem.url }); }
  catch (error) { readerBody.textContent = String(error); }
});
