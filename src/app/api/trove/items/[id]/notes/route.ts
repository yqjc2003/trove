import { withAuth, readJson } from '@/lib/http';
import { addNote, listNotes } from '@/lib/services/notes';

/** GET /api/trove/items/{id}/notes —— 列出某收藏的全部笔记 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    return { notes: await listNotes(serviceCtx, id) };
  });
}

/** POST /api/trove/items/{id}/notes —— 追加一条 Markdown 笔记 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (serviceCtx) => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const note = await addNote(serviceCtx, id, String(body.body_md ?? ''));
    return { note };
  });
}
