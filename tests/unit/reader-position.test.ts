import { describe, expect, it } from 'vitest';
import { captureReadingPosition, readingScrollTop } from '../../desktop/reader-position.mjs';

describe('阅读位置', () => {
  it('切换宽度导致正文重新换行时保持同一段及其相对位置', () => {
    const before = [{ top: -200, bottom: -40, height: 160 }, { top: -40, bottom: 160, height: 200 }];
    const position = captureReadingPosition(before, 10, 800);
    expect(position).toEqual({ index: 1, fraction: 0.25, scrollTop: 800 });
    const after = [{ top: -120, bottom: 0, height: 120 }, { top: 0, bottom: 400, height: 400 }];
    expect(readingScrollTop(position, after, 10, 800)).toBe(890);
  });

  it('标题区域、无效数据和正文变化时安全回退', () => {
    const position = captureReadingPosition([{ top: 100, bottom: 200, height: 100 }], 0, 40);
    expect(position).toEqual({ scrollTop: 40 });
    expect(readingScrollTop(position, [], 0, 0)).toBe(40);
    expect(readingScrollTop({ index: 8, fraction: 0.5, scrollTop: 20 }, [], 0, 0)).toBe(20);
    expect(readingScrollTop(null, [], 0, 0)).toBeNull();
  });

  it('段落间留白位于顶部时锚定前一段末尾', () => {
    const rectangles = [{ top: -100, bottom: -5, height: 95 }, { top: 25, bottom: 125, height: 100 }];
    expect(captureReadingPosition(rectangles, 0, 300)).toEqual({ index: 0, fraction: 1, scrollTop: 300 });
  });
});
