import 'server-only';

import { cookies, headers } from 'next/headers';
import { isLocale, localeFromAcceptLanguage, LOCALE_COOKIE, type Locale } from '@/lib/i18n';

/** Cookie wins over the browser's language preference on a first visit. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return localeFromAcceptLanguage((await headers()).get('accept-language'));
}
