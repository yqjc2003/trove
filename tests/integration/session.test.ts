import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServerClient } from '@supabase/ssr';

/**
 * 集成测试（会话通道）：用真实的 Supabase 登录会话打应用自己的 HTTP 接口。
 *
 * 与 `supabase.test.ts`（API Key 通道）互补——这里覆盖的是
 * 「浏览器登录 → Cookie 会话 → 服务端 RLS + SECURITY DEFINER RPC」这条路径，
 * 也就是 Web UI 实际走的路径。
 *
 * 默认 **skip**，不配置环境变量时整组跳过。
 *
 *   TROVE_TEST_APP_URL       应用地址，例如 http://localhost:3000 或 https://trove.vercel.app
 *   TROVE_TEST_SUPABASE_URL  Supabase 项目地址
 *   TROVE_TEST_ANON_KEY      publishable key
 *   TROVE_TEST_EMAIL         一个已确认邮箱的测试账号
 *   TROVE_TEST_PASSWORD      该账号的密码
 */

const APP_URL = process.env.TROVE_TEST_APP_URL;
const SUPABASE_URL = process.env.TROVE_TEST_SUPABASE_URL;
const ANON_KEY = process.env.TROVE_TEST_ANON_KEY;
const EMAIL = process.env.TROVE_TEST_EMAIL;
const PASSWORD = process.env.TROVE_TEST_PASSWORD;

const enabled = Boolean(APP_URL && SUPABASE_URL && ANON_KEY && EMAIL && PASSWORD);

const API = `${APP_URL}/api/trove`;

/** 本文件造的标签名 —— 清理时按名字匹配。 */
const TEST_TAG_NAMES = ['会话测试', '甲', '乙', '丙', '丁', '戊', '己', '庚'];

/**
 * 判断 URL 是否属于「保留的示例域名」——
 * example.com / *.example.com / *.example 按 RFC 2606 都是测试专用，
 * 真实用户不可能拿它当收藏。清理时只删这一类条目，绝不误删真实数据。
 */
function isTestUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'example.com' ||
      host.endsWith('.example.com') ||
      host.endsWith('.example') ||
      host === 'example'
    );
  } catch {
    return false;
  }
}

/** @supabase/ssr 的 Cookie 适配器：把会话 Cookie 存进内存 jar。 */
const jar = new Map<string, string>();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function call(
  path: string,
  options: { method?: string; body?: unknown; anon?: boolean } = {},
) {
  const res = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    redirect: 'manual',
    headers: {
      ...(options.anon ? {} : { cookie: cookieHeader() }),
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
  return { status: res.status, json: json as Record<string, unknown>, headers: res.headers };
}

describe.skipIf(!enabled)('集成测试（会话通道）', () => {
  let itemId = '';
  let itemUrl = '';
  let supabase: ReturnType<typeof createServerClient>;

  beforeAll(async () => {
    supabase = createServerClient(SUPABASE_URL!, ANON_KEY!, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => {
          for (const { name, value } of list) jar.set(name, value);
        },
      },
    });

    const { error } = await supabase.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    if (error) throw new Error(`登录失败：${error.message}`);
  }, 60000);

  afterAll(async () => {
    // 收尾：集成测试跑在真实库上，不能留残渣。
    // 只清「保留的示例域名」上的条目 + 本文件造的标签，真实收藏不受影响。
    const list = await call('/items?status=all&limit=200');
    const items =
      (list.json?.data as { items?: Array<{ id: string; url?: string }> })?.items ?? [];
    for (const item of items) {
      if (item.id === itemId || (item.url && isTestUrl(item.url))) {
        await call(`/items/${item.id}`, { method: 'DELETE' });
      }
    }

    const res = await call('/tags');
    const tags =
      (res.json?.data as { tags?: Array<{ id: string; name: string }> })?.tags ?? [];
    for (const tag of tags) {
      if (TEST_TAG_NAMES.includes(tag.name)) {
        await call(`/tags/${tag.id}`, { method: 'DELETE' });
      }
    }
  }, 180000);

  it('会话建立后可以读取自己的收藏列表', async () => {
    const res = await call('/items?limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json?.data as { items?: unknown[] }).items)).toBe(true);
  });

  it('会话通道可以写入收藏（走 trove_upsert_item RPC）', async () => {
    itemUrl = `https://session-e2e.example.com/post/${Date.now()}`;
    const res = await call('/items', {
      method: 'POST',
      body: { url: itemUrl, title: '会话通道写入', tags: ['会话测试'] },
    });

    expect(res.status).toBe(200);
    const data = res.json?.data as { created: number; items: Array<{ id: string }> };
    expect(data.created).toBe(1);
    itemId = data.items[0].id;
  });

  it('重复录入同一条 URL 走 upsert，不新建', async () => {
    const res = await call('/items', {
      method: 'POST',
      body: { url: itemUrl, title: '会话通道写入（改了标题）' },
    });

    expect(res.status).toBe(200);
    const data = res.json?.data as { created: number; updated: number };
    expect(data.created).toBe(0);
    expect(data.updated).toBe(1);
  });

  it('标签替换生效，且超过 3 个被拒绝', async () => {
    const ok = await call(`/items/${itemId}`, {
      method: 'PATCH',
      body: { tags: ['甲', '乙', '丙'] },
    });
    expect(ok.status).toBe(200);

    const tooMany = await call(`/items/${itemId}`, {
      method: 'PATCH',
      body: { tags: ['a', 'b', 'c', 'd'] },
    });
    expect(tooMany.status).toBe(422);
    expect((tooMany.json?.error as { code: string }).code).toBe('MAX_TAGS_EXCEEDED');
  }, 30000);

  it('会话角色在 DB 层可以打超过 3 个标签（Web 手工通道不限数量）', async () => {
    // 绕过 REST 的 service 层上限，直接以 authenticated 角色调 RPC，
    // 验证 DB 层的 auth.role() 分流：authenticated 放行、service_role 限 3。
    const { error } = await supabase.rpc('trove_replace_item_tags', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_item_id: itemId,
      p_tags: ['丁', '戊', '己', '庚'],
      p_origin: 'user',
    });
    expect(error).toBeNull();

    const res = await call(`/items/${itemId}`);
    const tags = (res.json?.data as { item: { tags: Array<{ name: string }> } }).item.tags;
    const names = tags.map((t) => t.name);
    expect(names).toHaveLength(4);
    expect([...names].sort()).toEqual(['丁', '戊', '己', '庚'].sort());
  }, 30000);

  it('/r/[id] 302 跳转到原始 URL', async () => {
    const res = await fetch(`${APP_URL}/r/${itemId}`, {
      redirect: 'manual',
      headers: { cookie: cookieHeader() },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(itemUrl);
  });

  it('匿名访问 REST 返回 401 JSON，而不是跳转到登录页', async () => {
    const res = await call('/items', { anon: true });
    expect(res.status).toBe(401);
    expect((res.json?.error as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('清理：删除测试条目', async () => {
    if (!itemId) return;
    const res = await call(`/items/${itemId}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
