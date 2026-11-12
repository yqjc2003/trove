import { describe, expect, it, beforeAll, afterAll } from 'vitest';

/**
 * 集成测试：需要真实的 Supabase 项目与已部署的应用。
 *
 * 默认 **skip** —— 不配置环境变量时整组跳过，不影响离线单测。
 *
 *   TROVE_TEST_APP_URL      应用地址（REST API 基址），例如 https://trove.vercel.app
 *   TROVE_TEST_SUPABASE_URL Supabase 项目地址
 *   TROVE_TEST_SERVICE_KEY  service role key（用于直接读写数据库验证触发器）
 *   TROVE_TEST_KEY          一个 trv_ API Key（属于测试用户）
 *   TROVE_TEST_KEY_B        可选：另一个用户的 API Key，用于验证跨用户隔离
 */

const APP_URL = process.env.TROVE_TEST_APP_URL;
const URL = process.env.TROVE_TEST_SUPABASE_URL;
const SERVICE_KEY = process.env.TROVE_TEST_SERVICE_KEY;
const KEY_A = process.env.TROVE_TEST_KEY;
const KEY_B = process.env.TROVE_TEST_KEY_B;

const enabled = Boolean(APP_URL && URL && SERVICE_KEY && KEY_A);

const API = `${APP_URL}/api/trove`;

/** 本文件造的条目 URL 前缀 —— 清理时只按前缀匹配，绝不误删用户真实收藏。 */
const TEST_URL_PREFIX = 'https://example.com/integ-';

/** 本文件造的标签名。 */
const TEST_TAG_NAMES = ['集成测试', '集成冲突标签', '集成冲突标签2'];

