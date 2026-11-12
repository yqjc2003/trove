'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { TagOption } from '@/components/TagInput';

const CONTENT_TYPES = [
  { value: 'article', label: '文章' },
  { value: 'video', label: '视频' },
  { value: 'repo', label: '仓库' },
  { value: 'tool', label: '工具' },
  { value: 'social', label: '社交' },
  { value: 'doc', label: '文档' },
  { value: 'other', label: '其他' },
];

const SOURCES = [
  { value: 'manual', label: '手动' },
  { value: 'skill', label: 'Skill' },
  { value: 'mcp', label: 'MCP' },
  { value: 'github', label: 'GitHub' },
  { value: 'bookmark', label: '收藏夹' },
];

/** 列表筛选栏。筛选状态全部放在 URL query 里，可分享、可回退。 */
export function FilterBar({
  tags,
  showStatus = true,
}: {
  tags: TagOption[];
  showStatus?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');

  const activeTags = params.getAll('tag');

  function push(next: URLSearchParams) {
    startTransition(() => {
      router.replace(`/items?${next.toString()}`, { scroll: false });
    });
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    next.delete('offset');
    push(next);
  }

  function toggleTag(name: string) {
    const next = new URLSearchParams(params.toString());
    const current = next.getAll('tag');
    next.delete('tag');
    const updated = current.includes(name)
      ? current.filter((t) => t !== name)
      : [...current, name];
    for (const t of updated) next.append('tag', t);
    next.delete('offset');
    push(next);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setParam('q', q.trim() || null);
  }

  const currentType = params.get('content_type');
  const currentSource = params.get('source');
  const currentRead = params.get('read');

  return (
    <div className="filters">
      <form onSubmit={submitSearch} className="form-row">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题、摘要或链接"
        />
        <button type="submit" className="btn btn-sm">
          搜索
        </button>
        {q && q !== (params.get('q') ?? '') ? (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setQ('');
              setParam('q', null);
            }}
          >
            清除
          </button>
        ) : null}
      </form>

      {tags.length > 0 ? (
        <div className="filter-group" style={{ marginTop: 12 }}>
          <span className="filter-label">标签</span>
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip"
              aria-pressed={activeTags.includes(t.name)}
              onClick={() => toggleTag(t.name)}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="filter-group" style={{ marginTop: 12 }}>
        <span className="filter-label">类型</span>
        <button
          type="button"
          className="chip"
          aria-pressed={!currentType}
          onClick={() => setParam('content_type', null)}
        >
          全部
        </button>
        {CONTENT_TYPES.map((c) => (
          <button
            key={c.value}
            type="button"
            className="chip"
            aria-pressed={currentType === c.value}
            onClick={() => setParam('content_type', currentType === c.value ? null : c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="filter-group" style={{ marginTop: 12 }}>
        <span className="filter-label">来源</span>
        <button
          type="button"
          className="chip"
          aria-pressed={!currentSource}
          onClick={() => setParam('source', null)}
        >
          全部
        </button>
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            className="chip"
            aria-pressed={currentSource === s.value}
            onClick={() => setParam('source', currentSource === s.value ? null : s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="filter-group" style={{ marginTop: 12 }}>
        <span className="filter-label">状态</span>
        <button
          type="button"
          className="chip"
          aria-pressed={currentRead === 'unread'}
          onClick={() => setParam('read', currentRead === 'unread' ? null : 'unread')}
        >
          未读
        </button>
        {showStatus ? (
          <button
            type="button"
            className="chip"
            aria-pressed={params.get('status') === 'archived'}
            onClick={() =>
              setParam('status', params.get('status') === 'archived' ? null : 'archived')
            }
          >
            已归档
          </button>
        ) : null}
      </div>

      {pending ? <p className="faint small" style={{ marginTop: 8 }}>筛选中…</p> : null}
    </div>
  );
}
