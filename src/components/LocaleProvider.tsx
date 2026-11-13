'use client';

import { createContext, useContext } from 'react';
import type { Locale } from '@/lib/i18n';
import { translate } from '@/lib/i18n';

const LocaleContext = createContext<Locale>('zh-CN');

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useTranslation() {
  const locale = useLocale();
  return { locale, t: (key: string, variables?: Record<string, string | number>) => translate(locale, key, variables) };
}
