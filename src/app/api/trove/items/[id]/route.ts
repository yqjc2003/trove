import { withAuth, readJson } from '@/lib/http';
import { deleteItem, getItem, updateItem } from '@/lib/services/items';
import type { ContentType } from '@/lib/domain/content-type';

/** GET /api/trove/items/{id} —— 详情（含笔记与最近点击） */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    const { item, notes } = await getItem(serviceCtx, id);
    const clicks = await serviceCtx.db.listClicks(id, 20);
    return { item, notes, clicks };
  });
}

/** PATCH /api/trove/items/{id} —— 局部更新 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    return updateItem(serviceCtx, id, {
      title: body.title === undefined ? undefined : String(body.title),
      summary: body.summary === undefined ? undefined : String(body.summary),
      tags: body.tags === undefined ? undefined : (body.tags as string[]),
      content_type: body.content_type as ContentType | undefined,
      status: body.status as 'active' | 'archived' | undefined,
      read: body.read === undefined ? undefined : Boolean(body.read),
      notes: body.notes === undefined ? undefined : String(body.notes),
      notes_mode: body.notes_mode as 'append' | 'replace' | undefined,
    });
  });
}

/** DELETE /api/trove/items/{id} —— 硬删除 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    await deleteItem(serviceCtx, id);
    return { deleted: true };
  });
}
