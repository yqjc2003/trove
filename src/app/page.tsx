import Link from 'next/link';
import { getServerContext } from '@/lib/server-context';
import { getStats, listReminders } from '@/lib/services/reminders';
import { listItems } from '@/lib/services/items';
import { ReviewDesk } from '@/components/ReviewDesk';
import { LandingPage } from '@/components/LandingPage';
import { AgentSetupGuide } from '@/components/AgentSetupGuide';

export const dynamic = 'force-dynamic';
export default async function DashboardPage() {
  const ctx = await getServerContext();
  if (!ctx) return <LandingPage />;
  const [stats, reminders, unread, keys] = await Promise.all([
    getStats(ctx),
    listReminders(ctx),
    listItems(ctx, {
      status: 'active',
      read: 'unread',
      limit: 100,
      sort: 'collected_at',
      order: 'asc',
    }),
    ctx.db.listApiKeys(),
  ]);
  const apiBase = `${(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/api/trove`;
  const needsAgentSetup = stats.total === 0 && !keys.some((key) => !key.revoked_at);
  const items = reminders.length
    ? reminders.slice(0, 100).map((r) => r.item)
    : unread.items;
  return (
    <main className="page">
      <div className="wrap wrap-wide">
        <header className="page-head">
          <div>
            <h1>今天，先回收一条。</h1>
            <p className="page-sub">曾经收下的好东西，值得再打开一次。</p>
          </div>
          <Link className="small muted" href="/items?read=unread">
            查看未读收藏
          </Link>
        </header>
        <div className="workspace">
          {needsAgentSetup ? (
            <AgentSetupGuide apiBase={apiBase} />
          ) : (
            <ReviewDesk items={items} overdue={reminders.length > 0} />
          )}
          <aside className="context-rail">
            <h2>你的藏库</h2>
            <p className="small faint">最近至多 200 条收藏的概况</p>
            <dl className="quiet-stats">
              <div>
                <dt>收藏</dt>
                <dd>{stats.total}</dd>
              </div>
              <div>
                <dt>未读</dt>
                <dd>{stats.unread}</dd>
              </div>
              <div>
                <dt>待回看</dt>
                <dd>{stats.overdue}</dd>
              </div>
              <div>
                <dt>本周收集</dt>
                <dd>{stats.added_7d}</dd>
              </div>
            </dl>
            <p className="small muted">
              {reminders.length
                ? '先回看超过提醒阈值的链接。'
                : '从最早收下、还未打开的链接开始。'}
              每轮最多呈现 100 条候选。
            </p>
            <div className="rail-section">
              <h2>顺着主题走</h2>
              <div className="rail-links">
                {stats.by_tag.slice(0, 6).map((t) => (
                  <Link
                    key={t.name}
                    href={`/items?tag=${encodeURIComponent(t.name)}`}
                  >
                    {t.name}
                    <span>{t.count}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="rail-section">
              <Link href="/stream">看看最近收下了什么</Link>
              <p className="small faint">
                链接由 Agent 整理，你决定它们的价值。
              </p>
            </div>
            {stats.total === 0 ? (
              <div className="rail-section">
                <Link className="btn" href="/items/new">
                  收下第一条链接
                </Link>
                <p className="page-sub">
                  {needsAgentSetup ? '或者在左侧连接你的 Agent。' : <Link href="/settings#connections">管理你的 Agent 连接</Link>}
                </p>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
