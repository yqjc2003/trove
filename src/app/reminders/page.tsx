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
            <h1>待读</h1>
            <p className="page-sub">
              收藏超过 {days} 天且从未打开过的条目。
            </p>
          </div>
          <span className="section-count">{reminders.length} 条</span>
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
              提醒阈值可在
              <Link href="/settings"> 设置页 </Link>
              调整。
            </p>
          </>
        )}
      </div>
    </main>
  );
}
