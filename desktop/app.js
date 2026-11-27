import { captureReadingPosition, readingScrollTop, waitForReaderImages } from './reader-position.mjs';
import { selectionAnchor, imageAnchor, findAnnotation } from './annotation-anchor.mjs';
import { measureReadingText, estimateReadingProgress } from './reading-estimate.mjs';
import { countTagItems, matchesLibraryView, toggleTag } from './library-filter.mjs';

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
const createTagDialog = document.querySelector('#create-tag-dialog');
const editTagsDialog = document.querySelector('#edit-tags-dialog');
const createTagForm = document.querySelector('#create-tag-form');
const editTagsForm = document.querySelector('#edit-tags-form');
const editTagsInput = document.querySelector('#edit-tags-input');
const createTagMessage = document.querySelector('#create-tag-message');
const editTagsMessage = document.querySelector('#edit-tags-message');
const tagToggle = document.querySelector('#toggle-tags');
const tagFilters = document.querySelector('#tag-filters');
function setTagsExpanded(expanded) {
  tagToggle.setAttribute('aria-expanded', String(expanded));
  tagFilters.hidden = !expanded;
  try { localStorage.setItem('tags-expanded', String(expanded)); } catch { /* 偏好无法保存时仍允许切换 */ }
}
let tagsExpanded = true;
try { tagsExpanded = localStorage.getItem('tags-expanded') !== 'false'; } catch { /* 使用默认展开状态 */ }
setTagsExpanded(tagsExpanded);
tagToggle.addEventListener('click', () => setTagsExpanded(tagToggle.getAttribute('aria-expanded') !== 'true'));
let editingItem = null;
let availableTags = [];
document.querySelector('#open-add').addEventListener('click', () => addDialog.showModal());
document.querySelector('#close-add').addEventListener('click', () => addDialog.close());
document.querySelector('#add-tag').addEventListener('click', () => {
  createTagForm.reset();
  createTagMessage.textContent = '';
  createTagDialog.showModal();
});
document.querySelector('#close-create-tag').addEventListener('click', () => createTagDialog.close());
document.querySelector('#close-edit-tags').addEventListener('click', () => editTagsDialog.close());
createTagForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  createTagMessage.textContent = '';
  try {
    await invoke('create_custom_tag', { name: document.querySelector('#new-tag-name').value });
    await refresh();
    createTagDialog.close();
  } catch (error) { createTagMessage.textContent = String(error); }
});
function parsedTags(value) {
  return value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}
