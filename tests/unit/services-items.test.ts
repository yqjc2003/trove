import { beforeEach, describe, expect, it } from 'vitest';

import { deleteItem, getItem, listItems, saveItem, saveItems } from '@/lib/services/items';
import { AppError } from '@/lib/domain/errors';
import { FakeTroveDb, fakeContext } from '../helpers/fake-db';

describe('items 服务', () => {
  let db: FakeTroveDb;

  beforeEach(() => {
    db = new FakeTroveDb();
  });

  it('保存后能列表查询到，并带上标签', async () => {
    const ctx = fakeContext(db);
    await saveItem(ctx, {
      url: 'https://example.com/a',
      title: '标题 A',
      tags: ['标签一'],
    });

    const result = await listItems(ctx, { status: 'active' });
    expect(result.total).toBe(1);
    expect(result.items[0].tags?.map((t) => t.name)).toEqual(['标签一']);
  });

  it('批量里单条失败不影响其余', async () => {
    const ctx = fakeContext(db);

    const result = await saveItems(ctx, [
      { url: 'https://example.com/ok', title: '好数据' },
      { url: 'bad-url', title: '坏数据' },
      { url: 'https://example.com/ok2', title: '好数据 2' },
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(1);
  });

  it('缺 title 抛 VALIDATION_ERROR', async () => {
    const ctx = fakeContext(db);
    await expect(saveItem(ctx, { url: 'https://example.com/a' })).rejects.toThrow(
      AppError,
    );
  });

  it('title 超长抛 VALIDATION_ERROR', async () => {
    const ctx = fakeContext(db);
    await expect(
      saveItem(ctx, { url: 'https://example.com/a', title: 'x'.repeat(301) }),
    ).rejects.toThrow(AppError);
  });

  it('按关键词检索命中标题 / 摘要 / URL', async () => {
    const ctx = fakeContext(db);
    await saveItem(ctx, {
      url: 'https://example.com/alpha',
      title: '向量数据库选型',
      summary: '关于检索的笔记',
    });
    await saveItem(ctx, { url: 'https://other.com/beta', title: '无关内容' });

    expect((await listItems(ctx, { q: '向量' })).total).toBe(1);
    expect((await listItems(ctx, { q: '检索' })).total).toBe(1);
    expect((await listItems(ctx, { q: 'alpha' })).total).toBe(1);
    expect((await listItems(ctx, { q: '不存在的东西' })).total).toBe(0);
  });

  it('按域名与内容形态过滤', async () => {
    const ctx = fakeContext(db);
    await saveItem(ctx, { url: 'https://github.com/a/b', title: '仓库' });
    await saveItem(ctx, { url: 'https://example.com/post', title: '文章' });

    expect((await listItems(ctx, { domain: 'github.com' })).total).toBe(1);
    expect((await listItems(ctx, { content_type: 'repo' })).total).toBe(1);
    expect((await listItems(ctx, { content_type: 'article' })).total).toBe(1);
  });

  it('按标签过滤是 AND 语义', async () => {
    const ctx = fakeContext(db);
    await saveItem(ctx, { url: 'https://example.com/1', title: 'A', tags: ['x', 'y'] });
    await saveItem(ctx, { url: 'https://example.com/2', title: 'B', tags: ['x'] });

    expect((await listItems(ctx, { tags: ['x'] })).total).toBe(2);
    expect((await listItems(ctx, { tags: ['x', 'y'] })).total).toBe(1);
  });

  it('默认只返回 active，status=all 才包含归档', async () => {
    const ctx = fakeContext(db);
    const saved = await saveItem(ctx, { url: 'https://example.com/a', title: 'T' });
    await db.updateItem(saved.id, { status: 'archived' });

    expect((await listItems(ctx, { status: 'active' })).total).toBe(0);
    expect((await listItems(ctx, { status: 'archived' })).total).toBe(1);
    expect((await listItems(ctx, { status: 'all' })).total).toBe(1);
  });

  it('详情返回 item + notes', async () => {
    const ctx = fakeContext(db);
    const saved = await saveItem(ctx, {
      url: 'https://example.com/a',
      title: 'T',
      notes: '笔记内容',
    });

    const detail = await getItem(ctx, saved.id);
    expect(detail.item.title).toBe('T');
    expect(detail.notes).toHaveLength(1);
  });

  it('删除不存在的收藏抛 NOT_FOUND', async () => {
    const ctx = fakeContext(db);
    await expect(deleteItem(ctx, 'missing')).rejects.toThrow(AppError);
  });

  it('删除后条目消失', async () => {
    const ctx = fakeContext(db);
    const saved = await saveItem(ctx, { url: 'https://example.com/a', title: 'T' });

    await deleteItem(ctx, saved.id);
    expect((await listItems(ctx, { status: 'all' })).total).toBe(0);
  });
});
