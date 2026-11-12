import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/mcp', '/.well-known'];

/**
 * 刷新 Supabase 会话并对受保护页面做守卫。
 * `/auth/callback`（OAuth 落地页）、`/api/mcp` 与 `/.well-known` 必须放行——
 * 前两个分别是 OAuth 回调（靠 code 换 session，不依赖已有会话）和 MCP
 * （走 Bearer 头）。
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() 会向 Supabase 校验令牌，不依赖本地解析结果
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // 落地页 `/` 是公开入口；其它工作区路由仍需会话。
  // 不能把 `/` 放入 PUBLIC_PATHS，否则 startsWith('/') 会误放行所有页面。
  const isPublic = pathname === '/' || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  // API 路径不做页面跳转：无凭据时交给路由处理器的 withAuth 返回 401 JSON。
  // 否则 Skill / CLI 调 REST 会收到一个 307 跳转到登录页的 HTML，而不是可解析的错误。
  const isApi = pathname.startsWith('/api/');

  if (!user && !isPublic && !isApi) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return response;
}
