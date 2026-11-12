import { withAuth } from '@/lib/http';
import { listReminders } from '@/lib/services/reminders';

/** GET /api/trove/reminders —— 超期清单（收藏超过阈值天数且从未阅读） */
export async function GET(req: Request) {
  return withAuth(req, async (ctx) => {
    const reminders = await listReminders(ctx);
    return { reminders };
  });
}
