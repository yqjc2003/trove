import { describe, expect, it } from 'vitest';

import { normalizeUrl, isAllowedScheme } from '@/lib/domain/url';
import { AppError } from '@/lib/domain/errors';

describe('normalizeUrl', () => {
  it('去掉跟踪参数', () => {
    const { normalizedUrl } = normalizeUrl(
      'https://example.com/a?utm_source=twitter&utm_medium=social&id=7',
    );
    expect(normalizedUrl).toBe('https://example.com/a?id=7');
  });

  it('剔除常见跟踪参数', () => {
    const { normalizedUrl } = normalizeUrl(
      'https://example.com/a?fbclid=abc&gclid=xyz&spm=1&from=hn',
    );
    expect(normalizedUrl).toBe('https://example.com/a');
  });

  it('去掉 www. 前缀并小写 host', () => {
    const { normalizedUrl, domain } = normalizeUrl('https://WWW.Example.COM/Path');
    expect(normalizedUrl).toBe('https://example.com/Path');
    expect(domain).toBe('example.com');
  });

  it('去掉尾部斜杠（根路径除外）', () => {
    expect(normalizeUrl('https://example.com/a/').normalizedUrl).toBe(
      'https://example.com/a',
    );
    expect(normalizeUrl('https://example.com/').normalizedUrl).toBe(
      'https://example.com/',
    );
  });

  it('去掉 fragment', () => {
    expect(normalizeUrl('https://example.com/a#section').normalizedUrl).toBe(
      'https://example.com/a',
    );
  });

  it('query 参数按 key 排序', () => {
    expect(normalizeUrl('https://example.com/a?b=2&a=1').normalizedUrl).toBe(
      'https://example.com/a?a=1&b=2',
    );
  });

  it('去重键统一用 https，因此 http 与 https 视为同一条', () => {
    expect(normalizeUrl('http://example.com/a').normalizedUrl).toBe(
      'https://example.com/a',
    );
  });

  it('规范化等价的不同写法命中同一个 key', () => {
    const a = normalizeUrl('https://x.com/a?utm_source=t');
    const b = normalizeUrl('https://www.x.com/a');
    const c = normalizeUrl('https://x.com/a#frag');
    expect(a.normalizedUrl).toBe(b.normalizedUrl);
    expect(b.normalizedUrl).toBe(c.normalizedUrl);
  });

  it('拒绝非 http/https 协议', () => {
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(AppError);
    expect(() => normalizeUrl('data:text/html,<h1>x</h1>')).toThrow(AppError);
    try {
      normalizeUrl('javascript:alert(1)');
    } catch (e) {
      expect((e as AppError).code).toBe('INVALID_SCHEME');
    }
  });

  it('拒绝非法 url 与空值', () => {
    expect(() => normalizeUrl('')).toThrow(AppError);
    expect(() => normalizeUrl('not a url')).toThrow(AppError);
  });

  it('保留原始协议用于展示，但去重键固定 https', () => {
    const { url, normalizedUrl } = normalizeUrl('http://example.com/a');
    expect(url).toBe('http://example.com/a');
    expect(normalizedUrl).toBe('https://example.com/a');
  });
});

describe('isAllowedScheme', () => {
  it('只接受 http/https', () => {
    expect(isAllowedScheme('https://example.com')).toBe(true);
    expect(isAllowedScheme('http://example.com')).toBe(true);
    expect(isAllowedScheme('javascript:alert(1)')).toBe(false);
    expect(isAllowedScheme('not a url')).toBe(false);
  });
});
