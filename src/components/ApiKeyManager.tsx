'use client';

import { useState, useTransition } from 'react';

import { createApiKeyAction, revokeApiKeyAction } from '@/app/actions/settings';
import { formatDateTime } from '@/lib/format';
import { buildAgentInstallPrompt } from '@/lib/agent-install-prompt';
import type { ApiKey } from '@/types';
import { AgentInstallDialog } from './AgentInstallDialog';

/**
 * API Key 管理。
 * 明文只在创建成功的那一次响应里显示，服务端只保存哈希。
 */
export function ApiKeyManager({
  keys,
  apiBase,
}: {
  keys: ApiKey[];
  apiBase: string;
}) {
  const [name, setName] = useState('');
  const [instruction, setInstruction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const res = await createApiKeyAction(name);
      if (!res.ok || !res.plaintext) {
        setError(res.error ?? '创建失败');
        return;
      }
      setInstruction(buildAgentInstallPrompt({ apiBase, apiKey: res.plaintext }));
      setName('');
      setError(null);
    });
  }

  function revoke(id: string) {
    if (!window.confirm('吊销这个 API Key？使用它的 Skill / MCP 会立刻失效。')) return;
    startTransition(async () => {
      const res = await revokeApiKeyAction(id);
      if (!res.ok) setError(res.error ?? '吊销失败');
    });
  }

  return (
    <div>
      <form
        className="form-row"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label className="sr-only" htmlFor="api-key-name">
          Key 的用途名称
        </label>
        <input
          id="api-key-name"
          className="input"
          name="api_key_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：定时采集…"
          disabled={pending}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn" disabled={pending || !name.trim()}>
          生成 API Key
        </button>
      </form>

      {error ? (
        <p className="small danger" style={{ marginTop: 8 }} role="alert">
          {error}
        </p>
      ) : null}

      {keys.length > 0 ? (
        <div className="table-scroll">
        <table className="table-simple" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th>名称</th>
              <th>前缀</th>
              <th>创建于</th>
              <th>最后使用</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="mono" translate="no">
                  {k.prefix}…
                </td>
                <td className="small faint">{formatDateTime(k.created_at)}</td>
                <td className="small faint">
                  {k.last_used_at ? formatDateTime(k.last_used_at) : '—'}
                </td>
                <td>
                  {k.revoked_at ? (
                    <span className="faint small">已吊销</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-quiet btn-danger"
                      disabled={pending}
                      onClick={() => revoke(k.id)}
                    >
                      吊销
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}

      {instruction ? (
        <AgentInstallDialog instruction={instruction} onClose={() => setInstruction(null)} />
      ) : null}
    </div>
  );
}
