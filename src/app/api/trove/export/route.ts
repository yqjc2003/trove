import { withAuth } from '@/lib/http';

/** GET /api/trove/export —— 全量 JSON 导出 */
export async function GET(req: Request) {
  return withAuth(req, async (ctx) => ctx.db.exportAll());
}
