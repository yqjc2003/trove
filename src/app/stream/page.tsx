import Link from 'next/link';
import { getServerContext } from '@/lib/server-context';
import { listItems } from '@/lib/services/items';
import { formatDate } from '@/lib/format';
import { ItemRow } from '@/components/ItemRow';
import { EmptyState } from '@/components/StatBlock';
import type { Item } from '@/types';

export const dynamic = 'force-dynamic';
export default async function StreamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
            <h1>收集流</h1>
            <p className="page-sub">从各处收下的链接，在这里汇合。</p>
          </div>
          <Link className="btn" href="/items/new">
            收一条链接
          </Link>
        </header>
        <div className="workspace">
          <div>
            {result.total === 0 ? (
              <EmptyState
                title="第一条链接，从这里开始"
                text="手工收下一个链接，或连接 Agent 导入浏览器书签与 GitHub Star。"
                action={
                  <Link href="/settings#connections" className="btn">
                    连接 Agent
                  </Link>
                }
              />
            ) : null}
            {[...groups].map(([date, items]) => (
              <section className="stream-day" key={date}>
                <div className="section-head">
                  <h2>{date}</h2>
                  <span className="section-count">本页 {items.length} 条</span>
                </div>
                <ul className="rows">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      actions={
                        item.source_ref ? (
                          <span className="small faint source-ref">
                            来源记录：{item.source_ref}
                          </span>
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}
            <div className="pagination">
              <span className="small faint">共 {result.total} 条收藏</span>
              <div>
                {offset > 0 ? (
                  <Link
                    className="btn"
                    href={`/stream?offset=${Math.max(0, offset - 50)}`}
                  >
                    较新的收集
                  </Link>
                ) : null}
                {offset + result.items.length < result.total ? (
                  <Link className="btn" href={`/stream?offset=${offset + 50}`}>
                    更早的收集
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
          <aside className="context-rail">
            <h2>收集的来路</h2>
            <p className="page-sub">
              这里按首次收藏日期排列，重复采集会补全已有收藏，保留它原来的位置。
            </p>
            <div className="rail-section">
              <p className="small muted">
                日期分组呈现收藏记录。每次导入的新增、更新与失败结果，请查看
                Agent 的采集报告。
              </p>
            </div>
            <div className="rail-section">
              <Link href="/settings#connections">管理采集连接</Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
