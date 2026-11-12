import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /auth/callback —— OAuth（GitHub 等）回调落地页。
 *
 * 浏览器端的 `createBrowserClient` 默认走 PKCE：Supabase 回调时只带一个
 * `?code=`，必须由服务端拿 code 换成 session 并写 Cookie，浏览器自己换不了。
 * 少这个路由，OAuth 登录就会停在「回调无处可落」的状态。
 *
 * 同时兼容 Supabase 直接把错误参数回传的情况（provider 没开、redirect_to
 * 不在白名单、用户拒绝授权等）。
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const oauthError = searchParams.get('error');
  const oauthErrorDesc = searchParams.get('error_description');

  const toLogin = (reason: string, detail?: string) => {
    const url = new URL('/login', origin);
    url.searchParams.set('error', reason);
    if (detail) url.searchParams.set('error_description', detail);
    return NextResponse.redirect(url);
  };

  // OAuth 失败：provider 未启用 / redirect_to 不在白名单 / 用户拒绝授权
  if (oauthError) {
    return toLogin(oauthError, oauthErrorDesc ?? undefined);
  }

  if (!code) {
    return toLogin('missing_code');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return toLogin('missing_config');
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return toLogin('exchange_failed', error.message);
  }

  // 只允许站内相对路径，防止开放重定向
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(`${origin}${target}`);
}
