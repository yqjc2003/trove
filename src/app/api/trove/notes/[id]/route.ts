import { withAuth, readJson } from '@/lib/http';
import { deleteNote, updateNote } from '@/lib/services/notes';

/** PATCH /api/trove/notes/{id} —— 编辑笔记 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const note = await updateNote(serviceCtx, id, String(body.body_md ?? ''));
    return { note };
  });
}

/** DELETE /api/trove/notes/{id} —— 删除笔记 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    await deleteNote(serviceCtx, id);
    return { deleted: true };
  });
}
