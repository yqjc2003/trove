'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { setItemStatusAction } from '@/app/actions/items';
import { OpenOriginal } from '@/components/OpenOriginal';
import { formatDate } from '@/lib/format';
import { SOURCE_LABELS, TYPE_LABELS } from '@/lib/ui-labels';
import type { Item } from '@/types';

export function ReviewDesk({
  items,
  overdue,
}: {
  items: Item[];
  overdue: boolean;
}) {
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
    <section className="review-desk" aria-label="单条回看">
      <div className="desk-tools">
        <label>
          主题
          <select
            className="input"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">所有标签</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          形态
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">所有形态</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
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
          随机一条
        </button>
      </div>
      {item ? (
        <article key={item.id} className="desk-content">
          <p className="desk-context">
            {overdue ? '搁置了一阵，重新看看' : '从最早收下的链接开始'}
            <span>{TYPE_LABELS[item.content_type]}</span>
          </p>
          <h2 className="desk-title">
            <a
              href={`/r/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(item.id)}
            >
              {item.title}
              <span className="sr-only">（在新标签页打开原文）</span>
            </a>
          </h2>
          <p className="row-meta">
            {item.domain} · {formatDate(item.collected_at)} 收集 ·{' '}
            {SOURCE_LABELS[item.source]}
          </p>
          <p className="desk-summary">
            {item.summary || '还没有摘要。打开原文，看看当初是什么吸引了你。'}
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
              详情与笔记
            </Link>
            <button
              className="btn"
              disabled={pending}
              onClick={() => {
                setSkipped((prev) => [...prev, item.id]);
                setNotice('本轮已跳过，未改变阅读状态。');
              }}
            >
              稍后再看
            </button>
            <button
              className="btn-quiet"
              disabled={pending}
              onClick={() => archive(item.id)}
            >
              {pending ? '处理中…' : '归档'}
            </button>
          </div>
        </article>
      ) : (
        <div className="desk-content empty">
          <h2>
            {matching.length
              ? '这一轮先到这里。'
              : items.length
                ? '这个镜头下没有待回看的链接。'
                : '暂时没有待回看的链接。'}
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
              重新开始
            </button>
            <Link href="/items">去藏库看看</Link>
          </div>
        </div>
      )}
      {opened ? (
        <p className="reading-return">
          打开之后，
          <Link href={`/items/${opened}#notes`}>留下一句自己的理解</Link>
          。打开记录不代表你已经读完。
        </p>
      ) : null}
      <div className="desk-footer">
        <span>
          当前候选 {pool.length} 条 · 本轮剩余 {candidates.length} 条
        </span>
        <Link href="/items?overdue=true">完整待回看清单</Link>
      </div>
      <p className="small faint desk-help">
        稍后再看仅在本轮跳过；重新进入回看台会再次出现。
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
          撤销上次归档
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
