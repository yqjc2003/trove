'use client';

import { useState, useTransition } from 'react';

import { updateReminderDaysAction } from '@/app/actions/settings';

/** 超期提醒天数阈值。 */
export function ReminderDaysForm({ days }: { days: number }) {
  const [value, setValue] = useState(String(days));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateReminderDaysAction(Number(value));
      if (!res.ok) {
        setError(res.error ?? '保存失败');
        return;
      }
      setError(null);
    });
  }

  return (
    <div className="form-row">
      <input
        className="input"
        type="number"
        min={1}
        max={365}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ maxWidth: 120 }}
        disabled={pending}
      />
      <button
        type="button"
        className="btn"
        onClick={save}
        disabled={pending}
      >
        保存
      </button>
      <span className="small faint">天（1–365）</span>
      {error ? (
        <span className="small" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