async function api(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
) {
  const res = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${options.key ?? KEY_A}`,
      'content-type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json: json as Record<string, unknown> };
}

describe.skipIf(!enabled)('集成测试（需要真实 Supabase）', () => {
  let createdId = '';

  /** 删除本文件造出来的所有条目与标签。 */
  async function cleanup() {
    const list = await api('/items?status=all&limit=200');
    const items =
      (list.json?.data as { items?: Array<{ id: string; url?: string }> })?.items ?? [];
    for (const item of items) {
      if (item.url?.startsWith(TEST_URL_PREFIX)) {
        await api(`/items/${item.id}`, { method: 'DELETE' });
      }
    }

    const tagList = await api('/tags');
    const tags =
      (tagList.json?.data as { tags?: Array<{ id: string; name: string }> })?.tags ?? [];
    for (const tag of tags) {
      if (TEST_TAG_NAMES.includes(tag.name)) {
        await api(`/tags/${tag.id}`, { method: 'DELETE' });
      }
    }
  }

  beforeAll(async () => {
    // 清理上一轮残留（只删测试自己造的）
    await cleanup();
  }, 180000);

  afterAll(async () => {
    // 收尾：集成测试跑在真实库上，不能留残渣
    await cleanup();
  }, 180000);

  it('同一 URL 重复提交只产生一条条目', async () => {
    const payload = {
      url: `https://example.com/integ-${Date.now()}`,
      title: '集成测试条目',
      summary: '来自集成测试',
      tags: ['集成测试'],
    };

    const first = await api('/items', { method: 'POST', body: payload });
    expect(first.status).toBe(200);
    const firstData = first.json?.data as { created: number; items: Array<{ id: string }> };
    expect(firstData.created).toBe(1);
    createdId = firstData.items[0].id;

    const second = await api('/items', { method: 'POST', body: payload });
    const secondData = second.json?.data as { created: number; updated: number };
    expect(secondData.created).toBe(0);
    expect(secondData.updated).toBe(1);
  }, 30000);

  it('缺省 tags 的 upsert 保留原标签', async () => {
    const before = await api(`/items/${createdId}`);
    const tags = (before.json?.data as { item: { tags: Array<{ name: string }> } }).item.tags;
    expect(tags.map((t) => t.name)).toContain('集成测试');

    await api(`/items/${createdId}`, {
      method: 'PATCH',
      body: { title: '改了标题' },
    });

    const after = await api(`/items/${createdId}`);
    const afterTags = (after.json?.data as { item: { tags: Array<{ name: string }> } }).item
      .tags;
    expect(afterTags.map((t) => t.name)).toContain('集成测试');
  }, 30000);

  it('超过 3 个标签被拒绝，且不改动原有标签', async () => {
    const res = await api(`/items/${createdId}`, {
      method: 'PATCH',
      body: { tags: ['a', 'b', 'c', 'd'] },
    });
    expect(res.status).toBe(422);
    expect((res.json?.error as { code: string }).code).toBe('MAX_TAGS_EXCEEDED');

    const after = await api(`/items/${createdId}`);
    const tags = (after.json?.data as { item: { tags: Array<{ name: string }> } }).item.tags;
    expect(tags.map((t) => t.name)).toContain('集成测试');
  }, 30000);

  it('标签重名返回 TAG_NAME_CONFLICT', async () => {
    await api('/tags', { method: 'POST', body: { name: '集成冲突标签' } });
    const list = await api('/tags');
    const tags = (list.json?.data as { tags: Array<{ id: string; name: string }> }).tags;
    const target = tags.find((t) => t.name === '集成冲突标签');

    await api('/tags', { method: 'POST', body: { name: '集成冲突标签2' } });
    const list2 = await api('/tags');
    const other = (list2.json?.data as { tags: Array<{ id: string; name: string }> }).tags.find(
      (t) => t.name === '集成冲突标签2',
    );

    const res = await api(`/tags/${other!.id}`, {
      method: 'PATCH',
      body: { name: '集成冲突标签' },
    });
    expect(res.status).toBe(409);
    expect((res.json?.error as { code: string }).code).toBe('TAG_NAME_CONFLICT');
    expect(target).toBeDefined();
  }, 30000);

  it('数据库层触发器在 Agent 通道拒绝第 4 个标签', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const itemRes = await api(`/items/${createdId}`);
    const userId = (itemRes.json?.data as { item: { user_id: string } }).item.user_id;

    // 自造 4 个新标签逐个绑定，不依赖历史残留：
    // service_role（Agent 通道）下触发器只允许 3 个，第 4 个必然被拒。
    const stamp = Date.now();
    const tagIds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const { data, error } = await admin
        .from('tags')
        .insert({ user_id: userId, name: `触发器测试${stamp}-${i}`, origin: 'agent' })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      tagIds.push((data as { id: string }).id);
    }

    const errors: string[] = [];
    for (const tagId of tagIds) {
      const { error } = await admin.from('item_tags').insert({ item_id: createdId, tag_id: tagId });
      if (error) errors.push(error.message);
    }

    expect(errors.some((m) => m.includes('MAX_TAGS_EXCEEDED'))).toBe(true);

    // 无论插多少次，最终绑定数都不超过 3
    const { data: bindings } = await admin
      .from('item_tags')
      .select('tag_id')
      .eq('item_id', createdId);
    expect((bindings ?? []).length).toBeLessThanOrEqual(3);

    // 清理这批测试标签（item_tags 会跟着级联删）
    await admin.from('tags').delete().in('id', tagIds);
  }, 60000);

  it.skipIf(!KEY_B)('跨用户访问被拒绝（404）', async () => {
    const res = await api(`/items/${createdId}`, { key: KEY_B });
    expect(res.status).toBe(404);
  }, 30000);

  it.skipIf(!KEY_B)('用户 B 看不到用户 A 的标签', async () => {
    const res = await api('/tags', { key: KEY_B });
    const tags = (res.json?.data as { tags: Array<{ name: string }> }).tags;
    expect(tags.map((t) => t.name)).not.toContain('集成测试');
  }, 30000);
});
