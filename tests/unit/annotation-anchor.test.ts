import { describe, expect, it } from 'vitest';
import { annotationPopoverPosition, annotationsAtPoint, resolveTextOffsets } from '../../desktop/annotation-anchor.mjs';

describe('批注原文定位', () => {
  it('按 UTF-16 偏移定位选中的文本和代码', () => {
    expect(resolveTextOffsets('😀代码\nlet a = 1;', 'let a = 1;', 5, 15)).toEqual({ start: 5, end: 15 });
  });

  it('原文移动后只定位唯一匹配，避免误跳到重复内容', () => {
    expect(resolveTextOffsets('前言 原文 新段落', '原文', 0, 2)).toEqual({ start: 3, end: 5 });
    expect(resolveTextOffsets('原文和原文', '原文', 1, 3)).toBeNull();
    expect(resolveTextOffsets('内容已删除', '原文', 0, 2)).toBeNull();
  });

  it('点击高亮区域可找到全部重叠批注，也支持图片', () => {
    const rect = { left: 10, right: 50, top: 20, bottom: 30, width: 40, height: 10 };
    const image = {};
    const entries = [
      { note: { id: 1 }, target: { range: { getClientRects: () => [rect] } } },
      { note: { id: 2 }, target: { range: { getClientRects: () => [rect] } } },
      { note: { id: 3 }, target: { element: image } },
    ];
    expect(annotationsAtPoint(entries, 20, 25).map((note: { id: number }) => note.id)).toEqual([1, 2]);
    expect(annotationsAtPoint(entries, 100, 100, image).map((note: { id: number }) => note.id)).toEqual([3]);
    expect(annotationsAtPoint(entries, 100, 100)).toEqual([]);
  });

  it('批注气泡优先显示在选区下方，空间不足时显示在上方并限制边界', () => {
    expect(annotationPopoverPosition(100, 100, 200, 120, 500, 500)).toEqual({ left: 76, top: 110, arrowX: 24, placement: 'below' });
    expect(annotationPopoverPosition(490, 480, 200, 120, 500, 500)).toEqual({ left: 292, top: 350, arrowX: 188, placement: 'above' });
  });
});
