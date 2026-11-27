export function toggleTag(selected, tag) {
  const key = tag.toLowerCase();
  return selected.some((value) => value.toLowerCase() === key)
    ? selected.filter((value) => value.toLowerCase() !== key)
    : [...selected, tag];
}

export function matchesLibraryView(item, view, selectedTags) {
  if (!selectedTags.every((tag) => item.tags.some((value) => value.toLowerCase() === tag.toLowerCase()))) return false;
  switch (view) {
    case 'unread': return !item.archived;
    case 'liked': return item.liked && !item.archived;
    case 'archive': return item.archived;
    case 'notes': return item.note_count > 0 || item.content_type === 'note';
    default: return false;
  }
}

export function countTagItems(items, view, tag) {
  return items.filter((item) => matchesLibraryView(item, view, [tag])).length;
}
