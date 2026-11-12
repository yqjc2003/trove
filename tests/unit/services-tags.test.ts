import { beforeEach, describe, expect, it } from 'vitest';

import { createTag, deleteTag, listTags, renameTag } from '@/lib/services/tags';
import { AppError } from '@/lib/domain/errors';
import { FakeTroveDb, fakeContext } from '../helpers/fake-db';

describe('标签服务', () => {
  let db: FakeTroveDb;

  beforeEach(() => {
    db = new FakeTroveDb();
  });

  it('新建标签', async () => {
    const ctx = fakeContext(db);
    const { tag, created } = await createTag(ctx, '读书');
    expect(created).toBe(true);
    expect(tag.name).toBe('读书');
    expect(tag.origin).toBe('user');
  });

  it('同名新建是幂等的，返回既有标签', async () => {
    const ctx = fakeContext(db);
    const first = await createTag(ctx, '读书');
    const second = await createTag(ctx, '读书');
    expect(second.created).toBe(false);
    expect(second.tag.id).toBe(first.tag.id);
    expect(db.tags.size).toBe(1);
  });

  it('标签名归一后再比较（# 与大小写）', async () => {
    const ctx = fakeContext(db);
    const first = await createTag(ctx, 'React');
    const second = await createTag(ctx, '#react');
    expect(second.created).toBe(false);
    expect(second.tag.id).toBe(first.tag.id);
  });

  it('改名不影响绑定关系', async () => {
    const ctx = fakeContext(db);
    const { tag } = await createTag(ctx, '读书');

    const item = {
      id: 'item-1',
      normalized_url: 'https://example.com/a',
    };
    db.items.set(item.normalized_url, {
      id: item.id,
      user_id: db.userId,
      url: item.normalized_url,
      normalized_url: item.normalized_url,
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
    db.itemTags.set(item.id, [tag.id]);

    const renamed = await renameTag(ctx, tag.id, '阅读');
    expect(renamed.name).toBe('阅读');
    expect(db.itemTags.get(item.id)).toEqual([tag.id]);
    expect(db.tags.get(tag.id)?.name).toBe('阅读');
  });

  it('改名撞名抛 TAG_NAME_CONFLICT', async () => {
    const ctx = fakeContext(db);
    await createTag(ctx, 'a');
    const b = await createTag(ctx, 'b');

    try {
      await renameTag(ctx, b.tag.id, 'a');
      throw new Error('应该抛错');
    } catch (e) {
      expect((e as AppError).code).toBe('TAG_NAME_CONFLICT');
    }
  });

  it('删除标签会从所有收藏上解绑，并返回解绑数量', async () => {
    const ctx = fakeContext(db);
    const { tag } = await createTag(ctx, '读书');

    db.itemTags.set('item-1', [tag.id]);
    db.itemTags.set('item-2', [tag.id]);

    const { unbound } = await deleteTag(ctx, tag.id);
    expect(unbound).toBe(2);
    expect(db.tags.has(tag.id)).toBe(false);
    expect(db.itemTags.get('item-1')).toEqual([]);
  });

  it('删除不存在的标签抛 NOT_FOUND', async () => {
    const ctx = fakeContext(db);
    await expect(deleteTag(ctx, 'missing')).rejects.toThrow(AppError);
  });

  it('列表带使用计数', async () => {
    const ctx = fakeContext(db);
    const { tag } = await createTag(ctx, '读书');
    db.itemTags.set('item-1', [tag.id]);

    const tags = await listTags(ctx);
    expect(tags).toHaveLength(1);
    expect(tags[0].count).toBe(1);
  });

  it('每个用户的标签空间互相隔离', async () => {
    const dbA = new FakeTroveDb('user-a');
    const dbB = new FakeTroveDb('user-b');

    await createTag(fakeContext(dbA), '仅A可见');

    const tagsB = await listTags(fakeContext(dbB));
    expect(tagsB).toHaveLength(0);
    expect(await dbB.getTagByName('仅a可见')).toBeNull();
  });

  it('空标签名抛 VALIDATION_ERROR', async () => {
    const ctx = fakeContext(db);
    await expect(createTag(ctx, '   ')).rejects.toThrow(AppError);
  });
});
