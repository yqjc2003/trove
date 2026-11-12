import { NextResponse } from 'next/server';

import { recordClick } from '@/lib/services/click';
import { isAllowedScheme } from '@/lib/domain/url';
import { toAppError } from '@/lib/domain/errors';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /r/{id} —— 302 重定向 + 点击追踪。
 *
 * 点击链接不直接跳转，而是先经这里记录点击行为与点击时间（首次点击同时标记已读），
 * 再 302 到目标地址。
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // 部署未配置完成时给出明确提示，而不是 500
  if (!isSupabaseConfigured()) {
    return new Response('服务尚未配置完成：缺少 Supabase 环境变量。', {
      status: 503,
    });
  }

  try {
    const target = await recordClick(id, {
      source: 'web',
      referrer: req.headers.get('referer'),
      userAgent: req.headers.get('user-agent'),
    });

    // 兜底：即使库里存了奇怪的 scheme，也不允许跳过去（开放重定向防护）
    if (!isAllowedScheme(target)) {
      return NextResponse.redirect(new URL(`/items?missing=${id}`, req.url), {
        status: 302,
      });
    }

    return NextResponse.redirect(target, { status: 302 });
  } catch (e) {
    const err = toAppError(e);

    // 未登录 / 收藏不存在：都退回列表页，由列表页提示，
    // 绝不在这里把用户卡在一张错误页上。
    if (err.code === 'NOT_FOUND' || err.code === 'UNAUTHORIZED') {
      return NextResponse.redirect(new URL(`/items?missing=${id}`, req.url), {
        status: 302,
      });
    }

    // 其他错误不跳转，避免吞掉问题
    return new Response('记录点击失败', { status: err.status });
  }
}
