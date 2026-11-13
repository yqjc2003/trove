'use client';

import { useState, useTransition } from 'react';

import { createApiKeyAction, revokeApiKeyAction } from '@/app/actions/settings';
import { formatDateTime } from '@/lib/format';
import { buildAgentInstallPrompt } from '@/lib/agent-install-prompt';
import type { ApiKey } from '@/types';

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
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function installationPrompt(key: string): string {
    return buildAgentInstallPrompt({ apiBase, apiKey: key });
  }

  async function copyInstallationPrompt(key: string) {
    try {
      await navigator.clipboard.writeText(installationPrompt(key));
      setNotice('安装提示语已复制。现在把它发给你信任的 Agent。');
    } catch {
      setNotice('自动复制失败；请从下方显示的 Key 和配置手动复制。');
    }
  }

  function create() {
    startTransition(async () => {
      const res = await createApiKeyAction(name);
      if (!res.ok || !res.plaintext) {
        setError(res.error ?? '创建失败');
        setPlaintext(null);
        return;
      }
      setPlaintext(res.plaintext);
      setName('');
      setError(null);
      setNotice(null);
    });
  }

  function createAndCopyInstallationPrompt() {
    startTransition(async () => {
      const res = await createApiKeyAction('Agent 安装连接');
      if (!res.ok || !res.plaintext) {
        setError(res.error ?? '生成安装连接 Key 失败');
        return;
      }
      setPlaintext(res.plaintext);
      setError(null);
      await copyInstallationPrompt(res.plaintext);
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

      {notice ? (
        <p className="small muted" style={{ marginTop: 8 }} role="status">
          {notice}
        </p>
      ) : null}

      {plaintext ? (
        <div style={{ marginTop: 16 }}>
          <p className="small muted">
            明文只显示这一次，请立刻保存：
          </p>
          <code className="key-reveal" translate="no">
            {plaintext}
          </code>
          <p className="small faint" style={{ marginTop: 8 }}>
            先在项目根目录运行 <code className="mono" translate="no">pnpm skill:install</code>，它会安装到{' '}
            <code className="mono" translate="no">~/.agents/skills/catch-and-linger/</code>。然后把下面两行写入{' '}
            <code className="mono" translate="no">~/.config/catchlinger/env</code>：
            <br />
            <code className="mono" translate="no">
              CATCHLINGER_API_BASE={apiBase}
            </code>
            <br />
            <code className="mono" translate="no">
              CATCHLINGER_API_KEY={plaintext}
            </code>
          </p>
          <p className="small faint" style={{ marginTop: 8 }}>
            重开一个 Codex 会话后，即可说：<code className="mono">用 $catch-and-linger 收下一个链接</code>。
          </p>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => copyInstallationPrompt(plaintext)}
          >
            复制安装提示语
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setPlaintext(null)}
          >
            我已保存
          </button>
        </div>
      ) : null}

      {keys.length > 0 && !plaintext ? (
        <div className="form-row" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={createAndCopyInstallationPrompt}
          >
            {pending ? '生成中…' : '一键复制 Agent 安装提示'}
          </button>
          <p className="small faint">会新建一枚专用于安装连接的 API Key；已有 Key 的明文无法再次读取。</p>
        </div>
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
    </div>
  );
}
