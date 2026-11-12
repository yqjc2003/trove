import Link from 'next/link';

import { getServerContext } from '@/lib/server-context';
import { getStats, listReminders } from '@/lib/services/reminders';
import { listItems } from '@/lib/services/items';
import { EmptyState, StatBlock } from '@/components/StatBlock';
import { ItemRow } from '@/components/ItemRow';
import { ReminderPanel } from '@/components/ReminderPanel';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await getServerContext();
  if (!ctx) return null;

  const [stats, reminders, recent] = await Promise.all([
    getStats(ctx),
    listReminders(ctx),
    listItems(ctx, { status: 'active', limit: 10, sort: 'collected_at', order: 'desc' }),
  ]);

  return (
    <main className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>概览</h1>
            <p className="page-sub">收藏的总量、待读与超期情况。</p>
          </div>
        </div>

        <div className="stats">
          <StatBlock value={stats.total} label="总收藏" />
          <StatBlock value={stats.unread} label="未读" />
          <StatBlock value={stats.overdue} label="超期未读" alert={stats.overdue > 0} />
          <StatBlock value={stats.added_7d} label="近 7 天新增" />
        </div>

        <section className="section">
          <div className="section-head">
            <h2>超期提醒</h2>
            <span className="section-count">{reminders.length} 条</span>
          </div>
          {reminders.length === 0 ? (
            <EmptyState
              title="没有超期未读的收藏"
              text="收藏超过提醒阈值且从未打开过的条目会出现在这里。"
            />
          ) : (
            <ReminderPanel entries={reminders} />
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2>最近收藏</h2>
            <Link href="/items" className="small muted">
              查看全部
            </Link>
          </div>
          {recent.items.length === 0 ? (
            <EmptyState
              title="还没有收藏"
              text="用 Skill 或 MCP 把链接收进来，或在设置页生成 API Key。"
            />
          ) : (
            <ul className="rows">
              {recent.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
