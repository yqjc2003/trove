import { withAuth, readJson } from '@/lib/http';
import { deleteTag, renameTag } from '@/lib/services/tags';

/** PATCH /api/trove/tags/{id} —— 改名（绑定关系不变） */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const tag = await renameTag(serviceCtx, id, String(body.name ?? ''));
    return { tag };
  });
}

/** DELETE /api/trove/tags/{id} —— 删除标签（级联解绑） */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    const { unbound } = await deleteTag(serviceCtx, id);
    return { deleted: true, unbound };
  });
}
