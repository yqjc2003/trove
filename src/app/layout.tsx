import type { Metadata } from 'next';

import './globals.css';
import { Nav } from '@/components/Nav';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'trove — 个人收藏管理',
  description: '把散落的链接统一收敛到一处：标签、笔记、归档与阅读追踪。',
};

/**
 * 环境变量没配好时，给出可执行的提示，而不是让每个页面 500。
 */
function SetupNotice() {
  return (
    <main className="page">
      <div className="wrap-narrow">
        <h1>trove</h1>
        <p className="page-sub">服务还没有配置完成。</p>

        <div className="section">
          <div className="callout">
            <p>缺少以下环境变量：</p>
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              <li>
                <code className="mono">NEXT_PUBLIC_SUPABASE_URL</code>
              </li>
              <li>
                <code className="mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
              </li>
              <li>
                <code className="mono">SUPABASE_SERVICE_ROLE_KEY</code>
              </li>
            </ul>
          </div>

          <p className="small muted" style={{ marginTop: 16 }}>
            1. 把 <code className="mono">.env.example</code> 复制为{' '}
            <code className="mono">.env.local</code> 并填入 Supabase 项目的凭据。
            <br />
            2. 执行 <code className="mono">pnpm db:push</code> 应用数据库迁移，
            或把 <code className="mono">db/migrations/0001_init.sql</code> 粘进
            Supabase Dashboard 的 SQL Editor。
          </p>
        </div>
      </div>
    </main>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!isSupabaseConfigured()) {
    return (
      <html lang="zh-CN">
        <body>
          <SetupNotice />
        </body>
      </html>
    );
  }

  let signedIn = false;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }

  return (
    <html lang="zh-CN">
      <body>
        {signedIn ? <Nav /> : null}
        {children}
      </body>
    </html>
  );
}
