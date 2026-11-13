import { getServerContext } from '@/lib/server-context';
import { listTags } from '@/lib/services/tags';
import { TagManager } from '@/components/TagManager';
import { ApiKeyManager } from '@/components/ApiKeyManager';
import { ReminderDaysForm } from '@/components/ReminderDaysForm';
import { ImportBookmarks } from '@/components/ImportBookmarks';
import { resolveAgentApiBase } from '@/lib/agent-connection';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { translate } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const locale = await getLocale();
  const ctx = await getServerContext();
  if (!ctx) return null;

  const [tags, keys, profile] = await Promise.all([
    listTags(ctx),
    ctx.db.listApiKeys(),
    ctx.db.getProfile(),
  ]);

  const apiBase = resolveAgentApiBase();

  return (
    <main className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>{translate(locale, 'settings.title')}</h1>
            <p className="page-sub">{translate(locale, 'settings.subtitle')}</p>
          </div>
        </div>

        <section className="section" style={{ marginTop: 0 }}>
          <div className="section-head"><h2>{translate(locale, 'settings.language')}</h2></div>
          <p className="small muted" style={{ marginTop: 12 }}>{translate(locale, 'settings.languageHelp')}</p>
          <div style={{ marginTop: 16 }}><LocaleSwitcher /></div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>{translate(locale, 'settings.vocabulary')}</h2>
            <span className="section-count">{translate(locale, 'settings.tagCount', { count: tags.length })}</span>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            {translate(locale, 'settings.vocabularyHelp')}
          </p>
          <div style={{ marginTop: 16 }}>
            <TagManager tags={tags} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 id="connections">{translate(locale, 'settings.connections')}</h2>
            <span className="section-count">{translate(locale, 'settings.keyCount', { count: keys.length })}</span>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            {translate(locale, 'settings.connectionsHelp')}
          </p>
          <div style={{ marginTop: 16 }}>
            <ApiKeyManager keys={keys} apiBase={apiBase} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>{translate(locale, 'settings.reviewRhythm')}</h2>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            {translate(locale, 'settings.reviewHelp')}
          </p>
          <div style={{ marginTop: 16 }}>
            <ReminderDaysForm days={profile?.reminder_days ?? 14} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>{translate(locale, 'settings.importExport')}</h2>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            {translate(locale, 'settings.exportHelp')}
          </p>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <a className="btn" href="/api/trove/export" download="catchlinger-export.json">
              {translate(locale, 'settings.export')}
            </a>
          </div>
          <div className="import-divider" />
          <h3>{translate(locale, 'settings.importBookmarks')}</h3>
          <div style={{ marginTop: 12 }}>
            <ImportBookmarks />
          </div>
        </section>

        <section className="section" aria-labelledby="feedback-heading">
          <div className="section-head">
            <h2 id="feedback-heading">反馈</h2>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            遇到问题、想分享建议或提出新想法，都可以直接联系我。
          </p>
          <div className="row-actions" style={{ marginTop: 16 }}>
            <a
              className="btn"
              href="https://github.com/yqjc2003/trove/issues/new"
              target="_blank"
              rel="noreferrer"
            >
              在 GitHub 提交 Issue
            </a>
            <a
              className="btn"
              href="mailto:yqjc2003@gmail.com?subject=%5BTrove%5D%20%E5%8F%8D%E9%A6%88&body=%E8%AF%B7%E5%91%8A%E8%AF%89%E6%88%91%E4%BD%A0%E9%81%87%E5%88%B0%E7%9A%84%E9%97%AE%E9%A2%98%E6%88%96%E6%83%B3%E6%B3%95%E3%80%82%0A%0A%E5%A4%8D%E7%8E%B0%E6%AD%A5%E9%AA%A4%EF%BC%88%E5%A6%82%E9%80%82%E7%94%A8%EF%BC%89%EF%BC%9A%0A%E6%9C%9F%E6%9C%9B%E7%BB%93%E6%9E%9C%EF%BC%9A%0A%E5%AE%9E%E9%99%85%E7%BB%93%E6%9E%9C%EF%BC%9A"
            >
              发送邮件
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
