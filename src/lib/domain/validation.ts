import { AppError } from './errors';

export const MAX_TITLE_LENGTH = 300;
export const MAX_SUMMARY_LENGTH = 1000;
export const MAX_EXCERPT_LENGTH = 2000;
export const MAX_NOTE_LENGTH = 50 * 1024;
export const MAX_BATCH_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function assertString(
  value: unknown,
  field: string,
  opts: { required?: boolean; maxLength?: number; allowEmpty?: boolean } = {},
): string | undefined {
  const { required = false, maxLength, allowEmpty = false } = opts;

  if (value === undefined || value === null) {
    if (required) {
      throw new AppError('VALIDATION_ERROR', `${field} 是必填字段`);
    }
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', `${field} 必须是字符串`);
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    if (required || !allowEmpty) {
      if (required) throw new AppError('VALIDATION_ERROR', `${field} 不能为空`);
      return undefined;
    }
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', `${field} 超过 ${maxLength} 字符上限`);
  }

  return trimmed;
}

export function clampLimit(raw: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i <= 0) return fallback;
  if (i > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return i;
}

export function clampOffset(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

export function assertBatchSize(length: number): void {
  if (length > MAX_BATCH_SIZE) {
    throw new AppError(
      'VALIDATION_ERROR',
      `单次最多提交 ${MAX_BATCH_SIZE} 条`,
      { limit: MAX_BATCH_SIZE, received: length },
    );
  }
}
