'use client';
import { useState, useTransition } from 'react';
import { updateWebhookAction, syncWebhookBatchAction, testWebhookAction } from '@/app/actions/settings';
import { useTranslation } from '@/components/LocaleProvider';

export function WebhookForm({ url, events }: { url: string; events: string[] }) {
  const { locale, t } = useTranslation();
  const en = locale === 'en-US';
  const [value, setValue] = useState(url);
  const [selected, setSelected] = useState(events);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  function save() {
    startTransition(async () => {
      const result = await updateWebhookAction(value, selected);
      setMessage(result.ok ? (en ? 'Saved.' : '已保存。') : (result.error ?? 'Error'));
    });
  }
  function test() {
    startTransition(async () => {
      const result = await testWebhookAction();
      setMessage(result.ok ? (en ? 'Connection successful.' : '连接成功。') : (result.error ?? 'Error'));
    });
  }
  function sync() {
    startTransition(async () => {
      let offset = 0, sent = 0, failed = 0;
      for (;;) {
        const result = await syncWebhookBatchAction(offset);
        if (!result.ok) { setMessage(result.error ?? 'Error'); return; }
        sent += result.sent ?? 0; failed += result.failed ?? 0;
        setMessage(en ? `Sent ${sent}, failed ${failed}.` : `已推送 ${sent} 条，失败 ${failed} 条。`);
        if (!result.more) break;
        offset += result.processed ?? 0;
      }
    });
  }
  return <div>
    <p className="small muted">{en ? 'Send saves to your HTTPS endpoint. Clear the address to disable delivery.' : '将收藏推送到你的 HTTPS 地址；清空地址即可关闭。'}</p>
    <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}>
      <legend className="field-label">{en ? 'Events' : '推送事件'}</legend>
      {([['item.created', en ? 'New save' : '新增'], ['item.updated', en ? 'Updated' : '修改'], ['item.archived', en ? 'Archived' : '归档'], ['note.changed', en ? 'Notes' : '笔记变更']] as const).map(([event, label]) => <label key={event} style={{ marginRight: 16 }}><input type="checkbox" checked={selected.includes(event)} disabled={pending} onChange={(e) => setSelected(e.target.checked ? [...selected, event] : selected.filter((v) => v !== event))} /> {label}</label>)}
    </fieldset>
    <form className="form-row" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label className="field" style={{ marginBottom: 0, flex: 1 }}><span className="field-label">Webhook URL</span>
        <input className="input" type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://example.com/webhook" disabled={pending} />
      </label>
      <button className="btn" disabled={pending}>{pending ? t('form.saving') : t('common.save')}</button>
      <button className="btn" type="button" disabled={pending || !url || value !== url} onClick={test}>{en ? 'Test connection' : '测试连接'}</button>
      <button className="btn" type="button" disabled={pending || !url || value !== url} onClick={sync}>{en ? 'Sync all saves' : '全量同步'}</button>
    </form>
    {message && <p className="small" role="status">{message}</p>}
  </div>;
}
