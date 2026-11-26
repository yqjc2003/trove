/** 将可见位置记录为正文段落及其内部比例，避免切换布局后因换行改变而跳页。 */
export function captureReadingPosition(rectangles, viewportTop, scrollTop) {
  for (let index = 0; index < rectangles.length; index++) {
    const rect = rectangles[index];
    const next = rectangles[index + 1];
    if (rect.top <= viewportTop && rect.height > 0 &&
        (rect.bottom > viewportTop || (next && next.top > viewportTop))) {
      return { index, fraction: Math.min(1, (viewportTop - rect.top) / rect.height), scrollTop };
    }
  }
  return { scrollTop };
}

/** 返回当前布局下的滚动位置；标题等非正文区域回退到原滚动值。 */
export function readingScrollTop(position, rectangles, viewportTop, scrollTop) {
  if (!position || typeof position !== 'object') return null;
  const rect = Number.isInteger(position.index) ? rectangles[position.index] : null;
  if (rect && Number.isFinite(position.fraction)) {
    const fraction = Math.max(0, Math.min(1, position.fraction));
    return Math.max(0, scrollTop + rect.top - viewportTop + rect.height * fraction);
  }
  return Number.isFinite(position.scrollTop) ? Math.max(0, position.scrollTop) : null;
}
