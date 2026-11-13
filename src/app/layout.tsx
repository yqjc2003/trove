import type { Metadata, Viewport } from 'next';

import './globals.css';
import { Nav } from '@/components/Nav';
import { LocaleProvider } from '@/components/LocaleProvider';
import type { Locale } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'CatchLinger · 拾藏 — 收下值得的，留下余味',
  description: '把浏览器收藏、视频与 GitHub Star 收进一个可回看的个人藏库。',
};

export const viewport: Viewport = {
  themeColor: '#f3f4f1',
  colorScheme: 'light',
};

function Shell({
  nav,
  children,
  locale,
}: {
  nav?: React.ReactNode;
  children: React.ReactNode;
  locale: Locale;
}) {
  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#content">
          跳到正文
        </a>
        <LocaleProvider locale={locale}>
          {nav}
          <div id="content" tabIndex={-1}>
            {children}
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}

/**
 * 环境变量没配好时，给出可执行的提示，而不是让每个页面 500。
 */
function SetupNotice() {
  return (
    <main className="page">
      <div className="wrap-narrow">
        <h1>拾藏</h1>
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
            <code className="mono">.env.local</code> 并填入 Supabase
            项目的凭据。
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
  const locale = await getLocale();
  if (!isSupabaseConfigured()) {
    return (
      <Shell locale={locale}>
        <SetupNotice />
      </Shell>
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

  return <Shell locale={locale} nav={signedIn ? <Nav /> : null}>{children}</Shell>;
}
