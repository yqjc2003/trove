'use client';

import { useState, useTransition } from 'react';

import { createApiKeyAction, revokeApiKeyAction } from '@/app/actions/settings';
import { formatDateTime } from '@/lib/format';
import type { ApiKey } from '@/types';

/**
 * API Key 管理。
 * 明文只在创建成功的那一次响应里显示，服务端只保存哈希。
 */
export function ApiKeyManager({
  keys,
  siteUrl,
}: {
  keys: ApiKey[];
  siteUrl: string;
}) {
  const [name, setName] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="用途名称，例如「定时采集」"
          disabled={pending}
        />
        <button type="submit" className="btn" disabled={pending || !name.trim()}>
          生成 API Key
        </button>
      </form>

      {error ? (
        <p className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>
          {error}
        </p>
      ) : null}

      {plaintext ? (
        <div style={{ marginTop: 16 }}>
          <p className="small muted">
            明文只显示这一次，请立刻保存：
          </p>
          <code className="key-reveal">{plaintext}</code>
          <p className="small faint" style={{ marginTop: 8 }}>
            放到 Skill 的环境变量里：
            <br />
            <code className="mono">TROVE_API_BASE={siteUrl}/api/trove</code>
            <br />
            <code className="mono">TROVE_API_KEY={plaintext}</code>
          </p>
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

      {keys.length > 0 ? (
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
                <td className="mono">{k.prefix}…</td>
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
                      className="btn-quiet"
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
      ) : null}
    </div>
  );
}
