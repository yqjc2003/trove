'use client';

import { useState, useTransition } from 'react';

import { createApiKeyAction } from '@/app/actions/settings';

type SetupState =
  | { kind: 'idle' }
  | { kind: 'ready'; instruction: string }
  | { kind: 'error'; message: string };

/**
 * 空藏库的首次连接引导。
 * API Key 仅在用户主动创建后才传到浏览器，并只用于生成可复制的 Agent 指令。
 */
export function AgentSetupGuide({ apiBase }: { apiBase: string }) {
  const [state, setState] = useState<SetupState>({ kind: 'idle' });
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function createConnectionKey() {
    startTransition(async () => {
      const result = await createApiKeyAction('首次连接的 Agent');
      if (!result.ok || !result.plaintext) {
        setState({ kind: 'error', message: result.error ?? '生成连接 Key 失败' });
        return;
      }

      setState({
        kind: 'ready',
        instruction: `请帮我安装并连接 CatchLinger 收藏 Skill。

1. 如果当前环境没有 CatchLinger 项目仓库，先获取 https://github.com/yqjc2003/trove.git；然后在仓库根目录运行：pnpm skill:install
   它会把新版 Skill 安装到 ~/.agents/skills/catchlinger-capture/，并移除已弃用的 trove-capture。
2. 创建或更新 ~/.config/catchlinger/env，写入：
   CATCHLINGER_API_BASE=${apiBase}
   CATCHLINGER_API_KEY=${result.plaintext}
3. 重开一个 Codex 会话后，确认 catchlinger-capture 已可用；再用它收下一个链接。

这把 Key 只属于我的 CatchLinger 藏库。请不要提交、记录到仓库，或分享给其他人。`,
      });
      setCopyNotice(null);
    });
  }

  async function copyInstruction() {
    if (state.kind !== 'ready') return;
    try {
      await navigator.clipboard.writeText(state.instruction);
      setCopyNotice('已复制。现在把这段话发给你的 Agent。');
    } catch {
      setCopyNotice('复制失败，请手动选中下方文字复制。');
    }
  }

  return (
    <section className="agent-setup" aria-labelledby="agent-setup-title">
      <p className="agent-setup-kicker">第一次连接</p>
      <h2 id="agent-setup-title">让 Agent 替你收下第一条。</h2>
      <p className="agent-setup-intro">
        生成一次性连接 Key，再把安装指令交给你信任的 Agent。它会被关联到你的藏库，不能访问其他人的内容。
      </p>

      {state.kind === 'idle' ? (
        <div className="agent-setup-action">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={createConnectionKey}>
            {pending ? '生成中…' : '生成连接 Key'}
          </button>
          <p className="small faint">Key 仅显示一次；生成后复制给 Agent 完成安装。</p>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <p className="callout callout-error small" role="alert">{state.message}</p>
      ) : null}

      {state.kind === 'ready' ? (
        <div className="agent-setup-ready">
          <p className="small muted">这段文字含有你的连接 Key，只发送给你信任的 Agent。</p>
          <textarea
            className="agent-setup-instruction"
            aria-label="发给 Agent 的 CatchLinger 安装与连接指令"
            readOnly
            value={state.instruction}
            rows={13}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="desk-actions">
            <button type="button" className="btn btn-primary" onClick={copyInstruction}>
              复制给 Agent
            </button>
            {copyNotice ? <p className="small muted" role="status">{copyNotice}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
