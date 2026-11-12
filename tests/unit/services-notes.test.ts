import { describe, expect, it } from 'vitest';

import { addNote, deleteNote, listNotes, updateNote } from '@/lib/services/notes';
import { AppError } from '@/lib/domain/errors';
import { FakeTroveDb, fakeContext } from '../helpers/fake-db';

function seedItem(db: FakeTroveDb, id = 'item-1') {
  const normalized = `https://example.com/${id}`;
  db.items.set(normalized, {
    id,
    user_id: db.userId,
    url: normalized,
    normalized_url: normalized,
    domain: 'example.com',
    title: 'T',
    summary: null,
    content_excerpt: null,
    content_type: 'article',
    source: 'manual',
    source_ref: null,
    status: 'active',
    archived_at: null,
    collected_at: '2026-01-01T00:00:00.000Z',
    read_at: null,
    click_count: 0,
    last_clicked_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  return id;
}

describe('笔记服务', () => {
  it('新增笔记', async () => {
    const db = new FakeTroveDb();
    const ctx = fakeContext(db);
    const itemId = seedItem(db);

    const note = await addNote(ctx, itemId, '# 标题\n\n正文');
    expect(note.body_md).toBe('# 标题\n\n正文');
    expect(note.item_id).toBe(itemId);
  });

  it('多条笔记按时间倒序列出', async () => {
    const db = new FakeTroveDb();
    const ctx = fakeContext(db);
    const itemId = seedItem(db);

    await addNote(ctx, itemId, '第一条');
    await addNote(ctx, itemId, '第二条');

    const notes = await listNotes(ctx, itemId);
    expect(notes).toHaveLength(2);
  });

  it('编辑笔记', async () => {
    const db = new FakeTroveDb();
    const ctx = fakeContext(db);
    const itemId = seedItem(db);

    const note = await addNote(ctx, itemId, '旧内容');
    const updated = await updateNote(ctx, note.id, '新内容');

    expect(updated.body_md).toBe('新内容');
  });

  it('删除笔记', async () => {
    const db = new FakeTroveDb();
    const ctx = fakeContext(db);
    const itemId = seedItem(db);

    const note = await addNote(ctx, itemId, '内容');
    expect(await deleteNote(ctx, note.id)).toBe(true);
    expect(await listNotes(ctx, itemId)).toHaveLength(0);
  });

  it('收藏不存在时抛 NOT_FOUND', async () => {
    const ctx = fakeContext(new FakeTroveDb());
    await expect(addNote(ctx, 'missing', 'x')).rejects.toThrow(AppError);
  });

  it('笔记不存在时抛 NOT_FOUND', async () => {
    const ctx = fakeContext(new FakeTroveDb());
    await expect(updateNote(ctx, 'missing', 'x')).rejects.toThrow(AppError);
    await expect(deleteNote(ctx, 'missing')).rejects.toThrow(AppError);
  });

  it('空笔记正文抛 VALIDATION_ERROR', async () => {
    const db = new FakeTroveDb();
    const ctx = fakeContext(db);
    const itemId = seedItem(db);
    await expect(addNote(ctx, itemId, '   ')).rejects.toThrow(AppError);
  });
});
