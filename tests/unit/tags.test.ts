import { describe, expect, it } from 'vitest';

import {
  MAX_TAGS_PER_ITEM,
  exceedsTagLimit,
  normalizeTagFilters,
  normalizeTagName,
  normalizeTags,
} from '@/lib/domain/tags';
import { AppError } from '@/lib/domain/errors';

describe('normalizeTagName', () => {
  it('trim 并折叠内部空白', () => {
    expect(normalizeTagName('  数据库   索引  ')).toBe('数据库 索引');
  });

  it('去掉 # 前缀', () => {
    expect(normalizeTagName('#react')).toBe('react');
    expect(normalizeTagName('##react')).toBe('react');
    expect(normalizeTagName('  # react ')).toBe('react');
  });

  it('小写化', () => {
    expect(normalizeTagName('React')).toBe('react');
    expect(normalizeTagName('Machine Learning')).toBe('machine learning');
  });

  it('空值与纯符号返回 null', () => {
    expect(normalizeTagName('')).toBeNull();
    expect(normalizeTagName('   ')).toBeNull();
    expect(normalizeTagName('#')).toBeNull();
  });

  it('中文标签完整保留', () => {
    expect(normalizeTagName('向量检索')).toBe('向量检索');
  });

  it('长度上限 32 字符', () => {
    const long = 'a'.repeat(50);
    expect(normalizeTagName(long)).toHaveLength(32);
  });
});

describe('normalizeTags', () => {
  it('去重并保持首次出现顺序', () => {
    expect(normalizeTags(['React', 'react', '数据库'])).toEqual([
      'react',
      '数据库',
    ]);
  });

  it('丢弃空名', () => {
    expect(normalizeTags(['react', '', '   ', '#'])).toEqual(['react']);
  });

  it('超过 3 个抛 MAX_TAGS_EXCEEDED', () => {
    try {
      normalizeTags(['a', 'b', 'c', 'd']);
      throw new Error('应该抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('MAX_TAGS_EXCEEDED');
      expect((e as AppError).status).toBe(422);
    }
  });

  it('恰好 3 个通过', () => {
    expect(normalizeTags(['a', 'b', 'c'])).toHaveLength(MAX_TAGS_PER_ITEM);
  });

  it('undefined / null 视为空数组', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it('非数组抛 VALIDATION_ERROR', () => {
    expect(() => normalizeTags('react')).toThrow(AppError);
  });

  it('非字符串元素抛 VALIDATION_ERROR', () => {
    expect(() => normalizeTags([1, 2])).toThrow(AppError);
  });
});

describe('exceedsTagLimit', () => {
  it('不抛错，只返回布尔值', () => {
    expect(exceedsTagLimit(['a', 'b', 'c'])).toBe(false);
    expect(exceedsTagLimit(['a', 'b', 'c', 'd'])).toBe(true);
  });

  it('去重后再计数', () => {
    expect(exceedsTagLimit(['a', 'a', 'a', 'a'])).toBe(false);
  });
});

describe('normalizeTagFilters', () => {
  it('与写入路径同一套归一：小写 / 去 # / 折叠空白', () => {
    expect(normalizeTagFilters(['React', '#Vue', '  Data   Base  '])).toEqual([
      'react',
      'vue',
      'data base',
    ]);
  });

  it('去重且保持首次出现顺序', () => {
    expect(normalizeTagFilters(['React', 'react', 'REACT'])).toEqual(['react']);
  });

  it('丢弃空名与非字符串', () => {
    expect(normalizeTagFilters(['react', '', '   ', '#', 42, null])).toEqual(['react']);
  });

  it('不限制数量（过滤条件可以有多个标签）', () => {
    expect(normalizeTagFilters(['a', 'b', 'c', 'd'])).toHaveLength(4);
  });

  it('非数组返回空数组', () => {
    expect(normalizeTagFilters(undefined)).toEqual([]);
    expect(normalizeTagFilters('react')).toEqual([]);
  });
});
