'use client';

import { useState, useTransition } from 'react';

import { setItemTagsAction } from '@/app/actions/items';

export interface TagOption {
  id: string;
  name: string;
}

const MAX_TAGS = 3;

/**
 * 单条收藏的标签编辑器（≤3 个）。
 * 语义分类全部由标签承载——这里既可以改 AI 给的标签，也可以直接新建。
 */
export function TagPicker({
  itemId,
  current,
  options,
}: {
  itemId: string;
  current: string[];
  options: TagOption[];
}) {
  const [tags, setTags] = useState<string[]>(current);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atLimit = tags.length >= MAX_TAGS;

  function commit(next: string[]) {
    setTags(next);
    setError(null);
    startTransition(async () => {
      const res = await setItemTagsAction(itemId, next);
      if (!res.ok) {
        setError(res.error ?? '保存失败');
        setTags(current);
      }
    });
  }

  function addTag(raw: string) {
    const name = raw.trim().replace(/^#+/, '').toLowerCase();
    if (!name) return;
    if (tags.includes(name)) {
      setError('该标签已存在');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setError(`每个收藏最多 ${MAX_TAGS} 个标签`);
      return;
    }
    setInput('');
    commit([...tags, name]);
  }

  return (
    <div>
      <div className="tags">
        {tags.map((t) => (
          <span key={t} className="tag">
            {t}
            <button
              type="button"
              className="btn-quiet"
              style={{ fontSize: 12, lineHeight: 1 }}
              onClick={() => commit(tags.filter((x) => x !== t))}
              disabled={pending}
              aria-label={`移除标签 ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 ? <span className="faint small">尚未打标签</span> : null}
      </div>

      <form
        className="form-row"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          addTag(input);
        }}
      >
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={atLimit ? `已达上限（${MAX_TAGS}）` : '添加标签'}
          disabled={atLimit || pending}
          list="trove-tag-options"
        />
        <datalist id="trove-tag-options">
          {options
            .filter((o) => !tags.includes(o.name))
            .map((o) => (
              <option key={o.id} value={o.name} />
            ))}
        </datalist>
        <button type="submit" className="btn btn-sm" disabled={atLimit || pending}>
          添加
        </button>
      </form>

      {error ? <p className="small" style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {pending ? <p className="faint small">保存中…</p> : null}
    </div>
  );
}
