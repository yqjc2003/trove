import Link from 'next/link';

import { formatDate } from '@/lib/format';
import type { Item } from '@/types';
import { getSourceLabels, getTypeLabels } from '@/lib/ui-labels';
import { translate, type Locale } from '@/lib/i18n';

export function ItemRow({
  item,
  actions,
  locale = 'zh-CN',
}: {
  item: Item;
  actions?: React.ReactNode;
  locale?: Locale;
}) {
  const typeLabels = getTypeLabels(locale);
  const sourceLabels = getSourceLabels(locale);
  return (
    <li className="row">
      <p className="row-title">
        <a href={`/r/${item.id}`} target="_blank" rel="noopener noreferrer">
          {item.title}
          <span className="sr-only">{translate(locale, 'item.openNewTab')}</span>
        </a>
      </p>
      <p className="row-meta">
        <span translate="no">{item.domain}</span>
        <span>{typeLabels[item.content_type]}</span>
        <span>{translate(locale, 'item.savedOn', { date: formatDate(item.collected_at) })}</span>
        {item.click_count > 0 ? <span>{translate(locale, 'item.opened', { count: item.click_count })}</span> : null}
        {!item.read_at ? <span>{translate(locale, 'item.unread')}</span> : <span>{translate(locale, 'item.read')}</span>}
        {item.status === 'archived' ? <span>{translate(locale, 'item.archived')}</span> : null}
      </p>
      {item.summary ? <p className="row-summary">{item.summary}</p> : null}
      {item.tags && item.tags.length > 0 ? (
        <div className="tags">
          {item.tags.map((t) => (
            <Link
              key={t.id}
              className="tag"
              href={`/items?tag=${encodeURIComponent(t.name)}`}
            >
              {t.name}
            </Link>
          ))}
        </div>
      ) : null}
      {actions ? <div className="row-actions">{actions}</div> : null}
      <div className="row-tail">
        <span>{sourceLabels[item.source]}</span>
        <Link
          className="btn-quiet"
          href={`/items/${item.id}`}
          aria-label={translate(locale, 'item.detailsAria', { title: item.title })}
        >
          {translate(locale, 'item.details')}
        </Link>
      </div>
    </li>
  );
}
