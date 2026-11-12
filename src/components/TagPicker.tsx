'use client';

import { useState, useTransition } from 'react';

import { setItemTagsAction } from '@/app/actions/items';
import { TagInput, type TagOption } from '@/components/TagInput';

/**
 * 单条收藏的标签编辑器。
 * 语义分类全部由标签承载——这里既可以改 AI 给的标签，也可以直接新建，数量不限。
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  return (
    <div>
      <TagInput tags={tags} onChange={commit} options={options} disabled={pending} />
      {error ? (
        <p className="small" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
      {pending ? <p className="faint small">保存中…</p> : null}
    </div>
  );
}
