import { withAuth } from '@/lib/http';
import { getStats } from '@/lib/services/reminders';

/** GET /api/trove/stats —— 统计概览 */
export async function GET(req: Request) {
  return withAuth(req, async (ctx) => getStats(ctx));
}
