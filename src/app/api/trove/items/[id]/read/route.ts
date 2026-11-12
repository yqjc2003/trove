import { withAuth, readJson } from '@/lib/http';
import { AppError } from '@/lib/domain/errors';
import { updateItem } from '@/lib/services/items';

/** POST /api/trove/items/{id}/read —— 标记 / 取消标记已读 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    const body = await readJson(req);

    if (typeof body.read !== 'boolean') {
      throw new AppError('VALIDATION_ERROR', 'read 必须是布尔值');
    }

    const item = await updateItem(serviceCtx, id, { read: body.read });
    return { read_at: item.read_at };
  });
}
