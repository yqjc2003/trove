'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { setItemStatusAction } from '@/app/actions/items';
import { OpenOriginal } from '@/components/OpenOriginal';
import { formatDate } from '@/lib/format';
import { getSourceLabels, getTypeLabels } from '@/lib/ui-labels';
import type { Item } from '@/types';
import { useTranslation } from '@/components/LocaleProvider';

export function ReviewDesk({
  items,
  overdue,
}: {
  items: Item[];
  overdue: boolean;
}) {
  const { locale, t } = useTranslation();
  const typeLabels = getTypeLabels(locale);
  const sourceLabels = getSourceLabels(locale);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [archived, setArchived] = useState<string[]>([]);
  const [tag, setTag] = useState('');
  const [type, setType] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const pool = items;
  const tags = [
    ...new Set(pool.flatMap((item) => (item.tags ?? []).map((t) => t.name))),
  ];
  const matching = pool.filter(
    (item) =>
      !archived.includes(item.id) &&
      (!tag || item.tags?.some((t) => t.name === tag)) &&
      (!type || item.content_type === type),
  );
  const candidates = matching.filter((item) => !skipped.includes(item.id));
  const item = candidates.find((i) => i.id === chosen) ?? candidates[0];
  function archive(id: string, undo = false) {
    startTransition(async () => {
      try {
        const result = await setItemStatusAction(
          id,
          undo ? 'active' : 'archived',
        );
        if (!result.ok) {
          setError(result.error ?? '归档失败，请重试');
          return;
        }
        setArchived((prev) =>
          undo ? prev.filter((value) => value !== id) : [...prev, id],
        );
        setNotice(undo ? '已恢复到藏库。' : '已归档，随时可以恢复。');
        setError('');
      } catch {
        setError('连接失败，请重试。');
      }
    });
  }
  return (
    <section className="review-desk" aria-label={t('review.label')}>
      <div className="desk-tools">
        <label>
          {t('review.topic')}
          <select
            className="input"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">{t('review.allTags')}</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          {t('review.type')}
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">{t('review.allTypes')}</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn-quiet"
          disabled={candidates.length < 2 || pending}
          onClick={() => {
            const others = candidates.filter((i) => i.id !== item?.id);
            setChosen(
              others[Math.floor(Math.random() * others.length)]?.id ?? null,
            );
          }}
        >
          {t('review.random')}
        </button>
      </div>
      {item ? (
        <article key={item.id} className="desk-content">
          <p className="desk-context">
            {overdue ? t('review.overdue') : t('review.oldest')}
            <span>{typeLabels[item.content_type]}</span>
          </p>
          <h2 className="desk-title">
            <a
              href={`/r/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(item.id)}
            >
              {item.title}
              <span className="sr-only">{t('item.openNewTab')}</span>
            </a>
          </h2>
          <p className="row-meta">
            {item.domain} · {t('review.collected', { date: formatDate(item.collected_at) })} · {sourceLabels[item.source]}
          </p>
          <p className="desk-summary">
            {item.summary || t('review.noSummary')}
          </p>
          <div className="tags">
            {item.tags?.map((t) => (
              <Link
                key={t.id}
                className="tag"
                href={`/items?tag=${encodeURIComponent(t.name)}`}
              >
                {t.name}
              </Link>
            ))}
          </div>
          <div className="desk-actions">
            <OpenOriginal id={item.id} onOpen={() => setOpened(item.id)} />
            <Link className="btn" href={`/items/${item.id}`}>
              {t('review.details')}
            </Link>
            <button
              className="btn"
              disabled={pending}
              onClick={() => {
                setSkipped((prev) => [...prev, item.id]);
                setNotice('本轮已跳过，未改变阅读状态。');
              }}
            >
              {t('review.later')}
            </button>
            <button
              className="btn-quiet"
              disabled={pending}
              onClick={() => archive(item.id)}
            >
              {pending ? t('review.processing') : t('review.archive')}
            </button>
          </div>
        </article>
      ) : (
        <div className="desk-content empty">
          <h2>
            {matching.length
              ? t('review.emptyRound')
              : items.length
                ? t('review.emptyFiltered')
                : t('review.empty')}
          </h2>
          <p className="page-sub">
            {matching.length
              ? '跳过的链接仍保留未读状态，可以随时重新开始。'
              : '换一个主题，或去藏库重新发现已有的收藏。'}
          </p>
          <div className="row-actions">
            <button
              className="btn"
              onClick={() => {
                setSkipped([]);
                setTag('');
                setType('');
              }}
            >
              {t('review.restart')}
            </button>
            <Link href="/items">{t('review.library')}</Link>
          </div>
        </div>
      )}
      {opened ? (
        <p className="reading-return">
          {t('review.return')}
          <Link href={`/items/${opened}#notes`}>{t('review.leaveNote')}</Link>
          {t('review.returnEnd')}
        </p>
      ) : null}
      <div className="desk-footer">
        <span>
          {t('review.candidates', { pool: pool.length, remaining: candidates.length })}
        </span>
        <Link href="/items?overdue=true">{t('review.fullList')}</Link>
      </div>
      <p className="small faint desk-help">
        {t('review.help')}
      </p>
      <p className="small muted" role="status">
        {notice}
      </p>
      {archived.length ? (
        <button
          className="btn-quiet"
          disabled={pending}
          onClick={() => archive(archived[archived.length - 1], true)}
        >
          {t('review.undoArchive')}
        </button>
      ) : null}
      {error ? (
        <p className="danger small" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
