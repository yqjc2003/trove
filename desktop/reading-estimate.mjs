const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/** Count non-whitespace characters and estimate minutes at 400 CJK characters or 200 words per minute. */
export function measureReadingText(text) {
  const chars = Array.from(text).filter((character) => !/\s/u.test(character)).length;
  const cjkCount = (text.match(cjk) || []).length;
  const words = (text.replace(cjk, ' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  return { chars, minutes: cjkCount / 400 + words / 200 };
}

/** Estimate remaining time using the visible fraction of each rendered text block. */
export function estimateReadingProgress(blocks, rectangles, viewportTop) {
  let totalChars = 0; let totalMinutes = 0; let remainingMinutes = 0;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]; const rect = rectangles[index];
    totalChars += block.chars; totalMinutes += block.minutes;
    const fraction = !rect || viewportTop <= rect.top ? 0 : rect.height <= 0 || viewportTop >= rect.bottom ? 1 : (viewportTop - rect.top) / rect.height;
    remainingMinutes += block.minutes * (1 - fraction);
  }
  return { totalChars, totalMinutes, remainingMinutes };
}
