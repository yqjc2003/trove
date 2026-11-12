'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  removeItemAction,
  setItemReadAction,
  setItemStatusAction,
} from '@/app/actions/items';

/** 单条收藏的操作按钮组。 */
export function ItemActions({
  itemId,
  status,
  read,
  showDelete = true,
}: {
  itemId: string;
  status: 'active' | 'archived';
  read: boolean;
  showDelete?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? '操作失败');
      else setError(null);
    });
  }

  function remove() {
    if (!window.confirm('彻底删除这条收藏？笔记与点击记录也会一并删除。')) return;
    startTransition(async () => {
      const res = await removeItemAction(itemId);
      if (!res.ok) {
        setError(res.error ?? '删除失败');
        return;
      }
      router.push('/items');
      router.refresh();
    });
  }

  return (
    <div className="row-actions">
      <button
        type="button"
        className="btn-quiet"
        disabled={pending}
        onClick={() => run(() => setItemStatusAction(itemId, status === 'active' ? 'archived' : 'active'))}
      >
        {status === 'active' ? '归档' : '取消归档'}
      </button>

      <button
        type="button"
        className="btn-quiet"
        disabled={pending}
        onClick={() => run(() => setItemReadAction(itemId, !read))}
      >
        {read ? '标记未读' : '标记已读'}
      </button>

      {showDelete ? (
        <button type="button" className="btn-quiet" disabled={pending} onClick={remove}>
          删除
        </button>
      ) : null}

      {error ? (
        <span className="small" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
