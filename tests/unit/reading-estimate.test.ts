import { describe, expect, it } from 'vitest';
import { estimateReadingProgress, measureReadingText } from '../../desktop/reading-estimate.mjs';

describe('阅读时间估算', () => {
  it('统计中英文混合正文并区分阅读速度', () => {
    expect(measureReadingText('你好 world code')).toEqual({ chars: 11, minutes: 2 / 400 + 2 / 200 });
    expect(measureReadingText(' \n\t')).toEqual({ chars: 0, minutes: 0 });
  });

  it('根据当前正文块和段内位置估算剩余时间', () => {
    const blocks = [{ chars: 400, minutes: 1 }, { chars: 200, minutes: 0.5 }];
    const rects = [{ top: -100, bottom: 0, height: 100 }, { top: 0, bottom: 200, height: 200 }];
    expect(estimateReadingProgress(blocks, rects, 100)).toEqual({ totalChars: 600, totalMinutes: 1.5, remainingMinutes: 0.25 });
    expect(estimateReadingProgress(blocks, rects, -200).remainingMinutes).toBe(1.5);
    expect(estimateReadingProgress(blocks, rects, 300).remainingMinutes).toBe(0);
  });
});
