import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerContext } from '@/lib/server-context';
import { getItem } from '@/lib/services/items';
import { listTags } from '@/lib/services/tags';
import { AppError } from '@/lib/domain/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { SOURCE_LABELS, TYPE_LABELS } from '@/lib/ui-labels';
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
  const data = await getItem(ctx, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const { item, notes } = data;
  const [tags, clicks] = await Promise.all([
    listTags(ctx),
    ctx.db.listClicks(id, 20),
  ]);
  return (
    <main className="page">
      <div className="wrap wrap-wide">
        <p className="breadcrumb">
          <Link href="/items">藏库</Link>
          <span>/</span>
          <span>{TYPE_LABELS[item.content_type]}</span>
          {item.status === 'archived' ? <span>已归档</span> : null}
        </p>
        <div className="workspace detail-workspace">
          <div className="detail-main">
            <ItemEditor
              itemId={item.id}
              title={item.title}
              summary={item.summary}
            />
            <div className="desk-actions">
              <OpenOriginal id={item.id} read={Boolean(item.read_at)} />
              <a
                className="small muted"
                href={item.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                直接访问（不记录）
              </a>
            </div>
            <section className="section" id="notes">
              <div className="section-head">
                <h2>我的理解</h2>
                <span className="section-count">{notes.length} 条笔记</span>
              </div>
              <p className="page-sub">
                {item.read_at
                  ? '打开过的链接，还可以留下自己的线索。'
                  : '先看看原文，再把值得记住的留在这里。'}
              </p>
              <NoteEditor itemId={item.id} notes={notes} />
            </section>
          </div>
          <aside className="context-rail">
            <h2>这条的来路</h2>
            <dl className="item-facts">
              <div>
                <dt>发布站点</dt>
                <dd>{item.domain}</dd>
              </div>
              <div>
                <dt>采集通道</dt>
                <dd>{SOURCE_LABELS[item.source]}</dd>
              </div>
              <div>
                <dt>收下于</dt>
                <dd>{formatDate(item.collected_at)}</dd>
              </div>
              <div>
                <dt>阅读记录</dt>
                <dd>
                  {item.read_at
                    ? `${formatDate(item.read_at)} 已读`
                    : '从未打开'}
                </dd>
              </div>
              <div>
                <dt>打开次数</dt>
                <dd>{item.click_count} 次</dd>
              </div>
              {item.source_ref ? (
                <div>
                  <dt>来源记录</dt>
                  <dd>{item.source_ref}</dd>
                </div>
              ) : null}
            </dl>
            <div className="rail-section">
              <h2>描述它的词</h2>
              <p className="page-sub">手工整理不限标签数量。</p>
              <TagPicker
                itemId={item.id}
                current={(item.tags ?? []).map((t) => t.name)}
                options={tags.map((t) => ({ id: t.id, name: t.name }))}
              />
            </div>
            <div className="rail-section">
              <h2>留存方式</h2>
              <ItemActions
                itemId={item.id}
                status={item.status}
                read={Boolean(item.read_at)}
              />
            </div>
            <details className="rail-section">
              <summary>最近打开记录（{clicks.length}）</summary>
              {clicks.length ? (
                <ul className="rows">
                  {clicks.map((c) => (
                    <li key={c.id} className="row small faint">
                      {formatDateTime(c.clicked_at)}
                      <br />
                      {c.source}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="page-sub">还没有打开记录。</p>
              )}
            </details>
          </aside>
        </div>
      </div>
    </main>
  );
}
