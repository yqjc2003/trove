import Link from 'next/link';

const sources = ['浏览器收藏夹', 'GitHub Star', 'Bilibili / YouTube', '任何链接'];

const advantages = [
  {
    title: '不挑来处',
    text: '收藏夹、技术仓库和视频，不必分散在不同的“稍后再看”里。',
  },
  {
    title: '先理解，再入库',
    text: 'Agent 在写入前提炼标题、摘要和可复用标签；你的标签语言始终归你。',
  },
  {
    title: '为重新打开而设计',
    text: '不是又一个链接墓地。待读提醒、回看台和笔记让收藏在恰当的时候回来。',
  },
];

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-nav" aria-label="主导航">
        <Link href="/" className="landing-brand" translate="no">
          CatchLinger <span>拾藏</span>
        </Link>
        <Link className="landing-login" href="/login">
          已有账号，登录
        </Link>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-kicker" translate="no">拾藏 · CatchLinger</p>
          <h1 id="landing-title">Catch what matters. Let it linger.</h1>
          <p className="landing-lead">
            拾藏把浏览器、视频站和 GitHub 里散落的好东西收在一起；由 Agent
            帮你整理来路，再把它们带回真正值得回味的时刻。
          </p>
          <div className="landing-actions">
            <Link className="btn btn-primary" href="/login?mode=signup&next=/onboarding">
              从第一条开始
            </Link>
            <a className="btn" href="#how-it-works">
              看看怎么用
            </a>
          </div>
          <p className="landing-note">CatchLinger：创建账号后，三步完成你的第一轮收集。</p>
        </div>

        <div className="capture-route" aria-label="收藏进入拾藏的路径">
          <p className="route-label">你已经收下的</p>
          <ul className="source-list">
            {sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
          <div className="route-line" aria-hidden="true" />
          <p className="route-label">Agent 整理为</p>
          <div className="route-output">
            <strong>标题 · 摘要 · 你的标签</strong>
            <span>不替你下判断，只替你整理来路。</span>
          </div>
          <div className="route-line route-line-short" aria-hidden="true" />
          <p className="route-label">在恰当的时候回到</p>
          <p className="route-return">今天，回味一条。</p>
        </div>
      </section>

      <section className="landing-section landing-case" aria-labelledby="case-title">
        <div>
          <p className="landing-kicker">不是更多收藏</p>
          <h2 id="case-title">是让每一次“以后再看”有下文。</h2>
        </div>
        <p>
          你不需要先搭一套复杂分类，也不用把所有内容塞进一个聊天框。拾藏保留原始链接，
          让 Agent 做内容解读；你只需决定它值不值得留下，以及何时再见。
        </p>
      </section>

      <section className="landing-section" aria-labelledby="advantages-title">
        <div className="section-intro">
          <p className="landing-kicker">为多源收藏者做的取舍</p>
          <h2 id="advantages-title">收进来很轻，留下来有用。</h2>
        </div>
        <div className="advantage-list">
          {advantages.map((advantage) => (
            <article key={advantage.title}>
              <h3>{advantage.title}</h3>
              <p>{advantage.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="landing-section onboarding-preview" aria-labelledby="onboarding-title">
        <div className="section-intro">
          <p className="landing-kicker">第一次使用</p>
          <h2 id="onboarding-title">不用迁移人生，先收一条。</h2>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <h3>创建你的空藏库</h3>
              <p>没有预设分类，也不会替你决定什么重要。</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>选一种收集方式</h3>
              <p>直接贴链接、手工添加，或连接 Agent 读取收藏夹与 GitHub Star。</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>回到一条真正想看的内容</h3>
              <p>从回看台开始，打开原文，再写下为什么值得记住。</p>
            </div>
          </li>
        </ol>
        <Link className="btn btn-primary" href="/login?mode=signup&next=/onboarding">
          开始建立我的藏库
        </Link>
      </section>

      <footer className="landing-footer">
        <span translate="no">CatchLinger · Catch what matters. Let it linger.</span>
        <Link href="/login">登录</Link>
      </footer>
    </main>
  );
}
