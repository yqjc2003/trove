import { AppError } from '@/lib/domain/errors';
import { MAX_NOTE_LENGTH, assertString } from '@/lib/domain/validation';
import type { Note } from '@/types';
import type { ServiceContext } from './context';
import { notifyWebhook } from './webhook';

/** 追加一条 Markdown 笔记。 */
export async function addNote(
  ctx: ServiceContext,
  itemId: string,
  rawBody: string,
): Promise<Note> {
  const item = await ctx.db.getItem(itemId);
  if (!item) throw new AppError('NOT_FOUND', '收藏不存在');

  const body = assertString(rawBody, 'body_md', {
    required: true,
    maxLength: MAX_NOTE_LENGTH,
  })!;

  const created = await ctx.db.createNote(itemId, body);
  await notifyWebhook(ctx, itemId, 'note.changed');
  return created;
}

/** 编辑一条笔记（必须属于当前用户）。 */
export async function updateNote(
  ctx: ServiceContext,
  noteId: string,
  rawBody: string,
): Promise<Note> {
  const note = await ctx.db.getNote(noteId);
  if (!note) throw new AppError('NOT_FOUND', '笔记不存在');

  const body = assertString(rawBody, 'body_md', {
    required: true,
    maxLength: MAX_NOTE_LENGTH,
  })!;

  const updated = await ctx.db.updateNote(noteId, body);
  if (!updated) throw new AppError('NOT_FOUND', '笔记不存在');
  await notifyWebhook(ctx, note.item_id, 'note.changed');
  return updated;
}

/** 删除一条笔记。 */
export async function deleteNote(
  ctx: ServiceContext,
  noteId: string,
): Promise<boolean> {
  const note = await ctx.db.getNote(noteId);
  if (!note) throw new AppError('NOT_FOUND', '笔记不存在');
  const deleted = await ctx.db.deleteNote(noteId);
  if (deleted) await notifyWebhook(ctx, note.item_id, 'note.changed');
  return deleted;
}

export async function listNotes(ctx: ServiceContext, itemId: string): Promise<Note[]> {
  return ctx.db.listNotes(itemId);
}
