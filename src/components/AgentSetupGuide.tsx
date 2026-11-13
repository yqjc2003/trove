'use client';

import { useState, useTransition } from 'react';

import { createApiKeyAction } from '@/app/actions/settings';
import { buildAgentInstallPrompt } from '@/lib/agent-install-prompt';
import { AgentInstallDialog } from './AgentInstallDialog';

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
        instruction: buildAgentInstallPrompt({ apiBase, apiKey: result.plaintext }),
      });
    });
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
        <AgentInstallDialog
          instruction={state.instruction}
          onClose={() => setState({ kind: 'idle' })}
        />
      ) : null}
    </section>
  );
}
