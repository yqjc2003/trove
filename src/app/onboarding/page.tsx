import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerContext } from '@/lib/server-context';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const context = await getServerContext();
  if (!context) redirect('/login?mode=signup&next=/onboarding');

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
              <h2>连接你的 Agent</h2>
              <p>生成 API Key 后，可用 Codex Skill 收录网页、视频、收藏夹或 GitHub Star。</p>
              <Link className="btn" href="/settings#connections">
                生成 API Key
              </Link>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h2>回到你的回看台</h2>
              <p>从最早、最值得重新打开的一条开始；读完后留下自己的理解。</p>
              <Link className="btn" href="/">
                前往回看台
              </Link>
            </div>
          </li>
        </ol>
      </div>
    </main>
  );
}
