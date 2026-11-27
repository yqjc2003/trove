/** Store UTF-16 text offsets, matching DOM Range offsets and JavaScript strings. */
export function selectionAnchor(root, selection) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const text = range.toString();
  if (!text.trim() || Array.from(text).length > 10000) return null;
  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { text, start, end: start + text.length, element_index: null };
}

export function imageAnchor(root, image) {
  const images = [...root.querySelectorAll('img')];
  const elementIndex = images.indexOf(image);
  if (elementIndex < 0) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEndBefore(image);
  const start = before.toString().length;
  return { text: image.alt || '图片', start, end: start, element_index: elementIndex };
}

/** When text moves, relocate only an unambiguous exact match; never jump to the wrong duplicate. */
export function resolveTextOffsets(text, quote, start, end) {
  if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && text.slice(start, end) === quote) return { start, end };
  const match = quote && text.indexOf(quote);
  if (match === false || match < 0 || text.indexOf(quote, match + 1) !== -1) return null;
  return { start: match, end: match + quote.length };
}

export function findAnnotation(root, note) {
  if (note.element_index !== null && note.element_index !== undefined) {
    const image = root.querySelectorAll('img')[note.element_index];
    return image && (image.alt || '图片') === note.anchor_text ? { element: image } : null;
  }
  if (!note.anchor_text || note.start_offset === null) return null;
  const offsets = resolveTextOffsets(root.textContent || '', note.anchor_text, note.start_offset, note.end_offset);
  if (!offsets) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node; let count = 0; let startNode = null; let startOffset = 0;
  while ((node = walker.nextNode())) {
    const next = count + node.length;
    if (!startNode && offsets.start < next) { startNode = node; startOffset = offsets.start - count; }
    if (startNode && offsets.end <= next) {
      const range = document.createRange();
      range.setStart(startNode, startOffset); range.setEnd(node, offsets.end - count);
      return { range };
    }
    count = next;
  }
  return null;
}
