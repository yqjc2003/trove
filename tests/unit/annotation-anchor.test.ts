import { describe, expect, it } from 'vitest';
import { resolveTextOffsets } from '../../desktop/annotation-anchor.mjs';

describe('批注原文定位', () => {
  it('按 UTF-16 偏移定位选中的文本和代码', () => {
    expect(resolveTextOffsets('😀代码\nlet a = 1;', 'let a = 1;', 5, 15)).toEqual({ start: 5, end: 15 });
  });

  it('原文移动后只定位唯一匹配，避免误跳到重复内容', () => {
    expect(resolveTextOffsets('前言 原文 新段落', '原文', 0, 2)).toEqual({ start: 3, end: 5 });
    expect(resolveTextOffsets('原文和原文', '原文', 1, 3)).toBeNull();
    expect(resolveTextOffsets('内容已删除', '原文', 0, 2)).toBeNull();
  });
});
