'use client';

import { useState } from 'react';

/**
 * 新建连接 Key 后唯一展示明文安装指令的位置。
 * 关闭后指令（以及其中的 Key）即从页面状态中移除。
 */
export function AgentInstallDialog({
  apiKey,
  instruction,
  onClose,
}: {
  apiKey: string;
  instruction: string;
  onClose: () => void;
}) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopyNotice('API Key 已复制，可以粘贴到浏览器扩展。');
    } catch {
      setCopyNotice('复制失败，请手动选中下方 API Key 复制。');
    }
  }

  async function copyInstruction() {
    try {
      await navigator.clipboard.writeText(instruction);
      setCopyNotice('已复制。现在把这段话发给你信任的 Agent。');
    } catch {
      setCopyNotice('复制失败，请手动选中下方文字复制。');
    }
  }

  return (
    <div className="agent-install-backdrop" role="presentation">
      <section
        className="agent-install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-install-dialog-title"
      >
        <p className="agent-setup-kicker">连接 Key 已生成</p>
        <h2 id="agent-install-dialog-title">连接浏览器扩展或 Agent</h2>
        <p className="agent-install-dialog-intro">
          Key 只显示到你关闭此窗口为止。请将它粘贴到浏览器扩展，或使用下方指令连接你信任的 Agent。
        </p>
        <label htmlFor="created-api-key">API Key</label>
        <input id="created-api-key" className="input" readOnly value={apiKey} onFocus={(event) => event.currentTarget.select()} />
        <div className="desk-actions">
          <button type="button" className="btn btn-primary" onClick={copyKey}>复制 API Key</button>
        </div>
        <p className="small muted">Agent 安装指令</p>
        <textarea
          className="agent-setup-instruction"
          aria-label="发给 Agent 的 CatchLinger 安装与连接指令"
          readOnly
          value={instruction}
          rows={13}
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="desk-actions">
          <button type="button" className="btn btn-primary" onClick={copyInstruction}>
            复制给 Agent
          </button>
          <button type="button" className="btn" onClick={onClose}>
            我已保存
          </button>
          {copyNotice ? <p className="small muted" role="status">{copyNotice}</p> : null}
        </div>
      </section>
    </div>
  );
}
