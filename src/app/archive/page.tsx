import { getServerContext } from '@/lib/server-context';
import { listItems } from '@/lib/services/items';
import { EmptyState } from '@/components/StatBlock';
import { ItemRow } from '@/components/ItemRow';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const ctx = await getServerContext();
  if (!ctx) return null;

  const result = await listItems(ctx, {
    status: 'archived',
    limit: 100,
    sort: 'collected_at',
    order: 'desc',
  });

  return (
    <main className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>归档</h1>
            <p className="page-sub">已归档的收藏，不参与提醒与默认列表。</p>
          </div>
          <span className="section-count">{result.total} 条</span>
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            title="归档区是空的"
            text="在收藏详情页点「归档」，条目会移到这里，随时可以恢复。"
          />
        ) : (
          <ul className="rows">
            {result.items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
