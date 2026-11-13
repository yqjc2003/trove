import Link from 'next/link';
import { getServerContext } from '@/lib/server-context';
import { listItems } from '@/lib/services/items';
import { formatDate } from '@/lib/format';
import { ItemRow } from '@/components/ItemRow';
import { EmptyState } from '@/components/StatBlock';
import type { Item } from '@/types';
import { getLocale } from '@/lib/i18n-server';
import { translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export default async function StreamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const ctx = await getServerContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const raw = Number(sp.offset);
  const offset = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const result = await listItems(ctx, {
    status: 'all',
    limit: 50,
    offset,
    sort: 'collected_at',
    order: 'desc',
  });
  const groups = new Map<string, Item[]>();
  for (const item of result.items) {
    const date = formatDate(item.collected_at);
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  return (
    <main className="page">
      <div className="wrap wrap-wide">
        <header className="page-head">
          <div>
            <h1>{translate(locale, 'stream.title')}</h1>
            <p className="page-sub">{translate(locale, 'stream.subtitle')}</p>
          </div>
          <Link className="btn" href="/items/new">
            {translate(locale, 'nav.capture')}
          </Link>
        </header>
        <div className="workspace">
          <div>
            {result.total === 0 ? (
              <EmptyState
                title={translate(locale, 'stream.emptyTitle')}
                text={translate(locale, 'stream.emptyText')}
                action={
                  <Link href="/settings#connections" className="btn">
                    {translate(locale, 'stream.connectAgent')}
                  </Link>
                }
              />
            ) : null}
            {[...groups].map(([date, items]) => (
              <section className="stream-day" key={date}>
                <div className="section-head">
                  <h2>{date}</h2>
                  <span className="section-count">{translate(locale, 'stream.pageItems', { count: items.length })}</span>
                </div>
                <ul className="rows">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      locale={locale}
                      actions={
                        item.source_ref ? (
                          <span className="small faint source-ref">
                            {translate(locale, 'stream.sourceRecord', { source: item.source_ref })}
                          </span>
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}
            <div className="pagination">
              <span className="small faint">{translate(locale, 'stream.totalItems', { count: result.total })}</span>
              <div>
                {offset > 0 ? (
                  <Link
                    className="btn"
                    href={`/stream?offset=${Math.max(0, offset - 50)}`}
                  >
                    {translate(locale, 'stream.newer')}
                  </Link>
                ) : null}
                {offset + result.items.length < result.total ? (
                  <Link className="btn" href={`/stream?offset=${offset + 50}`}>
                    {translate(locale, 'stream.older')}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
          <aside className="context-rail">
            <h2>{translate(locale, 'stream.origins')}</h2>
            <p className="page-sub">
              {translate(locale, 'stream.originsText')}
            </p>
            <div className="rail-section">
              <p className="small muted">
                {translate(locale, 'stream.reportText')}
              </p>
            </div>
            <div className="rail-section">
              <Link href="/settings#connections">{translate(locale, 'stream.manageConnections')}</Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
