import { AppError } from './errors';

export const DEFAULT_REMINDER_DAYS = 14;
export const MIN_REMINDER_DAYS = 1;
export const MAX_REMINDER_DAYS = 365;

export function clampReminderDays(days: unknown): number {
  const n = typeof days === 'number' ? days : Number(days);
  if (!Number.isFinite(n)) return DEFAULT_REMINDER_DAYS;
  const rounded = Math.trunc(n);
  if (rounded < MIN_REMINDER_DAYS) return MIN_REMINDER_DAYS;
  if (rounded > MAX_REMINDER_DAYS) return MAX_REMINDER_DAYS;
  return rounded;
}

export function assertReminderDays(days: unknown): number {
  const n = typeof days === 'number' ? days : Number(days);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new AppError('VALIDATION_ERROR', '提醒天数必须是整数');
  }
  if (n < MIN_REMINDER_DAYS || n > MAX_REMINDER_DAYS) {
    throw new AppError(
      'VALIDATION_ERROR',
      `提醒天数必须在 ${MIN_REMINDER_DAYS}–${MAX_REMINDER_DAYS} 之间`,
    );
  }
  return n;
}

/** 超期判定所需的最小 item 形状，避免 service 层与领域层耦合到完整实体。 */
export interface OverdueCandidate {
  status: string;
  read_at: string | null;
  collected_at: string;
}

/**
 * 超期判定（plan §5.4）：
 *   status === 'active' 且从未阅读（read_at 为 null）且收藏时间早于阈值
 */
export function isOverdue(
  item: OverdueCandidate,
  thresholdDays: number = DEFAULT_REMINDER_DAYS,
  now: Date = new Date(),
): boolean {
  if (item.status !== 'active') return false;
  if (item.read_at !== null && item.read_at !== undefined) return false;

  const cutoff = overdueCutoff(now, thresholdDays);
  return new Date(item.collected_at).getTime() < cutoff.getTime();
}

/** 判定为超期的截止时刻：now - thresholdDays。 */
export function overdueCutoff(
  now: Date = new Date(),
  thresholdDays: number = DEFAULT_REMINDER_DAYS,
): Date {
  return new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);
}

/** 已超期天数（整数，至少 0）。 */
export function daysOverdue(
  collectedAt: string,
  now: Date = new Date(),
): number {
  const collected = new Date(collectedAt).getTime();
  if (!Number.isFinite(collected)) return 0;
  const diff = now.getTime() - collected;
  if (diff <= 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}
