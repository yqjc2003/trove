import Link from 'next/link';

import { formatDate } from '@/lib/format';
import type { Item } from '@/types';
import { SOURCE_LABELS, TYPE_LABELS } from '@/lib/ui-labels';

export function ItemRow({
  item,
  actions,
}: {
  item: Item;
  actions?: React.ReactNode;
}) {
  return (
    <li className="row">
      <p className="row-title">
        <Link href={`/items/${item.id}`}>{item.title}</Link>
      </p>
      <p className="row-meta">
        <span translate="no">{item.domain}</span>
        <span>{TYPE_LABELS[item.content_type]}</span>
        <span>收藏于 {formatDate(item.collected_at)}</span>
        {item.click_count > 0 ? <span>打开 {item.click_count} 次</span> : null}
        {!item.read_at ? <span>未读</span> : <span>已读</span>}
        {item.status === 'archived' ? <span>已归档</span> : null}
      </p>
      {item.summary ? <p className="row-summary">{item.summary}</p> : null}
      {item.tags && item.tags.length > 0 ? (
        <div className="tags">
          {item.tags.map((t) => (
            <Link key={t.id} className="tag" href={`/items?tag=${encodeURIComponent(t.name)}`}>
              {t.name}
            </Link>
          ))}
        </div>
      ) : null}
      {actions ? <div className="row-actions">{actions}</div> : null}
      <div className="row-tail"><span>{SOURCE_LABELS[item.source]}</span><a href={`/r/${item.id}`} target="_blank" rel="noopener noreferrer" aria-label={`打开原文：${item.title}（新标签页）`}>打开原文 ↗</a></div>
    </li>
  );
}
