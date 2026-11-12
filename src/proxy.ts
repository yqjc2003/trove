import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

/**
 * Next 16 的 `proxy`（旧称 middleware）。
 * 刷新 Supabase 会话并对受保护页面做守卫。
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 排除：
     *  - _next/*   静态资源
     *  - api/mcp   MCP 端点走 Bearer 头，不依赖 Cookie
     *  - 静态文件
     */
    '/((?!_next/static|_next/image|favicon.ico|api/mcp|\\.well-known).*)',
  ],
};
