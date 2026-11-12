'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { SOURCE_LABELS, TYPE_LABELS } from '@/lib/ui-labels';
import type { TagOption } from '@/components/TagInput';

export function FilterBar({ tags }: { tags: TagOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [tagQuery, setTagQuery] = useState('');
  const activeTags = params.getAll('tag');
  function push(next: URLSearchParams) {
    next.delete('offset');
    startTransition(() => router.push(`/items?${next}`, { scroll: false }));
  }
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }
  function toggleTag(name: string) {
    const next = new URLSearchParams(params.toString());
    next.delete('tag');
    const values = activeTags.includes(name)
      ? activeTags.filter((t) => t !== name)
      : [...activeTags, name];
    values.forEach((t) => next.append('tag', t));
    push(next);
  }
  const lens =
    params.get('status') === 'archived'
      ? 'archive'
      : params.get('overdue') === 'true'
        ? 'overdue'
        : params.get('sort') === 'click_count'
          ? 'frequent'
          : params.get('read') === 'unread'
            ? 'unread'
            : 'all';
  function selectLens(value: string) {
    const next = new URLSearchParams(params.toString());
    ['status', 'read', 'overdue', 'sort', 'order'].forEach((key) =>
      next.delete(key),
    );
    if (value === 'archive') next.set('status', 'archived');
    if (value === 'unread') next.set('read', 'unread');
    if (value === 'overdue') next.set('overdue', 'true');
    if (value === 'frequent') next.set('sort', 'click_count');
    push(next);
  }
  const conditions = [...params.entries()].filter(([key]) =>
    [
      'q',
      'tag',
      'domain',
      'source',
      'content_type',
      'status',
      'read',
      'overdue',
      'sort',
      'order',
      'collected_from',
      'collected_to',
    ].includes(key),
  );
  function conditionLabel(key: string, value: string) {
    if (key === 'tag') return `标签：${value}`;
    if (key === 'q') return `关键词：${value}`;
    if (key === 'domain') return `域名：${value}`;
    if (key === 'source')
      return `来源：${SOURCE_LABELS[value as keyof typeof SOURCE_LABELS] ?? value}`;
    if (key === 'content_type')
      return `形态：${TYPE_LABELS[value as keyof typeof TYPE_LABELS] ?? value}`;
    if (key === 'status')
      return value === 'all'
        ? '包含归档'
        : value === 'archived'
          ? '已归档'
          : '未归档';
    if (key === 'read')
      return value === 'unread'
        ? '未读'
        : value === 'read'
          ? '已读'
          : '所有阅读状态';
    if (key === 'overdue') return '待回看';
    if (key === 'sort')
      return value === 'click_count'
        ? '按打开次数'
        : value === 'title'
          ? '按标题'
          : '按收藏时间';
    if (key === 'order') return value === 'asc' ? '升序' : '降序';
    return `${key === 'collected_from' ? '收集自' : '收集至'}：${value}`;
  }
  return (
    <div className="filters" aria-busy={pending}>
      <form
        key={params.get('q') ?? ''}
        role="search"
        className="form-row library-search"
        onSubmit={(e) => {
          e.preventDefault();
          setParam(
            'q',
            String(new FormData(e.currentTarget).get('q') ?? '').trim(),
          );
        }}
      >
        <label className="sr-only" htmlFor="item-search">
          搜索标题、摘要或链接
        </label>
        <input
          id="item-search"
          className="input"
          name="q"
          defaultValue={params.get('q') ?? ''}
          placeholder="找回一个想法、一篇文章、一个工具…"
          autoComplete="off"
        />
        <button className="btn btn-primary" disabled={pending}>
          搜索藏库
        </button>
      </form>
      <div className="lens-tabs" aria-label="快捷镜头">
        {[
          ['all', '全部'],
          ['unread', '未读'],
          ['overdue', '待回看'],
          ['frequent', '常打开'],
          ['archive', '已归档'],
        ].map(([value, label]) => (
          <button
            key={value}
            className="lens-tab"
            aria-pressed={lens === value}
            onClick={() => selectLens(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <details className="filter-details">
        <summary>
          收窄范围
          {activeTags.length ? ` · 同时包含 ${activeTags.length} 个标签` : ''}
        </summary>
        <div className="filter-fields">
          <label>
            内容形态
            <select
              className="input"
              value={params.get('content_type') ?? ''}
              onChange={(e) => setParam('content_type', e.target.value)}
            >
              <option value="">所有形态</option>
              {Object.entries(TYPE_LABELS).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            采集来源
            <select
              className="input"
              value={params.get('source') ?? ''}
              onChange={(e) => setParam('source', e.target.value)}
            >
              <option value="">所有来源</option>
              {Object.entries(SOURCE_LABELS).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <form
            key={params.get('domain') ?? ''}
            onSubmit={(e) => {
              e.preventDefault();
              setParam(
                'domain',
                String(
                  new FormData(e.currentTarget).get('domain') ?? '',
                ).trim(),
              );
            }}
          >
            <label htmlFor="domain-filter">域名</label>
            <div className="form-row">
              <input
                id="domain-filter"
                className="input"
                name="domain"
                defaultValue={params.get('domain') ?? ''}
                placeholder="github.com"
              />
              <button className="btn">应用</button>
            </div>
          </form>
        </div>
        <label className="field">
          <span className="field-label">标签 · 多选时同时包含（AND）</span>
          <input
            className="input"
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder="在你的标签中查找"
          />
        </label>
        <div className="tag-options">
          {tags
            .filter((t) =>
              t.name.toLowerCase().includes(tagQuery.toLowerCase()),
            )
            .map((t) => (
              <button
                key={t.id}
                className="chip"
                aria-pressed={activeTags.includes(t.name)}
                onClick={() => toggleTag(t.name)}
              >
                {t.name}
              </button>
            ))}
        </div>
      </details>
      <p className="filter-sentence">
        {activeTags.length ? `同时包含「${activeTags.join('」和「')}」的` : ''}
        {params.get('q') ? `匹配「${params.get('q')}」的` : ''}
        {lens === 'archive'
          ? '已归档收藏'
          : lens === 'overdue'
            ? '超期未读收藏'
            : lens === 'unread'
              ? '未读收藏'
              : '收藏'}
        {lens === 'frequent' ? '，按打开次数排列' : ''}。
      </p>
      {conditions.length ? (
        <div className="active-conditions">
          {conditions.map(([key, value]) => (
            <button
              className="chip"
              key={`${key}-${value}`}
              onClick={() => {
                if (key === 'tag') toggleTag(value);
                else setParam(key, '');
              }}
              aria-label={`移除${conditionLabel(key, value)}`}
            >
              {conditionLabel(key, value)} ×
            </button>
          ))}
          <button
            className="btn-quiet"
            onClick={() => push(new URLSearchParams())}
          >
            清空镜头
          </button>
        </div>
      ) : null}
      <p className="small faint" role="status">
        {pending ? '正在查找…' : ''}
      </p>
    </div>
  );
}
