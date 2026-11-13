'use client';

import { useTranslation } from '@/components/LocaleProvider';

export function OpenOriginal({
  id,
  read = false,
  onOpen,
}: {
  id: string;
  read?: boolean;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <a
      className="btn btn-primary"
      href={`/r/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        onOpen?.();
      }}
    >
      {read ? t('open.again') : t('open.read')}
      <span className="sr-only">{t('open.newTab')}</span>
    </a>
  );
}
