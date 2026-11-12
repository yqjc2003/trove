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
    <form
      className="form-row"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="field" style={{ marginBottom: 0, width: 120 }}>
        <span className="field-label">提醒天数</span>
        <input
          className="input"
          type="number"
          name="reminder_days"
          inputMode="numeric"
          min={1}
          max={365}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          autoComplete="off"
        />
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? '保存中…' : '保存'}
      </button>
      <span className="small faint">天（1–365）</span>
      {error ? (
        <span className="small danger" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
