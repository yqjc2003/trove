import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REMINDER_DAYS,
  assertReminderDays,
  clampReminderDays,
  daysOverdue,
  isOverdue,
  overdueCutoff,
} from '@/lib/domain/reminders';

const NOW = new Date('2026-06-20T12:00:00.000Z');

function item(overrides: Partial<{ status: string; read_at: string | null; collected_at: string }> = {}) {
  return {
    status: 'active',
    read_at: null,
    collected_at: '2026-06-19T12:00:00.000Z',
    ...overrides,
  };
}

describe('isOverdue', () => {
  it('收藏 13.9 天且从未阅读 → 不超期', () => {
    const collected = new Date(
      NOW.getTime() - 13.9 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isOverdue(item({ collected_at: collected }), 14, NOW)).toBe(false);
  });

  it('收藏 14.1 天且从未阅读 → 超期', () => {
    const collected = new Date(
      NOW.getTime() - 14.1 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isOverdue(item({ collected_at: collected }), 14, NOW)).toBe(true);
  });

  it('已读 → 不超期', () => {
    const collected = new Date(
      NOW.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      isOverdue(item({ collected_at: collected, read_at: '2026-06-01T00:00:00.000Z' }), 14, NOW),
    ).toBe(false);
  });

  it('已归档 → 不超期', () => {
    const collected = new Date(
      NOW.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isOverdue(item({ collected_at: collected, status: 'archived' }), 14, NOW)).toBe(
      false,
    );
  });

  it('阈值可配', () => {
    const collected = new Date(
      NOW.getTime() - 20 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isOverdue(item({ collected_at: collected }), 14, NOW)).toBe(true);
    expect(isOverdue(item({ collected_at: collected }), 30, NOW)).toBe(false);
  });

  it('默认阈值是 14 天', () => {
    expect(DEFAULT_REMINDER_DAYS).toBe(14);
  });
});

describe('overdueCutoff', () => {
  it('返回 now - thresholdDays', () => {
    expect(overdueCutoff(NOW, 14).toISOString()).toBe(
      new Date(NOW.getTime() - 14 * 86400000).toISOString(),
    );
  });
});

describe('daysOverdue', () => {
  it('计算积压天数', () => {
    const collected = new Date(
      NOW.getTime() - 20.5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(daysOverdue(collected, NOW)).toBe(20);
  });

  it('未来时间返回 0', () => {
    expect(daysOverdue('2027-01-01T00:00:00.000Z', NOW)).toBe(0);
  });

  it('非法日期返回 0', () => {
    expect(daysOverdue('not a date', NOW)).toBe(0);
  });
});

describe('reminder days 校验', () => {
  it('assertReminderDays 接受 1–365 的整数', () => {
    expect(assertReminderDays(1)).toBe(1);
    expect(assertReminderDays(365)).toBe(365);
  });

  it('越界与非整数抛错', () => {
    expect(() => assertReminderDays(0)).toThrow();
    expect(() => assertReminderDays(366)).toThrow();
    expect(() => assertReminderDays(14.5)).toThrow();
  });

  it('clampReminderDays 把越界值拉回区间', () => {
    expect(clampReminderDays(0)).toBe(1);
    expect(clampReminderDays(9999)).toBe(365);
    expect(clampReminderDays('abc')).toBe(14);
  });
});
