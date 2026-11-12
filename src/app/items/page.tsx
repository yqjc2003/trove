import { Suspense } from 'react';
import Link from 'next/link';

import { getServerContext } from '@/lib/server-context';
import { listItems } from '@/lib/services/items';
import { listTags } from '@/lib/services/tags';
import { EmptyState } from '@/components/StatBlock';
import { ItemRow } from '@/components/ItemRow';
import { FilterBar } from '@/components/FilterBar';
import { isContentType, type ContentType } from '@/lib/domain/content-type';
import type { ItemSource } from '@/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function list(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .flatMap((x) => x.split(','))
    .map((x) => x.trim())
    .filter(Boolean);
}

async function ItemsList({ searchParams }: PageProps) {
  const ctx = await getServerContext();
  if (!ctx) return null;

  const sp = await searchParams;

  const contentTypeRaw = first(sp.content_type);
  const sourceRaw = first(sp.source);
  const statusRaw = first(sp.status);
  const readRaw = first(sp.read);
  const offsetRaw = Number(first(sp.offset) ?? '0');

  const [result, tags] = await Promise.all([
    listItems(ctx, {
      q: first(sp.q),
      domain: first(sp.domain),
      tags: list(sp.tag),
      content_type:
        contentTypeRaw && isContentType(contentTypeRaw)
          ? (contentTypeRaw as ContentType)
          : undefined,
      source:
        sourceRaw &&
        ['manual', 'skill', 'mcp', 'github', 'bookmark'].includes(sourceRaw)
          ? (sourceRaw as ItemSource)
          : undefined,
      status:
        statusRaw === 'archived' || statusRaw === 'all' ? statusRaw : 'active',
      read: readRaw === 'read' || readRaw === 'unread' ? readRaw : 'all',
      overdue: first(sp.overdue) === 'true',
      sort:
        first(sp.sort) === 'click_count' || first(sp.sort) === 'title'
          ? (first(sp.sort) as 'click_count' | 'title')
          : 'collected_at',
      order: first(sp.order) === 'asc' ? 'asc' : 'desc',
      collected_from: first(sp.collected_from),
      collected_to: first(sp.collected_to),
      limit: PAGE_SIZE,
      offset: Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0,
    }),
    listTags(ctx),
  ]);

  const total = result.total;
  const offset = result.offset;
  const shown = result.items.length;
  const hasMore = offset + shown < total;

  return (
    <>
      <FilterBar tags={tags.map((t) => ({ id: t.id, name: t.name }))} />
      <p className="results-count small faint" role="status">
        找到 {total} 条收藏
      </p>

      {result.items.length === 0 ? (
        <EmptyState
          title="没有匹配的收藏"
          text="换个关键词，或清空筛选条件试试。"
          action={
            <div className="row-actions">
              <Link href="/items" className="btn">
                清空镜头
              </Link>
              <Link href="/items/new" className="btn btn-sm">
                手工收一条链接
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <ul className="rows">
            {result.items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>

          <div
            className="row-actions"
            style={{ justifyContent: 'space-between', marginTop: 24 }}
          >
            <span className="small faint">
              {offset + 1}–{offset + shown} / 共 {total} 条
            </span>
            <span style={{ display: 'flex', gap: 10 }}>
              {offset > 0 ? (
                <a
                  className="btn btn-sm"
                  href={`/items?${buildQuery(sp, Math.max(0, offset - PAGE_SIZE))}`}
                >
                  上一页
                </a>
              ) : null}
              {hasMore ? (
                <a
                  className="btn btn-sm"
                  href={`/items?${buildQuery(sp, offset + PAGE_SIZE)}`}
                >
                  下一页
                </a>
              ) : null}
            </span>
          </div>
        </>
      )}
    </>
  );
}

/** 保留当前筛选条件，只改 offset。 */
function buildQuery(
  sp: Record<string, string | string[] | undefined>,
  offset: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === 'offset') continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  if (offset > 0) params.set('offset', String(offset));
  return params.toString();
}

export default function ItemsPage({ searchParams }: PageProps) {
  return (
    <main className="page">
      <div className="wrap wrap-library">
        <div className="page-head">
          <div>
            <h1>藏库</h1>
            <p className="page-sub">你曾经觉得有价值的，都在这里。</p>
          </div>
          <Link href="/items/new" className="btn btn-primary">
            收一条链接
          </Link>
        </div>

        <Suspense fallback={<p className="faint small">加载中…</p>}>
          <ItemsList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
