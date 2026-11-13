import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  isLocale,
  localeFromAcceptLanguage,
  translate,
} from '@/lib/i18n';

describe('i18n locale resolution', () => {
  it('accepts only the supported locale identifiers', () => {
    expect(isLocale('en-US')).toBe(true);
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('zh-TW')).toBe(true);
    expect(isLocale('en-GB')).toBe(false);
  });

  it('negotiates Chinese script variants and English', () => {
    expect(localeFromAcceptLanguage('zh-TW,zh;q=0.9,en;q=0.8')).toBe('zh-TW');
    expect(localeFromAcceptLanguage('zh-HK,zh;q=0.9')).toBe('zh-TW');
    expect(localeFromAcceptLanguage('zh;q=0.9,en;q=0.8')).toBe('zh-CN');
    expect(localeFromAcceptLanguage('en-GB,en;q=0.9')).toBe('en-US');
    expect(localeFromAcceptLanguage('fr-FR')).toBe(DEFAULT_LOCALE);
  });

  it('interpolates translated messages and falls back safely', () => {
    expect(translate('en-US', 'items.results', { count: 2 })).toBe('2 saved items found');
    expect(translate('zh-TW', 'items.results', { count: 2 })).toBe('找到 2 則收藏');
    expect(translate('en-US', 'unknown.key')).toBe('unknown.key');
  });
});
