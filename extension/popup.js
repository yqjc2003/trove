const status = document.getElementById('status');
const capture = document.getElementById('capture');
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage();
capture.onclick = async () => {
  capture.disabled = true; status.textContent = '正在交给客户端收录…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.runtime.sendMessage({ type: 'capture', url: tab?.url });
    if (!result.ok) throw Error(result.error);
    status.textContent = result.data.status === 'exists' ? '链接已收录，保留原有内容。' : result.data.warning || '已保存到本地客户端。';
  } catch (error) { status.textContent = error.message || '收录失败。'; }
  finally { capture.disabled = false; }
};
chrome.runtime.sendMessage({ type: 'check' }).then((result) => { status.textContent = result.ok ? '已连接本地客户端。' : result.error; }).catch(() => { status.textContent = '连接失败，请检查设置。'; });
