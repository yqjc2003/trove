import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getServerContext } from '@/lib/server-context';
import { getItem } from '@/lib/services/items';
import { listTags } from '@/lib/services/tags';
import { formatDate, formatDateTime } from '@/lib/format';
import { ItemActions } from '@/components/ItemActions';
import { ItemEditor } from '@/components/ItemEditor';
import { NoteEditor } from '@/components/NoteEditor';
import { TagPicker } from '@/components/TagPicker';

export const dynamic = 'force-dynamic';

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动添加',
  skill: 'Skill 采集',
  mcp: 'MCP 采集',
  github: 'GitHub Star',
  bookmark: '浏览器收藏夹',
};

const TYPE_LABELS: Record<string, string> = {
  article: '文章',
  video: '视频',
  repo: '仓库',
  tool: '工具',
  social: '社交',
  doc: '文档',
  other: '其他',
};

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getServerContext();
  if (!ctx) return null;

  const { id } = await params;
  const { item, notes } = await getItem(ctx, id);
  if (!item) notFound();

  const [tags, clicks] = await Promise.all([
    listTags(ctx),
    ctx.db.listClicks(id, 20),
  ]);

  return (
    <main className="page">
      <div className="wrap">
        <p className="small faint" style={{ marginBottom: 20 }}>
          <Link href="/items">← 返回收藏列表</Link>
        </p>

        <ItemEditor itemId={item.id} title={item.title} summary={item.summary} />

        <p className="row-meta" style={{ marginTop: 12 }}>
          <span>{item.domain}</span>
          <span>收藏于 {formatDate(item.collected_at)}</span>
          <span>打开 {item.click_count} 次</span>
          <span>{TYPE_LABELS[item.content_type] ?? item.content_type}</span>
          <span>{SOURCE_LABELS[item.source] ?? item.source}</span>
          {item.read_at ? <span>已读于 {formatDate(item.read_at)}</span> : <span>未读</span>}
          {item.status === 'archived' ? <span>已归档</span> : null}
        </p>

        <div className="row-actions" style={{ marginTop: 16 }}>
          <a className="btn btn-primary" href={`/r/${item.id}`}>
            打开链接
          </a>
          <a className="btn" href={item.url} rel="noreferrer noopener" target="_blank">
            不记录直接访问
          </a>
        </div>

        <section className="section">
          <div className="section-head">
            <h2>标签</h2>
            <span className="section-count">手工整理不限数量</span>
          </div>
          <div style={{ paddingTop: 16 }}>
            <TagPicker
              itemId={item.id}
              current={(item.tags ?? []).map((t) => t.name)}
              options={tags.map((t) => ({ id: t.id, name: t.name }))}
            />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>笔记</h2>
            <span className="section-count">{notes.length} 条</span>
          </div>
          <div style={{ paddingTop: 8 }}>
            <NoteEditor itemId={item.id} notes={notes} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>点击记录</h2>
            <span className="section-count">最近 {clicks.length} 次</span>
          </div>
          {clicks.length === 0 ? (
            <p className="faint small" style={{ padding: '18px 0' }}>
              还没有点击记录。
            </p>
          ) : (
            <ul className="rows">
              {clicks.map((c) => (
                <li key={c.id} className="row" style={{ padding: '10px 0' }}>
                  <p className="row-meta">
                    <span>{formatDateTime(c.clicked_at)}</span>
                    <span>{c.source}</span>
                    {c.referrer ? (
                      <span className="faint">{c.referrer.slice(0, 60)}</span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2>操作</h2>
          </div>
          <div style={{ paddingTop: 16 }}>
            <ItemActions
              itemId={item.id}
              status={item.status}
              read={Boolean(item.read_at)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
