'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { getSourceLabels, getTypeLabels } from '@/lib/ui-labels';
import type { TagOption } from '@/components/TagInput';
import { useTranslation } from '@/components/LocaleProvider';

export function FilterBar({ tags }: { tags: TagOption[] }) {
  const { locale, t } = useTranslation();
  const typeLabels = getTypeLabels(locale);
  const sourceLabels = getSourceLabels(locale);
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
    if (key === 'tag') return t('filter.tag', { value });
    if (key === 'q') return t('filter.keyword', { value });
    if (key === 'domain') return t('filter.domainValue', { value });
    if (key === 'source')
      return t('filter.sourceValue', { value: sourceLabels[value as keyof typeof sourceLabels] ?? value });
    if (key === 'content_type')
      return t('filter.typeValue', { value: typeLabels[value as keyof typeof typeLabels] ?? value });
    if (key === 'status')
      return value === 'all'
        ? t('filter.all')
        : value === 'archived'
          ? t('filter.archived')
          : t('filter.all');
    if (key === 'read')
      return value === 'unread'
        ? t('filter.unread')
        : value === 'read' ? t('item.read') : t('filter.all');
    if (key === 'overdue') return t('filter.overdue');
    if (key === 'sort')
      return value === 'click_count'
        ? t('filter.frequent') : value;
    if (key === 'order') return value;
    return `${key}: ${value}`;
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
          {t('filter.searchLabel')}
        </label>
        <input
          id="item-search"
          className="input"
          name="q"
          defaultValue={params.get('q') ?? ''}
          placeholder={t('filter.searchPlaceholder')}
          autoComplete="off"
        />
        <button className="btn btn-primary" disabled={pending}>
          {t('filter.search')}
        </button>
      </form>
      <div className="lens-tabs" aria-label={t('filter.quickViews')}>
        {[
          ['all', t('filter.all')], ['unread', t('filter.unread')], ['overdue', t('filter.overdue')], ['frequent', t('filter.frequent')], ['archive', t('filter.archived')],
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
          {t('filter.narrow')}
          {activeTags.length ? t('filter.tagsIncluded', { count: activeTags.length }) : ''}
        </summary>
        <div className="filter-fields">
          <label>
            {t('filter.contentType')}
            <select
              className="input"
              value={params.get('content_type') ?? ''}
              onChange={(e) => setParam('content_type', e.target.value)}
            >
              <option value="">{t('filter.allTypes')}</option>
              {Object.entries(typeLabels).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('filter.source')}
            <select
              className="input"
              value={params.get('source') ?? ''}
              onChange={(e) => setParam('source', e.target.value)}
            >
              <option value="">{t('filter.allSources')}</option>
              {Object.entries(sourceLabels).map(([v, label]) => (
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
            <label htmlFor="domain-filter">{t('filter.domain')}</label>
            <div className="form-row">
              <input
                id="domain-filter"
                className="input"
                name="domain"
                defaultValue={params.get('domain') ?? ''}
                placeholder="github.com"
              />
              <button className="btn">{t('filter.apply')}</button>
            </div>
          </form>
        </div>
        <label className="field">
          <span className="field-label">{t('filter.tagsAnd')}</span>
          <input
            className="input"
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder={t('filter.findTags')}
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
        {t('filter.showing', { view: lens === 'archive' ? t('filter.viewArchived') : lens === 'overdue' ? t('filter.viewOverdue') : lens === 'unread' ? t('filter.viewUnread') : lens === 'frequent' ? t('filter.viewFrequent') : t('filter.viewAll') })}
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
              aria-label={t('filter.remove', { value: conditionLabel(key, value) })}
            >
              {conditionLabel(key, value)} ×
            </button>
          ))}
          <button
            className="btn-quiet"
            onClick={() => push(new URLSearchParams())}
          >
            {t('filter.clear')}
          </button>
        </div>
      ) : null}
      <p className="small faint" role="status">
        {pending ? t('filter.searching') : ''}
      </p>
    </div>
  );
}
