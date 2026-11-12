import { describe, expect, it } from 'vitest';

import { detectContentType, isContentType } from '@/lib/domain/content-type';

describe('detectContentType', () => {
  it('识别仓库类站点', () => {
    expect(detectContentType('https://github.com/yqjc2003/trove')).toBe('repo');
    expect(detectContentType('https://gitlab.com/a/b')).toBe('repo');
    expect(detectContentType('https://gitee.com/a/b')).toBe('repo');
  });

  it('识别视频类站点', () => {
    expect(detectContentType('https://www.youtube.com/watch?v=x')).toBe('video');
    expect(detectContentType('https://youtu.be/x')).toBe('video');
    expect(detectContentType('https://www.bilibili.com/video/BV1')).toBe('video');
  });

  it('识别社交类站点', () => {
    expect(detectContentType('https://x.com/user/status/1')).toBe('social');
    expect(detectContentType('https://www.zhihu.com/question/1')).toBe('social');
    expect(detectContentType('https://www.douban.com/note/1')).toBe('social');
  });

  it('识别文档类站点', () => {
    expect(detectContentType('https://docs.google.com/doc/1')).toBe('doc');
    expect(detectContentType('https://notion.so/page')).toBe('doc');
    expect(detectContentType('https://developer.mozilla.org/zh-CN/')).toBe('doc');
  });

  it('识别工具类站点', () => {
    expect(detectContentType('https://www.figma.com/file/abc')).toBe('tool');
    expect(detectContentType('https://supabase.com/docs')).toBe('tool');
  });

  it('识别文章类站点', () => {
    expect(detectContentType('https://medium.com/@a/b')).toBe('article');
    expect(detectContentType('https://juejin.cn/post/1')).toBe('article');
  });

  it('未知站点回落到 article', () => {
    expect(detectContentType('https://some-random-blog.example/post')).toBe(
      'article',
    );
  });

  it('忽略 www. 前缀', () => {
    expect(detectContentType('https://www.github.com/a/b')).toBe('repo');
  });

  it('非法 url 不会抛错', () => {
    expect(detectContentType('not a url')).toBe('article');
  });
});

describe('isContentType', () => {
  it('只接受白名单内的值', () => {
    expect(isContentType('article')).toBe(true);
    expect(isContentType('repo')).toBe(true);
    expect(isContentType('nope')).toBe(false);
    expect(isContentType(undefined)).toBe(false);
  });
});
