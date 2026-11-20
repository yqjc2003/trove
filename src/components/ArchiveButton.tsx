'use client';

import { useState, useTransition } from 'react';
import { setItemStatusAction } from '@/app/actions/items';
import { translate, type Locale } from '@/lib/i18n';

export function ArchiveButton({ itemId, status, locale }: {
  itemId: string;
  status: 'active' | 'archived';
  locale: Locale;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleArchive() {
    startTransition(async () => {
      try {
        const result = await setItemStatusAction(itemId, status === 'active' ? 'archived' : 'active');
        setError(result.ok ? null : result.error ?? translate(locale, 'item.archiveError'));
      } catch {
        setError(translate(locale, 'item.archiveError'));
      }
    });
  }

  return (
    <>
      <button type="button" className="btn-quiet" disabled={pending} onClick={toggleArchive}>
        {translate(locale, pending ? 'item.archivePending' : status === 'active' ? 'item.archive' : 'item.unarchive')}
      </button>
      {error ? <span className="small danger" role="alert">{error}</span> : null}
    </>
  );
}
