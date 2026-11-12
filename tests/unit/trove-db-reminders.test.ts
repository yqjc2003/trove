import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TroveDb } from '@/lib/db/trove-db';

afterEach(() => vi.useRealTimers());

describe('TroveDb 待回看查询', () => {
  it('使用当前用户的阈值，且即使 status=all 也排除归档', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
    const calls: Array<[string, ...unknown[]]> = [];
    const query = {
      select: (...args: unknown[]) => {
        calls.push(['select', ...args]);
        return query;
      },
      eq: (...args: unknown[]) => {
        calls.push(['eq', ...args]);
        return query;
      },
      is: (...args: unknown[]) => {
        calls.push(['is', ...args]);
        return query;
      },
      lt: (...args: unknown[]) => {
        calls.push(['lt', ...args]);
        return query;
      },
      order: () => query,
      range: async () => ({ data: [], count: 0, error: null }),
    };
    const db = new TroveDb('user-1', {
      from: () => query,
    } as unknown as SupabaseClient);
    vi.spyOn(db, 'getProfile').mockResolvedValue({
      reminder_days: 30,
    } as never);
    await db.listItems({ overdue: true, status: 'all' });
    expect(calls).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(calls).toContainEqual(['eq', 'status', 'active']);
    expect(calls).toContainEqual(['is', 'read_at', null]);
    expect(calls).toContainEqual([
      'lt',
      'collected_at',
      '2026-10-13T00:00:00.000Z',
    ]);
  });
});
