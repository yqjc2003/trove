import { beforeEach, describe, expect, it } from 'vitest';

import { saveItem, saveItems, updateItem } from '@/lib/services/items';
import { AppError } from '@/lib/domain/errors';
import { FakeTroveDb, fakeContext } from '../helpers/fake-db';

describe('upsert（重复录入）', () => {
  let db: FakeTroveDb;

  beforeEach(() => {
    db = new FakeTroveDb();
  });

  const URL_A = 'https://example.com/article';

  it('① 同 URL 二次提交 → created=false，且 items 仍为 1 条', async () => {
    const ctx = fakeContext(db);

    const first = await saveItem(ctx, {
      url: URL_A,
      title: '原始标题',
      summary: '原始摘要',
      tags: ['a'],
    });
    expect(first.created).toBe(true);

    const second = await saveItem(ctx, {
      url: URL_A,
      title: '新标题',
      summary: '新摘要',
      tags: ['b'],
    });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(db.items.size).toBe(1);
  });

  it('② 缺省 tags → 原标签保留', async () => {
    const ctx = fakeContext(db);

    await saveItem(ctx, { url: URL_A, title: 'T', tags: ['数据库', '向量检索'] });

    const second = await saveItem(ctx, { url: URL_A, title: '新标题' });
    expect(new Set(second.tags)).toEqual(new Set(['数据库', '向量检索']));
  });

  it('③ 传了 tags → 整体替换', async () => {
    const ctx = fakeContext(db);

    await saveItem(ctx, { url: URL_A, title: 'T', tags: ['a', 'b'] });
    const second = await saveItem(ctx, { url: URL_A, title: 'T', tags: ['c'] });

    expect(second.tags).toEqual(['c']);
    expect(second.tags).not.toContain('a');
  });

  it('④ 缺省 summary → 原值保留；传入 → 覆盖', async () => {
    const ctx = fakeContext(db);

    await saveItem(ctx, { url: URL_A, title: 'T', summary: '原始摘要' });

    const withoutSummary = await saveItem(ctx, { url: URL_A, title: 'T2' });
    const item = await db.getItem(withoutSummary.id);
    expect(item?.summary).toBe('原始摘要');

    const withSummary = await saveItem(ctx, { url: URL_A, title: 'T3', summary: '新摘要' });
    const item2 = await db.getItem(withSummary.id);
    expect(item2?.summary).toBe('新摘要');
  });

  it('⑤ collected_at / status / read_at / click_count 在 upsert 后全部不变', async () => {
    const ctx = fakeContext(db);

    const first = await saveItem(ctx, { url: URL_A, title: 'T' });

    // 制造「已读 + 已归档 + 有点击」的既有状态
    await db.updateItem(first.id, {
      read_at: '2026-05-01T00:00:00.000Z',
      status: 'archived',
      archived_at: '2026-05-02T00:00:00.000Z',
      click_count: 7,
    });

    const before = await db.getItem(first.id);

    await saveItem(ctx, { url: URL_A, title: '新标题', summary: '新摘要' });

    const after = await db.getItem(first.id);
    expect(after?.collected_at).toBe(before?.collected_at);
    expect(after?.status).toBe('archived');
    expect(after?.archived_at).toBe(before?.archived_at);
    expect(after?.read_at).toBe(before?.read_at);
    expect(after?.click_count).toBe(7);
    expect(after?.title).toBe('新标题');
    expect(after?.updated_at).not.toBe(before?.updated_at);
  });

  it('⑥ notes 追加而非覆盖', async () => {
    const ctx = fakeContext(db);

    const first = await saveItem(ctx, {
      url: URL_A,
      title: 'T',
      notes: '第一条笔记',
    });
    await saveItem(ctx, { url: URL_A, title: 'T', notes: '第二条笔记' });

    const notes = await db.listNotes(first.id);
    expect(new Set(notes.map((n) => n.body_md))).toEqual(
      new Set(['第一条笔记', '第二条笔记']),
    );
  });

  it('⑦ 批量响应满足 created + updated + errors.length = 提交条数', async () => {
    const ctx = fakeContext(db);

    const result = await saveItems(ctx, [
      { url: 'https://a.com/1', title: 'A' },
      { url: 'https://b.com/2', title: 'B' },
      { url: 'https://a.com/1', title: 'A 再来一次' },
      { url: 'not-a-url', title: '坏数据' },
    ]);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.created + result.updated + result.errors.length).toBe(4);
    expect(result.errors[0].index).toBe(3);
  });

  it('⑧ 规范化等价的 URL 命中同一条', async () => {
    const ctx = fakeContext(db);

    const a = await saveItem(ctx, { url: 'https://x.com/a?utm_source=t', title: 'T1' });
    const b = await saveItem(ctx, { url: 'https://www.x.com/a', title: 'T2' });
    const c = await saveItem(ctx, { url: 'https://x.com/a#frag', title: 'T3' });

    expect(b.created).toBe(false);
    expect(c.created).toBe(false);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(db.items.size).toBe(1);
  });

  it('标签超限时既不创建 item 也不动原标签', async () => {
    const ctx = fakeContext(db);

    await saveItem(ctx, { url: URL_A, title: 'T', tags: ['a', 'b'] });

    await expect(
      saveItem(ctx, { url: 'https://other.com/x', title: 'T2', tags: ['a', 'b', 'c', 'd'] }),
    ).rejects.toThrow(AppError);

    // 被拒的那条没有落库
    expect(db.items.size).toBe(1);

    // 原有标签没被动过
    const item = await db.getItemByNormalizedUrl('https://example.com/article');
    const tags = await db.getTagsForItems([item!.id]);
    expect(tags.get(item!.id)!.map((t) => t.name).sort()).toEqual(['a', 'b']);
  });

  it('新建时写入自动识别的 content_type；已有条目缺省时保留原值', async () => {
    const ctx = fakeContext(db);

    const created = await saveItem(ctx, { url: 'https://github.com/a/b', title: 'T' });
    const item1 = await db.getItem(created.id);
    expect(item1?.content_type).toBe('repo');

    // 显式指定 → 覆盖
    await saveItem(ctx, { url: 'https://github.com/a/b', title: 'T', content_type: 'tool' });
    const item2 = await db.getItem(created.id);
    expect(item2?.content_type).toBe('tool');

    // 不指定 → 保留上一次的值
    await saveItem(ctx, { url: 'https://github.com/a/b', title: 'T' });
    const item3 = await db.getItem(created.id);
    expect(item3?.content_type).toBe('tool');
  });

  it('url 与 normalized_url 在 upsert 后保持首次收藏的值', async () => {
    const ctx = fakeContext(db);

    await saveItem(ctx, { url: 'https://example.com/a', title: 'T' });
    await saveItem(ctx, { url: 'https://example.com/a?utm_source=x', title: 'T' });

    const item = await db.getItemByNormalizedUrl('https://example.com/a');
    expect(item?.url).toBe('https://example.com/a');
  });
});

