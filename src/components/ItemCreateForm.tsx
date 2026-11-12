'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { createItemAction } from '@/app/actions/items';
import { TagInput, type TagOption } from '@/components/TagInput';

/** 手工添加收藏的表单（Web 通道，标签不限数量）。 */
export function ItemCreateForm({ options }: { options: TagOption[] }) {
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
        <span className="field-label">链接</span>
        <input
          className="input"
          type="url"
          name="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>

      <label className="field">
        <span className="field-label">标题</span>
        <input
          className="input"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：一篇想稍后再读的文章…"
          autoComplete="off"
          required
          maxLength={300}
        />
      </label>

      <label className="field">
        <span className="field-label">摘要</span>
        <textarea
          className="textarea"
          name="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="一句话说明，可留空…"
          autoComplete="off"
          maxLength={1000}
          style={{ minHeight: 90 }}
        />
      </label>

      <div className="field">
        <span className="field-label">标签</span>
        <TagInput tags={tags} onChange={setTags} options={options} disabled={pending} />
        <p className="small faint" style={{ marginTop: 6 }}>
          手工整理，标签数量不限。
        </p>
      </div>

      {error ? (
        <p className="callout callout-error small" role="alert">
          {error}
        </p>
      ) : null}

      <div className="row-actions" style={{ marginTop: 20 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </button>
        <Link className="btn" href="/items">
          取消
        </Link>
      </div>
    </form>
  );
}
