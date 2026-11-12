import { daysOverdue, isOverdue, overdueCutoff } from '@/lib/domain/reminders';
import type { ReminderEntry, Stats } from '@/types';
import type { ServiceContext } from './context';

/** 超期清单：收藏超过阈值天数且从未阅读。 */
export async function listReminders(
  ctx: ServiceContext,
): Promise<ReminderEntry[]> {
  const profile = await ctx.db.getProfile();
  const threshold = profile?.reminder_days ?? 14;
  const now = new Date();

  const result = await ctx.db.listItems({
    status: 'active',
    read: 'unread',
    limit: 200,
    sort: 'collected_at',
    order: 'asc',
  });

  const tagMap = await ctx.db.getTagsForItems(result.items.map((i) => i.id));

  return result.items
    .filter((item) => isOverdue(item, threshold, now))
    .map((item) => ({
      item: { ...item, tags: tagMap.get(item.id) ?? [] },
      days_overdue: daysOverdue(item.collected_at, now),
    }));
}

/** 统计概览。 */
export async function getStats(ctx: ServiceContext): Promise<Stats> {
  const profile = await ctx.db.getProfile();
  const threshold = profile?.reminder_days ?? 14;
  const now = new Date();

  const [all, tags, tagUsage] = await Promise.all([
    ctx.db.listItems({ status: 'all', limit: 200, sort: 'collected_at', order: 'desc' }),
    ctx.db.listTags(),
    ctx.db.countTagUsage(),
  ]);

  const items = all.items;
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const bySource = new Map<string, number>();
  const byContentType = new Map<string, number>();
  const byDomain = new Map<string, number>();

  let active = 0;
  let archived = 0;
  let unread = 0;
  let overdue = 0;
  let added7d = 0;

  for (const item of items) {
    if (item.status === 'active') active += 1;
    else archived += 1;

    if (!item.read_at) unread += 1;
    if (isOverdue(item, threshold, now)) overdue += 1;
    if (new Date(item.collected_at).getTime() >= weekAgo.getTime()) added7d += 1;

    bySource.set(item.source, (bySource.get(item.source) ?? 0) + 1);
    byContentType.set(item.content_type, (byContentType.get(item.content_type) ?? 0) + 1);
    byDomain.set(item.domain, (byDomain.get(item.domain) ?? 0) + 1);
  }

  const byTag = tags
    .map((t) => ({ name: t.name, count: tagUsage.get(t.name) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    total: items.length,
    active,
    archived,
    unread,
    overdue,
    added_7d: added7d,
    by_tag: byTag,
    by_source: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    by_content_type: [...byContentType.entries()]
      .map(([content_type, count]) => ({ content_type, count }))
      .sort((a, b) => b.count - a.count),
    top_domains: [...byDomain.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

export { overdueCutoff };
