import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/domain/errors';

/**
 * 记录一次点击（会话通道）。
 *
 * 走 `trove_record_click` 这个 SECURITY DEFINER RPC —— 它用 `auth.uid()` 自证归属，
 * 并在同一个事务里完成：插 click_events + click_count+1 + 首次点击写 read_at。
 */
export async function recordClick(
  itemId: string,
  options: {
    source?: string;
    referrer?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<string> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc('trove_record_click', {
    p_item_id: itemId,
    p_source: options.source ?? 'web',
    p_referrer: options.referrer ?? null,
    p_user_agent: options.userAgent ?? null,
  });

  if (error) {
    if (error.message.includes('NOT_FOUND')) {
      throw new AppError('NOT_FOUND', '收藏不存在');
    }
    if (error.message.includes('AUTH_REQUIRED')) {
      throw new AppError('UNAUTHORIZED', '需要登录');
    }
    // 无会话时 PostgREST 以 anon 角色调用 → 42501 权限不足
    if (error.code === '42501' || error.message.includes('permission denied')) {
      throw new AppError('UNAUTHORIZED', '需要登录');
    }
    throw new AppError('INTERNAL', `记录点击失败：${error.message}`);
  }

  if (typeof data !== 'string' || data === '') {
    throw new AppError('INTERNAL', '记录点击失败');
  }

  return data;
}
