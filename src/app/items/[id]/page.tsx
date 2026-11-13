import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerContext } from '@/lib/server-context';
import { getItem } from '@/lib/services/items';
import { listTags } from '@/lib/services/tags';
import { AppError } from '@/lib/domain/errors';
import { formatDate } from '@/lib/format';
import { getSourceLabels } from '@/lib/ui-labels';
import { getLocale } from '@/lib/i18n-server';
import { translate } from '@/lib/i18n';
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
  const locale = await getLocale();
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
          <Link href="/items">{translate(locale, 'detail.back')}</Link>
        </p>
        <header className="detail-main">
          <p className="row-meta detail-meta">
            <span>{item.domain}</span>
            <span>{translate(locale, 'detail.collected', { date: formatDate(item.collected_at) })}</span>
            <span>
              {item.status === 'archived'
                ? translate(locale, 'item.archived')
                : item.read_at
                  ? translate(locale, 'item.read')
                  : translate(locale, 'item.unread')}
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
          <summary>{translate(locale, 'detail.organize')}</summary>
          <div className="organize-content">
            <p className="small faint">
              {getSourceLabels(locale)[item.source]} · {translate(locale, 'item.opened', { count: item.click_count })}
              {item.read_at ? ` · ${translate(locale, 'detail.collected', { date: formatDate(item.read_at) })} ${translate(locale, 'item.read')}` : ''}
            </p>
            {item.source_ref ? (
              <p className="small faint source-ref">
                {translate(locale, 'detail.sourceRecord', { source: item.source_ref })}
              </p>
            ) : null}
            <h2 className="field-label" id="item-tags-heading">
              {translate(locale, 'detail.tags')}
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
        <section className="detail-notes" id="notes" aria-label={translate(locale, 'detail.notes')}>
          <NoteEditor itemId={item.id} notes={notes} />
        </section>
      </div>
    </main>
  );
}