function renderTagChoices() {
  const selected = parsedTags(editTagsInput.value);
  const choices = document.querySelector('#edit-tag-choices');
  choices.replaceChildren();
  const tags = [...availableTags];
  for (const tag of selected) {
    if (!tags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  for (const tag of tags) {
    const active = selected.some((candidate) => candidate.toLowerCase() === tag.toLowerCase());
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = tag; button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      const current = parsedTags(editTagsInput.value);
      const exists = current.some((candidate) => candidate.toLowerCase() === tag.toLowerCase());
      editTagsInput.value = (exists ? current.filter((candidate) => candidate.toLowerCase() !== tag.toLowerCase()) : [...current, tag]).join(', ');
      renderTagChoices();
    });
    choices.append(button);
  }
}
editTagsInput.addEventListener('input', renderTagChoices);
async function openTagEditor(item) {
  if (!mayLeaveReaderEditor()) return;
  if (readerEditing) await leaveReaderEditor();
  editingItem = item;
  document.querySelector('#edit-item-title').value = item.title;
  document.querySelector('#edit-item-summary').value = item.summary;
  editTagsInput.value = item.tags.join(', ');
  editTagsMessage.textContent = '';
  document.querySelector('#edit-note-body-field').hidden = item.content_type !== 'note';
  if (item.content_type === 'note') {
    try { document.querySelector('#edit-note-body').value = (await invoke('get_reader_item', { id: item.id })).body; }
    catch (error) { libraryMessage.textContent = String(error); return; }
  }
  renderTagChoices();
  editTagsDialog.showModal();
}
editTagsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingItem) return;
  editTagsMessage.textContent = '';
  try {
    const item = { id: editingItem.id, title: document.querySelector('#edit-item-title').value, summary: document.querySelector('#edit-item-summary').value, tags: parsedTags(editTagsInput.value), body: editingItem.content_type === 'note' ? document.querySelector('#edit-note-body').value : null };
    await invoke('edit_item', { item });
    if (currentItem?.id === item.id) {
      currentItem = { ...currentItem, title: item.title.trim(), summary: item.summary.trim(), tags: item.tags };
      readerTitle.textContent = currentItem.title;
      if (item.body !== null) await openReader(currentItem);
    }
    await refresh();
    editTagsDialog.close();
  } catch (error) { editTagsMessage.textContent = String(error); }
});
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
let pendingSourceNote = '';
let pendingImages = [];
let pendingSourceIncomplete = false;
let classificationVersion = 0;
let classificationTimer;
const contentKindHint = document.querySelector('#content-kind-hint');
function setAddMode() {
  const note = form.elements.mode.value === 'note';
  document.querySelector('#link-fields').hidden = note;
  document.querySelector('#note-body-field').hidden = !note;
  form.elements.url.required = !note;
  form.elements.url.disabled = note;
  message.textContent = '';
}
form.elements.mode.addEventListener('change', setAddMode);
const contentHints = {
  article: '识别为文章：解析时会提取正文并发送给 DeepSeek，用于生成摘要和标签。',
  repo: '识别为代码仓库：GitHub 项目会读取公开 README 并交给 DeepSeek 分析。',
  profile: '识别为 GitHub 用户：读取公开简介和 Profile README 并交给 DeepSeek 分析。',
  video: '识别为视频：读取公开介绍并交给 DeepSeek 分析。',
};
async function showContentKind(url) {
  const version = ++classificationVersion;
  if (!url || !form.elements.url.checkValidity()) {
    contentKindHint.textContent = '文章提取正文；GitHub 读取公开 README 或用户资料；视频读取公开介绍。';
    return;
  }
  try {
    const kind = await invoke('classify_url', { url });
    if (version === classificationVersion && form.elements.url.value.trim() === url) {
      contentKindHint.textContent = contentHints[kind] || contentHints.article;
    }
  } catch {
    if (version === classificationVersion) contentKindHint.textContent = '请输入有效的 HTTP 或 HTTPS 网址。';
  }
}
async function analyzeUrl() {
  if (analyzeButton.disabled) return;
  const url = form.elements.url.value.trim();
  if (!url || !form.elements.url.reportValidity()) return;
  analyzeButton.disabled = true;
  saveButton.disabled = true;
  const initial = { title: form.elements.title.value, summary: form.elements.summary.value, tags: form.elements.tags.value };
  message.textContent = '正在读取网页并生成摘要，请稍候……';
  try {
    const result = await invoke('analyze_url', { url });
    if (form.elements.mode.value !== 'link' || form.elements.url.value.trim() !== url) return;
    if (form.elements.title.value === initial.title) form.elements.title.value = result.title;
    if (form.elements.summary.value === initial.summary) form.elements.summary.value = result.summary;
    if (form.elements.tags.value === initial.tags) form.elements.tags.value = result.tags.join(', ');
    pendingBody = result.body;
    pendingSourceNote = result.warning || '';
    pendingImages = result.images || [];
    pendingSourceIncomplete = !!result.source_incomplete;
    lastAnalyzedUrl = url;
    message.textContent = result.warning || '解析完成，可以检查或修改后保存。';
  } catch (error) {
    if (form.elements.url.value.trim() === url) {
      lastAnalyzedUrl = url;
      message.textContent = `${String(error)}；可手工填写标题、简介和标签后保存。`;
    }
  }
  finally { analyzeButton.disabled = false; saveButton.disabled = false; }
}
analyzeButton.addEventListener('click', analyzeUrl);
form.elements.url.addEventListener('input', () => {
  clearTimeout(classificationTimer);
  classificationVersion++;
  const url = form.elements.url.value.trim();
  classificationTimer = setTimeout(() => showContentKind(url), 150);
  if (lastAnalyzedUrl && form.elements.url.value.trim() !== lastAnalyzedUrl) {
    form.elements.title.value = '';
    form.elements.summary.value = '';
    form.elements.tags.value = '';
    pendingBody = '';
    pendingSourceNote = '';
    pendingImages = [];
    pendingSourceIncomplete = false;
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
  const [result, tags, notes] = await Promise.all([
    invoke('list_items', { query: document.querySelector('#search').value }),
    invoke('list_desktop_tags'),
    invoke('list_all_reader_notes'),
  ]);
  if (version !== refreshVersion) return;
  libraryMessage.textContent = '';
  allItems = result;
  allNotes = notes;
  availableTags = tags.sort((a, b) => a.localeCompare(b));
  renderItems();
}
let allItems = [];
let allNotes = [];
let currentView = 'unread';
let selectedTags = [];
let currentItem = null;
document.querySelector('#clear-tag-filters').addEventListener('click', () => {
  selectedTags = [];
  renderItems();
});
function noteTime(value) {
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function renderItems() {
  document.querySelector('#clear-tag-filters').hidden = selectedTags.length === 0;
  document.querySelector('#count-unread').textContent = allItems.filter((item) => !item.archived).length;
  document.querySelector('#count-liked').textContent = allItems.filter((item) => item.liked && !item.archived).length;
  document.querySelector('#count-archive').textContent = allItems.filter((item) => item.archived).length;
  document.querySelector('#count-notes').textContent = allItems.filter((item) => item.note_count > 0 || item.content_type === 'note').length;
  const tagFilters = document.querySelector('#tag-filters');
  tagFilters.replaceChildren();
  for (const tag of availableTags) {
    const row = document.createElement('div');
    row.className = 'tag-row';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tag-filter';
    const name = document.createElement('span'); name.className = 'tag-name'; name.textContent = tag;
    const count = document.createElement('span'); count.className = 'tag-count'; count.textContent = `(${countTagItems(allItems, currentView, tag)})`;
    button.append(name, count);
    const selected = selectedTags.some((value) => value.toLowerCase() === tag.toLowerCase());
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', () => {
      selectedTags = toggleTag(selectedTags, tag);
      renderItems();
    });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'delete-tag-button'; remove.textContent = '×';
    remove.setAttribute('aria-label', `删除标签 ${tag}`);
    remove.title = `删除标签 ${tag}`;
    remove.addEventListener('click', async () => {
      if (!window.confirm(`删除标签“${tag}”？该标签会从所有收藏中移除，收藏本身会保留。`)) return;
      remove.disabled = true;
      try {
        await invoke('delete_desktop_tag', { name: tag });
        selectedTags = selectedTags.filter((value) => value.toLowerCase() !== tag.toLowerCase());
        await refresh();
      } catch (error) {
        libraryMessage.textContent = String(error);
        remove.disabled = false;
      }
    });
    row.append(button, remove);
    tagFilters.append(row);
  }
  const titles = { unread: '首页', liked: '喜欢', archive: '归档', notes: '笔记' };
  document.querySelector('#list-heading').textContent = titles[currentView];
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === currentView));
  const result = allItems.filter((item) => matchesLibraryView(item, currentView, selectedTags));
  items.replaceChildren();
  document.querySelector('#count').textContent = `${result.length} 条`;
  if (!result.length) items.textContent = currentView === 'notes' ? '还没有阅读笔记。' : '这里还没有收藏。';
  if (currentView === 'notes') {
    for (const item of result) {
      const group = document.createElement('section'); group.className = 'annotation-group';
      const heading = document.createElement('button'); heading.type = 'button'; heading.className = 'annotation-group-title'; heading.textContent = item.title;
      heading.addEventListener('click', () => openReader(item)); group.append(heading);
      for (const note of allNotes.filter((entry) => entry.item_id === item.id)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'annotation-list-entry';
        if (note.anchor_text) {
          const quote = document.createElement('span'); quote.className = 'annotation-list-quote'; quote.textContent = note.anchor_text; button.append(quote);
        }
        const date = document.createElement('small'); date.textContent = noteTime(note.created_at);
        if (note.body) { const text = document.createElement('span'); text.className = 'annotation-list-body'; text.textContent = note.body; button.append(text); }
        button.append(date); button.addEventListener('click', () => openReader(item, note)); group.append(button);
      }
      items.append(group);
    }
    return;
  }
  for (const item of result) {
    const row = document.createElement('div'); row.className = 'item';
    row.dataset.itemId = String(item.id);
    row.classList.toggle('selected', currentItem?.id === item.id);
    row.addEventListener('click', (event) => { if (!event.target.closest('button')) openReader(item); });
    const info = document.createElement('div');
    const title = document.createElement('button'); title.type = 'button'; title.className = 'item-title';
    title.title = item.title;
    title.addEventListener('click', () => openReader(item));
    const url = document.createElement('small'); url.className = 'item-source';
    const type = item.content_type === 'profile' ? 'repo' : item.content_type;
    const icons = { article: ['文章链接', 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6'], video: ['视频链接', 'M3 5h18v14H3z M10 9l5 3-5 3z'], repo: ['代码库', 'M5 3h13v18H5z M8 3v18 M11 8l-2 2 2 2 M14 8l2 2-2 2'], note: ['笔记文章', 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5'] };
    const [label, path] = icons[type] || icons.article;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', label); icon.classList.add('item-kind-icon');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', path); icon.append(shape);
    const titleText = document.createElement('span'); titleText.textContent = item.title; title.append(icon, titleText);
    const address = document.createElement('span'); address.textContent = item.url || '';
    url.append(address);
    const summary = document.createElement('p'); summary.textContent = item.summary;
    const footer = document.createElement('div'); footer.className = 'item-footer';
    const tags = document.createElement('div'); tags.className = 'item-tags';
    for (const name of item.tags.slice(0, 3)) {
      const tag = document.createElement('span'); tag.className = 'item-tag'; tag.textContent = name; tag.title = name; tags.append(tag);
    }
    if (item.tags.length > 3) {
      const more = document.createElement('span'); more.className = 'item-tags-more'; more.textContent = '…';
      more.title = item.tags.slice(3).join('、'); more.setAttribute('aria-label', `还有 ${item.tags.length - 3} 个标签：${more.title}`); tags.append(more);
    }
    const actions = document.createElement('div'); actions.className = 'item-actions';
    function actionButton(label, path, active = false) {
      const button = document.createElement('button'); button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
      if (active) button.classList.add('active');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', path); svg.append(shape); button.append(svg);
      return button;
    }
    const editTags = actionButton('编辑收藏', 'M4 20h4l11-11-4-4L4 16z M13 7l4 4');
    editTags.addEventListener('click', () => openTagEditor(item));
    const like = actionButton(item.liked ? '取消喜欢' : '喜欢', 'M20.5 8.8c0 4.2-8.5 10.1-8.5 10.1S3.5 13 3.5 8.8a4.5 4.5 0 0 1 8.5-2.1 4.5 4.5 0 0 1 8.5 2.1Z', item.liked);
    like.setAttribute('aria-pressed', String(item.liked));
    like.addEventListener('click', async () => { try { await invoke('set_item_state', { id: item.id, field: 'liked', value: !item.liked }); await refresh(); } catch (error) { libraryMessage.textContent = String(error); } });
    const archive = actionButton(item.archived ? '移回首页' : '归档', item.archived ? 'M4 5h16v4H4z M5.5 9v10h13V9 M9 15l3-3 3 3 M12 12v5' : 'M4 5h16v4H4z M5.5 9v10h13V9 M9 13h6');
    archive.addEventListener('click', async () => { try { await invoke('set_item_state', { id: item.id, field: 'archived', value: !item.archived }); await refresh(); } catch (error) { libraryMessage.textContent = String(error); } });
    const remove = actionButton('删除', 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5');
    remove.addEventListener('click', async () => {
      if (currentItem?.id === item.id && !mayLeaveReaderEditor()) return;
      if (!window.confirm(`删除“${item.title}”？`)) return;
      try {
        if (currentItem?.id === item.id && readerEditing) setReaderEditing(false);
        await invoke('delete_item', { id: item.id });
        if (currentItem?.id === item.id) await closeReader();
        try { localStorage.removeItem(positionKey(item)); } catch { /* 收藏删除已成功 */ }
        await refresh();
      } catch (error) { libraryMessage.textContent = String(error); }
    });
    actions.append(like, archive, editTags, remove);
    footer.append(tags, actions);
    info.append(title, url, summary, footer); row.append(info); items.append(row);
  }
}
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  currentView = button.dataset.view;
  renderItems();
}));
let searchTimer;
document.querySelector('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refresh().catch((error) => { libraryMessage.textContent = String(error); }), 180);
});
form.addEventListener('submit', async (event) => {
  event.preventDefault(); message.textContent = '';
  const data = new FormData(form);
  if (data.get('mode') === 'note') {
    try {
      await invoke('create_note_article', { note: { title: data.get('title'), summary: data.get('summary'), tags: parsedTags(data.get('tags')), body: data.get('body') } });
      form.reset(); setAddMode(); lastAnalyzedUrl = ''; pendingBody = ''; pendingSourceNote = ''; pendingImages = []; pendingSourceIncomplete = false; classificationVersion++; await refresh(); addDialog.close();
    } catch (error) { message.textContent = String(error); }
    return;
  }
  const item = { url: data.get('url'), title: data.get('title'), summary: data.get('summary'), tags: data.get('tags').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), body: pendingBody, source_note: pendingSourceNote, images: pendingImages, source_incomplete: pendingSourceIncomplete };
  try { await invoke('save_item', { item }); form.reset(); setAddMode(); lastAnalyzedUrl = ''; pendingBody = ''; pendingSourceNote = ''; pendingImages = []; pendingSourceIncomplete = false; classificationVersion++; await showContentKind(''); await refresh(); addDialog.close(); }
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
const editReaderButton = document.querySelector('#edit-reader-body');
const readerEditor = document.querySelector('#reader-editor');
const readerEditorInput = document.querySelector('#reader-editor-input');
const saveReaderEdit = document.querySelector('#save-reader-edit');
const cancelReaderEdit = document.querySelector('#cancel-reader-edit');
const readerNotesSection = document.querySelector('.notes-section');
const readingEstimate = document.querySelector('#reading-estimate');
const readerEmpty = document.querySelector('#reader-empty');
const retryReaderContent = document.querySelector('#retry-reader-content');
const refreshReaderContent = document.querySelector('#refresh-reader-content');
const readerTitle = document.querySelector('#reader-title');
const readerUrl = document.querySelector('#reader-url');
const annotationDialog = document.querySelector('#annotation-dialog');
const annotationForm = document.querySelector('#annotation-form');
const annotationMenu = document.querySelector('#annotation-context-menu');
const contextCopy = document.querySelector('#context-copy');
const contextAnnotate = document.querySelector('#context-annotate');
let selectedAnchor = null;
let editingAnnotation = null;
let contextRange = null;
const font = document.querySelector('#reader-font');
const size = document.querySelector('#reader-size');
const color = document.querySelector('#reader-color');
const theme = document.querySelector('#reader-theme');
let readerVersion = 0;
let layoutVersion = 0;
let readerReady = false;
let restoringPosition = false;
let positionTimer;
let currentReaderData = null;
let readerEditing = false;
let readerSaving = false;
function mayLeaveReaderEditor() {
  if (readerSaving) return false;
  return !readerEditing || readerEditorInput.value === currentReaderData?.body || window.confirm('正文有未保存的修改，确定放弃吗？');
}
function setReaderEditing(editing) {
  readerEditing = editing;
  readerEditor.hidden = !editing;
  readerBody.hidden = editing;
  readerNotesSection.hidden = editing;
  readerEmpty.hidden = editing || !!currentReaderData?.body.trim();
  editReaderButton.hidden = editing;
  refreshReaderContent.hidden = editing || !currentItem?.url;
  readingEstimate.hidden = editing;
}
async function leaveReaderEditor() {
  setReaderEditing(false);
  if (currentItem && currentReaderData) await showReaderContent(currentReaderData, currentItem, readerVersion);
}
editReaderButton.addEventListener('click', () => {
  if (!currentItem || !currentReaderData || readerEditing) return;
  clearTimeout(positionTimer); saveReaderPosition();
  readerReady = false;
  closeAnnotationMenu();
  readerEditorInput.value = currentReaderData.body;
  document.querySelector('#reader-edit-message').textContent = '';
  readerStatus.textContent = '';
  setReaderEditing(true);
  readerEditorInput.focus();
});
cancelReaderEdit.addEventListener('click', async () => {
  if (mayLeaveReaderEditor()) await leaveReaderEditor();
});
readerEditor.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentItem || !currentReaderData || readerSaving) return;
  const item = currentItem; const version = readerVersion; const body = readerEditorInput.value;
  document.querySelector('#reader-edit-message').textContent = '';
  readerSaving = true; saveReaderEdit.disabled = true; cancelReaderEdit.disabled = true;
  try {
    const result = await invoke('update_reader_body', { id: item.id, expectedBody: currentReaderData.body, body });
    if (version !== readerVersion) return;
    currentReaderData = result;
    setReaderEditing(false);
    await showReaderContent(result, item, version);
    await refresh().catch((error) => { libraryMessage.textContent = String(error); });
    if (version === readerVersion) readerStatus.textContent = '正文已保存。';
  } catch (error) { if (version === readerVersion) (readerEditing ? document.querySelector('#reader-edit-message') : readerStatus).textContent = String(error); }
  finally { readerSaving = false; saveReaderEdit.disabled = false; cancelReaderEdit.disabled = false; }
});
window.addEventListener('beforeunload', (event) => {
  if (readerEditing && readerEditorInput.value !== currentReaderData?.body) { event.preventDefault(); event.returnValue = ''; }
});
let readingBlocks = [];
let estimateFrame = 0;
function updateReadingEstimate() {
  estimateFrame = 0;
  if (!currentItem || !readingBlocks.length) { readingEstimate.hidden = true; return; }
  const rectangles = [...readerBody.children].map((element) => element.getBoundingClientRect());
  const viewportTop = reader.getBoundingClientRect().top + document.querySelector('.reader-actions').offsetHeight;
  const { totalChars, remainingMinutes } = estimateReadingProgress(readingBlocks, rectangles, viewportTop);
  readingEstimate.hidden = !totalChars;
  readingEstimate.textContent = `共 ${totalChars.toLocaleString()} 字 · ${remainingMinutes <= 0 ? '已读完' : `剩余约 ${Math.max(1, Math.ceil(remainingMinutes))} 分钟`}`;
  readingEstimate.title = '估算速度：中文约每分钟 400 字，其他文字约每分钟 200 词';
}
function scheduleReadingEstimate() {
  if (!estimateFrame) estimateFrame = requestAnimationFrame(updateReadingEstimate);
}
function positionKey(item) {
  return `reader-position:${item.id}:${item.url}`;
}
function capturePosition() {
  const rectangles = [...readerBody.children].map((paragraph) => paragraph.getBoundingClientRect());
  return captureReadingPosition(rectangles, reader.getBoundingClientRect().top + document.querySelector('.reader-actions').offsetHeight, reader.scrollTop);
}
function saveReaderPosition() {
  if (!currentItem || !readerReady || restoringPosition) return;
  try { localStorage.setItem(positionKey(currentItem), JSON.stringify(capturePosition())); } catch { /* 阅读不应因本地设置存储失败而中断 */ }
}
function restorePosition(position) {
  const rectangles = [...readerBody.children].map((paragraph) => paragraph.getBoundingClientRect());
  const next = readingScrollTop(position, rectangles, reader.getBoundingClientRect().top + document.querySelector('.reader-actions').offsetHeight, reader.scrollTop);
  if (next !== null) reader.scrollTop = next;
}
function loadReaderPosition(item) {
  try { return JSON.parse(localStorage.getItem(positionKey(item)) || 'null'); } catch { return null; }
}
reader.addEventListener('scroll', () => {
  scheduleReadingEstimate();
  if (!readerReady || restoringPosition) return;
  clearTimeout(positionTimer);
  positionTimer = setTimeout(saveReaderPosition, 200);
}, { passive: true });
window.addEventListener('resize', scheduleReadingEstimate);
function closeAnnotationMenu() { annotationMenu.hidden = true; }
readerBody.addEventListener('contextmenu', (event) => {
  const selection = window.getSelection();
  const image = event.target instanceof HTMLImageElement ? event.target : null;
  const anchor = image ? imageAnchor(readerBody, image) : selectionAnchor(readerBody, selection);
  if (!anchor) { closeAnnotationMenu(); return; }
  event.preventDefault();
  selectedAnchor = anchor;
  contextRange = !image && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  readerBody.querySelectorAll('.annotation-selected-image').forEach((node) => node.classList.remove('annotation-selected-image'));
  if (image) image.classList.add('annotation-selected-image');
  contextCopy.hidden = !!image;
  annotationMenu.hidden = false;
  const rect = contextRange?.getBoundingClientRect();
  const x = event.clientX || rect?.left || 0; const y = event.clientY || rect?.bottom || 0;
  annotationMenu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - annotationMenu.offsetWidth - 8))}px`;
  annotationMenu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - annotationMenu.offsetHeight - 8))}px`;
});
annotationMenu.addEventListener('mousedown', (event) => event.preventDefault());
contextAnnotate.addEventListener('click', () => { closeAnnotationMenu(); if (selectedAnchor && currentItem) openAnnotationEditor(); });
contextCopy.addEventListener('click', async () => {
  closeAnnotationMenu();
  try {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(selectedAnchor.text); copied = true; } catch { /* WebView 可能禁用 Clipboard API */ }
    }
    if (!copied) {
      if (contextRange) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(contextRange); }
      if (!document.execCommand('copy')) throw new Error('复制失败');
    }
  } catch { readerStatus.textContent = '复制失败，请使用 Ctrl+C 重试。'; }
});
document.addEventListener('pointerdown', (event) => { if (!annotationMenu.contains(event.target)) closeAnnotationMenu(); });
reader.addEventListener('scroll', closeAnnotationMenu, { passive: true });
document.addEventListener('keydown', (event) => {
  if (!annotationMenu.hidden && event.key === 'Escape') { event.preventDefault(); closeAnnotationMenu(); }
});
function openAnnotationEditor(note = null) {
  editingAnnotation = note;
  document.querySelector('#annotation-heading').textContent = note ? '编辑笔记' : '添加批注';
  document.querySelector('#annotation-quote').textContent = note ? (note.anchor_text || '普通阅读笔记') : selectedAnchor.text;
  document.querySelector('#annotation-input').value = note?.body || '';
  document.querySelector('#annotation-input').required = !!note && note.start_offset === null;
  document.querySelector('#annotation-message').textContent = '';
  annotationDialog.showModal();
}
document.querySelector('#close-annotation').addEventListener('click', () => annotationDialog.close());
annotationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentItem) return;
  const itemId = currentItem.id;
  const body = document.querySelector('#annotation-input').value;
  const submit = annotationForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    if (editingAnnotation) await invoke('edit_reader_note', { id: editingAnnotation.id, itemId, body });
    else await invoke('add_annotation', { itemId, body, anchor: selectedAnchor });
    annotationDialog.close();
    selectedAnchor = null;
    readerBody.querySelectorAll('.annotation-selected-image').forEach((image) => image.classList.remove('annotation-selected-image'));
    await refreshNotes(itemId); await refresh();
  } catch (error) { document.querySelector('#annotation-message').textContent = String(error); }
  finally { submit.disabled = false; }
});
function jumpToAnnotation(note) {
  if (note.start_offset === null || note.start_offset === undefined) {
    document.querySelector('#notes').scrollIntoView({ block: 'start' });
    return;
  }
  const target = findAnnotation(readerBody, note);
  if (!target) { readerStatus.textContent = '原文内容已变化，无法准确定位这条批注；批注内容仍然保留。'; return; }
  readerBody.querySelectorAll('.annotation-selected-image').forEach((image) => image.classList.remove('annotation-selected-image'));
  if (target.element) {
    target.element.classList.add('annotation-selected-image'); target.element.scrollIntoView({ block: 'center' });
  } else {
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(target.range);
    const rect = target.range.getBoundingClientRect();
    reader.scrollTop += rect.top - reader.getBoundingClientRect().top - reader.clientHeight / 3;
  }
}
window.addEventListener('pagehide', saveReaderPosition);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { clearTimeout(positionTimer); saveReaderPosition(); }
});
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
  scheduleReadingEstimate();
}
[font, size, color, theme].forEach((control) => control.addEventListener('input', applyReaderSettings));
applyReaderSettings();
async function openReader(item, annotation = null) {
  if (!mayLeaveReaderEditor()) return;
  if (readerEditing) setReaderEditing(false);
  clearTimeout(positionTimer);
  saveReaderPosition();
  readerReady = false;
  restoringPosition = false;
  const version = ++readerVersion;
  currentItem = item;
  currentReaderData = null;
  editReaderButton.disabled = true;
  readingBlocks = [];
  readingEstimate.hidden = true;
  selectedAnchor = null;
  closeAnnotationMenu();
  if (window.CSS?.highlights) CSS.highlights.delete('reader-annotations');
  readerPlaceholder.hidden = true;
  readerContent.hidden = false;
  document.body.classList.add('reading-active');
  document.querySelectorAll('.item').forEach((row) => row.classList.toggle('selected', row.dataset.itemId === String(item.id)));
  readerTitle.textContent = item.title;
  readerUrl.textContent = item.url;
  document.querySelector('#reader-url-container').hidden = !item.url;
  if (item.url) readerUrl.href = item.url;
  else readerUrl.removeAttribute('href');
  document.querySelector('#open-video').hidden = item.content_type !== 'video' || !item.url;
  refreshReaderContent.hidden = !item.url;
  document.querySelector('#reader-empty p').textContent = !item.url ? '暂无正文，可通过“编辑收藏”填写文章内容。' : item.content_type === 'video' ? '暂无保存的视频简介，可尝试重新获取或打开原视频。' : item.content_type === 'repo' ? '暂无保存的项目内容，可尝试重新获取或打开原网页。' : '暂无保存的正文，请通过标题下的链接访问原网页。';
  retryReaderContent.hidden = !item.url;
  readerBody.textContent = '正在读取正文……';
  readerEmpty.hidden = true;
  retryReaderContent.disabled = false;
  refreshReaderContent.disabled = false;
  readerStatus.textContent = '';
  document.querySelector('#notes').replaceChildren();
  document.querySelector('#note-message').textContent = '';
  refreshNotes(item.id).catch((error) => { document.querySelector('#note-message').textContent = String(error); });
  reader.scrollTop = 0;
  try {
    const result = await invoke('get_reader_item', { id: item.id });
    if (version !== readerVersion) return;
    await showReaderContent(result, item, version, annotation);
  } catch (error) {
    if (version === readerVersion) readerBody.textContent = String(error);
  }
}
async function showReaderContent(result, item, version, annotation = null) {
  currentReaderData = result;
  editReaderButton.disabled = true;
  readerReady = false;
  restoringPosition = false;
  readingBlocks = [];
  readingEstimate.hidden = true;
  readerStatus.textContent = result.source_note || '';
  readerBody.replaceChildren();
  if (!result.body.trim() && item.content_type === 'video' && result.summary.trim()) {
    const paragraph = document.createElement('p'); paragraph.textContent = result.summary;
    readerBody.append(paragraph);
    readerStatus.textContent = result.source_note || '未获取到视频原始简介，显示保存的摘要。';
    readerEmpty.hidden = true;
  } else {
    readerEmpty.hidden = !!result.body.trim();
    if (!result.body.trim()) { editReaderButton.disabled = false; if (annotation) jumpToAnnotation(annotation); return; }
    const html = await invoke('render_markdown', { body: result.body, images: result.images || [] });
    if (version !== readerVersion) return;
    // HTML 由 Rust 的 Markdown 渲染器和白名单清理器共同生成。
    readerBody.innerHTML = html;
    await waitForReaderImages(readerBody.querySelectorAll('img'));
    if (version !== readerVersion) return;
  }
  readingBlocks = [...readerBody.children].map((element) => measureReadingText(element.textContent || ''));
  scheduleReadingEstimate();
  refreshNotes(item.id).catch((error) => { document.querySelector('#note-message').textContent = String(error); });
  const savedPosition = loadReaderPosition(item);
  requestAnimationFrame(() => {
    if (version !== readerVersion) return;
    restoringPosition = true;
    restorePosition(savedPosition);
    requestAnimationFrame(() => {
      if (version !== readerVersion) return;
      restoringPosition = false;
      readerReady = true;
      editReaderButton.disabled = false;
      if (annotation) jumpToAnnotation(annotation);
    });
  });
}
async function retrieveReaderContent(force) {
  if (!currentItem || readerEditing) return;
  if (force && !window.confirm('重新获取会替换当前保存的正文和图片。继续吗？')) return;
  const item = currentItem;
  const version = readerVersion;
  retryReaderContent.disabled = true;
  refreshReaderContent.disabled = true;
  editReaderButton.disabled = true;
  readerStatus.textContent = '正在重新获取正文……';
  try {
    const result = await invoke('fetch_reader_content', { id: item.id, force });
    if (version === readerVersion) await showReaderContent(result, item, version);
  } catch (error) {
    if (version === readerVersion) { readerStatus.textContent = `无法获取正文：${String(error)}`; editReaderButton.disabled = !currentReaderData; }
  } finally {
    if (version === readerVersion) { retryReaderContent.disabled = false; refreshReaderContent.disabled = false; }
  }
}
retryReaderContent.addEventListener('click', () => retrieveReaderContent(false));
refreshReaderContent.addEventListener('click', () => retrieveReaderContent(true));
readerBody.addEventListener('click', async (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  event.preventDefault();
  try { await invoke('open_original', { url: link.href }); }
  catch (error) { readerStatus.textContent = String(error); }
});
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
  if (!mayLeaveReaderEditor()) return;
  if (readerEditing) setReaderEditing(false);
  clearTimeout(positionTimer);
  saveReaderPosition();
  if (document.body.classList.contains('reader-fullscreen')) setReaderFullscreen(false);
  readerVersion++;
  readerReady = false;
  restoringPosition = false;
  currentItem = null;
  currentReaderData = null;
  readingBlocks = [];
  readingEstimate.hidden = true;
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
  readerBody.querySelectorAll('.annotated-image').forEach((image) => image.classList.remove('annotated-image'));
  const ranges = [];
  for (const note of notes) {
    const target = findAnnotation(readerBody, note);
    if (target?.range) ranges.push(target.range);
    if (target?.element) target.element.classList.add('annotated-image');
  }
  if (window.CSS?.highlights && window.Highlight) CSS.highlights.set('reader-annotations', new Highlight(...ranges));
  for (const note of notes) {
    const row = document.createElement('div'); row.className = 'note';
    if (note.anchor_text) {
      const quote = document.createElement('button'); quote.type = 'button'; quote.className = 'note-quote'; quote.textContent = note.anchor_text;
      quote.title = '定位原文'; quote.addEventListener('click', () => jumpToAnnotation(note)); row.append(quote);
    }
    if (note.body) { const text = document.createElement('p'); text.textContent = note.body; row.append(text); }
    const date = document.createElement('small'); date.textContent = note.updated_at ? `${noteTime(note.created_at)} · 修改于 ${noteTime(note.updated_at)}` : noteTime(note.created_at);
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'text-button'; edit.textContent = '编辑'; edit.addEventListener('click', () => openAnnotationEditor(note));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = '删除笔记';
    remove.addEventListener('click', async () => {
      if (!window.confirm('删除这条笔记？')) return;
      try { await invoke('delete_reader_note', { id: note.id, itemId }); await refreshNotes(itemId); await refresh(); }
      catch (error) { document.querySelector('#note-message').textContent = String(error); }
    });
    row.append(date, edit, remove); container.append(row);
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
    await refresh();
  } catch (error) { document.querySelector('#note-message').textContent = String(error); }
});
readerUrl.addEventListener('click', async (event) => {
  event.preventDefault();
  try { await invoke('open_original', { url: currentItem.url }); }
  catch (error) { readerStatus.textContent = String(error); }
});
document.querySelector('#open-video').addEventListener('click', async () => {
  try { await invoke('open_original', { url: currentItem.url }); }
  catch (error) { readerStatus.textContent = String(error); }
});
