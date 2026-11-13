'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import {
  createTagAction,
  deleteTagAction,
  renameTagAction,
} from '@/app/actions/tags';
import type { Tag } from '@/types';
import { useTranslation } from '@/components/LocaleProvider';

/**
 * 标签管理（DIY）：新建 / 改名 / 删除。
 * 每个用户拥有完全独立的标签空间，这里只操作当前用户的标签。
 */
export function TagManager({ tags }: { tags: Tag[] }) {
  const { t } = useTranslation();
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
      setNotice(t('tags.savedNotice'));
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
      setNotice(t('tags.renamedNotice'));
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
      setNotice(t('tags.deletedNotice'));
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
        <label className="sr-only" htmlFor="new-tag">
          {t('tags.newName')}
        </label>
        <input
          id="new-tag"
          className="input"
          name="tag"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('tags.placeholder')}
          disabled={pending}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="btn"
          disabled={pending || !name.trim()}
        >
          {t('tags.create')}
        </button>
      </form>

      {error ? (
        <p className="small danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="small muted" role="status">
          {notice}
        </p>
      ) : null}
      {name.trim() &&
      tags.some((t) =>
        t.name.toLowerCase().includes(name.trim().toLowerCase()),
      ) ? (
        <p className="small muted">
          已有相近名称：
          {tags
            .filter((t) =>
              t.name.toLowerCase().includes(name.trim().toLowerCase()),
            )
            .slice(0, 5)
            .map((t) => t.name)
            .join('、')}
          。可直接复用已有标签。
        </p>
      ) : null}

      {tags.length === 0 ? (
        <p className="faint small" style={{ marginTop: 16 }}>
          {t('tags.empty')}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="table-simple">
            <thead>
              <tr>
                <th>{t('tags.name')}</th>
                <th style={{ textAlign: 'right' }}>{t('tags.count')}</th>
                <th style={{ textAlign: 'right' }}>{t('tags.origin')}</th>
                <th style={{ textAlign: 'right' }}>{t('tags.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id}>
                  <td>
                    {editingId === tag.id ? (
                      <input
                        className="input"
                        name="tag_name"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        aria-label={t('tags.newNameAria', { name: tag.name })}
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            rename(tag.id);
                          }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <Link href={`/items?tag=${encodeURIComponent(tag.name)}`}>
                        {tag.name}
                      </Link>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{tag.count ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="faint small">
                      {tag.origin === 'user' ? t('tags.user') : t('tags.agent')}
                    </span>
                  </td>
                  <td>
                    {editingId === tag.id ? (
                      <>
                        <button
                          type="button"
                          className="btn-quiet"
                          disabled={pending}
                          onClick={() => rename(tag.id)}
                        >
                          {t('tags.save')}
                        </button>
                        <p className="small faint">
                          影响 {tag.count ?? 0} 条收藏，关联保持不变。
                        </p>
                        <button
                          type="button"
                          className="btn-quiet"
                          disabled={pending}
                          onClick={() => setEditingId(null)}
                        >
                          {t('tags.cancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-quiet"
                          disabled={pending}
                          onClick={() => {
                            setEditingId(tag.id);
                            setEditingName(tag.name);
                          }}
                        >
                          {t('tags.rename')}
                        </button>
                        <button
                          type="button"
                          className="btn-quiet btn-danger"
                          disabled={pending}
                          onClick={() => remove(tag)}
                        >
                          {t('tags.delete')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
