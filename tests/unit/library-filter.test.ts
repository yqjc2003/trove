import { describe, expect, it } from 'vitest';
import { matchesLibraryView, toggleTag } from '../../desktop/library-filter.mjs';

describe('桌面收藏筛选', () => {
  const item = { tags: ['工具', 'Rust'], liked: true, archived: false, note_count: 0, content_type: 'article' };

  it('标签可多选并再次点击取消，忽略大小写', () => {
    expect(toggleTag(toggleTag([], '工具'), 'Rust')).toEqual(['工具', 'Rust']);
    expect(toggleTag(['工具', 'Rust'], 'rust')).toEqual(['工具']);
  });

  it('标签之间取交集，且与当前入口共同筛选', () => {
    expect(matchesLibraryView(item, 'unread', ['工具', 'rust'])).toBe(true);
    expect(matchesLibraryView(item, 'liked', ['工具', 'rust'])).toBe(true);
    expect(matchesLibraryView(item, 'liked', ['工具', '博客'])).toBe(false);
    expect(matchesLibraryView(item, 'archive', ['工具'])).toBe(false);
    const archived = { ...item, archived: true };
    expect(matchesLibraryView(archived, 'unread', ['工具'])).toBe(false);
    expect(matchesLibraryView(archived, 'liked', ['工具'])).toBe(false);
    expect(matchesLibraryView(archived, 'archive', ['工具'])).toBe(true);
    expect(matchesLibraryView({ ...item, liked: false }, 'liked', [])).toBe(false);
  });

  it('笔记入口也应用标签交集，保留手写文章和原有阅读笔记', () => {
    expect(matchesLibraryView({ ...item, note_count: 1 }, 'notes', ['工具'])).toBe(true);
    expect(matchesLibraryView({ ...item, content_type: 'note' }, 'notes', ['工具'])).toBe(true);
    expect(matchesLibraryView({ ...item, note_count: 1 }, 'notes', ['博客'])).toBe(false);
  });
});
