import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerContext } from '@/lib/server-context';
import { getItem } from '@/lib/services/items';
import { listTags } from '@/lib/services/tags';
import { AppError } from '@/lib/domain/errors';
import { formatDate } from '@/lib/format';
import { SOURCE_LABELS } from '@/lib/ui-labels';
import { ItemActions } from '@/components/ItemActions';
import { ItemEditor } from '@/components/ItemEditor';
import { NoteEditor } from '@/components/NoteEditor';
import { TagPicker } from '@/components/TagPicker';
import { OpenOriginal } from '@/components/OpenOriginal';

export const dynamic = 'force-dynamic';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getServerContext();
  if (!ctx) return null;
  const { id } = await params;
  const { item, notes } = await getItem(ctx, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const tags = await listTags(ctx);

  return (
    <main className="page">
      <div className="wrap detail-page">
        <p className="breadcrumb">
          <Link href="/items">返回藏库</Link>
        </p>
        <header className="detail-main">
          <p className="row-meta detail-meta">
            <span>{item.domain}</span>
            <span>{formatDate(item.collected_at)} 收集</span>
            <span>
              {item.status === 'archived'
                ? '已归档'
                : item.read_at
                  ? '已读'
                  : '未读'}
            </span>
          </p>
          <ItemEditor
            itemId={item.id}
            title={item.title}
            summary={item.summary}
          />
          <div className="row-actions">
            <OpenOriginal id={item.id} read={Boolean(item.read_at)} />
          </div>
        </header>
        <details className="item-organize">
          <summary>整理收藏</summary>
          <div className="organize-content">
            <p className="small faint">
              {SOURCE_LABELS[item.source]} · 打开 {item.click_count} 次
              {item.read_at ? ` · ${formatDate(item.read_at)} 已读` : ''}
            </p>
            {item.source_ref ? (
              <p className="small faint source-ref">
                来源记录：{item.source_ref}
              </p>
            ) : null}
            <h2 className="field-label" id="item-tags-heading">
              标签
            </h2>
            <TagPicker
              itemId={item.id}
              current={(item.tags ?? []).map((tag) => tag.name)}
              options={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
            />
            <ItemActions
              itemId={item.id}
              status={item.status}
              read={Boolean(item.read_at)}
            />
          </div>
        </details>
        <section className="detail-notes" id="notes" aria-label="收藏笔记">
          <NoteEditor itemId={item.id} notes={notes} />
        </section>
      </div>
    </main>
  );
}
