'use client';

import { useState, useTransition } from 'react';

import { createTagAction, deleteTagAction, renameTagAction } from '@/app/actions/tags';
import type { Tag } from '@/types';

/**
 * 标签管理（DIY）：新建 / 改名 / 删除。
 * 每个用户拥有完全独立的标签空间，这里只操作当前用户的标签。
 */
export function TagManager({ tags }: { tags: Tag[] }) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await createTagAction(name);
      if (!res.ok) {
        setError(res.error ?? '创建失败');
        setNotice(null);
        return;
      }
      setName('');
      setError(null);
      setNotice(null);
    });
  }

  function rename(id: string) {
    startTransition(async () => {
      const res = await renameTagAction(id, editingName);
      if (!res.ok) {
        setError(res.error ?? '重命名失败');
        return;
      }
      setEditingId(null);
      setEditingName('');
      setError(null);
    });
  }

  function remove(tag: Tag) {
    const affected = tag.count ?? 0;
    const message =
      affected > 0
        ? `删除标签「${tag.name}」？将从 ${affected} 条收藏上解绑。`
        : `删除标签「${tag.name}」？`;
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const res = await deleteTagAction(tag.id);
      if (!res.ok) {
        setError(res.error ?? '删除失败');
        return;
      }
      setError(null);
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
          placeholder="新建标签（支持中文）"
          disabled={pending}
        />
        <button type="submit" className="btn" disabled={pending || !name.trim()}>
          新建
        </button>
      </form>

      {error ? (
        <p className="small" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
      {notice ? <p className="small muted">{notice}</p> : null}

      {tags.length === 0 ? (
        <p className="faint small" style={{ marginTop: 16 }}>
          还没有任何标签。AI 解读链接时会自动创建标签，你也可以在这里手动新建。
        </p>
      ) : (
        <table className="table-simple">
          <thead>
            <tr>
              <th>标签</th>
              <th style={{ textAlign: 'right' }}>收藏数</th>
              <th style={{ textAlign: 'right' }}>来源</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id}>
                <td>
                  {editingId === t.id ? (
                    <input
                      className="input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          rename(t.id);
                        }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <span>{t.name}</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>{t.count ?? 0}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className="faint small">{t.origin === 'user' ? '手动' : 'AI'}</span>
                </td>
                <td>
                  {editingId === t.id ? (
                    <>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={pending}
                        onClick={() => rename(t.id)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={pending}
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={pending}
                        onClick={() => {
                          setEditingId(t.id);
                          setEditingName(t.name);
                        }}
                      >
                        改名
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={pending}
                        onClick={() => remove(t)}
                      >
                        删除
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
