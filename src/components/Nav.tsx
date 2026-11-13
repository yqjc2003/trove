'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { useTranslation } from '@/components/LocaleProvider';

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const opened = useRef(false);
  const { t } = useTranslation();
  const links = [
    { href: '/', label: t('nav.dashboard') },
    { href: '/stream', label: t('nav.stream') },
    { href: '/items', label: t('nav.library') },
    { href: '/settings', label: t('nav.settings') },
  ];

  useEffect(() => {
    function track(event: MouseEvent) {
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (
        anchor.origin === window.location.origin &&
        anchor.pathname.startsWith('/r/')
      )
        opened.current = true;
    }
    function refresh() {
      if (opened.current && document.visibilityState === 'visible') {
        opened.current = false;
        router.refresh();
      }
    }
    document.addEventListener('click', track);
    document.addEventListener('auxclick', track);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('click', track);
      document.removeEventListener('auxclick', track);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/' || pathname === '/reminders'
      : pathname.startsWith(href);

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand" translate="no">
          {t('brand')}
        </Link>
        <div className="nav-links">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-spacer" />
        <LocaleSwitcher />
        <Link href="/items/new" className="nav-capture">
          {t('nav.capture')}
        </Link>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="btn-quiet">
            {t('nav.signOut')}
          </button>
        </form>
      </div>
    </nav>
  );
}
