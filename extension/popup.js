const status = document.getElementById('status');
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage();
document.getElementById('capture').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { await chrome.tabs.sendMessage(tab.id, { type: 'open' }); window.close(); }
  catch { status.textContent = '此页面不支持扩展，请打开普通网页后重试。'; }
};
chrome.runtime.sendMessage({ type: 'check' }).then((result) => {
  if (result.ok) status.textContent = '已连接，可以收录当前页面。';
  else { status.textContent = result.error; if (result.auth) chrome.runtime.openOptionsPage(); }
}).catch(() => { status.textContent = '连接失败，请检查设置。'; });
