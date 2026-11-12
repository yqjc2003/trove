import { after, NextResponse } from 'next/server';

import { recordClick } from '@/lib/services/click';
import { isAllowedScheme } from '@/lib/domain/url';
import { toAppError } from '@/lib/domain/errors';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getServerContext } from '@/lib/server-context';

export const dynamic = 'force-dynamic';

/**
 * GET /r/{id} —— 302 重定向 + 点击追踪。
 *
 * 先读取当前用户的收藏并校验目标地址，返回 302。
 * 点击追踪在响应后尽力执行，失败不能阻断打开原文。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  function redirect(target: string | URL) {
    const response = NextResponse.redirect(target, { status: 302 });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const fallback = new URL('/items', req.url);
  fallback.searchParams.set('missing', id);

  // 部署未配置完成时给出明确提示，而不是 500
  if (!isSupabaseConfigured()) {
    return new Response('服务尚未配置完成：缺少 Supabase 环境变量。', {
      status: 503,
    });
  }

  try {
    const context = await getServerContext();
    if (!context) return redirect(fallback);
    // 经 TroveDb 的 user_id 过滤与会话 RLS 读取，不通过 service-role 兜底。
    const item = await context.db.getItem(id);
    if (!item || !isAllowedScheme(item.url)) return redirect(fallback);
    const response = redirect(item.url);
    const options = {
      source: 'web',
      referrer: req.headers.get('referer'),
      userAgent: req.headers.get('user-agent'),
    };
    try {
      after(async () => {
        try {
          await recordClick(id, options);
        } catch (error) {
          // 不记录原始错误/请求头，避免凭据或私人 URL 进入日志。
          console.warn('TROVE_CLICK_TRACKING_FAILED', {
            id,
            code: toAppError(error).code,
          });
        }
      });
    } catch {
      console.warn('TROVE_CLICK_TRACKING_NOT_SCHEDULED', { id });
    }
    return response;
  } catch (e) {
    const err = toAppError(e);

    // 无法安全确定归属或目标地址时退回站内；不泄露或猜测其他用户的链接。
    console.warn('TROVE_REDIRECT_TARGET_UNAVAILABLE', { id, code: err.code });
    return redirect(fallback);
  }
}