describe('updateItem', () => {
  it('显式 read:false 可以重置已读状态', async () => {
    const db = new FakeTroveDb();
    const ctx = fakeContext(db);

    const saved = await saveItem(ctx, { url: 'https://example.com/a', title: 'T' });
    await db.updateItem(saved.id, { read_at: '2026-05-01T00:00:00.000Z' });

    const updated = await updateItem(ctx, saved.id, { read: false });
    expect(updated.read_at).toBeNull();

    const read = await updateItem(ctx, saved.id, { read: true });
    expect(read.read_at).not.toBeNull();
  });

  it('归档与取消归档互为逆操作', async () => {
    const db = new FakeTroveDb();
    const ctx = fakeContext(db);

    const saved = await saveItem(ctx, { url: 'https://example.com/a', title: 'T' });
    const archived = await updateItem(ctx, saved.id, { status: 'archived' });
    expect(archived.status).toBe('archived');
    expect(archived.archived_at).not.toBeNull();

    const restored = await updateItem(ctx, saved.id, { status: 'active' });
    expect(restored.status).toBe('active');
    expect(restored.archived_at).toBeNull();
  });

  it('不存在的收藏抛 NOT_FOUND', async () => {
    const ctx = fakeContext(new FakeTroveDb());
    await expect(updateItem(ctx, 'missing', { title: 'x' })).rejects.toThrow(
      AppError,
    );
  });
});
