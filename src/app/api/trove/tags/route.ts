import { withAuth, readJson } from '@/lib/http';
import { createTag, listTags } from '@/lib/services/tags';

/** GET /api/trove/tags —— 标签列表（含使用计数） */
export async function GET(req: Request) {
  return withAuth(req, async (ctx) => {
    const tags = await listTags(ctx);
    return { tags };
  });
}

/** POST /api/trove/tags —— 新建标签（同名则幂等返回既有标签） */
export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const body = await readJson(req);
    const { tag, created } = await createTag(ctx, String(body.name ?? ''));
    return { tag: { ...tag, count: 0 }, created };
  });
}
