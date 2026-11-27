const form = document.getElementById('settings');
const input = document.getElementById('token');
const status = document.getElementById('status');
chrome.storage.local.get('mcpToken').then((data) => { if (data.mcpToken) input.value = data.mcpToken; });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = input.value.trim();
  try {
    const result = await chrome.runtime.sendMessage({ type: 'validate', key });
    if (!result.ok) throw Error(result.error);
    await chrome.storage.local.set({ mcpToken: key });
    status.textContent = '已连接本地客户端。';
  } catch (error) { status.textContent = error.message || '设置保存失败。'; }
});
