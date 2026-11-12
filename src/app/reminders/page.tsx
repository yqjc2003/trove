import Link from 'next/link';

import { getServerContext } from '@/lib/server-context';
import { listReminders } from '@/lib/services/reminders';
import { EmptyState } from '@/components/StatBlock';
import { ReminderPanel } from '@/components/ReminderPanel';

export const dynamic = 'force-dynamic';

export default async function RemindersPage() {
  const ctx = await getServerContext();
  if (!ctx) return null;

  const [reminders, profile] = await Promise.all([
    listReminders(ctx),
    ctx.db.getProfile(),
  ]);

  const days = profile?.reminder_days ?? 14;

  return (
    <main className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>待回看清单</h1>
            <p className="page-sub">
              收藏超过 {days} 天且从未打开过的条目。
            </p>
          </div>
          <Link href="/" className="btn">回到单条回看</Link>
        </div>

        {reminders.length === 0 ? (
          <EmptyState
            title="没有积压的收藏"
            text="所有收藏要么还没到提醒阈值，要么你已经看过了。"
          />
        ) : (
          <>
            <ReminderPanel entries={reminders} />
            <p className="small faint" style={{ marginTop: 24 }}>
              当前显示最早的至多 200 条未读收藏中符合阈值的条目。完整结果可在 <Link href="/items?overdue=true">藏库待回看镜头</Link> 翻页查看；阈值可在 <Link href="/settings">我的语言</Link> 调整。
            </p>
          </>
        )}
      </div>
    </main>
  );
}
