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

/** 离线图片完成解码后再恢复位置，避免图片撑开页面造成跳位。 */
export async function waitForReaderImages(images) {
  await Promise.all(Array.from(images, async (image) => {
    try { await image.decode(); } catch { /* 无法解码的图片不应阻止阅读 */ }
  }));
}
