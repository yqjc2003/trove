import Link from 'next/link';

import { formatDate } from '@/lib/format';
import type { ReminderEntry } from '@/types';

/** 超期提醒清单：收藏超过阈值天数且从未阅读。 */
export function ReminderPanel({
  entries,
  showLink = true,
}: {
  entries: ReminderEntry[];
  showLink?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <p className="empty-text" style={{ padding: '18px 0' }}>
        暂时没有超期未读的收藏。
      </p>
    );
  }

  return (
    <ul className="rows">
      {entries.map(({ item, days_overdue }) => (
        <li key={item.id} className="row">
          <p className="row-title">
            <Link href={`/items/${item.id}`}>{item.title}</Link>
          </p>
          <p className="row-meta">
            <span>{item.domain}</span>
            <span>收藏于 {formatDate(item.collected_at)}</span>
            <span>已收下 {days_overdue} 天</span>
          </p>
          {showLink ? <div className="row-actions"><a className="btn" href={`/r/${item.id}`} target="_blank" rel="noopener noreferrer">打开并阅读<span className="sr-only">（新标签页）</span></a></div> : null}
        </li>
      ))}
    </ul>
  );
}
