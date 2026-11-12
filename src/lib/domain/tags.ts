import { AppError } from './errors';

export const MAX_TAGS_PER_ITEM = 3;
export const MAX_TAG_NAME_LENGTH = 32;

/**
 * 标签名归一（plan §5.3）：
 *   trim → 去 # 前缀 → 折叠空白 → 小写 → 长度上限 32
 *
 * 中文标签完整保留；小写化对中文无副作用，对英文可避免 "React" / "react" 并存。
 */
export function normalizeTagName(raw: string): string | null {
  if (typeof raw !== 'string') return null;

  let name = raw.trim();

  // 去掉前导的 #（允许连续多个）
  while (name.startsWith('#')) {
    name = name.slice(1).trim();
  }

  // 折叠内部空白
  name = name.replace(/\s+/g, ' ').trim();

  if (name === '') return null;

  name = name.toLowerCase();

  if (name.length > MAX_TAG_NAME_LENGTH) {
    name = name.slice(0, MAX_TAG_NAME_LENGTH).trim();
    if (name === '') return null;
  }

  return name;
}

/**
 * 归一 + 去重一个标签数组，并校验「至多 3 个」。
 * 返回值已去重且保持首次出现顺序。
 */
export function normalizeTags(input: unknown): string[] {
  if (input === undefined || input === null) return [];

  if (!Array.isArray(input)) {
    throw new AppError('VALIDATION_ERROR', 'tags 必须是数组');
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of input) {
    if (typeof raw !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'tags 只能包含字符串');
    }
    const name = normalizeTagName(raw);
    if (name === null) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }

  if (result.length > MAX_TAGS_PER_ITEM) {
    throw new AppError(
      'MAX_TAGS_EXCEEDED',
      `每个收藏最多 ${MAX_TAGS_PER_ITEM} 个标签`,
      { limit: MAX_TAGS_PER_ITEM, received: result.length },
    );
  }

  return result;
}

/** 不抛错的版本，用于「判断是否超限」这类场景。 */
export function exceedsTagLimit(input: unknown): boolean {
  if (!Array.isArray(input)) return false;
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const name = normalizeTagName(raw);
    if (name === null) continue;
    seen.add(name);
  }
  return seen.size > MAX_TAGS_PER_ITEM;
}
