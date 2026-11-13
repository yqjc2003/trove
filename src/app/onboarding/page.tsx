import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerContext } from '@/lib/server-context';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const context = await getServerContext();
  if (!context) redirect('/login?mode=signup&next=/onboarding');

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

  return (
    <main className="page onboarding-page">
      <div className="wrap-narrow">
        <p className="landing-kicker">欢迎来到拾藏</p>
        <h1>从一条你真的会回看的内容开始。</h1>
        <p className="page-sub onboarding-intro">
          不用一次搬完所有收藏。先完成其中一种收集方式，回看台就会为你留下下一步。
        </p>

        <ol className="onboarding-steps">
          <li>
            <span>1</span>
            <div>
              <h2>贴入一条链接</h2>
              <p>最快的开始方式。手工补充标题、摘要和你自己的标签。</p>
              <Link className="btn btn-primary" href="/items/new">
                收下第一条
              </Link>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h2>生成连接 Key</h2>
              <p>
                API Key 只在创建时显示一次；它把本机 Agent 的每一次写入限定在你的藏库里。
              </p>
              <Link className="btn" href="/settings#connections">
                生成 API Key
              </Link>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h2>安装到你的全局 Skills</h2>
              <p>
                在这个项目根目录运行下面命令。它会安装到{' '}
                <code>~/.agents/skills/catchlinger-capture/</code>，所有项目中的 Codex 都能使用。
              </p>
              <code className="onboarding-code" translate="no">pnpm skill:install</code>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <h2>配置一次，开始收集</h2>
              <p>
                把刚才显示的 Key 连同下面两行写入 <code>~/.config/catchlinger/env</code>，然后重开一个 Codex
                会话。
              </p>
              <code className="onboarding-code" translate="no">
                CATCHLINGER_API_BASE={siteUrl}/api/trove{`\n`}CATCHLINGER_API_KEY=trv_…
              </code>
              <p>现在可以说：<code>用 $catchlinger-capture 收下 https://example.com</code>。</p>
            </div>
          </li>
        </ol>
      </div>
    </main>
  );
}
