'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { createItemAction } from '@/app/actions/items';
import { TagInput, type TagOption } from '@/components/TagInput';
import { useTranslation } from '@/components/LocaleProvider';

/** 手工添加收藏的表单（Web 通道，标签不限数量）。 */
export function ItemCreateForm({ options }: { options: TagOption[] }) {
  const { t } = useTranslation();
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await createItemAction({
        url: url.trim(),
        title: title.trim(),
        summary: summary.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (!res.ok || !res.id) {
        setError(res.error ?? '保存失败');
        return;
      }
      router.push(`/items/${res.id}`);
    });
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 28 }}>
      <label className="field">
        <span className="field-label">{t('form.url')}</span>
        <input
          className="input"
          type="url"
          name="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('form.urlPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>

      <label className="field">
        <span className="field-label">{t('form.title')}</span>
        <input
          className="input"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('form.titlePlaceholder')}
          autoComplete="off"
          required
          maxLength={300}
        />
      </label>

      <label className="field">
        <span className="field-label">{t('form.summary')}</span>
        <textarea
          className="textarea"
          name="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t('form.summaryPlaceholder')}
          autoComplete="off"
          maxLength={1000}
          style={{ minHeight: 90 }}
        />
      </label>

      <div className="field">
        <span className="field-label">{t('form.tags')}</span>
        <TagInput tags={tags} onChange={setTags} options={options} disabled={pending} />
        <p className="small faint" style={{ marginTop: 6 }}>
          {t('form.tagsUnlimited')}
        </p>
      </div>

      {error ? (
        <p className="callout callout-error small" role="alert">
          {error}
        </p>
      ) : null}

      <div className="row-actions" style={{ marginTop: 20 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? t('form.saving') : t('common.save')}
        </button>
        <Link className="btn" href="/items">
          {t('common.cancel')}
        </Link>
      </div>
    </form>
  );
}
