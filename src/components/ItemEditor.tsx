'use client';

import { useState, useTransition } from 'react';

import { updateItemFieldsAction } from '@/app/actions/items';

/** 详情页的标题与摘要编辑。 */
export function ItemEditor({
  itemId,
  title,
  summary,
}: {
  itemId: string;
  title: string;
  summary: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftSummary, setDraftSummary] = useState(summary ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateItemFieldsAction(itemId, {
        title: draftTitle.trim(),
        summary: draftSummary.trim(),
      });
      if (!res.ok) {
        setError(res.error ?? '保存失败');
        return;
      }
      setError(null);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div>
        <h1>{title}</h1>
        {summary ? <p className="detail-summary">{summary}</p> : null}
        <div className="row-actions">
          <button type="button" className="btn-quiet" onClick={() => setEditing(true)}>
            编辑标题与摘要
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="field">
        <span className="field-label">标题</span>
        <input
          className="input"
          name="title"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          maxLength={300}
          autoComplete="off"
          required
        />
      </label>

      <label className="field">
        <span className="field-label">摘要</span>
        <textarea
          className="textarea"
          name="summary"
          value={draftSummary}
          onChange={(e) => setDraftSummary(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          style={{ minHeight: 100 }}
        />
      </label>

      {error ? (
        <p className="small danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="row-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={pending}
        >
          保存标题与摘要
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            setEditing(false);
            setDraftTitle(title);
            setDraftSummary(summary ?? '');
            setError(null);
          }}
          disabled={pending}
        >
          取消
        </button>
      </div>
    </div>
  );
}
