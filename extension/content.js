(() => {
  if (document.getElementById('catchlinger-extension-root')) return;
  const host = document.createElement('div'); host.id = 'catchlinger-extension-root';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>:host{all:initial}*{box-sizing:border-box}button,input,textarea{font:14px system-ui}button{cursor:pointer}.bubble{position:fixed;z-index:2147483647;right:0;top:45%;width:42px;height:42px;border:0;border-radius:21px 0 0 21px;background:#26392f;color:#fff;font-size:19px;touch-action:none}.panel{position:fixed;z-index:2147483647;right:16px;top:15%;width:min(360px,calc(100vw - 32px));max-height:80vh;overflow:auto;background:#fafaf8;color:#222;border:1px solid #aaa;border-radius:8px;padding:18px;font:14px/1.5 system-ui}.panel[hidden]{display:none}h2{font-size:18px;margin:0 0 12px}label{display:block;margin:12px 0;font-weight:600}input,textarea{display:block;width:100%;margin-top:5px;padding:8px;border:1px solid #bbb;border-radius:4px;background:white;color:#222}textarea{min-height:90px;resize:vertical}.actions{display:flex;gap:8px} .actions button{border:0;background:#26392f;color:white;padding:8px 16px;border-radius:4px}.actions .close{background:#eee;color:#222}.status{color:#666;min-height:20px;white-space:pre-wrap}</style><button class="bubble" title="拖动调整位置，点击收录">藏</button><section class="panel" hidden><h2>收录到拾藏</h2><label>标题<input class="title" maxlength="300"></label><label>简述<textarea class="summary" maxlength="1000"></textarea></label><label>标签（逗号分隔，最多 3 个）<input class="tags"></label><p class="status" role="status"></p><div class="actions"><button class="save">保存</button><button class="close">关闭</button></div></section>`;
  const bubble = root.querySelector('.bubble'), panel = root.querySelector('.panel'), status = root.querySelector('.status');
  const title = root.querySelector('.title'), summary = root.querySelector('.summary'), tags = root.querySelector('.tags'), save = root.querySelector('.save');
  let moved = false, startY = 0;
  bubble.addEventListener('pointerdown', (event) => { startY = event.clientY; moved = false; bubble.setPointerCapture(event.pointerId); });
  bubble.addEventListener('pointermove', (event) => { if (!bubble.hasPointerCapture(event.pointerId)) return; if (Math.abs(event.clientY - startY) > 4) moved = true; if (moved) bubble.style.top = `${Math.max(0, Math.min(innerHeight - 42, event.clientY - 21))}px`; });
  bubble.addEventListener('click', () => { if (!moved) open(); });
  root.querySelector('.close').onclick = () => { panel.hidden = true; };
  async function open() {
    panel.hidden = false; title.value = (document.title || location.hostname).slice(0, 300); summary.value = ''; tags.value = ''; status.textContent = '正在解读页面…'; save.disabled = true;
    const text = (document.querySelector('article') || document.querySelector('main') || document.body)?.innerText || '';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'analyze', title: title.value, text: text.slice(0, 12000) });
      if (!result.ok) status.textContent = result.error;
      else if (result.manual) status.textContent = '未配置 AI，可手工填写后保存。';
      else { summary.value = result.summary.slice(0, 1000); tags.value = result.tags.join(', '); status.textContent = '解读完成，请检查或修改后保存。'; }
    } catch { status.textContent = '解读失败，请手工填写或检查扩展设置。'; }
    save.disabled = false;
  }
  save.onclick = async () => {
    const list = tags.value.split(/[,，]/).map((v) => v.trim()).filter(Boolean);
    if (!title.value.trim() || list.length > 3) { status.textContent = '请填写标题，标签最多 3 个。'; return; }
    save.disabled = true; status.textContent = '正在保存…';
    try { const result = await chrome.runtime.sendMessage({ type: 'save', title: title.value.trim(), summary: summary.value.trim(), tags: list }); status.textContent = result.ok ? '已保存到拾藏。' : result.error; }
    catch { status.textContent = '保存失败，请重试。'; }
    save.disabled = false;
  };
  chrome.runtime.onMessage.addListener((message) => { if (message.type === 'open') open(); });
})();

