import { getServerContext } from '@/lib/server-context';
import { listTags } from '@/lib/services/tags';
import { TagManager } from '@/components/TagManager';
import { ApiKeyManager } from '@/components/ApiKeyManager';
import { ReminderDaysForm } from '@/components/ReminderDaysForm';
import { ImportBookmarks } from '@/components/ImportBookmarks';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = await getServerContext();
  if (!ctx) return null;

  const [tags, keys, profile] = await Promise.all([
    listTags(ctx),
    ctx.db.listApiKeys(),
    ctx.db.getProfile(),
  ]);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

  return (
    <main className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>我的语言</h1>
            <p className="page-sub">收藏慢慢积累，描述它们的词汇也由你定义。</p>
          </div>
        </div>

        <section className="section" style={{ marginTop: 0 }}>
          <div className="section-head">
            <h2>个人词汇表</h2>
            <span className="section-count">{tags.length} 个</span>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            标签是系统里唯一的分类维度，每个用户拥有自己独立的一套。
            AI 解读链接时会自动创建标签，你也可以随时改名或删除。
          </p>
          <div style={{ marginTop: 16 }}>
            <TagManager tags={tags} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 id="connections">连接 Agent</h2>
            <span className="section-count">{keys.length} 个</span>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            供 Skill 与 MCP 使用。服务端只保存哈希，明文仅在生成时显示一次。
          </p>
          <div style={{ marginTop: 16 }}>
            <ApiKeyManager keys={keys} siteUrl={siteUrl} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>回看节奏</h2>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            收藏超过这个天数且从未打开过，就会进入待读清单。
          </p>
          <div style={{ marginTop: 16 }}>
            <ReminderDaysForm days={profile?.reminder_days ?? 14} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>导入导出</h2>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            导出为 JSON（含收藏、标签、笔记与点击记录）。
          </p>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <a className="btn" href="/api/trove/export" download="cachet-export.json">
              导出 JSON
            </a>
          </div>
          <div className="import-divider" />
          <h3>导入浏览器收藏</h3>
          <div style={{ marginTop: 12 }}>
            <ImportBookmarks />
          </div>
        </section>
      </div>
    </main>
  );
}
