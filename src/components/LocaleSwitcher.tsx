'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from '@/components/LocaleProvider';
import { LOCALE_COOKIE, locales, type Locale } from '@/lib/i18n';

export function LocaleSwitcher() {
  const router = useRouter();
  const { locale, t } = useTranslation();
  return (
    <label className="locale-switcher">
      <span className="sr-only">{t('locale.label')}</span>
      <select
        aria-label={t('locale.label')}
        value={locale}
        onChange={(event) => {
          const next = event.target.value as Locale;
          document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax`;
          router.refresh();
        }}
      >
        {locales.map((value) => <option key={value} value={value}>{t(`locale.${value}`)}</option>)}
      </select>
    </label>
  );
}
