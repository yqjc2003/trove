import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({ rpc }),
}));

describe('recordClick', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('调用 trove_record_click 并返回目标 URL', async () => {
    const { recordClick } = await import('@/lib/services/click');

    rpc.mockResolvedValue({ data: 'https://example.com/target', error: null });

    const target = await recordClick('item-1', {
      source: 'web',
      referrer: 'https://trove.example.com/items/1',
      userAgent: 'Mozilla/5.0',
    });

    expect(target).toBe('https://example.com/target');
    expect(rpc).toHaveBeenCalledOnce();

    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('trove_record_click');
    expect(args.p_item_id).toBe('item-1');
    expect(args.p_source).toBe('web');
  });

  it('收藏不存在 → NOT_FOUND', async () => {
    const { recordClick } = await import('@/lib/services/click');

    rpc.mockResolvedValue({
      data: null,
      error: { message: 'NOT_FOUND' },
    });

    await expect(recordClick('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('未登录 → UNAUTHORIZED', async () => {
    const { recordClick } = await import('@/lib/services/click');

    rpc.mockResolvedValue({
      data: null,
      error: { message: 'AUTH_REQUIRED' },
    });

    await expect(recordClick('item-1')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('其他数据库错误 → INTERNAL', async () => {
    const { recordClick } = await import('@/lib/services/click');

    rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection reset' },
    });

    await expect(recordClick('item-1')).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });

  it('返回空 URL → INTERNAL（不跳转到空地址）', async () => {
    const { recordClick } = await import('@/lib/services/click');

    rpc.mockResolvedValue({ data: '', error: null });

    await expect(recordClick('item-1')).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });
});
