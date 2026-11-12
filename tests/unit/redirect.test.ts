import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getContext, getItem, recordClick, after, configured } = vi.hoisted(
  () => ({
    getContext: vi.fn(),
    getItem: vi.fn(),
    recordClick: vi.fn(),
    after: vi.fn(),
    configured: vi.fn(),
  }),
);

vi.mock('@/lib/server-context', () => ({ getServerContext: getContext }));
vi.mock('@/lib/services/click', () => ({ recordClick }));
vi.mock('@/lib/supabase/server', () => ({ isSupabaseConfigured: configured }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after,
}));

import { GET } from '@/app/r/[id]/route';

const id = '0fe29db0-8a68-434a-b98d-b5a4e74b8ea4';
const target = 'https://example.com/original?q=test';
const request = () =>
  new Request(`https://trove.example/r/${id}`, {
    headers: {
      referer: 'https://trove.example/items',
      'user-agent': 'Test browser',
    },
  });
const run = () => GET(request(), { params: Promise.resolve({ id }) });

describe('原文跳转优先于点击追踪', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.resetAllMocks();
    configured.mockReturnValue(true);
    getContext.mockResolvedValue({ db: { getItem } });
    getItem.mockResolvedValue({ id, url: target });
    recordClick.mockResolvedValue(target);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('先返回不可缓存的 302，统计在响应后执行', async () => {
    const response = await run();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(target);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(getItem).toHaveBeenCalledWith(id);
    expect(recordClick).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(recordClick).toHaveBeenCalledWith(id, {
      source: 'web',
      referrer: 'https://trove.example/items',
      userAgent: 'Test browser',
    });
  });

  it.each(['数据库权限错误', 'RPC 不存在', '网络连接中断'])(
    '统计失败（%s）也保留原文 302，不泄露错误内容',
    async (message) => {
      recordClick.mockRejectedValue(new Error(message));
      const response = await run();
      await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(target);
      expect(console.warn).toHaveBeenCalledWith('TROVE_CLICK_TRACKING_FAILED', {
        id,
        code: 'INTERNAL',
      });
    },
  );

  it('统计永不完成也不会阻塞跳转', async () => {
    recordClick.mockImplementation(() => new Promise(() => undefined));
    const response = await run();
    expect(response.headers.get('location')).toBe(target);
    expect(recordClick).not.toHaveBeenCalled();
  });

  it('后台任务无法注册时也返回原文 302', async () => {
    after.mockImplementation(() => {
      throw new Error('after unavailable');
    });
    expect((await run()).headers.get('location')).toBe(target);
  });

  it('合法 HTTP 地址也照常跳转', async () => {
    getItem.mockResolvedValue({ id, url: 'http://example.com/original' });
    expect((await run()).headers.get('location')).toBe('http://example.com/original');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'file:///secret',
    '/relative',
    'not a url',
  ])('非法目标 %s 退回站内且不记录点击', async (url) => {
    getItem.mockResolvedValue({ id, url });
    const response = await run();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `https://trove.example/items?missing=${id}`,
    );
    expect(after).not.toHaveBeenCalled();
  });

  it.each(['未登录', '收藏不属于当前用户', '无法读取收藏'])(
    '%s 时不泄露目标地址',
    async (scenario) => {
      if (scenario === '未登录') getContext.mockResolvedValue(null);
      else if (scenario === '无法读取收藏')
        getItem.mockRejectedValue(new Error('database offline'));
      else getItem.mockResolvedValue(null);
      const response = await run();
      expect(response.headers.get('location')).toBe(
        `https://trove.example/items?missing=${id}`,
      );
      expect(after).not.toHaveBeenCalled();
    },
  );
});
